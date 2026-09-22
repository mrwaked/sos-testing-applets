const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/messages.sample.json');
const { parseIsoUtc } = require('../dist-test/parser.js');
const { buildSeries, seriesSignature, stepPaths, VIEW_W, VIEW_H } = require('../dist-test/chart.js');

const utc = (iso) => parseIsoUtc(iso);
const NOW = utc(fixture.nowTime);

test('buildSeries: counts in time order, closing/opening as zero, mentions and ads skipped, terminal point at now', () => {
	const points = buildSeries(fixture.messages, NOW, 10);
	assert.deepEqual(points.map((p) => p.count), [8, 7, 9, 11, 7, 10, 11, 15, 0, 0, 1, 2, 4, 6, 10, 10]);
	assert.equal(points[0].ms, utc('2026-09-15T13:51:20+00:00'));
	assert.equal(points[8].ms, utc('2026-09-15T21:23:18+00:00'));
	assert.equal(points[9].ms, utc('2026-09-16T09:58:17+00:00'));
	assert.equal(points[points.length - 1].ms, NOW);
	for (let i = 1; i < points.length; i++) assert.ok(points[i].ms >= points[i - 1].ms, 'sorted ascending');
});

test('buildSeries: terminal point uses the displayed count (closed/stale -> 0) or holds the last value', () => {
	const closedNow = buildSeries(fixture.messages, NOW, 0);
	assert.equal(closedNow[closedNow.length - 1].count, 0);
	const held = buildSeries(fixture.messages, NOW, null);
	assert.equal(held[held.length - 1].count, 10);
});

test('buildSeries: future-dated and unparsable messages are ignored; empty input -> empty series', () => {
	const messages = [
		{ time: '2030-01-01T00:00:00+00:00', text: 'v kině 99 samců' },
		{ time: 'garbage', text: 'v kině 5 samců' },
	];
	assert.deepEqual(buildSeries(messages, NOW, 3), []);
	assert.deepEqual(buildSeries([], NOW, 3), []);
});

test('seriesSignature: stable across a time tick, changes when a value changes', () => {
	const a = buildSeries(fixture.messages, NOW, 10);
	const b = buildSeries(fixture.messages, NOW + 60000, 10);
	assert.equal(seriesSignature(a), seriesSignature(b));
	const withNew = fixture.messages.concat([{ time: '2026-09-16T12:30:00+00:00', text: 'v kině 12 samců' }]);
	assert.notEqual(seriesSignature(buildSeries(withNew, NOW, 12)), seriesSignature(a));
	assert.notEqual(seriesSignature(buildSeries(fixture.messages, NOW, 0)), seriesSignature(a), 'displayed count is part of the key');
});

test('stepPaths: right-anchored step path with headroom, area closes on the baseline', () => {
	const points = buildSeries(fixture.messages, NOW, 10);
	const g = stepPaths(points);
	assert.ok(g);
	assert.match(g.line, /^M\d+(\.\d)? \d+(\.\d)?(H\d+(\.\d)?(V\d+(\.\d)?)?)+$/);
	assert.equal(g.endX, VIEW_W, 'last point sits on the right edge');
	assert.ok(g.line.indexOf('M0 ') === 0, 'first point sits on the left edge');
	// max 15 -> y for 10 = 288 - (10/15) * 248
	assert.equal(g.endY, Math.round((288 - (10 / 15) * 248) * 10) / 10);
	assert.ok(g.area.indexOf(g.line) === 0);
	assert.match(g.area, /V288H0Z$/);
	assert.ok(g.endY > 0 && g.endY < VIEW_H);
});

test('stepPaths: all zeros gives a flat baseline, single point spans at least an hour, empty -> null', () => {
	const zeros = [{ ms: NOW - 7200e3, count: 0 }, { ms: NOW, count: 0 }];
	const flat = stepPaths(zeros);
	assert.equal(flat.line, 'M0 288H1000');
	assert.equal(flat.endY, 288);
	const single = stepPaths([{ ms: NOW - 600e3, count: 3 }, { ms: NOW, count: 3 }]);
	assert.ok(single.line.indexOf('M833.3 ') === 0, 'ten minutes inside a one-hour window');
	assert.equal(stepPaths([]), null);
});
