#!/usr/bin/env node

/*
 * SPDX-FileCopyrightText: © 2015 Robin Schneider <ypid@riseup.net>
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import fs from 'node:fs';
import readline from 'node:readline';
import { styleText } from 'node:util';
import opening_hours from '../build/opening_hours.esm.mjs';

const pageWidth = 20;
const defaultJsonFile = 'export.opening_hours.json';
const args = process.argv.slice(2);
const jsonFile = args[0] || defaultJsonFile;

if (args.length === 0) {
    console.info(styleText('blue', `No JSON file specified; using default: ${jsonFile}`));
}

if (!fs.existsSync(jsonFile)) {
    console.error(styleText('red', `JSON file not found: ${jsonFile}`));
    process.exit(1);
}

/** @typedef {{ value: string, count: number }} TagInfoEntry */
/** @typedef {{ data: TagInfoEntry[] }} TagInfoExport */
/** @typedef {{ entry: TagInfoEntry, pre: string, match: string, post: string, evaluation?: EvaluationResult }} SearchMatch */
/** @typedef {{ ok: true, state: string, warnings: string[], needsLocation: boolean } | { ok: false, error: Error }} EvaluationResult */

/** @type {TagInfoExport} */
let tagInfoExport;
try {
    tagInfoExport = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(styleText('red', `Could not read ${jsonFile}: ${message}`));
    process.exit(1);
}

if (!Array.isArray(tagInfoExport?.data)) {
    console.error(styleText('red', `Invalid Taginfo export: ${jsonFile} has no data array`));
    process.exit(1);
}

console.info(`Loaded ${jsonFile}.`);

/** @type {import('node:readline').Interface} */
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

/** @type {((answer: string | null) => void) | undefined} */
let pendingQuestion;
rl.on('close', () => pendingQuestion?.(null));
/**
 * Ask a question in the interactive terminal.
 * @param {string} prompt - Text to display before reading input.
 * @returns {Promise<string | null>} User response, or null on end of input.
 */
function ask(prompt) {
    return new Promise(resolve => {
        let resolved = false;
        /** @param {string | null} answer - User response, or null on EOF. */
        const finish = answer => {
            if (resolved) {
                return;
            }
            resolved = true;
            if (pendingQuestion === finish) {
                pendingQuestion = undefined;
            }
            resolve(answer);
        };
        pendingQuestion = finish;
        rl.question(prompt, finish);
    });
}

/**
 * Parse an opening_hours value, retrying with location data when needed.
 * @param {string} value - Value to parse.
 * @returns {EvaluationResult} Parser status, state, and warnings.
 */
function evaluateValue(value) {
    let lastError;
    for (const location of [undefined, nominatimTestJSON]) {
        try {
            const parsed = new opening_hours(value, location);
            return {
                ok: true,
                state: parsed.getStateString(),
                warnings: parsed.getWarnings().map(warning => typeof warning === 'string' ? warning : warning.message),
                needsLocation: location !== undefined
            };
        } catch (error) {
            lastError = error;
        }
    }
    return { ok: false, error: lastError instanceof Error ? lastError : new Error(String(lastError)) };
}

/**
 * Find values matching a regex and keep the captured matching text.
 * @param {string} source - User-entered regular expression.
 * @returns {SearchMatch[]} Matches ordered by use count.
 */
function findMatches(source) {
    const expression = new RegExp(source, 'i');
    /** @type {SearchMatch[]} */
    const matches = tagInfoExport.data.flatMap(entry => {
        if (typeof entry?.value !== 'string' || typeof entry?.count !== 'number') {
            return [];
        }
        const result = expression.exec(entry.value);
        if (!result) {
            return [];
        }
        const pre = entry.value.slice(0, result.index);
        const match = result[0];
        const post = entry.value.slice(result.index + match.length);
        return [{ entry, pre, match, post }];
    });
    return matches.sort((left, right) => right.entry.count - left.entry.count);
}

/**
 * Print a page of matched values with parser status.
 * @param {SearchMatch[]} matches - Matches to display.
 * @returns {Promise<void>} Resolves when output completes.
 */
async function printMatches(matches) {
    for (let index = 0; index < matches.length; index++) {
        const item = matches[index];
        const result = item.evaluation || evaluateValue(item.entry.value);
        const passed = result.ok
            ? result.state === 'unknown'
                ? styleText('magenta', 'Passed')
                : result.state === 'close' || result.state === 'closed'
                    ? styleText('blue', 'Passed')
                    : styleText('green', 'Passed')
            : '';
        const status = result.ok
            ? passed
                + (result.needsLocation ? ', loc needed' : '')
                + (result.warnings.length > 0 ? ', warnings' : '')
            : styleText('red', 'Failed');
        console.info(`Matched (count: ${item.entry.count}, status: ${status}): ${item.pre}${styleText('blue', item.match)}${item.post}`);
        if (!result.ok && result.error.message) {
            console.info(`  * ${result.error.message}`);
        } else if (result.ok && result.warnings.length > 0) {
            for (const warning of result.warnings) {
                console.info(`  * ${warning}`);
            }
        }

        if ((index + 1) % pageWidth === 0 && index + 1 < matches.length) {
            const response = await ask('Continue? ');
            if (response === null || !/^y/i.test(response)) {
                break;
            }
        }
    }
}

async function runInteractiveSearch() {
    while (true) {
        const source = await ask('regex search> ');
        if (source === null) {
            return;
        }
        if (/^\s*$/.test(source)) {
            console.info('Send SIGINT (Ctrl+C) to exit.');
            continue;
        }

        /** @type {SearchMatch[]} */
        let matches;
        try {
            matches = findMatches(source);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(styleText('red', `Your regular expression did not compile: ${message}`));
            continue;
        }

        if (matches.length === 0) {
            console.info(`Did not match any value with regular expression: ${source}`);
            continue;
        }

        let parseAll = true;
        if (matches.length > 10000) {
            const answer = await ask('Try to parse each value (probably takes a second)? ');
            if (answer === null) {
                return;
            }
            parseAll = /^y/i.test(answer);
        }

        let totalInUse = 0;
        let passedCount = 0;
        let passedInUse = 0;
        for (const item of matches) {
            totalInUse += item.entry.count;
            if (parseAll) {
                item.evaluation = evaluateValue(item.entry.value);
                if (item.evaluation.ok) {
                    passedCount++;
                    passedInUse += item.entry.count;
                }
            }
        }

        const passedSummary = parseAll ? ` (${passedCount} passed)` : '';
        const useSummary = matches.length === 1
            ? ''
            : `, total in use: ${totalInUse}${parseAll ? ` (${passedInUse} passed)` : ''}`;
        console.info(styleText('green', `Matched ${matches.length}${passedSummary} different value${matches.length === 1 ? '' : 's'}${useSummary}`));

        const printValues = await ask('Print values? (y/n) ');
        if (printValues === null) {
            return;
        }
        if (/^y/i.test(printValues)) {
            await printMatches(matches);
        }
    }
}

const nominatimTestJSON = {
    place_id: '44651229',
    licence: 'Data © OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright',
    osm_type: 'way',
    osm_id: '36248375',
    lat: '49.5400039',
    lon: '9.7937133',
    display_name: 'K 2847, Lauda-Königshofen, Main-Tauber-Kreis, Regierungsbezirk Stuttgart, Baden-Württemberg, Germany, European Union',
    address: {
        road: 'K 2847',
        city: 'Lauda-Königshofen',
        county: 'Main-Tauber-Kreis',
        state_district: 'Regierungsbezirk Stuttgart',
        state: 'Baden-Württemberg',
        country: 'Germany',
        country_code: 'de',
        continent: 'European Union'
    }
};

try {
    await runInteractiveSearch();
} finally {
    rl.close();
}
