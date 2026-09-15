import './index.css';
import sos from '@signageos/front-applet';

// ─────────────────────────────────────────────────────────────────────────────
// Two DIFFERENT videos make the two regions easy to tell apart on screen.
// ─────────────────────────────────────────────────────────────────────────────
const VIDEO_1_URL = 'https://static.signageos.io/assets/test-videos-03_AME/video-test-03_15s_1920x1080_2fe7b039750a134aeac1c0a515710007.mp4';
const VIDEO_2_URL = 'https://static.signageos.io/assets/test-videos-04_AME/video-test-04_15s_1920x1080_88f90af5fa281d7efb8eae17848e71d9.mp4';

// Layout fractions — kept in sync with #header (12vh) and #log-band (33vh) in index.css.
const HEADER_FRAC = 0.12;
const LOG_FRAC = 0.33;
const CYCLE_MS = 60000;

type Mode = 'both-background' | 'mixed' | 'both-foreground';
const MODES: Mode[] = ['both-background', 'mixed', 'both-foreground'];

// Per-mode background flag for [VIDEO 1, VIDEO 2].
const MODE_BG: { [k in Mode]: [boolean, boolean] } = {
	'both-background': [true, true],
	mixed: [true, false], // V2 (foreground) is prepared last → it wins the global z-order on BrightSign
	'both-foreground': [false, false],
};

// What we expect to SEE on a BrightSign running the MR-446 fix.
const MODE_EXPECT: { [k in Mode]: string } = {
	'both-background': 'both videos UNDER the HTML — both labels stay visible on top.',
	mixed: 'global z-order = last prepare (V2 foreground) → BOTH videos cover the labels (demonstrates the shared z-order).',
	'both-foreground': 'both videos ON TOP — both labels are covered (normal foreground).',
};

interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface VideoSlot {
	name: string;
	uid: string; // cache key for sos.offline.cache
	remoteUrl: string; // original https URL the user configured
	url: string; // local filePath after caching — this is what sos.video.prepare/play receives
	rect: Rect;
	overlayEl: HTMLElement;
	stateEl: HTMLElement;
	loops: number; // how many times it has looped in the current mode
}

let video1!: VideoSlot;
let video2!: VideoSlot;
let activeSlots: VideoSlot[] = [];
let currentModeIndex = 0;
let paused = false;
let cycleTimer: number | null = null;

// Serialize all mode transitions so an auto-cycle tick can't interleave with a key press.
let chain: Promise<unknown> = Promise.resolve();
function runExclusive(fn: () => Promise<void>): Promise<void> {
	const run = chain.catch(() => undefined).then(fn);
	chain = run.catch(() => undefined);
	return run;
}

function modeAt(i: number): Mode {
	const idx = ((i % MODES.length) + MODES.length) % MODES.length;
	return MODES[idx] ?? 'both-background';
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
		console.error('[bg-test]', msg);
	} else if (level === 'warn') {
		console.warn('[bg-test]', msg);
	} else {
		console.log('[bg-test]', msg);
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

function computeRects(): { v1: Rect; v2: Rect } {
	const w = window.innerWidth;
	const h = window.innerHeight;
	const top = Math.round(h * HEADER_FRAC);
	const bottom = Math.round(h * (1 - LOG_FRAC));
	const bandHeight = bottom - top;
	const halfWidth = Math.floor(w / 2);
	return {
		v1: { x: 0, y: top, width: halfWidth, height: bandHeight },
		v2: { x: halfWidth, y: top, width: w - halfWidth, height: bandHeight },
	};
}

function positionOverlay(el: HTMLElement, r: Rect) {
	el.style.left = r.x + 'px';
	el.style.top = r.y + 'px';
	el.style.width = r.width + 'px';
	el.style.height = r.height + 'px';
}

function setSlotState(slot: VideoSlot, text: string) {
	slot.stateEl.textContent = text;
}

function updateHeader(mode: Mode) {
	const [bg1, bg2] = MODE_BG[mode];
	byId('mode-line').textContent = 'MODE: ' + mode + '   (V1 background=' + bg1 + ', V2 background=' + bg2 + ')';
	byId('expectation-line').textContent = 'Expected on BrightSign → ' + MODE_EXPECT[mode];
}

function describeEvent(event: { type: string; srcArguments: { uri: string; x: number; y: number; width: number; height: number } }): string {
	const a = event.srcArguments;
	return event.type + ' ' + a.uri + ' @ ' + a.x + ',' + a.y + ' ' + a.width + 'x' + a.height;
}

async function stopAll() {
	const toStop = activeSlots.slice();
	activeSlots = [];
	for (const slot of toStop) {
		const r = slot.rect;
		try {
			await sos.video.stop(slot.url, r.x, r.y, r.width, r.height);
			setSlotState(slot, 'stopped');
			log('stopped ' + slot.name, 'info');
		} catch (e) {
			log('stop ' + slot.name + ' failed: ' + errMsg(e), 'warn');
		}
	}
}

async function startVideo(slot: VideoSlot, background: boolean): Promise<boolean> {
	if (!slot.url) {
		log(slot.name + ': not cached (download failed?) — skipping', 'warn');
		setSlotState(slot, 'not cached');
		return false;
	}
	slot.loops = 0;
	const r = slot.rect;
	const coords = r.x + ', ' + r.y + ', ' + r.width + ', ' + r.height;
	try {
		log(slot.name + ': prepare(uri, ' + coords + ', { background: ' + background + ' })', 'info');
		setSlotState(slot, 'preparing (bg=' + background + ')');
		await sos.video.prepare(slot.url, r.x, r.y, r.width, r.height, { background });
		log(slot.name + ': prepare resolved', 'ok');

		log(slot.name + ': play(uri, ' + coords + ')', 'info');
		await sos.video.play(slot.url, r.x, r.y, r.width, r.height);
		log(slot.name + ': play resolved', 'ok');

		setSlotState(slot, 'playing (bg=' + background + ')');
		activeSlots.push(slot);
		return true;
	} catch (e) {
		log(slot.name + ': FAILED — ' + errMsg(e), 'err');
		setSlotState(slot, 'error: ' + errMsg(e));
		return false;
	}
}

async function cacheVideo(slot: VideoSlot): Promise<void> {
	try {
		log(slot.name + ': caching ' + slot.remoteUrl + '  (uid: ' + slot.uid + ') …', 'info');
		setSlotState(slot, 'downloading…');
		// BrightSign's sos.video resolves the URI to a LOCAL file and rejects remote URLs
		// ("Invalid local uri"). loadOrSaveFile downloads (or reuses the cached copy) and
		// returns a local filePath that prepare/play accept. (Canonical signageOS pattern.)
		const file = await sos.offline.cache.loadOrSaveFile(slot.uid, slot.remoteUrl);
		slot.url = file.filePath;
		log(slot.name + ': cached → ' + file.filePath, 'ok');
		setSlotState(slot, 'ready (cached)');
	} catch (e) {
		log(slot.name + ': cache FAILED — ' + errMsg(e), 'err');
		setSlotState(slot, 'cache error: ' + errMsg(e));
	}
}

async function applyMode(mode: Mode) {
	log('──────── MODE: ' + mode + ' ────────', 'warn');
	log('Expected → ' + MODE_EXPECT[mode], 'warn');
	updateHeader(mode);

	await stopAll();

	const [bg1, bg2] = MODE_BG[mode];
	// Order matters: VIDEO 2 is prepared LAST, so on BrightSign its background flag
	// sets the single, GLOBAL graphics z-order for both videos (SetGraphicsZOrder).
	const ok1 = await startVideo(video1, bg1);
	const ok2 = await startVideo(video2, bg2);

	if (ok1 && !ok2) {
		log('VIDEO 2 failed but VIDEO 1 played — single video plane on this device? Continuing with VIDEO 1 only.', 'warn');
	}
	if (!ok1 && !ok2) {
		log('Neither video started — see the per-video error above (e.g. caching failed or URL unreachable).', 'err');
	}
	log('last prepare = ' + video2.name + ' (background=' + bg2 + ') → sets the GLOBAL z-order for both on BrightSign.', 'info');
}

function transitionTo(mode: Mode): Promise<void> {
	return runExclusive(() => applyMode(mode));
}

function scheduleCycle() {
	if (cycleTimer !== null) {
		clearTimeout(cycleTimer);
		cycleTimer = null;
	}
	if (paused) {
		return;
	}
	cycleTimer = window.setTimeout(() => {
		currentModeIndex = (currentModeIndex + 1) % MODES.length;
		void transitionTo(modeAt(currentModeIndex)).then(scheduleCycle);
	}, CYCLE_MS);
}

function goToMode(index: number) {
	currentModeIndex = ((index % MODES.length) + MODES.length) % MODES.length;
	void transitionTo(modeAt(currentModeIndex)).then(scheduleCycle);
}

function setupKeyboard() {
	window.addEventListener('keydown', (ev: KeyboardEvent) => {
		switch (ev.key) {
			case '1':
				goToMode(0);
				break;
			case '2':
				goToMode(1);
				break;
			case '3':
				goToMode(2);
				break;
			case 'r':
			case 'R':
				goToMode(currentModeIndex);
				break;
			case ' ':
				paused = !paused;
				log(paused ? 'auto-cycle PAUSED (space to resume)' : 'auto-cycle RESUMED', 'warn');
				scheduleCycle();
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
		// On BrightSign a video reaching its duration emits ENDED; calling play() again
		// maps to a native resume, keeping it looping (same pattern as the gapless example).
		const slot = activeSlots.find((s) => s.url === event.srcArguments.uri);
		if (slot) {
			slot.loops = slot.loops + 1;
			log(slot.name + ': ended → replay (loop #' + slot.loops + ')', 'info');
			setSlotState(slot, 'playing · loop ' + slot.loops);
			void sos.video
				.play(slot.url, slot.rect.x, slot.rect.y, slot.rect.width, slot.rect.height)
				.catch((e) => log(slot.name + ': replay failed — ' + errMsg(e), 'err'));
		} else {
			log('video.onEnded (inactive): ' + describeEvent(event), 'info');
		}
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
	// https://developers.signageos.io/sdk/sos_management/#getmodel
	const model = await tryGet(() => sos.management.getModel());
	const brand = await tryGet(() => sos.management.getBrand());
	const serial = await tryGet(() => sos.management.getSerialNumber());
	const firmwareType = await tryGet(() => sos.management.firmware.getType());
	// https://developers.signageos.io/sdk/sos_management/firmware#getversion
	const firmwareVersion = await tryGet(() => sos.management.firmware.getVersion());
	log('model: ' + model, 'ok');
	log('brand: ' + brand);
	log('serialNumber: ' + serial);
	log('firmware.type: ' + firmwareType);
	log('firmware.version: ' + firmwareVersion, 'ok');
	setDeviceBadge(model, firmwareVersion);
}

sos.onReady().then(async function () {
	log('sOS ready', 'ok');

	const rects = computeRects();
	video1 = {
		name: 'VIDEO 1',
		loops: 0,
		uid: 'bg-test-video-1.mp4',
		remoteUrl: VIDEO_1_URL,
		url: '',
		rect: rects.v1,
		overlayEl: byId('overlay-1'),
		stateEl: byId('state-1'),
	};
	video2 = {
		name: 'VIDEO 2',
		loops: 0,
		uid: 'bg-test-video-2.mp4',
		remoteUrl: VIDEO_2_URL,
		url: '',
		rect: rects.v2,
		overlayEl: byId('overlay-2'),
		stateEl: byId('state-2'),
	};
	positionOverlay(video1.overlayEl, video1.rect);
	positionOverlay(video2.overlayEl, video2.rect);

	window.addEventListener('resize', () => {
		const r = computeRects();
		video1.rect = r.v1;
		video2.rect = r.v2;
		positionOverlay(video1.overlayEl, r.v1);
		positionOverlay(video2.overlayEl, r.v2);
	});

	await logDeviceInfo();
	setupVideoListeners();
	setupKeyboard();

	// Download both videos to local storage BEFORE playing. BrightSign's sos.video cannot
	// stream a remote URL — it resolves the URI to a local file path, so a raw https URL
	// fails with "Invalid local uri". This is sequential so the log is easy to follow.
	log('caching videos to local storage…', 'warn');
	await cacheVideo(video1);
	await cacheVideo(video2);

	log('Auto-cycling modes every ' + CYCLE_MS / 1000 + 's. Keys: 1/2/3 = mode, space = pause/resume, r = re-run.', 'warn');
	await transitionTo(modeAt(currentModeIndex));
	scheduleCycle();
});
