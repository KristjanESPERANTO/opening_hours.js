// SPDX-FileCopyrightText: © opening_hours.js contributors
// SPDX-License-Identifier: LGPL-3.0-only

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import opening_hours from '../../build/opening_hours.esm.mjs';

function isPublicHoliday(countryCode, date, state) {
    const location = { address: { country_code: countryCode, ...(state ? { state } : {}) } };
    return new opening_hours('PH', location).getPublicHolidayContext(new Date(`${date}T12:00:00`)).isHoliday;
}

test('public holiday restrictions respect country subdivisions', () => {
    assert.equal(isPublicHoliday('ch', '2027-03-26', 'Tessin'), false);
    assert.equal(isPublicHoliday('ch', '2027-03-26', 'Zürich'), true);
    assert.equal(isPublicHoliday('us', '2027-02-15', 'Guam'), false);
});

test('state-specific substitute rules are retained', () => {
    assert.equal(isPublicHoliday('es', '2022-05-02', 'Andalucía'), true);
    assert.equal(isPublicHoliday('es', '2022-05-02', 'Galicia'), false);
});

test('orthodox Easter retains its additive substitute day', () => {
    assert.equal(isPublicHoliday('ua', '2027-05-02'), true);
    assert.equal(isPublicHoliday('ua', '2027-05-03'), true);
});

test('sync script rejects command-line arguments', () => {
    const scriptPath = fileURLToPath(new URL('../../scripts/sync_holidays_from_date_holidays.js', import.meta.url));
    const result = spawnSync(process.execPath, [scriptPath, 'not-a-country'], { encoding: 'utf8' });

    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not accept command-line arguments/);
});
