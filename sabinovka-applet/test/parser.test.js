const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/messages.sample.json');
const {
	classify,
	deriveOccupancy,
	formatHHMM,
	normalizeText,
	parseIsoUtc,
	samciNoun,
	STALE_MS,
} = require('../dist-test/parser.js');

const EXPECTED_BY_TIME = {
	'2026-09-15T13:51:20+00:00': ['count', 8],
	'2026-09-15T14:35:28+00:00': ['count', 7],
	'2026-09-15T15:13:27+00:00': ['count', 9],
	'2026-09-15T16:11:35+00:00': ['count', 11],
	'2026-09-15T16:26:50+00:00': ['count', 7],
	'2026-09-15T17:19:54+00:00': ['count', 10],
	'2026-09-15T17:39:40+00:00': ['none', null],
	'2026-09-15T17:40:37+00:00': ['count', 11],
	'2026-09-15T18:29:47+00:00': ['count', 15],
	'2026-09-15T18:40:18+00:00': ['mention', null],
	'2026-09-15T19:12:37+00:00': ['mention', null],
	'2026-09-15T20:04:21+00:00': ['mention', null],
	'2026-09-15T20:54:57+00:00': ['mention', null],
	'2026-09-15T21:23:18+00:00': ['closed', null],
	'2026-09-16T09:04:15+00:00': ['none', null],
	'2026-09-16T09:58:17+00:00': ['open', null],
	'2026-09-16T10:14:56+00:00': ['count', 1],
	'2026-09-16T10:21:35+00:00': ['count', 2],
	'2026-09-16T10:40:33+00:00': ['count', 4],
	'2026-09-16T11:19:52+00:00': ['count', 6],
	'2026-09-16T11:47:17+00:00': ['count', 10],
};

const utc = (iso) => parseIsoUtc(iso);
const upTo = (iso) => fixture.messages.filter((m) => utc(m.time) <= utc(iso));

test('fixture covers 21 real messages and every one has an expectation', () => {
	assert.equal(fixture.messages.length, 21);
	for (const message of fixture.messages) {
		assert.ok(EXPECTED_BY_TIME[message.time], 'missing expectation for ' + message.time);
	}
});

test('classify: every real message', () => {
	for (const message of fixture.messages) {
		const [kind, count] = EXPECTED_BY_TIME[message.time];
		assert.deepEqual(classify(message.text), { kind, count }, message.time + ' | ' + message.text);
	}
});

test('classify: synthetic edge cases', () => {
	const cases = [
		['[emoticon custom="3"] v kině 5 samců', 'count', 5],
		['v kině 12 samců&nbsp;mix', 'count', 12],
		['V KINĚ 7 SAMCŮ', 'count', 7],
		['v kině jeden samec', 'count', 1],
		['žádný samec', 'count', 0],
		['v kině 100 samců', 'count', 100],
		['v kině samců 12', 'mention', null],
		['Poppersy 54 druhů od 250,300 kč', 'none', null],
		['', 'none', null],
		['dnes končíme ve 22:00', 'closed', null],
		['konečně 10 samců', 'count', 10],
		['klub je otevřen od 12', 'open', null],
	];
	for (const [text, kind, count] of cases) {
		assert.deepEqual(classify(text), { kind, count }, JSON.stringify(text));
	}
});

test('normalizeText strips tags, nbsp, leading punctuation and repeated spaces', () => {
	assert.equal(normalizeText(',V kině  10 samců [emoticon custom="1"]'), 'V kině 10 samců');
});

test('deriveOccupancy: live snapshot -> 10 samců, exact', () => {
	const result = deriveOccupancy(fixture.messages, utc(fixture.nowTime), STALE_MS);
	assert.deepEqual(result, { status: 'open', count: 10, approx: false, reportedAt: utc('2026-09-16T11:47:17+00:00') });
});

test('deriveOccupancy: samci mention after a count -> 15+', () => {
	const result = deriveOccupancy(upTo('2026-09-15T18:40:18+00:00'), utc('2026-09-15T18:45:00+00:00'), STALE_MS);
	assert.deepEqual(result, { status: 'open', count: 15, approx: true, reportedAt: utc('2026-09-15T18:40:18+00:00') });
});

test('deriveOccupancy: closing message wins even with a number in it', () => {
	const result = deriveOccupancy(upTo('2026-09-15T21:23:18+00:00'), utc('2026-09-15T21:30:00+00:00'), STALE_MS);
	assert.deepEqual(result, { status: 'closed', count: 0, approx: false, reportedAt: utc('2026-09-15T21:23:18+00:00') });
});

test('deriveOccupancy: next-morning ad is skipped, still closed', () => {
	const result = deriveOccupancy(upTo('2026-09-16T09:04:15+00:00'), utc('2026-09-16T09:30:00+00:00'), STALE_MS);
	assert.equal(result.status, 'closed');
	assert.equal(result.reportedAt, utc('2026-09-15T21:23:18+00:00'));
});

test('deriveOccupancy: "otevřen" -> open with 0', () => {
	const result = deriveOccupancy(upTo('2026-09-16T09:58:17+00:00'), utc('2026-09-16T10:00:00+00:00'), STALE_MS);
	assert.deepEqual(result, { status: 'open', count: 0, approx: false, reportedAt: utc('2026-09-16T09:58:17+00:00') });
});

test('deriveOccupancy: no report for more than 4 h -> stale', () => {
	const result = deriveOccupancy(fixture.messages, utc('2026-09-16T16:00:00+00:00'), STALE_MS);
	assert.deepEqual(result, { status: 'stale', count: 0, approx: false, reportedAt: utc('2026-09-16T11:47:17+00:00') });
});

test('deriveOccupancy: mention with no earlier count -> unknown count, approx', () => {
	const messages = [{ time: '2026-09-16T10:00:00+00:00', text: 'v kině samci mix' }];
	const result = deriveOccupancy(messages, utc('2026-09-16T10:05:00+00:00'), STALE_MS);
	assert.deepEqual(result, { status: 'open', count: null, approx: true, reportedAt: utc('2026-09-16T10:00:00+00:00') });
});

test('deriveOccupancy: nothing relevant -> unknown', () => {
	assert.equal(deriveOccupancy([], Date.now(), STALE_MS).status, 'unknown');
	const ads = [{ time: '2026-09-16T10:00:00+00:00', text: 'Poppersy 54 druhů' }];
	assert.equal(deriveOccupancy(ads, utc('2026-09-16T10:05:00+00:00'), STALE_MS).status, 'unknown');
});

test('deriveOccupancy: input order does not matter', () => {
	const shuffled = fixture.messages.slice().reverse();
	assert.deepEqual(deriveOccupancy(shuffled, utc(fixture.nowTime), STALE_MS), deriveOccupancy(fixture.messages, utc(fixture.nowTime), STALE_MS));
});

test('samciNoun: Czech declension', () => {
	assert.equal(samciNoun(1, false), 'samec');
	assert.equal(samciNoun(2, false), 'samci');
	assert.equal(samciNoun(3, false), 'samci');
	assert.equal(samciNoun(4, false), 'samci');
	assert.equal(samciNoun(0, false), 'samců');
	assert.equal(samciNoun(5, false), 'samců');
	assert.equal(samciNoun(11, false), 'samců');
	assert.equal(samciNoun(100, false), 'samců');
	assert.equal(samciNoun(15, true), 'samců');
	assert.equal(samciNoun(null, true), 'samců');
});

test('parseIsoUtc: offsets and invalid input', () => {
	const expected = Date.UTC(2026, 8, 16, 11, 47, 17);
	assert.equal(parseIsoUtc('2026-09-16T11:47:17+00:00'), expected);
	assert.equal(parseIsoUtc('2026-09-16T11:47:17Z'), expected);
	assert.equal(parseIsoUtc('2026-09-16T13:47:17+02:00'), expected);
	assert.equal(parseIsoUtc('2026-09-16T11:47:17.123Z'), expected + 0);
	assert.equal(parseIsoUtc('garbage'), null);
});

test('formatHHMM: zero-padded HH:MM', () => {
	assert.match(formatHHMM(Date.now()), /^\d{2}:\d{2}$/);
	const nineOhFive = new Date(2026, 0, 1, 9, 5).getTime();
	assert.equal(formatHHMM(nineOhFive), '09:05');
});

test('latestMessageOfDay: newest message of the current local day only (TZ pinned to Europe/Prague)', () => {
	assert.equal(process.env.TZ, 'Europe/Prague');
	const today = require('../dist-test/parser.js').latestMessageOfDay(fixture.messages, utc(fixture.nowTime));
	assert.equal(today.time, '2026-09-16T11:47:17+00:00');
	const lateYesterday = require('../dist-test/parser.js').latestMessageOfDay(fixture.messages, utc('2026-09-15T21:30:00+00:00'));
	assert.equal(lateYesterday.time, '2026-09-15T21:23:18+00:00', '23:23 local is still the 15th');
	const afterMidnight = require('../dist-test/parser.js').latestMessageOfDay(fixture.messages, utc('2026-09-15T22:30:00+00:00'));
	assert.equal(afterMidnight, null, '00:30 local on the 16th has no messages yet');
	assert.equal(require('../dist-test/parser.js').latestMessageOfDay(fixture.messages, utc('2026-09-17T10:00:00+00:00')), null);
	assert.equal(require('../dist-test/parser.js').latestMessageOfDay([], utc(fixture.nowTime)), null);
});

test('displayText: strips tags and nbsp, truncates long text with an ellipsis', () => {
	const { displayText } = require('../dist-test/parser.js');
	assert.equal(displayText('V kině 10 samců [emoticon custom="16"]', 90), 'V kině 10 samců');
	assert.equal(displayText('v kině 6 samců mix Poppersy 54 druhů od 250,300,350,400 kč......a jiné dobroty', 40), 'v kině 6 samců mix Poppersy 54 druhů od…');
	assert.ok(displayText(fixture.messages[0].text, 90).length <= 90);
	assert.equal(displayText('', 90), '');
});

test('girlsStatus: follows the newest status-bearing message, closing means no', () => {
	const { girlsStatus } = require('../dist-test/parser.js');
	assert.deepEqual(girlsStatus(fixture.messages, utc(fixture.nowTime)), { present: false, count: null });
	assert.deepEqual(girlsStatus(upTo('2026-09-15T20:04:21+00:00'), utc('2026-09-15T20:10:00+00:00')), { present: true, count: null });
	assert.deepEqual(girlsStatus(upTo('2026-09-15T20:54:57+00:00'), utc('2026-09-15T21:00:00+00:00')), { present: false, count: null }, '"už jen samci" ends it');
	assert.deepEqual(girlsStatus(upTo('2026-09-15T21:23:18+00:00'), utc('2026-09-15T21:30:00+00:00')), { present: false, count: null }, 'closing note');
	const counted = [{ time: '2026-09-16T10:00:00+00:00', text: 'v kině 5 samců a 2 slečny [emoticon custom="1"]' }];
	assert.deepEqual(girlsStatus(counted, utc('2026-09-16T10:05:00+00:00')), { present: true, count: 2 });
	assert.deepEqual(girlsStatus([], utc(fixture.nowTime)), { present: false, count: null });
});

test('slecnyNoun: Czech declension', () => {
	const { slecnyNoun } = require('../dist-test/parser.js');
	assert.equal(slecnyNoun(1), 'slečna');
	assert.equal(slecnyNoun(2), 'slečny');
	assert.equal(slecnyNoun(4), 'slečny');
	assert.equal(slecnyNoun(5), 'slečen');
	assert.equal(slecnyNoun(null), 'slečny');
});

test('parseOpeningTime: "od 12 hodin" and "od 10:30" forms, prices ignored', () => {
	const { parseOpeningTime } = require('../dist-test/parser.js');
	assert.equal(parseOpeningTime(fixture.messages, utc(fixture.nowTime)), '12:00');
	const clock = [{ time: '2026-09-16T08:00:00+00:00', text: 'Dnes otevřeno od 10:30 [emoticon custom="2"]' }];
	assert.equal(parseOpeningTime(clock, utc('2026-09-16T09:00:00+00:00')), '10:30');
	const hod = [{ time: '2026-09-16T08:00:00+00:00', text: 'těšíme se na vás od 9 hod.' }];
	assert.equal(parseOpeningTime(hod, utc('2026-09-16T09:00:00+00:00')), '09:00');
	const prices = [{ time: '2026-09-16T08:00:00+00:00', text: 'Poppersy 54 druhů od 250,300,350,400 kč a od 5 hlavních značek' }];
	assert.equal(parseOpeningTime(prices, utc('2026-09-16T09:00:00+00:00')), null);
	assert.equal(parseOpeningTime([], utc(fixture.nowTime)), null);
});

test('formatRelative: Czech elapsed time without the preposition', () => {
	const { formatRelative } = require('../dist-test/parser.js');
	assert.equal(formatRelative(30e3), 'chvilkou');
	assert.equal(formatRelative(12 * 60e3), '12 min');
	assert.equal(formatRelative(125 * 60e3), '2 h 5 min');
	assert.equal(formatRelative(180 * 60e3), '3 h');
	assert.equal(formatRelative(-5000), 'chvilkou');
});
