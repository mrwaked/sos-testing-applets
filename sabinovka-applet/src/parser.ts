// Pure parsing of the club chat; no DOM or sos imports so it also runs under node:test.

export type Kind = 'closed' | 'count' | 'mention' | 'open' | 'none';
export type Status = 'open' | 'closed' | 'stale' | 'unknown';

export interface Classification {
	kind: Kind;
	count: number | null;
}

export interface ChatMessage {
	id?: string | number;
	time: string;
	text: string;
}

export interface Occupancy {
	status: Status;
	count: number | null;
	approx: boolean;
	reportedAt: number | null;
}

/** No report for this long means the cinema is treated as closed. */
export const STALE_MS = 4 * 3600e3;

// ES5-safe regexes: no `u` flag, literal Czech letters, no `\b` next to them.
const SAMEC = '(?:samec|samc[iůue])';
const DIGIT_COUNT_RE = new RegExp('(\\d+)\\s*' + SAMEC, 'i');
const WORD_COUNT_RE = new RegExp('(jeden|jedna|jedno|dva|dvě|tři|čtyři|pět|šest|sedm|osm|devět|deset)\\s+' + SAMEC, 'i');
const ZERO_RE = new RegExp('žádn[ýáéí]\\s+' + SAMEC + '|prázdno', 'i');
const MENTION_RE = new RegExp(SAMEC, 'i');
const CLOSED_RE = /končíme|zavřeno|zavíráme|zavírame|zavreno|uzavřeno/i;
const OPEN_RE = /otevřen|otevíráme|otvíráme|otevreno/i;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

const WORD_NUMBERS: { [word: string]: number } = {
	jeden: 1,
	jedna: 1,
	jedno: 1,
	dva: 2,
	dvě: 2,
	tři: 3,
	čtyři: 4,
	pět: 5,
	šest: 6,
	sedm: 7,
	osm: 8,
	devět: 9,
	deset: 10,
};

export function normalizeText(text: string): string {
	return text
		.replace(/\[[^\]]*\]/g, ' ')
		.replace(/&nbsp;| /g, ' ')
		.replace(/\s+/g, ' ')
		.replace(/^[\s,.]+/, '')
		.trim();
}

export function classify(rawText: string): Classification {
	const text = normalizeText(rawText);
	if (CLOSED_RE.test(text)) {
		return { kind: 'closed', count: null };
	}
	const digit = DIGIT_COUNT_RE.exec(text);
	if (digit && digit[1]) {
		return { kind: 'count', count: parseInt(digit[1], 10) };
	}
	const word = WORD_COUNT_RE.exec(text);
	const wordValue = word && word[1] ? WORD_NUMBERS[word[1].toLowerCase()] : undefined;
	if (wordValue !== undefined) {
		return { kind: 'count', count: wordValue };
	}
	if (ZERO_RE.test(text)) {
		return { kind: 'count', count: 0 };
	}
	if (MENTION_RE.test(text)) {
		return { kind: 'mention', count: null };
	}
	if (OPEN_RE.test(text)) {
		return { kind: 'open', count: null };
	}
	return { kind: 'none', count: null };
}

interface Classified {
	ms: number;
	cls: Classification;
}

/** Walks messages newest to oldest; the first decisive report wins, a bare samci mention keeps the previous count as approximate. */
export function deriveOccupancy(messages: ChatMessage[], nowMs: number, staleMs: number = STALE_MS): Occupancy {
	const items: Classified[] = [];
	for (const message of messages) {
		const ms = parseIsoUtc(message.time);
		if (ms !== null) {
			items.push({ ms, cls: classify(message.text) });
		}
	}
	items.sort((a, b) => b.ms - a.ms);

	let mentionAt: number | null = null;
	for (const item of items) {
		const kind = item.cls.kind;
		if (kind === 'none') {
			continue;
		}
		if (kind === 'closed') {
			return { status: 'closed', count: 0, approx: false, reportedAt: item.ms };
		}
		if (kind === 'count') {
			return mentionAt !== null
				? openOrStale(item.cls.count, true, mentionAt, nowMs, staleMs)
				: openOrStale(item.cls.count, false, item.ms, nowMs, staleMs);
		}
		if (kind === 'open') {
			return mentionAt !== null
				? openOrStale(null, true, mentionAt, nowMs, staleMs)
				: openOrStale(0, false, item.ms, nowMs, staleMs);
		}
		if (mentionAt === null) {
			mentionAt = item.ms;
		}
	}
	if (mentionAt !== null) {
		return openOrStale(null, true, mentionAt, nowMs, staleMs);
	}
	return { status: 'unknown', count: null, approx: false, reportedAt: null };
}

function openOrStale(count: number | null, approx: boolean, reportedAt: number, nowMs: number, staleMs: number): Occupancy {
	if (nowMs - reportedAt > staleMs) {
		return { status: 'stale', count: 0, approx: false, reportedAt };
	}
	return { status: 'open', count, approx, reportedAt };
}

export function samciNoun(count: number | null, approx: boolean): string {
	if (count === null || approx) {
		return 'samců';
	}
	if (count === 1) {
		return 'samec';
	}
	if (count >= 2 && count <= 4) {
		return 'samci';
	}
	return 'samců';
}

export function parseIsoUtc(iso: string): number | null {
	const m = ISO_RE.exec(iso);
	if (!m) {
		const fallback = Date.parse(iso);
		return isNaN(fallback) ? null : fallback;
	}
	let ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
	const tz = m[7];
	if (tz && tz !== 'Z') {
		const sign = tz.charAt(0) === '-' ? -1 : 1;
		const digits = tz.slice(1).replace(':', '');
		const offsetMinutes = Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4));
		ms -= sign * offsetMinutes * 60000;
	}
	return ms;
}

export function formatHHMM(ms: number): string {
	const date = new Date(ms);
	return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
}

function pad2(value: number): string {
	return (value < 10 ? '0' : '') + value;
}

/** Newest message posted on the same local calendar day as `nowMs`, or null. */
export function latestMessageOfDay(messages: ChatMessage[], nowMs: number): ChatMessage | null {
	let best: ChatMessage | null = null;
	let bestMs = -Infinity;
	for (const message of messages) {
		const ms = parseIsoUtc(message.time);
		if (ms === null || ms > nowMs || ms <= bestMs || !isSameLocalDay(ms, nowMs)) {
			continue;
		}
		best = message;
		bestMs = ms;
	}
	return best;
}

export function isSameLocalDay(a: number, b: number): boolean {
	const da = new Date(a);
	const db = new Date(b);
	return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export function displayText(text: string, maxLength: number): string {
	const clean = normalizeText(text);
	if (clean.length <= maxLength) {
		return clean;
	}
	return clean.slice(0, maxLength - 1).replace(/\s+$/, '') + '…';
}

export interface GirlsStatus {
	present: boolean;
	count: number | null;
}

const GIRLS_RE = /slečn|holk|dívk/i;
const GIRLS_COUNT_RE = /(\d+)\s*(?:slečn|holk|dívk)/i;
const OPENING_HOURS_RE = /\bod\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:hodin|hod\.?|h)(?![a-záčďéěíňóřšťúůýž])/i;
const OPENING_CLOCK_RE = /\bod\s+(\d{1,2}):(\d{2})/i;

/** Whether the newest status-bearing message says girls are present; a closing note always means no. */
export function girlsStatus(messages: ChatMessage[], nowMs: number): GirlsStatus {
	let latest: { ms: number; text: string; kind: Kind } | null = null;
	for (const message of messages) {
		const ms = parseIsoUtc(message.time);
		if (ms === null || ms > nowMs) {
			continue;
		}
		const cls = classify(message.text);
		if (cls.kind === 'none') {
			continue;
		}
		if (!latest || ms > latest.ms) {
			latest = { ms, text: normalizeText(message.text), kind: cls.kind };
		}
	}
	if (!latest || latest.kind === 'closed' || !GIRLS_RE.test(latest.text)) {
		return { present: false, count: null };
	}
	const counted = GIRLS_COUNT_RE.exec(latest.text);
	return { present: true, count: counted && counted[1] ? parseInt(counted[1], 10) : null };
}

export function slecnyNoun(count: number | null): string {
	if (count === 1) {
		return 'slečna';
	}
	if (count === null || (count >= 2 && count <= 4)) {
		return 'slečny';
	}
	return 'slečen';
}

/** Opening time ("od 12 hodin", "od 10:30") from the newest message that states one, as HH:MM. */
export function parseOpeningTime(messages: ChatMessage[], nowMs: number): string | null {
	let best: { ms: number; value: string } | null = null;
	for (const message of messages) {
		const ms = parseIsoUtc(message.time);
		if (ms === null || ms > nowMs) {
			continue;
		}
		const text = normalizeText(message.text);
		const match = OPENING_HOURS_RE.exec(text) || OPENING_CLOCK_RE.exec(text);
		if (!match || !match[1]) {
			continue;
		}
		const hours = parseInt(match[1], 10);
		const minutes = match[2] ? parseInt(match[2], 10) : 0;
		if (hours > 23 || minutes > 59) {
			continue;
		}
		if (!best || ms > best.ms) {
			best = { ms, value: pad2(hours) + ':' + pad2(minutes) };
		}
	}
	return best ? best.value : null;
}

/** Elapsed time in Czech without the preposition: "chvilkou", "12 min", "2 h 5 min", "3 h". */
export function formatRelative(deltaMs: number): string {
	const minutes = Math.floor(Math.max(deltaMs, 0) / 60000);
	if (minutes < 1) {
		return 'chvilkou';
	}
	if (minutes < 60) {
		return minutes + ' min';
	}
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0 ? hours + ' h' : hours + ' h ' + rest + ' min';
}
