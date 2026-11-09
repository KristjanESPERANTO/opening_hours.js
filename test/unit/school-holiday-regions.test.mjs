// SPDX-FileCopyrightText: © opening_hours.js contributors
// SPDX-License-Identifier: LGPL-3.0-only

import test from 'node:test';
import assert from 'node:assert/strict';

const { default: opening_hours } = await import('../../build/opening_hours.esm.mjs');

test('Dutch municipalities assigned to multiple school regions remain unresolved', () => {
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
        for (const [province, municipality] of [
            ['GE', 'Montferland'],
            ['GE', 'Neder-Betuwe'],
            ['NB', 'Altena'],
            ['UT', 'De Ronde Venen'],
        ]) {
            const address = {
                'country_code': 'nl',
                'ISO3166-2-lvl4': `NL-${province}`,
                municipality,
            };
            assert.throws(
                () => new opening_hours('SH', { address }).getState(new Date('2026-07-12T12:00:00')),
                (error) => String(error).includes('There are no holidays (SH) defined for country nl'),
                municipality,
            );
        }
    } finally {
        console.error = originalConsoleError;
    }
});
