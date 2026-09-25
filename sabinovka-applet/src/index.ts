import './index.css';
import sos from '@signageos/front-applet';
import type { ChatMessage } from './parser';
import { parseIsoUtc } from './parser';
import { init as initView, show, showError } from './view';

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
const DEFAULT_STALE_HOURS = 4;
const MIN_STALE_HOURS = 0.5;
const MAX_BACKOFF_MS = 10 * 60e3;
const XHR_TIMEOUT_MS = 15e3;

sos.onReady().then(function () {
	const relayUrl = typeof sos.config.relayUrl === 'string' ? sos.config.relayUrl.trim() : '';
	const refreshSeconds = Number(sos.config.refreshSeconds) || DEFAULT_REFRESH_S;
	const intervalMs = Math.max(MIN_REFRESH_S, refreshSeconds) * 1000;
	const staleHours = Number(sos.config.staleHours) || DEFAULT_STALE_HOURS;
	const staleMs = Math.max(MIN_STALE_HOURS, staleHours) * 3600e3;

	initView();
	if (!relayUrl) {
		showError('chybí relayUrl v konfiguraci appletu');
		return;
	}
	console.log(
		'[sabinovka] start',
		relayUrl,
		'every',
		intervalMs / 1000,
		's, stale after',
		staleMs / 3600e3,
		'h, tz offset',
		new Date().getTimezoneOffset(),
	);
	startPolling(relayUrl, intervalMs, staleMs);
});

function startPolling(relayUrl: string, intervalMs: number, staleMs: number): void {
	let failures = 0;
	let lastGood: LastGood | null = null;

	const schedule = (ms: number) => {
		const jitter = ms * 0.1 * (Math.random() * 2 - 1);
		setTimeout(tick, ms + jitter);
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
				show(response.messages, nowMs, staleMs, null);
				schedule(intervalMs);
			})
			.catch((error: Error) => {
				failures++;
				const reason = error && error.message ? error.message : String(error);
				console.warn('[sabinovka] relay error', reason, 'failures', failures);
				if (lastGood) {
					// Let "now" drift with the device clock so the stale state still triggers while offline.
					show(lastGood.messages, lastGood.nowMs + (Date.now() - lastGood.receivedAt), staleMs, 'relay offline');
				} else {
					showError('relay nedostupné: ' + reason);
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
