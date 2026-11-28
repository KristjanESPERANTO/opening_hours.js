// SPDX-FileCopyrightText: © opening_hours.js contributors
// SPDX-License-Identifier: LGPL-3.0-only

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';
const { default: opening_hours } = await import('../../build/opening_hours.esm.mjs');

const localDate = (hour, minute = 0) => new Date(2026, 0, 5, hour, minute);

test('getIterator exposes the initial state and advances to state changes', () => {
    const start = localDate(8);
    const iterator = new opening_hours('Mo 09:00-17:00').getIterator(start);

    assert.equal(iterator.getDate().getTime(), start.getTime());
    assert.equal(iterator.getState(), false);
    assert.equal(iterator.getUnknown(), false);
    assert.equal(iterator.getStateString(false), 'close');

    assert.equal(iterator.advance(localDate(18)), true);
    assert.equal(iterator.getDate().getTime(), localDate(9).getTime());
    assert.equal(iterator.getState(), true);

    assert.equal(iterator.advance(localDate(18)), true);
    assert.equal(iterator.getDate().getTime(), localDate(17).getTime());
    assert.equal(iterator.getStateString(true), 'closed');
});

test('getIterator exposes comments and matching rules for the current state', () => {
    const iterator = new opening_hours('Mo 09:00-17:00 "foo"').getIterator(localDate(8));

    assert.equal(iterator.getComment(), undefined);
    assert.equal(iterator.getMatchingRule(), undefined);

    assert.equal(iterator.advance(localDate(18)), true);
    assert.equal(iterator.getComment(), 'foo');
    assert.equal(iterator.getMatchingRule(), 0);

    assert.equal(iterator.advance(localDate(18)), true);
    assert.equal(iterator.getComment(), undefined);
    assert.equal(iterator.getMatchingRule(), undefined);
});

test('a colon comment is not treated as a time separator', () => {
    const oh = new opening_hours('Mo ":" 09:00-17:00');
    const iterator = oh.getIterator(localDate(10));

    assert.equal(iterator.getState(), false);
    assert.equal(iterator.getUnknown(), true);
    assert.equal(iterator.getComment(), ':');
    assert.deepEqual(oh.getStructuredWarnings(), []);
});

test('a comma comment is not treated as an additional rule', () => {
    const iterator = new opening_hours('Mo open "," 09:00-17:00').getIterator(localDate(10));

    assert.equal(iterator.getState(), true);
    assert.equal(iterator.getUnknown(), false);
    assert.equal(iterator.getComment(), ',');
    assert.equal(iterator.getMatchingRule(), 0);
});

test('readability colons are tolerated only away from rule boundaries and time range ends', () => {
    const iterator = new opening_hours('Mo: 09:00-17:00').getIterator(localDate(10));

    assert.equal(iterator.getState(), true);
    assert.equal(iterator.getUnknown(), false);

    for (const value of [': Mo 09:00-17:00', 'Mo:', 'Mo 09:00-17:00: open']) {
        assert.throws(() => new opening_hours(value), /Unexpected token/);
    }
});

test('getIterator does not advance at or beyond the date limit', () => {
    const iterator = new opening_hours('Mo 09:00-17:00').getIterator(localDate(8));

    assert.equal(iterator.advance(localDate(9)), false);
    assert.equal(iterator.getDate().getHours(), 8);

    assert.equal(iterator.advance(localDate(10)), true);
    assert.equal(iterator.getDate().getTime(), localDate(9).getTime());
});

test('getIterator setDate resets the current state and next change', () => {
    const iterator = new opening_hours('Mo-Fr 09:00-17:00').getIterator(localDate(8));

    iterator.setDate(localDate(10));

    assert.equal(iterator.getDate().getTime(), localDate(10).getTime());
    assert.equal(iterator.getState(), true);
    assert.equal(iterator.getUnknown(), false);

    assert.equal(iterator.advance(localDate(18)), true);
    assert.equal(iterator.getDate().getTime(), localDate(17).getTime());
    assert.equal(iterator.getState(), false);
});

test('getIterator stops when the current state has no next boundary', () => {
    const iterator = new opening_hours('24/7').getIterator(localDate(8));

    assert.equal(iterator.getState(), true);
    assert.equal(iterator.advance(), false);
});

test('supports monthday ranges with an open end', () => {
    const oh = new opening_hours('Mo-Fr 08:00-12:00; 2027 Feb 15+ unknown');

    assert.equal(oh.getStateString(new Date(2027, 1, 14, 10)), 'close');
    assert.equal(oh.getStateString(new Date(2027, 1, 15, 10)), 'unknown');
    assert.deepEqual(oh.getWarnings(), []);
});

test('monthday ranges honor year and date boundaries', () => {
    for (const [value, date, expected] of [
        ['Jan 26-Feb 2', new Date(2027, 0, 25, 12), false],
        ['Jan 26-Feb 2', new Date(2027, 1, 2, 12), true],
        ['Jan 26-Feb 2', new Date(2027, 1, 3, 12), false],
        ['2027 Jan 26-2027 Feb 2', new Date(2027, 0, 26, 12), true],
        ['2027 Jan 26-2027 Feb 2', new Date(2028, 0, 26, 12), false],
        ['Feb 29', new Date(2024, 1, 29, 12), true],
        ['Feb 29', new Date(2025, 2, 1, 12), false],
    ]) {
        assert.equal(new opening_hours(value).getState(date), expected, value);
    }
});

test('explicit monthday ranges reject reversed endpoints', () => {
    for (const endpoint of [
        '2028 Dec 01-2027 Jan 01',
        '2024 Apr 02-2024 Apr 01',
        '2024 easter +1 day-2024 Mar 01',
        '2024 May 01-2024 easter +1 day',
        '2024 Apr 01-2024 Mar Su[-1]',
        '2024 Apr 02-2024 Mar Su[-1] +1 day',
    ]) {
        assert.throws(
            () => new opening_hours(`${endpoint} 10:00-11:00`),
            error => typeof error === 'string'
                && error.split(' <--- (')[0].trimEnd() === endpoint
                && error.includes('Range in wrong order')
        );
    }

    for (const [value, date, expected] of [
        ['Dec 31-Jan 01', new Date(2027, 11, 31, 12), true],
        ['Dec 31-Jan 01', new Date(2028, 0, 1, 12), true],
        ['Dec 31-Jan 01', new Date(2028, 5, 1, 12), false],
        ['2027 Dec 31-2028 Jan 01', new Date(2027, 11, 31, 12), true],
        ['2027 Dec 31-2028 Jan 01', new Date(2028, 0, 1, 12), true],
        ['2027 Dec 31-2028 Jan 01', new Date(2029, 0, 1, 12), false],
        ['2024 Apr 01-2024 Mar Su[-1] +1 day', new Date(2024, 3, 1, 12), true],
    ]) {
        assert.equal(new opening_hours(value).getState(date), expected, value);
    }
});

test('February ranges include existing days in non-leap years', () => {
    for (const [value, date, expected] of [
        ['Feb 28-29', new Date(2024, 1, 28, 12), true],
        ['Feb 28-29', new Date(2024, 1, 29, 12), true],
        ['Feb 28-29', new Date(2024, 2, 1, 12), false],
        ['Feb 28-29', new Date(2025, 1, 28, 12), true],
        ['Feb 28-29', new Date(2025, 2, 1, 12), false],
        ['2025 Feb 28-29', new Date(2025, 1, 28, 12), true],
        ['2025 Feb 28-29', new Date(2025, 2, 1, 12), false],
        ['Feb 27-29/2', new Date(2025, 1, 27, 12), true],
        ['Feb 27-29/2', new Date(2025, 1, 28, 12), false],
        ['Feb 27-29/2', new Date(2024, 1, 29, 12), true],
        ['Feb 29', new Date(2025, 1, 28, 12), false],
        ['2025 Feb 29', new Date(2025, 2, 1, 12), false],
        ['Jan 01-Feb 29', new Date(2025, 1, 28, 12), true],
        ['Jan 01-Feb 29', new Date(2025, 2, 1, 12), false],
        ['Jan 01-Feb 29', new Date(2024, 1, 29, 12), true],
        ['2025 Jan 01-2025 Feb 29', new Date(2025, 2, 1, 12), false],
        ['Feb 29-Mar 02', new Date(2025, 2, 1, 12), true],
        ['2025 Feb 29-2025 Mar 02', new Date(2025, 2, 2, 12), true],
        ['Feb 29-Feb 29', new Date(2025, 2, 1, 12), false],
        ['Feb 29-Feb 29', new Date(2024, 1, 29, 12), true],
        ['2025 Feb 29-2025 Feb 29', new Date(2025, 2, 1, 12), false],
        ['Feb 27-28', new Date(2025, 1, 27, 12), true],
        ['Feb 27-28', new Date(2025, 1, 28, 12), true],
        ['Feb 27-28', new Date(2025, 2, 1, 12), false],
        ['Feb 28-29,27', new Date(2024, 1, 29, 12), true],
        ['Feb 27,28-29', new Date(2024, 1, 29, 12), true],
        ['Feb 28-29,27', new Date(2025, 1, 28, 12), true],
        ['Feb 27,28-29', new Date(2025, 1, 28, 12), true],
    ]) {
        assert.equal(new opening_hours(value).getState(date), expected, value);
    }

    const leapDay = new opening_hours('Feb 29');
    assert.equal(leapDay.getNextChange(new Date(2025, 0, 1), new Date(2029, 0, 1)).getTime(),
        new Date(2028, 1, 29).getTime());
    const leapDayRange = new opening_hours('Feb 29-Feb 29');
    assert.equal(leapDayRange.getNextChange(new Date(2025, 0, 1), new Date(2029, 0, 1)).getTime(),
        new Date(2028, 1, 29).getTime());
    const explicit = new opening_hours('2025 Feb 28-29');
    assert.equal(explicit.getNextChange(new Date(2025, 1, 28), new Date(2026, 0, 1)).getTime(),
        new Date(2025, 2, 1).getTime());
    assert.deepEqual(explicit.getStatePair(new Date(2025, 2, 1)).slice(0, 2), [false, undefined]);
    const periodic = new opening_hours('Feb 27-29/2');
    assert.equal(periodic.getNextChange(new Date(2025, 1, 28), new Date(2027, 0, 1)).getTime(),
        new Date(2026, 1, 27).getTime());
    const crossMonth = new opening_hours('Jan 01-Feb 29');
    assert.equal(crossMonth.getNextChange(new Date(2025, 1, 28), new Date(2026, 0, 1)).getTime(),
        new Date(2025, 2, 1).getTime());
});

test('periodic monthday ranges advance at each selected day boundary', () => {
    const iterator = new opening_hours('Jan 2-6/2').getIterator(new Date(2027, 0, 1, 12));
    const limit = new Date(2027, 0, 8);

    assert.equal(iterator.getState(), false);
    for (const [day, expected] of [
        [2, true], [3, false], [4, true], [5, false], [6, true], [7, false],
    ]) {
        assert.equal(iterator.advance(limit), true);
        assert.equal(iterator.getDate().getTime(), new Date(2027, 0, day).getTime());
        assert.equal(iterator.getState(), expected);
    }
    assert.equal(iterator.advance(limit), false);
});

test('monthday lists preserve ranges, periods and neighboring months', () => {
    for (const [value, date, expected] of [
        ['Jan 2-4,8,10-12/2,Feb 3', new Date(2027, 0, 3, 12), true],
        ['Jan 2-4,8,10-12/2,Feb 3', new Date(2027, 0, 5, 12), false],
        ['Jan 2-4,8,10-12/2,Feb 3', new Date(2027, 0, 8, 12), true],
        ['Jan 2-4,8,10-12/2,Feb 3', new Date(2027, 0, 11, 12), false],
        ['Jan 2-4,8,10-12/2,Feb 3', new Date(2027, 0, 12, 12), true],
        ['Jan 2-4,8,10-12/2,Feb 3', new Date(2027, 1, 3, 12), true],
        ['Jan,Feb 2-4', new Date(2027, 0, 20, 12), true],
        ['Jan,Feb 2-4', new Date(2027, 1, 3, 12), true],
        ['Jan,Feb 2-4', new Date(2027, 1, 5, 12), false],
    ]) {
        assert.equal(new opening_hours(value).getState(date), expected, value);
    }
});

test('single-month day ranges respect explicit years', () => {
    const oh = new opening_hours('2099 Jan 2-4');

    assert.equal(oh.getState(new Date(2098, 0, 3, 12)), false);
    assert.equal(oh.getState(new Date(2099, 0, 1, 12)), false);
    assert.equal(oh.getState(new Date(2099, 0, 3, 12)), true);
    assert.equal(oh.getState(new Date(2099, 0, 5, 12)), false);
    assert.equal(oh.getState(new Date(2100, 0, 3, 12)), false);
});

test('month selectors followed by times are not parsed as month days', () => {
    for (const [value, options, date, expected] of [
        ['Jan 09:00-17:00', undefined, new Date(2027, 0, 20, 10), true],
        ['Jan 09:00-17:00', undefined, new Date(2027, 0, 20, 18), false],
        ['Jan 09:00-17:00', undefined, new Date(2027, 1, 20, 10), false],
        ['Jan 09:00', 1, new Date(2027, 0, 20, 9), true],
        ['Jan 09:00', 1, new Date(2027, 0, 20, 9, 1), false],
    ]) {
        assert.equal(new opening_hours(value, null, options).getState(date), expected, value);
    }
});

test('periodic monthday ranges count calendar days across DST changes', () => {
    for (const [value, month, day] of [
        ['Mar 01-31/2', 2, 31],
        ['Oct 01-31/2', 9, 31],
    ]) {
        const oh = new opening_hours(value);
        const iterator = oh.getIterator(new Date(2026, month, day - 1, 12));

        assert.equal(iterator.getState(), false, value);
        assert.equal(iterator.advance(new Date(2026, month + 1, 1)), true, value);
        assert.equal(iterator.getDate().getTime(), new Date(2026, month, day, 0).getTime(), value);
        assert.equal(iterator.getState(), true, value);
    }

    assert.equal(new opening_hours('Oct 01-31/2').getState(new Date(2026, 9, 30, 23, 30)), false);
});

test('movable event selectors consume optional day offsets', () => {
    for (const [value, date, expected] of [
        ['easter', new Date(2024, 2, 31, 12), true],
        ['easter +1 day', new Date(2024, 3, 1, 12), true],
        ['easter +1 day-Apr 3', new Date(2024, 3, 2, 12), true],
        ['easter +1 day-Apr 3', new Date(2024, 3, 4, 12), false],
        ['2024 easter +1 day', new Date(2024, 3, 1, 12), true],
    ]) {
        assert.equal(new opening_hours(value).getState(date), expected, value);
    }
});

test('movable event range endpoints include the event day', () => {
    for (const [value, start, end] of [
        ['Jan 01-easter', new Date(2024, 0, 1), new Date(2024, 3, 1)],
        ['2024 Jan 01-2024 easter', new Date(2024, 0, 1), new Date(2024, 3, 1)],
        ['easter-easter', new Date(2024, 2, 31), new Date(2024, 3, 1)],
        ['easter -1 day-easter +1 day', new Date(2024, 2, 30), new Date(2024, 3, 2)],
    ]) {
        const oh = new opening_hours(value);
        const iterator = oh.getIterator(new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1, 12));

        assert.equal(iterator.getState(), false, value);
        assert.equal(iterator.advance(end), true, value);
        assert.equal(iterator.getDate().getTime(), start.getTime(), value);
        assert.equal(iterator.getState(), true, value);
        assert.equal(oh.getState(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1, 12)), true, value);
        assert.equal(oh.getState(end), false, value);
        assert.equal(oh.getNextChange(start, new Date(2025, 0, 1)).getTime(), end.getTime(), value);
    }

    for (const value of ['easter +1 day-easter', 'Apr 01-Mar 31']) {
        for (const date of [new Date(2024, 2, 31, 12), new Date(2024, 3, 1, 12)]) {
            assert.equal(new opening_hours(value).getState(date), true, value);
        }
    }
});

test('movable event offsets are checked against the event year', () => {
    const oh = new opening_hours('2024 easter +1 day');

    assert.equal(oh.getState(new Date(2023, 0, 1)), false);
    assert.equal(oh.getState(new Date(2024, 3, 1, 12)), true);
    assert.equal(oh.getState(new Date(2025, 0, 1)), false);
    for (const value of ['2024 easter -100 days', 'easter -100 days']) {
        assert.throws(
            () => new opening_hours(value).getState(new Date(2024, 0, 1)),
            error => typeof error === 'string' && error.includes('is not in the year of the movable day')
        );
    }
});

test('movable event range offset errors mark the offset', () => {
    assert.throws(
        () => new opening_hours('2024 easter -100 days 10:00-11:00').getState(new Date(2024, 0, 1)),
        error => typeof error === 'string'
            && error.split(' <--- (')[0].trimEnd() === '2024 easter -100 days'
            && error.includes('is not in the year of the movable day')
    );

    for (const [value, marked] of [
        ['2024 easter -100 days-2024 May 01 10:00-11:00', '2024 easter -100 days'],
        ['2024 easter -100 days+ 10:00-11:00', '2024 easter -100 days'],
        ['easter -100 days-May 01 10:00-11:00', 'easter -100 days'],
        ['2024 Jan 01-2024 easter -100 days 10:00-11:00', '2024 Jan 01-2024 easter -100 days'],
    ]) {
        assert.throws(
            () => new opening_hours(value).getState(new Date(2024, 0, 1)),
            error => typeof error === 'string'
                && error.split(' <--- (')[0].trimEnd() === marked
                && error.includes('is not in the year of the movable day')
        );
    }
});

test('single movable events respect explicit years and stop after the event', () => {
    for (const [value, month, day] of [
        ['2024 easter', 2, 31],
        ['2024 easter +1 day', 3, 1],
    ]) {
        const oh = new opening_hours(value);
        const start = new Date(2024, month, day);
        const end = new Date(2024, month, day + 1);
        const iterator = oh.getIterator(new Date(2023, month, day, 12));

        assert.equal(iterator.getState(), false, value);
        assert.equal(iterator.advance(new Date(2025, 0, 1)), true, value);
        assert.equal(iterator.getDate().getTime(), start.getTime(), value);
        assert.equal(iterator.getState(), true, value);
        assert.equal(iterator.advance(new Date(2025, 0, 1)), true, value);
        assert.equal(iterator.getDate().getTime(), end.getTime(), value);
        assert.equal(iterator.getState(), false, value);
        assert.deepEqual(oh.getStatePair(end).slice(0, 2), [false, undefined], value);
        assert.equal(oh.getState(new Date(2025, month, day, 12)), false, value);
        assert.equal(oh.getNextChange(end, new Date(2030, 0, 1)), undefined, value);
    }

    const recurring = new opening_hours('easter');
    assert.equal(recurring.getNextChange(new Date(2024, 3, 1), new Date(2026, 0, 1)).getTime(),
        new Date(2025, 3, 20).getTime());
});

test('time range errors mark the whole time, including calculated variable times', () => {
    for (const marked of [
        '10:00',
        '(sunrise+01:00)',
        'Mo (sunset-00:30)',
        '10:00-49:00',
        '10:00-(sunset+31:00)',
    ]) {
        assert.throws(() => new opening_hours(marked), error => error.startsWith(`${marked} <--- (`));
    }
});
