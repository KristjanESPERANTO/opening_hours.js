/*
 * SPDX-FileCopyrightText: © 2025 Kristjan ESPERANTO <https://github.com/KristjanESPERANTO>
 *
 * SPDX-License-Identifier: LGPL-3.0-only
 */

/**
 * Generate word_error_correction.yaml from manual literal/regex corrections and
 * ambiguity warnings derived from pinned CLDR weekday and month names.
 * Weekday/month correction lookup itself belongs to the runtime locale resolver.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';

const basePath = process.cwd();
const localesPath = path.resolve(basePath, 'src/locales');
const manualYamlPath = path.join(localesPath, 'word_error_correction_manual.yaml');
const outputPath = path.join(localesPath, 'word_error_correction.yaml');

const cldrDatesMainPath = path.resolve(basePath, 'node_modules/cldr-dates-full/main');
const cldrLocalenamesPath = path.resolve(
    basePath,
    'node_modules/cldr-localenames-full/main/en/languages.json'
);

// Keep English abbreviations explicit and stable across runtime/CLDR updates.
const monthAbbreviations = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const weekdayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const weekdayAbbreviations = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** @typedef {Record<string, string | undefined>} LocalizedTerms */
/** @typedef {{ wide?: LocalizedTerms, abbreviated?: LocalizedTerms }} LocalizedTermForms */
/** @typedef {{ format?: LocalizedTermForms, 'stand-alone'?: LocalizedTermForms }} CalendarNameData */
/** @typedef {{ months?: CalendarNameData, days?: { format?: LocalizedTermForms } }} GregorianData */
/** @typedef {{ locale: string, meaning: string, type: string, form: string }} WordConflictOccurrence */
/** @typedef {Record<string, Record<string, string>>} CorrectionCategories */
/** @typedef {{ literal: CorrectionCategories, regex: CorrectionCategories, ambiguous: Record<string, string> }} ManualCorrections */

/** @type {('literal'|'regex')[]} */
const correctionSections = ['literal', 'regex'];

/**
 * Read and parse a JSON file.
 * @param {string} filePath - Path to the JSON file.
 * @returns {ReturnType<typeof JSON.parse>} Parsed JSON value.
 */
function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Normalize a value for case-insensitive matching.
 * @param {unknown} term - Value to normalize.
 * @returns {string} Normalized term.
 */
function normalizeTerm(term) {
    return String(term || '').trim().toLowerCase();
}

/**
 * Sort an object's keys alphabetically.
 * @param {object} obj - Object whose keys to sort.
 * @returns {string[]} Sorted keys.
 */
function sortedKeys(obj) {
    return Object.keys(obj).sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * Sort a string map alphabetically by key.
 * @param {Record<string, string>} obj - Map to sort.
 * @returns {Record<string, string>} Sorted map.
 */
function sortObject(obj) {
    return Object.fromEntries(sortedKeys(obj).map(key => [key, obj[key]]));
}

/**
 * Validate regex syntax and reject duplicate correction rules.
 * @param {ManualCorrections} corrections Manual correction sections.
 * @returns {void}
 */
function validateCorrections(corrections) {
    for (const section of correctionSections) {
        const seenRules = new Set();
        for (const [category, entries] of Object.entries(corrections[section])) {
            for (const source of Object.keys(entries)) {
                if (section === 'regex') {
                    new RegExp('^(?:' + source + ')$', 'iu');
                }
                const key = section === 'literal' ? source.toLowerCase() : source;
                if (seenRules.has(key)) {
                    throw new Error(`Duplicate ${section} correction in ${category}: ${source}`);
                }
                seenRules.add(key);
            }
        }
    }
}

function listCldrLocales() {
    if (!fs.existsSync(cldrDatesMainPath)) {
        throw new Error(`CLDR dates path does not exist: ${cldrDatesMainPath}`);
    }

    return fs.readdirSync(cldrDatesMainPath, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter(locale => fs.existsSync(path.join(cldrDatesMainPath, locale, 'ca-gregorian.json')))
        .sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * Load Gregorian calendar data for a locale.
 * @param {string} locale - CLDR locale identifier.
 * @returns {GregorianData | undefined} Parsed Gregorian calendar data, if present.
 */
function loadGregorianData(locale) {
    const filePath = path.join(cldrDatesMainPath, locale, 'ca-gregorian.json');
    const data = readJson(filePath);
    return data?.main?.[locale]?.dates?.calendars?.gregorian;
}

/**
 * Resolve a locale code to its display name.
 * @param {string} locale - Locale identifier.
 * @param {Record<string, string>} languageNames - CLDR language display names.
 * @returns {string} Display name or the locale identifier as fallback.
 */
function languageName(locale, languageNames) {
    return languageNames[locale]
        || languageNames[locale.split('-')[0]]
        || locale;
}

/**
 * Collect localized weekday and month terms for a locale.
 * Months include both 'format' and 'stand-alone' forms; weekdays use 'format'.
 * @param {GregorianData} gregorian - CLDR Gregorian calendar data.
 * @returns {{ raw: string | undefined, meaning: string, type: string, form: string }[]} Localized terms.
 */
function collectTerms(gregorian) {
    const months = gregorian?.months || {};
    const days = gregorian?.days || {};
    const monthWide = months.format?.wide || {};
    const monthAbbr = months.format?.abbreviated || {};
    const monthSaWide = months['stand-alone']?.wide || {};
    const monthSaAbbr = months['stand-alone']?.abbreviated || {};
    const dayWide = days.format?.wide || {};
    const dayAbbr = days.format?.abbreviated || {};

    const terms = [];
    for (let i = 0; i < 12; i++) {
        const meaning = monthAbbreviations[i];
        const key = String(i + 1);
        terms.push({ raw: monthWide[key], meaning, type: 'month', form: 'long' });
        terms.push({ raw: monthSaWide[key], meaning, type: 'month', form: 'long' });
        terms.push({ raw: monthAbbr[key], meaning, type: 'month', form: 'short' });
        terms.push({ raw: monthSaAbbr[key], meaning, type: 'month', form: 'short' });
    }
    for (let i = 0; i < 7; i++) {
        const meaning = weekdayAbbreviations[i];
        const key = weekdayKeys[i];
        terms.push({ raw: dayWide[key], meaning, type: 'weekday', form: 'long' });
        terms.push({ raw: dayAbbr[key], meaning, type: 'weekday', form: 'short' });
    }
    return terms;
}

/** @type {ManualCorrections} */
let manualCorrections = { literal: {}, regex: {}, ambiguous: {} };
if (fs.existsSync(manualYamlPath)) {
    manualCorrections = /** @type {ManualCorrections} */ (yaml.parse(fs.readFileSync(manualYamlPath, 'utf8')));
    if (!correctionSections.every(section => manualCorrections[section])) {
        throw new Error('Manual corrections must define literal and regex sections.');
    }
    manualCorrections.ambiguous ??= {};
} else {
    console.log(`  ✗ Manual corrections file not found: ${manualYamlPath}`);
}

const supportedLocales = listCldrLocales();

const cldrDatesVersion = readJson(path.resolve(basePath, 'node_modules/cldr-dates-full/package.json')).version;
const cldrLocalenamesVersion = readJson(path.resolve(basePath, 'node_modules/cldr-localenames-full/package.json')).version;

const languageNames = readJson(cldrLocalenamesPath)?.main?.en?.localeDisplayNames?.languages || {};

/** @type {Record<string, WordConflictOccurrence[]>} */
const wordConflicts = {};

for (const locale of supportedLocales) {
    const gregorian = loadGregorianData(locale);
    if (!gregorian) {
        continue;
    }

    const terms = collectTerms(gregorian);
    for (const { raw, meaning, type, form } of terms) {
        const term = normalizeTerm(raw);
        if (term && term !== meaning.toLowerCase()) {
            (wordConflicts[term] ??= []).push({ locale, meaning, type, form });
        }
    }
}

for (const word of sortedKeys(wordConflicts)) {
    const occurrences = wordConflicts[word];
    if (new Set(occurrences.map(({ meaning }) => meaning)).size < 2) {
        continue;
    }
    if (occurrences.some(({ form }) => form === 'short')) {
        continue;
    }
    const labels = [...new Set(occurrences.map(({ meaning, locale }) =>
        `${meaning} (${languageName(locale, languageNames)})`
    ))];
    manualCorrections.ambiguous[word] = `Word "${word}" is ambiguous: ${labels.join(' or ')}. Please specify language context or use English ${occurrences[0].type} name.`;
}

const abbreviationCategory = 'please use English abbreviation ok for ko';
manualCorrections.literal[abbreviationCategory] = sortObject(manualCorrections.literal[abbreviationCategory] || {});
manualCorrections.ambiguous = sortObject(manualCorrections.ambiguous);
validateCorrections(manualCorrections);

const yamlOutput = yaml.stringify(manualCorrections, {
    defaultStringType: 'PLAIN',
    lineWidth: 0
});

const finalYamlContent = `---
# Generated word_error_correction.yaml
# Sources:
#   - Manual corrections: ${path.relative(basePath, manualYamlPath)}
#   - CLDR dates: cldr-dates-full@${cldrDatesVersion}
#   - CLDR language names: cldr-localenames-full@${cldrLocalenamesVersion}
# Note: Ambiguous words are handled in separate section with warnings

${yamlOutput}`;

fs.writeFileSync(outputPath, finalYamlContent, 'utf8');

const correctionCount = correctionSections.flatMap(section => Object.values(manualCorrections[section]))
    .reduce((sum, category) => sum + Object.keys(category).length, 0);
const ambiguousCount = Object.keys(manualCorrections.ambiguous).length;
console.log(`Generated ${path.relative(basePath, outputPath)}: ${correctionCount} corrections, ${ambiguousCount} ambiguity warnings.`);
