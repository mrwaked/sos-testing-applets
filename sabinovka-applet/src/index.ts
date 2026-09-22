import './index.css';
import sos from '@signageos/front-applet';
import type { ChatMessage, Occupancy } from './parser';
import { STALE_MS, deriveOccupancy, formatHHMM, parseIsoUtc, samciNoun } from './parser';
import { VIEW_H, VIEW_W, buildSeries, seriesSignature, stepPaths } from './chart';

interface RelayResponse {
	nowTime: string;
	fetchedAt?: string;
	messages: ChatMessage[];
}

interface LastGood {
	messages: ChatMessage[];
	nowMs: number;
	receivedAt: number;
}

const DEFAULT_REFRESH_S = 60;
const MIN_REFRESH_S = 15;
const MAX_BACKOFF_MS = 10 * 60e3;
const XHR_TIMEOUT_MS = 15e3;

let lastNumText = '';
let lastChartSignature = '';

sos.onReady().then(function () {
	const relayUrl = typeof sos.config.relayUrl === 'string' ? sos.config.relayUrl.trim() : '';
	const refreshSeconds = Number(sos.config.refreshSeconds) || DEFAULT_REFRESH_S;
	const intervalMs = Math.max(MIN_REFRESH_S, refreshSeconds) * 1000;

	if (!relayUrl) {
		renderError('chybí relayUrl v konfiguraci appletu');
		return;
	}
	console.log('[sabinovka] start', relayUrl, 'every', intervalMs / 1000, 's, tz offset', new Date().getTimezoneOffset());
	startPolling(relayUrl, intervalMs);
});

function startPolling(relayUrl: string, intervalMs: number): void {
	let failures = 0;
	let lastGood: LastGood | null = null;

	const schedule = (ms: number) => {
		const jitter = ms * 0.1 * (Math.random() * 2 - 1);
		setTimeout(tick, ms + jitter);
	};

	const show = (messages: ChatMessage[], nowMs: number, warning: string | null) => {
		const occupancy = deriveOccupancy(messages, nowMs, STALE_MS);
		render(occupancy, warning);
		renderChart(messages, nowMs, occupancy);
	};

	const tick = () => {
		getJson<RelayResponse>(relayUrl, XHR_TIMEOUT_MS)
			.then((response) => {
				if (!response || !Array.isArray(response.messages)) {
					throw new Error('unexpected relay response');
				}
				const parsedNow = parseIsoUtc(response.nowTime);
				const nowMs = parsedNow !== null ? parsedNow : Date.now();
				lastGood = { messages: response.messages, nowMs, receivedAt: Date.now() };
				failures = 0;
				show(response.messages, nowMs, null);
				schedule(intervalMs);
			})
			.catch((error: Error) => {
				failures++;
				const reason = error && error.message ? error.message : String(error);
				console.warn('[sabinovka] relay error', reason, 'failures', failures);
				if (lastGood) {
					// Let "now" drift with the device clock so the stale state still triggers while offline.
					show(lastGood.messages, lastGood.nowMs + (Date.now() - lastGood.receivedAt), 'relay offline');
				} else {
					renderError('relay nedostupné: ' + reason);
				}
				schedule(Math.min(intervalMs * Math.pow(2, failures), MAX_BACKOFF_MS));
			});
	};

	tick();
}

function getJson<T>(url: string, timeoutMs: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		const separator = url.indexOf('?') === -1 ? '?' : '&';
		xhr.open('GET', url + separator + 't=' + Date.now(), true);
		xhr.timeout = timeoutMs;
		xhr.onload = () => {
			if (xhr.status < 200 || xhr.status >= 300) {
				reject(new Error('HTTP ' + xhr.status));
				return;
			}
			try {
				resolve(JSON.parse(xhr.responseText) as T);
			} catch (e) {
				reject(new Error('invalid JSON from relay'));
			}
		};
		xhr.onerror = () => reject(new Error('network error'));
		xhr.ontimeout = () => reject(new Error('timeout after ' + timeoutMs + ' ms'));
		xhr.send();
	});
}

function render(occupancy: Occupancy, warning: string | null): void {
	const reportedAt = occupancy.reportedAt !== null ? formatHHMM(occupancy.reportedAt) : null;
	let numText: string;
	let subText = 'v kině';
	let statusText: string;
	let dotClass = '';

	switch (occupancy.status) {
		case 'open':
			numText = occupancy.count === null ? '?' : String(occupancy.count) + (occupancy.approx ? '+' : '');
			statusText = reportedAt ? 'poslední hlášení ' + reportedAt : 'hlášení bez času';
			break;
		case 'closed':
			numText = '0';
			subText = 'v kině · zavřeno';
			statusText = reportedAt ? 'zavřeli v ' + reportedAt : 'zavřeno';
			break;
		case 'stale':
			numText = '0';
			statusText = reportedAt ? 'bez hlášení od ' + reportedAt : 'bez hlášení';
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
	const nounText = occupancy.status === 'open' ? samciNoun(occupancy.count, occupancy.approx) : 'samců';

	if (numText !== lastNumText) {
		replay(byId('headline'), 'pop');
		lastNumText = numText;
	}
	byId('num').textContent = numText;
	byId('noun').textContent = nounText;
	byId('sub').textContent = subText;
	byId('status').textContent = statusText;
	byId('status').className = '';
	byId('dot').className = dotClass;
	byId('root').className = occupancy.status === 'closed' || occupancy.status === 'stale' ? 'closed' : '';

	console.log(
		'[sabinovka]',
		occupancy.status,
		occupancy.count,
		occupancy.approx ? 'approx' : 'exact',
		occupancy.reportedAt !== null ? new Date(occupancy.reportedAt).toISOString() : '-',
		warning || '',
	);
}

/** Redraws the background step chart; the fade-in replays only when a reported value changed, not on every tick. */
function renderChart(messages: ChatMessage[], nowMs: number, occupancy: Occupancy): void {
	const chart = byId('chart');
	const currentCount = occupancy.status === 'open' ? occupancy.count : 0;
	const points = buildSeries(messages, nowMs, currentCount);
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

function renderError(message: string): void {
	byId('num').textContent = '…';
	byId('noun').textContent = 'samců';
	byId('sub').textContent = 'v kině';
	byId('status').textContent = message;
	byId('status').className = 'err';
	byId('dot').className = 'err';
	console.error('[sabinovka]', message);
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
