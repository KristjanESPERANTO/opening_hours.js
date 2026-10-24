#!/usr/bin/env node

/*
 * SPDX-FileCopyrightText: © 2015 Robin Schneider <ypid@riseup.net>
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import fs from 'node:fs';
import path from 'node:path';
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

const tagKey = /^export\.(.*)\.json$/.exec(path.basename(jsonFile))?.[1] || '';
console.info(`Loaded ${jsonFile}.`);

const standardRegexes = [
    'PH',
    'SH',
    '.',
    String.raw`\((?:dusk|sun|dawn)[^)]*(?:-|\+)[^)]*\)`,
    String.raw`(?:dusk|sun|dawn).*hours`,
    String.raw`(?:dusk|sun|dawn|\d{1,2}[.:]\d{2})\+`,
    String.raw`\d\s*-\s*(mo|tu|we|th|fr|sa|su)\\b`,
    String.raw`-\s*\d{1,2}[:.]\d{2}\s*?\+`,
    String.raw`[^0-9a-z ?.]\s*?-\s*?\d{1,2}:\d{2}\s*?[^+]`,
    String.raw`\d{1,2}:\d{2}\s*?-\s*?\d{1,2}:\d{2}\s*?\+`,
    String.raw`^(?:(?:[0-1][0-9]|2[0-4])(?:[1-5][0-9]|0[0-9])\s*-?\s*){2}$`
];
const historyFile = process.env.OPENING_HOURS_REGEX_HISTORY_FILE || '/tmp/opening_hours.regex.history';
const noRepeatFile = process.env.OPENING_HOURS_REGEX_NO_REPEAT_FILE || '/tmp/opening_hours.regex.testing';
const doNotLoadValuesAgain = new Set();
try {
    for (const value of fs.readFileSync(noRepeatFile, 'utf8').split(/\r?\n/).filter(Boolean)) {
        doNotLoadValuesAgain.add(value);
    }
} catch {
    // The repeat list is optional and is created on first JOSM use.
}

/**
 * Complete an input prefix with one of the common QA regexes.
 * @param {string} line - Current input prefix.
 * @returns {[string[], string]} Matching completions and the prefix.
 */
function completeRegex(line) {
    return [standardRegexes.filter(regex => regex.startsWith(line)), line];
}

const rl = /** @type {import('node:readline').Interface & { history: string[] }} */ (
    readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        completer: completeRegex
    })
);
try {
    rl.history = fs.readFileSync(historyFile, 'utf8').split(/\r?\n/).filter(Boolean).reverse();
} catch {
    // History is optional and is saved as soon as the user enters a line.
}
rl.on('history', history => {
    try {
        fs.writeFileSync(historyFile, `${history.slice().reverse().join('\n')}\n`);
    } catch (error) {
        console.error(`Could not save regex history: ${error instanceof Error ? error.message : String(error)}`);
    }
});

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
    const parserOptions = tagKey ? { tag_key: tagKey, map_value: true } : undefined;
    let lastError;
    for (const location of [undefined, nominatimTestJSON]) {
        try {
            const parsed = new opening_hours(value, location, parserOptions);
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
 * Print selected matched values with parser status and optional integrations.
 * @param {SearchMatch[]} matches - Matches to display.
 * @param {{ all: boolean, passed: boolean, showErrors: boolean, overpass: boolean, tagInfo: boolean, josm: boolean, noRepeat: boolean }} options - Output filters and integrations.
 * @returns {Promise<void>} Resolves when output completes.
 */
async function printMatches(matches, options) {
    const printWidth = options.showErrors ? pageWidth / 2 : pageWidth;
    let printedCount = 0;
    for (const item of matches) {
        const result = item.evaluation || evaluateValue(item.entry.value);
        if (!options.all && options.passed !== result.ok) {
            continue;
        }

        if (printedCount > 0 && printedCount % printWidth === 0) {
            const response = await ask('Continue? ');
            if (response === null || !/^y/i.test(response)) {
                break;
            }
        }

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
        if (options.showErrors && !result.ok && result.error.message) {
            console.info(`  * ${result.error.message}`);
        }

        const encodedKey = encodeURIComponent(tagKey);
        const encodedValue = encodeURIComponent(item.entry.value);
        const urls = [];
        if (options.overpass) {
            urls.push(`overpass: https://overpass-turbo.eu/?template=key-value&key=${encodedKey}&value=${encodedValue}`);
        }
        if (options.tagInfo) {
            urls.push(`taginfo: https://taginfo.openstreetmap.org/tags/${encodedKey}=${encodedValue}`);
        }
        if (urls.length > 0) {
            console.info(urls.join(', '));
        }

        if (options.josm && (!options.noRepeat || !doNotLoadValuesAgain.has(item.entry.value))) {
            const loaded = await loadInJosm(item.entry.value);
            if (loaded && options.noRepeat) {
                doNotLoadValuesAgain.add(item.entry.value);
                try {
                    fs.writeFileSync(noRepeatFile, `${[...doNotLoadValuesAgain].join('\n')}\n`);
                } catch (error) {
                    console.error(`Could not save JOSM repeat list: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }
        printedCount++;
    }
}

/**
 * Send a value to JOSM Remote Control.
 * @param {string} value - Opening-hours value to load.
 * @returns {Promise<boolean>} Whether JOSM accepted the request.
 */
async function loadInJosm(value) {
    const query = `https://overpass-api.de/api/xapi_meta?*[${tagKey}=${value}]`;
    const url = `http://localhost:8111/import?url=${encodeURIComponent(query)}`;
    try {
        const response = await fetch(url);
        if (response.status !== 200) {
            console.error(styleText('red', `JOSM Remote HTTP request returned status ${response.status}`));
            return false;
        }
        return true;
    } catch {
        console.error(styleText('red', 'Could not connect to JOSM. Start JOSM and enable Remote Control.'));
        return false;
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

    const printOptions = await ask('Print values (yes, passed, failed; add overpass, taginfo, err, josm, no_repeat): ');
    if (printOptions === null) {
            return;
        }
        if (!/^(y|p|f)/i.test(printOptions)) {
            continue;
        }

        await printMatches(matches, {
            all: /^\s*y/i.test(printOptions),
            passed: /^\s*p/i.test(printOptions),
            showErrors: /\berr\b/i.test(printOptions),
            overpass: /\bover(pass)?\b/i.test(printOptions),
            tagInfo: /tag/i.test(printOptions),
            josm: /\bjosm\b/i.test(printOptions),
            noRepeat: /\bno_repeat\b/i.test(printOptions)
        });
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
