// Pure geometry for the background history chart; no DOM so it runs under node:test.
import type { ChatMessage } from './parser';
import { classify, parseIsoUtc } from './parser';

export interface SeriesPoint {
	ms: number;
	count: number;
}

export interface ChartGeometry {
	line: string;
	area: string;
	endX: number;
	endY: number;
}

export const VIEW_W = 1000;
export const VIEW_H = 300;
const PAD_TOP = 40;
const PAD_BOTTOM = 12;
const MIN_SPAN_MS = 3600e3;

/** Reported counts in time order plus a terminal point at `nowMs`; closing/opening notes count as zero, bare mentions hold the previous value. */
export function buildSeries(messages: ChatMessage[], nowMs: number, currentCount: number | null): SeriesPoint[] {
	const points: SeriesPoint[] = [];
	for (const message of messages) {
		const ms = parseIsoUtc(message.time);
		if (ms === null || ms > nowMs) {
			continue;
		}
		const cls = classify(message.text);
		if (cls.kind === 'count' && cls.count !== null) {
			points.push({ ms, count: cls.count });
		} else if (cls.kind === 'closed' || cls.kind === 'open') {
			points.push({ ms, count: 0 });
		}
	}
	points.sort((a, b) => a.ms - b.ms);
	const last = points[points.length - 1];
	if (!last) {
		return points;
	}
	if (nowMs > last.ms) {
		points.push({ ms: nowMs, count: currentCount !== null ? currentCount : last.count });
	}
	return points;
}

/** Stable key of the reported values; the terminal "now" point is excluded so a plain time tick does not count as a change. */
export function seriesSignature(points: SeriesPoint[]): string {
	const parts: string[] = [];
	for (let i = 0; i < points.length - 1; i++) {
		const p = points[i];
		if (p) {
			parts.push(p.ms + ':' + p.count);
		}
	}
	const last = points[points.length - 1];
	return parts.join('|') + (last ? '|end:' + last.count : '');
}

/** Right-anchored step line (and its area) in a VIEW_W x VIEW_H box; y scales to the highest count with headroom. */
export function stepPaths(points: SeriesPoint[]): ChartGeometry | null {
	const first = points[0];
	const last = points[points.length - 1];
	if (!first || !last) {
		return null;
	}
	let maxCount = 0;
	for (const p of points) {
		if (p.count > maxCount) {
			maxCount = p.count;
		}
	}
	const yMax = Math.max(maxCount, 1);
	const spanMs = Math.max(last.ms - first.ms, MIN_SPAN_MS);
	const x0 = last.ms - spanMs;
	const sx = (ms: number) => round1(((ms - x0) / spanMs) * VIEW_W);
	const sy = (count: number) => round1(VIEW_H - PAD_BOTTOM - (count / yMax) * (VIEW_H - PAD_TOP - PAD_BOTTOM));

	const startX = sx(first.ms);
	let d = 'M' + startX + ' ' + sy(first.count);
	let prevY = sy(first.count);
	for (let i = 1; i < points.length; i++) {
		const p = points[i];
		if (!p) {
			continue;
		}
		const y = sy(p.count);
		d += 'H' + sx(p.ms);
		if (y !== prevY) {
			d += 'V' + y;
			prevY = y;
		}
	}
	const baseline = round1(VIEW_H - PAD_BOTTOM);
	return { line: d, area: d + 'V' + baseline + 'H' + startX + 'Z', endX: sx(last.ms), endY: prevY };
}

function round1(value: number): number {
	return Math.round(value * 10) / 10;
}
