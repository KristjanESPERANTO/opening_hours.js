// SPDX-FileCopyrightText: © opening_hours.js contributors
// SPDX-License-Identifier: LGPL-3.0-only

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { convertCSVToInternalFormat } from '../../scripts/generate-holiday-definitions.mjs';
import { at, de, ro } from '../../src/holidays/generated-openholidays.mjs';

const { default: opening_hours } = await import('../../build/opening_hours.esm.mjs');

test('school-holiday conversion keeps the year window and cross-year boundary', () => {
    const rows = [
        { Name: 'EN Before', StartDate: '2023-12-20', EndDate: '2023-12-31' },
        { Name: 'EN Boundary', StartDate: '2023-12-20', EndDate: '2024-01-05' },
        { Name: 'EN First', StartDate: '2024-03-01', EndDate: '2024-03-02' },
        { Name: 'EN Last', StartDate: '2029-12-20', EndDate: '2030-01-05' },
        { Name: 'EN After', StartDate: '2030-01-01', EndDate: '2030-01-02' },
    ];
    const holidays = convertCSVToInternalFormat(rows, 'test', [2024, 2029])._countrywide.SH;

    assert.deepEqual(holidays.map(holiday => holiday.name), ['Boundary', 'First', 'Last']);
    assert.deepEqual(holidays.find(holiday => holiday.name === 'Boundary')[2023], [12, 20, 1, 5]);
    assert.deepEqual(holidays.find(holiday => holiday.name === 'Last')[2029], [12, 20, 1, 5]);
});

test('production bundle detects school holidays crossing the first supported year', () => {
    const submodule = fileURLToPath(new URL('../../submodules/openholidaysapi.data/', import.meta.url));
    const timestamp = Number(execFileSync('git', ['show', '-s', '--format=%ct', 'HEAD'], {
        cwd: submodule,
        encoding: 'utf8',
    }).trim());
    const firstYear = new Date(timestamp * 1000).getUTCFullYear() - 1;
    const holidays = de['Baden-Württemberg'].SH;
    const boundary = holidays.find(holiday => {
        const dates = holiday[firstYear - 1];
        return dates && dates[0] > dates[2];
    });

    assert.ok(boundary, `Missing school holiday crossing into ${firstYear}`);
    const value = new opening_hours('SH', { address: { country_code: 'de', state: 'Baden-Württemberg' } });
    const date = new Date(firstYear, 0, 1, 12);
    assert.equal(value.getState(date), true);
    assert.equal(value.getComment(date), boundary.name);
});

for (const [country, state, holidays] of [
    ['de', 'Baden-Württemberg', de['Baden-Württemberg'].SH],
    ['de', 'Bremen', de.Bremen.SH],
    ['de', 'Rheinland-Pfalz', de['Rheinland-Pfalz'].SH],
    ['at', 'Wien', at.Wien.SH],
    ['ro', undefined, ro.SH],
]) {
    test(`production bundle evaluates available school holidays in ${state || country}`, () => {
        const holiday = holidays.find(item => Object.keys(item).some(key => /^\d{4}$/.test(key)));
        assert.ok(holiday, `Missing school holiday data for ${state || country}`);
        const year = Number(Object.keys(holiday).find(key => /^\d{4}$/.test(key)));
        const [month, day] = holiday[year];
        const value = new opening_hours('SH', { address: { country_code: country, state } });

        assert.equal(value.getState(new Date(year, month - 1, day, 12)), true);
    });
}
