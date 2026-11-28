// SPDX-FileCopyrightText: © opening_hours.js contributors
// SPDX-License-Identifier: CC0-1.0

import { fileURLToPath } from 'node:url';
import configs from '../rollup.config.mjs';

const config = configs[0];
const testHolidays = fileURLToPath(new URL('../build/generated-openholidays-test.mjs', import.meta.url));

export default {
    ...config,
    plugins: [{
        name: 'school-holiday-test-data',
        resolveId(source) {
            return source === './holidays/generated-openholidays.mjs' ? testHolidays : null;
        },
    }, ...config.plugins],
    output: {
        name: 'opening_hours',
        file: 'build/opening_hours-test.js',
        format: 'umd',
        globals: { suncalc: 'SunCalc' },
    },
};
