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
