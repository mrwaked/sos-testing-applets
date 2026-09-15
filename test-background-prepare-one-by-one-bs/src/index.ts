import './index.css';
import sos from '@signageos/front-applet';

// ─────────────────────────────────────────────────────────────────────────────
// Playlist — edit freely. Pre-filled with the two public signageOS test videos
// already validated on these devices. Each item is cached locally before playback.
// ─────────────────────────────────────────────────────────────────────────────
interface PlaylistItem {
	name: string;
	uid: string;
	remoteUrl: string;
	localUrl: string; // filled in after caching
}

const PLAYLIST: PlaylistItem[] = [
	{
		name: 'CHERRY (03)',
		uid: 'bg-1by1-video-1.mp4',
		remoteUrl: 'https://static.signageos.io/assets/test-videos-03_AME/video-test-03_15s_1920x1080_2fe7b039750a134aeac1c0a515710007.mp4',
		localUrl: '',
	},
	{
		name: 'CITY (04)',
		uid: 'bg-1by1-video-2.mp4',
		remoteUrl: 'https://static.signageos.io/assets/test-videos-04_AME/video-test-04_15s_1920x1080_88f90af5fa281d7efb8eae17848e71d9.mp4',
		localUrl: '',
	},
];

// Two call patterns, compared over time. background:true is supplied ONLY by prepare(),
// so whether it survives depends on which BrightScript path play() takes.
type Strategy = 'prepare-then-play' | 'play-only';
const STRATEGIES: Strategy[] = ['prepare-then-play', 'play-only'];

const STRATEGY_DESC: { [k in Strategy]: string } = {
	'prepare-then-play': 'stop → prepare(uri,{background:true}) → play(uri)  [correct contract → video.play]',
	'play-only': 'stop → play(uri)  [no prepare → video.prepare_and_play, options cleared]',
};
const STRATEGY_EXPECT: { [k in Strategy]: string } = {
	'prepare-then-play': 'background HELD — overlay card stays ON TOP of the video.',
	'play-only': 'background LOST (options→false) — video covers the overlay card.',
};

const HEADER_FRAC = 0.12;
const LOG_FRAC = 0.33;
const DWELL_MS = 12000;

interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

let videoRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
let overlayEl!: HTMLElement;
let active: { url: string; rect: Rect } | null = null;
let currentStrategyIndex = 0;
let currentVideoIndex = 0;
let paused = false;
let stepTimer: number | null = null;

// Serialize transitions so a key press can't interleave with an in-flight stop/prepare/play.
let chain: Promise<unknown> = Promise.resolve();
function runExclusive(fn: () => Promise<void>): Promise<void> {
	const run = chain.catch(() => undefined).then(fn);
	chain = run.catch(() => undefined);
	return run;
}

function byId(id: string): HTMLElement {
	const el = document.getElementById(id);
	if (!el) {
		throw new Error('missing element #' + id);
	}
	return el;
}

function errMsg(e: unknown): string {
	if (e instanceof Error) {
		return e.message;
	}
	try {
		return JSON.stringify(e);
	} catch (_) {
		return String(e);
	}
}

function log(msg: string, level: 'info' | 'ok' | 'warn' | 'err' = 'info') {
	const ts = new Date().toISOString().slice(11, 23);
	const line = '[' + ts + '] ' + msg;

	if (level === 'err') {
		console.error('[bg-1by1]', msg);
	} else if (level === 'warn') {
		console.warn('[bg-1by1]', msg);
	} else {
		console.log('[bg-1by1]', msg);
	}

	const el = document.getElementById('log');
	if (el) {
		const div = document.createElement('div');
		div.className = 'log-line' + (level === 'info' ? '' : ' log-' + level);
		div.textContent = line;
		el.appendChild(div);
		while (el.childNodes.length > 200 && el.firstChild) {
			el.removeChild(el.firstChild);
		}
		el.scrollTop = el.scrollHeight;
	}
}

function strategyAt(i: number): Strategy {
	const idx = ((i % STRATEGIES.length) + STRATEGIES.length) % STRATEGIES.length;
	return STRATEGIES[idx] ?? 'prepare-then-play';
}

function computeRect(): Rect {
	const w = window.innerWidth;
	const h = window.innerHeight;
	const top = Math.round(h * HEADER_FRAC);
	const bottom = Math.round(h * (1 - LOG_FRAC));
	return { x: 0, y: top, width: w, height: bottom - top };
}

function positionOverlay() {
	overlayEl.style.left = videoRect.x + 'px';
	overlayEl.style.top = videoRect.y + 'px';
	overlayEl.style.width = videoRect.width + 'px';
	overlayEl.style.height = videoRect.height + 'px';
}

function setHeader(strategy: Strategy, item: PlaylistItem) {
	byId('strategy-line').textContent = 'STRATEGY: ' + strategy + '   ·   NOW: ' + item.name + '   (' + STRATEGY_DESC[strategy] + ')';
	byId('expectation-line').textContent = 'Expected on BrightSign → ' + STRATEGY_EXPECT[strategy];
}

function setVideoLabel(item: PlaylistItem, stateText: string) {
	byId('video-name').textContent = item.name;
	byId('video-state').textContent = stateText;
}

function describeEvent(event: { type: string; srcArguments: { uri: string; x: number; y: number; width: number; height: number } }): string {
	const a = event.srcArguments;
	return event.type + ' ' + a.uri + ' @ ' + a.x + ',' + a.y + ' ' + a.width + 'x' + a.height;
}

async function stopActive() {
	if (!active) {
		return;
	}
	const a = active;
	active = null;
	try {
		await sos.video.stop(a.url, a.rect.x, a.rect.y, a.rect.width, a.rect.height);
		log('stopped previous video', 'info');
	} catch (e) {
		log('stop failed: ' + errMsg(e), 'warn');
	}
}

async function playItem(item: PlaylistItem, strategy: Strategy) {
	if (!item.localUrl) {
		log(item.name + ': not cached — skipping', 'warn');
		setVideoLabel(item, 'not cached');
		return;
	}
	const r = videoRect;
	const coords = r.x + ', ' + r.y + ', ' + r.width + ', ' + r.height;
	setHeader(strategy, item);
	await stopActive();

	try {
		if (strategy === 'prepare-then-play') {
			log(item.name + ': prepare(uri, ' + coords + ', { background: true })', 'info');
			await sos.video.prepare(item.localUrl, r.x, r.y, r.width, r.height, { background: true });
			log(item.name + ': prepare resolved', 'ok');
		} else {
			log(item.name + ': NO prepare — calling play() directly (exercises video.prepare_and_play)', 'warn');
		}

		log(item.name + ': play(uri, ' + coords + ')', 'info');
		await sos.video.play(item.localUrl, r.x, r.y, r.width, r.height);
		log(item.name + ': play resolved', 'ok');

		active = { url: item.localUrl, rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
		setVideoLabel(item, strategy === 'prepare-then-play' ? 'playing — expect HELD (overlay on top)' : 'playing — expect LOST (video on top)');
	} catch (e) {
		log(item.name + ': FAILED — ' + errMsg(e), 'err');
		setVideoLabel(item, 'error: ' + errMsg(e));
	}
}

function clearTimer() {
	if (stepTimer !== null) {
		clearTimeout(stepTimer);
		stepTimer = null;
	}
}

function scheduleNext() {
	clearTimer();
	if (paused) {
		return;
	}
	stepTimer = window.setTimeout(() => {
		void advance();
	}, DWELL_MS);
}

async function runStep() {
	clearTimer();
	const item = PLAYLIST[currentVideoIndex];
	if (!item) {
		return;
	}
	const strategy = strategyAt(currentStrategyIndex);
	await runExclusive(() => playItem(item, strategy));
	scheduleNext();
}

async function advance() {
	currentVideoIndex = currentVideoIndex + 1;
	if (currentVideoIndex >= PLAYLIST.length) {
		// finished a full pass → rotate to the next strategy so the two are compared over time
		currentVideoIndex = 0;
		currentStrategyIndex = currentStrategyIndex + 1;
		const strat = strategyAt(currentStrategyIndex);
		log('──────── STRATEGY → ' + strat + ' ────────', 'warn');
		log('Expected → ' + STRATEGY_EXPECT[strat], 'warn');
	}
	await runStep();
}

function goToStrategy(index: number) {
	currentStrategyIndex = ((index % STRATEGIES.length) + STRATEGIES.length) % STRATEGIES.length;
	currentVideoIndex = 0;
	const strat = strategyAt(currentStrategyIndex);
	log('──────── STRATEGY: ' + strat + ' (manual) ────────', 'warn');
	void runStep();
}

function setupKeyboard() {
	window.addEventListener('keydown', (ev: KeyboardEvent) => {
		switch (ev.key) {
			case '1':
				goToStrategy(0);
				break;
			case '2':
				goToStrategy(1);
				break;
			case 'n':
			case 'N':
				clearTimer();
				void advance();
				break;
			case 'r':
			case 'R':
				currentVideoIndex = 0;
				void runStep();
				break;
			case ' ':
				paused = !paused;
				log(paused ? 'PAUSED (space to resume)' : 'RESUMED', 'warn');
				if (paused) {
					clearTimer();
				} else {
					scheduleNext();
				}
				break;
			default:
				break;
		}
	});
}

function setupVideoListeners() {
	sos.video.onError((event) => {
		log('video.onError: ' + describeEvent(event), 'err');
	});
	sos.video.onEnded((event) => {
		log('video.onEnded: ' + describeEvent(event), 'info');
	});
	sos.video.onStop((event) => {
		log('video.onStop: ' + describeEvent(event), 'info');
	});
}

async function tryGet(fn: () => Promise<unknown>): Promise<string> {
	try {
		return String(await fn());
	} catch (e) {
		return '(unavailable: ' + errMsg(e) + ')';
	}
}

function setDeviceBadge(model: string, firmware: string) {
	const m = document.getElementById('db-model-val');
	const f = document.getElementById('db-fw-val');
	if (m) {
		m.textContent = model;
	}
	if (f) {
		f.textContent = firmware;
	}
}

async function logDeviceInfo() {
	log('── device info ──', 'info');
	log('userAgent: ' + navigator.userAgent);
	log('viewport: ' + window.innerWidth + ' x ' + window.innerHeight);
	const model = await tryGet(() => sos.management.getModel());
	const firmwareType = await tryGet(() => sos.management.firmware.getType());
	const firmwareVersion = await tryGet(() => sos.management.firmware.getVersion());
	log('model: ' + model, 'ok');
	log('firmware.type: ' + firmwareType);
	log('firmware.version: ' + firmwareVersion, 'ok');
	setDeviceBadge(model, firmwareVersion);
}

async function cacheItem(item: PlaylistItem) {
	try {
		log(item.name + ': caching ' + item.remoteUrl + ' …', 'info');
		const file = await sos.offline.cache.loadOrSaveFile(item.uid, item.remoteUrl);
		item.localUrl = file.filePath;
		log(item.name + ': cached → ' + file.filePath, 'ok');
	} catch (e) {
		log(item.name + ': cache FAILED — ' + errMsg(e), 'err');
	}
}

sos.onReady().then(async function () {
	log('sOS ready', 'ok');
	overlayEl = byId('overlay');
	videoRect = computeRect();
	positionOverlay();
	window.addEventListener('resize', () => {
		videoRect = computeRect();
		positionOverlay();
	});

	await logDeviceInfo();
	setupVideoListeners();
	setupKeyboard();

	log('caching playlist to local storage…', 'warn');
	for (const item of PLAYLIST) {
		await cacheItem(item);
	}

	log(
		'Sequential one-by-one playback. Auto-advances every ' +
			DWELL_MS / 1000 +
			's; strategy rotates each full pass. Keys: 1=prepare+play, 2=play-only, n=next, space=pause, r=restart.',
		'warn',
	);
	const strat = strategyAt(currentStrategyIndex);
	log('──────── STRATEGY: ' + strat + ' ────────', 'warn');
	log('Expected → ' + STRATEGY_EXPECT[strat], 'warn');
	await runStep();
});
