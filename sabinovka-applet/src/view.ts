// All DOM rendering; state between ticks lives here so the effects know what changed.
import type { ChatMessage, Occupancy } from './parser';
import {
	deriveOccupancy,
	displayText,
	formatHHMM,
	formatRelative,
	girlsStatus,
	latestMessageOfDay,
	parseIsoUtc,
	parseOpeningTime,
	samciNoun,
	slecnyNoun,
} from './parser';
import type { SeriesPoint } from './chart';
import { VIEW_H, VIEW_W, buildSeries, seriesDayMax, seriesSignature, seriesTrend, stepPaths } from './chart';
import { buildStars, burstConfetti } from './effects';
import { initSound, playGong } from './sound';
import gongUrl from './gong.mp3';

const CHAT_MAX_CHARS = 90;
const FANFARE_MIN_COUNT = 5;
const EFFECT_MS = 15000;
const CONFETTI_COUNT = 70;
const CONFETTI_INTERVAL_MS = 2500;
const STAR_COUNT = 70;

let lastNumText = '';
let lastChartSignature = '';
let lastChatText = '';
let lastCount: number | null = null;
let rendered = false;
let numEffectTimer: number | null = null;
let fanfareTimer: number | null = null;
let confettiTimer: number | null = null;

export function init(): void {
	buildStars(byId('stars'), STAR_COUNT);
	initSound(gongUrl);
}

export function show(messages: ChatMessage[], nowMs: number, staleMs: number, warning: string | null): void {
	const occupancy = deriveOccupancy(messages, nowMs, staleMs);
	const points = buildSeries(messages, nowMs, occupancy.status === 'open' ? occupancy.count : 0);

	renderHeadline(occupancy, nowMs, warning);
	renderPills(occupancy, points, messages, nowMs);
	renderChart(points);
	renderChat(messages, nowMs, occupancy);
	renderMood(occupancy, messages, nowMs);
	maybeFanfare(occupancy, points, nowMs, warning);
	rendered = true;

	console.log(
		'[sabinovka]',
		occupancy.status,
		occupancy.count,
		occupancy.approx ? 'approx' : 'exact',
		occupancy.reportedAt !== null ? new Date(occupancy.reportedAt).toISOString() : '-',
		warning || '',
	);
}

export function showError(message: string): void {
	byId('num').textContent = '…';
	byId('noun').textContent = 'samců';
	byId('sub').textContent = 'v kině';
	byId('status').textContent = message;
	byId('status').className = 'err';
	byId('dot').className = 'err';
	console.error('[sabinovka]', message);
}

function renderHeadline(occupancy: Occupancy, nowMs: number, warning: string | null): void {
	const at = occupancy.reportedAt !== null ? formatHHMM(occupancy.reportedAt) : null;
	const ago = occupancy.reportedAt !== null ? formatRelative(nowMs - occupancy.reportedAt) : null;
	let numText: string;
	let subText = 'v kině';
	let statusText: string;
	let dotClass = '';

	switch (occupancy.status) {
		case 'open':
			numText = occupancy.count === null ? '?' : String(occupancy.count) + (occupancy.approx ? '+' : '');
			statusText = at ? 'poslední hlášení před ' + ago + ' · ' + at : 'hlášení bez času';
			break;
		case 'closed':
			numText = '0';
			subText = 'v kině · zavřeno';
			statusText = at ? 'zavřeli před ' + ago + ' · ' + at : 'zavřeno';
			break;
		case 'stale':
			numText = '0';
			statusText = at ? 'bez hlášení už ' + ago + ' · poslední ' + at : 'bez hlášení';
			dotClass = 'warn';
			break;
		default:
			numText = '0';
			statusText = 'zatím žádné hlášení';
			dotClass = 'warn';
	}
	if (warning) {
		statusText += ' · ' + warning;
		dotClass = 'warn';
	}

	if (numText !== lastNumText) {
		if (rendered) {
			replay(byId('headline'), 'pop');
			setNumEffect('changed');
		}
		lastNumText = numText;
	}
	byId('num').textContent = numText;
	byId('noun').textContent = occupancy.status === 'open' ? samciNoun(occupancy.count, occupancy.approx) : 'samců';
	byId('sub').textContent = subText;
	byId('status').textContent = statusText;
	byId('status').className = '';
	byId('dot').className = dotClass;
	byId('root').className = occupancy.status === 'closed' || occupancy.status === 'stale' ? 'closed' : '';
}

function renderPills(occupancy: Occupancy, points: SeriesPoint[], messages: ChatMessage[], nowMs: number): void {
	const trendEl = byId('trend');
	const trend = occupancy.status === 'open' ? seriesTrend(points) : null;
	if (!trend) {
		trendEl.className = 'pill';
	} else {
		const direction = trend.delta > 0 ? 'up' : trend.delta < 0 ? 'down' : 'flat';
		const since = ' od ' + formatHHMM(trend.fromMs);
		byId('trend-text').textContent =
			direction === 'flat' ? 'beze změny' + since : (trend.delta > 0 ? '+' : '−') + Math.abs(trend.delta) + since;
		const nextClass = 'pill show ' + direction;
		if (trendEl.className !== nextClass) {
			replay(trendEl, nextClass);
		}
	}

	const girlsEl = byId('girls');
	const girls = occupancy.status === 'open' ? girlsStatus(messages, nowMs) : { present: false, count: null };
	if (!girls.present) {
		girlsEl.className = 'pill';
	} else {
		byId('girls-text').textContent = (girls.count !== null ? girls.count + ' ' : '') + slecnyNoun(girls.count);
		if (girlsEl.className !== 'pill show') {
			replay(girlsEl, 'pill show');
		}
	}
}

/** Redraws the background step chart; the fade-in replays only when a reported value changed, not on every tick. */
function renderChart(points: SeriesPoint[]): void {
	const chart = byId('chart');
	const geometry = stepPaths(points);
	if (!geometry) {
		chart.className = '';
		lastChartSignature = '';
		return;
	}
	byId('chart-line').setAttribute('d', geometry.line);
	byId('chart-area').setAttribute('d', geometry.area);
	const endDot = byId('chart-dot');
	endDot.style.left = (geometry.endX / VIEW_W) * 100 + '%';
	endDot.style.top = (geometry.endY / VIEW_H) * 100 + '%';

	const signature = seriesSignature(points);
	if (signature !== lastChartSignature) {
		lastChartSignature = signature;
		replay(chart, 'has-data redraw');
	} else {
		chart.className = 'has-data';
	}
}

/** Newest chat line of the current day, shown only while the cinema is open. */
function renderChat(messages: ChatMessage[], nowMs: number, occupancy: Occupancy): void {
	const chat = byId('chat');
	const latest = occupancy.status === 'open' ? latestMessageOfDay(messages, nowMs) : null;
	if (!latest) {
		chat.className = '';
		byId('chat-time').textContent = '';
		byId('chat-text').textContent = '';
		lastChatText = '';
		return;
	}
	const ms = parseIsoUtc(latest.time);
	const text = displayText(latest.text, CHAT_MAX_CHARS);
	byId('chat-time').textContent = ms !== null ? formatHHMM(ms) + ' · ' : '';
	byId('chat-text').textContent = text;
	if (text !== lastChatText) {
		lastChatText = text;
		replay(chat, 'show');
	} else {
		chat.className = 'show';
	}
}

function renderMood(occupancy: Occupancy, messages: ChatMessage[], nowMs: number): void {
	const mood = byId('mood');
	if (occupancy.status === 'closed') {
		const opening = parseOpeningTime(messages, nowMs);
		mood.textContent = 'Sabinovka spí' + (opening ? ' · otevírá od ' + opening : '');
	} else if (occupancy.status === 'stale') {
		mood.textContent = 'Sabinovka asi spí';
	} else {
		mood.textContent = '';
	}
}

/** Confetti bursts, a flashing number and a label for EFFECT_MS when an exact count climbs to a new daily record of at least FANFARE_MIN_COUNT. */
function maybeFanfare(occupancy: Occupancy, points: SeriesPoint[], nowMs: number, warning: string | null): void {
	const count = occupancy.status === 'open' && !occupancy.approx ? occupancy.count : null;
	const isRecord =
		rendered &&
		!warning &&
		count !== null &&
		lastCount !== null &&
		count > lastCount &&
		count >= FANFARE_MIN_COUNT &&
		count >= seriesDayMax(points, nowMs);
	lastCount = count;
	if (!isRecord || count === null) {
		return;
	}
	playGong();
	setNumEffect('flash');
	const label = byId('fanfare');
	label.textContent = 'Nový rekord dne · ' + count;
	replay(label, 'show');

	const burst = () => {
		const rect = byId('num').getBoundingClientRect();
		const x = rect.left + rect.width * (0.2 + Math.random() * 0.6);
		const y = rect.top + rect.height * (0.3 + Math.random() * 0.4);
		burstConfetti(byId('fx'), x, y, CONFETTI_COUNT);
	};
	burst();
	if (confettiTimer !== null) {
		window.clearInterval(confettiTimer);
	}
	confettiTimer = window.setInterval(burst, CONFETTI_INTERVAL_MS);
	if (fanfareTimer !== null) {
		window.clearTimeout(fanfareTimer);
	}
	fanfareTimer = window.setTimeout(() => {
		label.className = '';
		fanfareTimer = null;
		if (confettiTimer !== null) {
			window.clearInterval(confettiTimer);
			confettiTimer = null;
		}
	}, EFFECT_MS - CONFETTI_INTERVAL_MS);
	console.log('[sabinovka] fanfare: new day record', count);
}

/** Puts a timed animation class on the number and clears it after EFFECT_MS so the idle breathing resumes. */
function setNumEffect(className: string): void {
	replay(byId('num'), className);
	if (numEffectTimer !== null) {
		window.clearTimeout(numEffectTimer);
	}
	numEffectTimer = window.setTimeout(() => {
		byId('num').className = '';
		numEffectTimer = null;
	}, EFFECT_MS);
}

/** Restarts a CSS animation by clearing the class, forcing a reflow and setting it again. */
function replay(element: HTMLElement, className: string): void {
	element.className = '';
	void element.offsetWidth;
	element.className = className;
}

function byId(id: string): HTMLElement {
	const element = document.getElementById(id);
	if (!element) {
		throw new Error('missing element #' + id);
	}
	return element;
}
