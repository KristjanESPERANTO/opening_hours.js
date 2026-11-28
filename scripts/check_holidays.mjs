#!/usr/bin/env node

/*
 * SPDX-FileCopyrightText: © opening_hours.js contributors
 * SPDX-License-Identifier: LGPL-3.0-only
 *
 * Smoke-test that public holidays (PH) can be evaluated for every location
 * in src/holidays/nominatim_cache in the current year. This detects evaluation
 * errors, but does not verify that the resulting holidays are correct.
 */

import { globSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const YEAR = new Date().getFullYear();
const CACHE_DIR = new URL('../src/holidays/nominatim_cache/', import.meta.url);

// A computed specifier keeps the typecheck out of the generated build.
const { default: opening_hours } = await import(new URL('../build/opening_hours.esm.mjs', import.meta.url).href);

const cache_files = globSync('*.yaml', { cwd: fileURLToPath(CACHE_DIR) });
const failures = [];

for (const cache_file of cache_files) {
    const location = basename(cache_file, '.yaml');
    try {
        const nominatim_data = YAML.parse(readFileSync(new URL(cache_file, CACHE_DIR), 'utf8'));
        const oh = new opening_hours('PH', nominatim_data);
        oh.getOpenIntervals(new Date(YEAR, 0, 1), new Date(YEAR + 1, 0, 1));
    } catch (err) {
        failures.push(`${location}: ${err}`);
    }
}

if (cache_files.length === 0) {
    console.error('No Nominatim cache fixtures found.');
    process.exitCode = 1;
} else if (failures.length > 0) {
    console.error(`Public holidays for ${YEAR} could not be evaluated for:`);
    console.error(failures.join('\n'));
    process.exitCode = 1;
} else {
    console.log(`Public holidays for ${YEAR} can be evaluated for all ${cache_files.length} locations.`);
}
