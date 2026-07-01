#!/usr/bin/env node

// SPDX-FileCopyrightText: © opening_hours.js contributors
//
// SPDX-License-Identifier: LGPL-3.0-only

/**
 * Generate YAML holiday files using date-holidays submodule as PH data source.
 *
 * - PH (Public Holidays) are read directly from submodules/date-holidays/data/countries/*.yaml
 * - Rule strings are converted to opening_hours.js format (fixed_date, variable_date, offset).
 * - SH (School Holidays) and _nominatim_url are preserved from existing YAML files.
 *
 * Usage:
 *   node scripts/generate_holidays_hybrid.js [--dry-run] [cc ...]
 *
 *   --dry-run   Print generated YAML to stdout instead of writing files.
 *   cc ...      Optional list of country codes to process (e.g. "at de"). Defaults to all.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { parse } = require('yaml');

const HOLIDAYS_DIR = path.join(__dirname, '..', 'src', 'holidays');
const SUBMODULE_COUNTRIES_DIR = path.join(__dirname, '..', 'submodules', 'date-holidays', 'data', 'countries');

// PH output should only include actual public holidays.
const INCLUDED_DAY_TYPES = new Set(['public']);

// REUSE-IgnoreStart
const GENERATED_YAML_HEADER = [
    '# SPDX-FileCopyrightText: date-holidays contributors',
    '# SPDX-FileCopyrightText: opening_hours.js contributors',
    '# SPDX-License-Identifier: CC-BY-SA-3.0',
    '---',
    '',
];
// REUSE-IgnoreEnd

function buildGeneratedYamlHeader(countryCode) {
    return [
        ...GENERATED_YAML_HEADER,
        `# @source ${getDateHolidaysSourceUrl(countryCode)}`,
        '',
    ];
}

function extractExistingPrefixBeforePh(existingDataPath) {
    if (!fs.existsSync(existingDataPath)) return null;

    try {
        const content = fs.readFileSync(existingDataPath, 'utf8');
        const lines = content.split(/\r?\n/);
        const phIndex = lines.findIndex((line) => /^PH:\s*(?:#.*)?$/.test(line));
        if (phIndex <= 0) return null;

        // Preserve the existing prefix exactly as written, including the PH label/comment line.
        return lines.slice(0, phIndex + 1).join('\n');
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Supported variable_date keys in opening_hours.js (from src/index.js)
// ---------------------------------------------------------------------------
const SUPPORTED_VAR_DATES = new Set([
    'firstJanuaryMonday', 'firstFebruaryMonday', 'lastFebruarySunday',
    'firstMarchMonday', 'firstMarchTuesday',
    'firstAprilMonday',
    'firstMayMonday',
    'firstJuneMonday',
    'firstJulyMonday',
    'firstAugustMonday', 'firstAugustTuesday', 'firstAugustFriday',
    'firstSeptemberMonday', 'firstSeptemberTuesday', 'firstSeptemberSunday',
    'firstOctoberMonday',
    'firstNovemberMonday', 'firstNovemberTuesday', 'firstNovemberThursday',
    'lastMayMonday', 'lastMarchMonday', 'lastAprilMonday', 'lastAprilFriday',
    'lastAugustMonday', 'lastSeptemberMonday', 'lastSeptemberFriday',
    'lastOctoberMonday', 'lastOctoberFriday',
    'nextWednesday16Nov',
    'orthodox easter',
    'nextSaturday20Jun',
    'nextSaturday31Oct',
    'victoriaDay',
]);

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

// ---------------------------------------------------------------------------
// Country configuration
// ---------------------------------------------------------------------------

/**
 * State name mapping: date-holidays state code → nominatim address.state value.
 * Only needed when the date-holidays name differs from what nominatim returns.
 */
const DE_STATES = {
    BB: 'Brandenburg',
    BE: 'Berlin',
    BW: 'Baden-Württemberg',
    BY: 'Bayern',
    HB: 'Bremen',
    HE: 'Hessen',
    HH: 'Hamburg',
    MV: 'Mecklenburg-Vorpommern',
    NI: 'Niedersachsen',
    NW: 'Nordrhein-Westfalen',
    RP: 'Rheinland-Pfalz',
    SH: 'Schleswig-Holstein',
    SL: 'Saarland',
    SN: 'Sachsen',
    ST: 'Sachsen-Anhalt',
    TH: 'Thüringen',
};

const AU_STATES = {
    ACT: 'Australian Capital Territory',
    NSW: 'New South Wales',
    NT: 'Northern Territory',
    QLD: 'Queensland',
    SA: 'South Australia',
    TAS: 'Tasmania',
    VIC: 'Victoria',
    WA: 'Western Australia',
};

const AU_STATE_NOMINATIM_URLS = {
    ACT: 'https://nominatim.openstreetmap.org/reverse?format=json&lat=-35.2809&lon=149.1300&zoom=16&addressdetails=1&accept-language=en',
    NSW: 'https://nominatim.openstreetmap.org/reverse?format=json&lat=-33.8688&lon=151.2093&zoom=16&addressdetails=1&accept-language=en',
    NT: 'https://nominatim.openstreetmap.org/reverse?format=json&lat=-12.4634&lon=130.8456&zoom=16&addressdetails=1&accept-language=en',
    QLD: 'https://nominatim.openstreetmap.org/reverse?format=json&lat=-27.4698&lon=153.0251&zoom=16&addressdetails=1&accept-language=en',
    SA: 'https://nominatim.openstreetmap.org/reverse?format=json&lat=-34.9285&lon=138.6007&zoom=16&addressdetails=1&accept-language=en',
    TAS: 'https://nominatim.openstreetmap.org/reverse?format=json&lat=-42.8821&lon=147.3272&zoom=16&addressdetails=1&accept-language=en',
    VIC: 'https://nominatim.openstreetmap.org/reverse?format=json&lat=-37.8136&lon=144.9631&zoom=16&addressdetails=1&accept-language=en',
    WA: 'https://nominatim.openstreetmap.org/reverse?format=json&lat=-31.9505&lon=115.8605&zoom=16&addressdetails=1&accept-language=en',
};

const CH_NAME_OVERRIDES = {
    'Berchtoldstag/2 Janvier': 'Berchtoldstag/2 janvier',
    'Berchtoldstag/Saint-Berthold': 'Berchtoldstag/2 janvier',
    'Heilige Drei Könige/l\'Épiphanie/Befana': 'Heilige Drei Könige/l\'Épiphanie/Epifania',
    'Mariä Himmelfahrt/Assomption/Ferragosto': 'Mariä Himmelfahrt/Assomption/Assunzione',
    'Weihnachten/Noël/Natale': 'Weihnachtstag/Noël/Natale',
    '2. Weihnachtstag/Lendemain de Noël/Santo Stefano': 'Stephanstag/Saint-Etienne/Santo Stefano',
    'Wiederherstellung der Republik/Restauration de la République/Ultimo dell’anno': 'Wiederherstellung der Republik/Restauration de la République',
};

/**
 * Country configurations.
 *
 * cc         - ISO 3166-1 alpha-2 code used by date-holidays (uppercase)
 * states     - Map of date-holidays state code → nominatim state name.
 *              When provided, per-state PH sections are generated.
 *              When omitted, only national-level PH are generated.
 * skip       - Reason string: skip this country entirely (output a warning).
 */
const COUNTRY_CONFIGS = {
    // Simple countries (national PH only)
    ar: { cc: 'AR', includeDayTypes: ['public', 'optional'] },
    at: { cc: 'AT' },
    au: {
        cc: 'AU',
        states: AU_STATES,
        includeStateCode: true,
        stateNominatimUrls: AU_STATE_NOMINATIM_URLS,
    },
    be: { cc: 'BE', nameLangs: ['nl', 'fr'] },
    br: { cc: 'BR', statesFromSource: true, includeStateCode: true, stateAcceptLanguage: 'pt,en' },
    ca: { cc: 'CA' },
    ci: { cc: 'CI', skip: 'CI relies on Islamic calendar holidays (Ramadan etc.) which are not supported' },
    cn: { cc: 'CN', skip: 'CN relies on Chinese lunisolar calendar which is not supported' },
    cz: { cc: 'CZ' },
    dk: { cc: 'DK' },
    es: { cc: 'ES' },
    fi: { cc: 'FI' },
    fr: { cc: 'FR' },
    gr: { cc: 'GR' },
    hr: { cc: 'HR' },
    hu: { cc: 'HU' },
    ie: { cc: 'IE' },
    it: { cc: 'IT' },
    jp: { cc: 'JP' },
    lu: { cc: 'LU' },
    na: { cc: 'NA' },
    nl: { cc: 'NL' },
    no: { cc: 'NO' },
    nz: { cc: 'NZ' },
    pl: { cc: 'PL' },
    ro: { cc: 'RO' },
    ru: { cc: 'RU' },
    se: { cc: 'SE' },
    si: { cc: 'SI' },
    sk: { cc: 'SK' },
    ua: { cc: 'UA' },
    vn: { cc: 'VN', skip: 'VN relies on Vietnamese lunisolar calendar (Tết etc.) which is not supported' },
    xa: { cc: 'XA', skip: 'XA is an internal placeholder, not a real country' },

    // New countries added from date-holidays
    bg: { cc: 'BG' },
    by: { cc: 'BY' },
    ee: { cc: 'EE' },
    ge: { cc: 'GE' },
    lt: { cc: 'LT' },
    lv: { cc: 'LV' },
    mc: { cc: 'MC' },
    md: { cc: 'MD' },
    mt: { cc: 'MT' },
    mx: { cc: 'MX' },
    pt: { cc: 'PT' },
    rs: { cc: 'RS' },
    sm: { cc: 'SM' },
    za: { cc: 'ZA' },

    // Skipped new: Islamic calendar or other unsupported calendar systems
    al: { cc: 'AL', skip: 'AL has Islamic holidays (Eid al-Fitr, Eid al-Adha) which are not supported' },
    ba: { cc: 'BA', skip: 'BA has Islamic and Julian calendar holidays which are not supported' },
    is: { cc: 'IS', skip: 'IS uses unusual Thursday-based rules not supported by the parser' },
    kr: { cc: 'KR', skip: 'KR relies on the Korean lunisolar calendar which is not supported' },
    ma: { cc: 'MA', skip: 'MA relies on Islamic calendar holidays which are not supported' },
    me: { cc: 'ME', skip: 'ME has Islamic, Julian, Hebrew and Orthodox calendar holidays' },
    sg: { cc: 'SG', skip: 'SG has Chinese lunisolar and Islamic calendar holidays which are not supported' },
    tr: { cc: 'TR', skip: 'TR relies on Islamic calendar holidays (Eid al-Fitr, Eid al-Adha) which are not supported' },

    // Countries with state sections
    de: { cc: 'DE', states: DE_STATES, includeStateCode: true },

    // Skipped: state structure too complex for automatic generation
    // Manual maintenance of per-section format is preferred.
    gb: { cc: 'GB', skip: 'GB uses a non-standard per-section format with special variable_date values' },
    ch: {
        cc: 'CH',
        nameLangs: ['de', 'fr', 'it'],
        nameSeparator: '/',
        nameOverrides: CH_NAME_OVERRIDES,
        sortStatesByName: true,
        statesFromSource: true,
        includeStateCode: true,
        stateAcceptLanguage: 'de,fr,it,rm',
        emitOnlyStatesAtTopLevel: true,
    },
    us: { cc: 'US', skip: 'US has 50 states; support can be added once DE works well' },
};

// ---------------------------------------------------------------------------
// Rule parser: date-holidays rule → opening_hours.js holiday object
// ---------------------------------------------------------------------------

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Convert a date-holidays `rule` string to an opening_hours.js holiday definition.
 *
 * Returns an object with some subset of:
 *   { fixed_date, variable_date, offset }
 *
 * Returns null if the rule is unsupported.
 */
function parseRule(rule) {
    // Strip trailing qualifiers that don't affect the base date:
    //   "since YYYY", "until YYYY", "prior to YYYY", "if sunday then next monday ...", "substitutes ..."

    // Extract shift rule before stripping it.
    // date-holidays encodes movable holidays as e.g. "06-17 if tuesday,wednesday then previous monday if thursday,friday then next monday".
    // opening_hours.js supports this via shift_rule on fixed_date entries.
    // "MM-DD and if ..." = additive substitute (BOTH original date AND shifted date are holidays).
    // These are modelled as substitute_rule (original stays + substitute added).
    // "MM-DD if ..." and "substitutes MM-DD if ..." = replacement substitute
    // (only shifted date).
    // These are modelled as shift_rule.
    const isAdditiveSubstitute = /\band\s+if\b/i.test(rule);
    const shiftMatch = isAdditiveSubstitute ? null : rule.match(/\s+(if\s+.+)$/i);
    let shift_rule = null;
    let substitute_rule = null;

    function extractIfClauses(raw) {
        const candidate = raw.trim()
            .replace(/\s+since\s+\d{4}.*$/i, '')
            .replace(/\s+until\s+\d{4}.*$/i, '')
            .replace(/\s+prior\s+to\s+\d{4}.*$/i, '')
            .replace(/\s+#\d+\s*$/i, '')
            .trim()
            .toLowerCase();
        // Only keep well-formed "if [days] then [previous|next] [day]" clauses.
        if (/^(if\s+[\w,\s]+\s+then\s+(?:previous|next)\s+\w+\s*)+$/.test(candidate)) {
            return candidate;
        }
        return null;
    }

    if (isAdditiveSubstitute) {
        const andIfMatch = rule.match(/\band\s+(if\s+.+)$/i);
        if (andIfMatch) {
            substitute_rule = extractIfClauses(andIfMatch[1]);
        }
    } else if (shiftMatch) {
        shift_rule = extractIfClauses(shiftMatch[1]);
    }

    const clean = rule
        .replace(/\s+since\s+\d{4}.*$/i, '')
        .replace(/\s+until\s+\d{4}.*$/i, '')
        .replace(/\s+prior\s+to\s+\d{4}.*$/i, '')
        // date-holidays sometimes uses "#1", "#2" suffixes to disambiguate keys.
        // They are not part of the date semantics.
        .replace(/\s+#\d+\s*$/i, '')
        .replace(/\s+and\s+if\s+.*/i, '')
        .replace(/^substitutes?\s+/i, '')
        .replace(/\s+if\s+.*/i, '')
        .trim();

    // Easter-based: "easter", "easter N", "easter -N"
    const easterMatch = clean.match(/^easter\s*([+-]?\d+)?$/);
    if (easterMatch) {
        const offset = easterMatch[1] ? parseInt(easterMatch[1]) : 0;
        if (offset === 0) return { variable_date: 'easter' };
        return { variable_date: 'easter', offset };
    }

    // Orthodox Easter-based: "orthodox", "orthodox N", "orthodox -N"
    const orthodoxMatch = clean.match(/^orthodox\s*([+-]?\d+)?$/);
    if (orthodoxMatch) {
        const offset = orthodoxMatch[1] ? parseInt(orthodoxMatch[1]) : 0;
        if (offset === 0) return { variable_date: 'orthodox easter' };
        return { variable_date: 'orthodox easter', offset };
    }

    // "saturday after MM-DD" → specific nextSaturday keys
    const SATURDAY_AFTER = {
        '06-20': 'nextSaturday20Jun',
        '10-31': 'nextSaturday31Oct',
    };
    const saturdayAfterMatch = clean.match(/^saturday after (\d{2}-\d{2})$/i);
    if (saturdayAfterMatch) {
        const key = SATURDAY_AFTER[saturdayAfterMatch[1]];
        if (key) return { variable_date: key };
        return null;
    }

    // Fixed date: "MM-DD"
    const fixedMatch = clean.match(/^(\d{2})-(\d{2})$/);
    if (fixedMatch) {
        const def = { fixed_date: [parseInt(fixedMatch[1]), parseInt(fixedMatch[2])] };
        if (shift_rule) def.shift_rule = shift_rule;
        if (substitute_rule) def.substitute_rule = substitute_rule;
        return def;
    }

    // Exact one-off date: "YYYY-MM-DD".
    // We intentionally keep only month/day in the generated YAML because the
    // current opening_hours.js holiday format has no year-specific holiday type.
    const exactDateMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (exactDateMatch) {
        return {
            fixed_date: [parseInt(exactDateMatch[2]), parseInt(exactDateMatch[3])],
            exact_date: clean,
        };
    }

    // Duration-based fixed: "MM-DD PNdT" or "MM-DD PND" (multi-day holiday)
    // Returns an array of single-day definitions.
    const durationMatch = clean.match(/^(\d{2})-(\d{2})\s+P(\d+)D/i);
    if (durationMatch) {
        const month = parseInt(durationMatch[1]);
        const startDay = parseInt(durationMatch[2]);
        const days = parseInt(durationMatch[3]);
        const results = [];
        for (let i = 0; i < days; i++) {
            // Simple day increment (assumes no month wrap for reasonable durations)
            results.push({ fixed_date: [month, startDay + i] });
        }
        return results; // array of defs
    }

    // "Nth weekday in Month" → first{Month}{Weekday} + offset (N-1)*7
    const nthInMatch = clean.match(/^(\d+)(?:st|nd|rd|th)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+in\s+(\w+)$/i);
    if (nthInMatch) {
        const n = parseInt(nthInMatch[1]);
        const weekday = capitalize(nthInMatch[2]);
        const month = capitalize(nthInMatch[3]);
        const key = `first${month}${weekday}`;
        if (SUPPORTED_VAR_DATES.has(key)) {
            const offset = (n - 1) * 7;
            if (offset === 0) return { variable_date: key };
            return { variable_date: key, offset };
        }
        return null;
    }

    // "last weekday in Month" → last{Month}{Weekday}
    const lastInMatch = clean.match(/^last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+in\s+(\w+)$/i);
    if (lastInMatch) {
        const weekday = capitalize(lastInMatch[1]);
        const month = capitalize(lastInMatch[2]);
        const key = `last${month}${weekday}`;
        if (SUPPORTED_VAR_DATES.has(key)) return { variable_date: key };
        return null;
    }

    // Special named rules
    // 'monday before 05-25' = Victoria Day in Canada = opening_hours.js 'victoriaDay'
    const NAMED_RULES = {
        'monday before 05-25': 'victoriaDay',
        'monday after 05-27': 'lastMayMonday',
    };
    const cleanLower = clean.toLowerCase();
    if (NAMED_RULES[cleanLower]) {
        return { variable_date: NAMED_RULES[cleanLower] };
    }

    // "weekday before MM-DD" patterns
    // Special cases where the result maps to a named opening_hours.js variable_date:
    //   "wednesday before 11-23" → nextWednesday16Nov  (Buß- und Bettag)
    const BEFORE_SPECIAL = {
        'wednesday before 11-23': 'nextWednesday16Nov',
    };
    const beforeSpecialKey = clean.toLowerCase().replace(/\d+(?:st|nd|rd|th)\s+/, '');
    if (BEFORE_SPECIAL[beforeSpecialKey]) {
        return { variable_date: BEFORE_SPECIAL[beforeSpecialKey] };
    }

    // "weekday before MM-01" → last{PrevMonth}{Weekday}
    // "1st weekday before MM-01" is the same
    const beforeMatch = clean.match(/^(?:\d+(?:st|nd|rd|th)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+before\s+(\d{2})-01$/i);
    if (beforeMatch) {
        const weekday = capitalize(beforeMatch[1]);
        const monthIdx = parseInt(beforeMatch[2]) - 2; // 0-indexed month before
        if (monthIdx >= 0 && monthIdx < 12) {
            const key = `last${MONTHS[monthIdx]}${weekday}`;
            if (SUPPORTED_VAR_DATES.has(key)) return { variable_date: key };
        }
        return null;
    }

    // "weekday before Month" (e.g. "monday before October")
    // and "1st weekday before Month" (e.g. "1st friday before October")
    // map to the last weekday in the previous month.
    const beforeMonthNameMatch = clean.match(/^(?:\d+(?:st|nd|rd|th)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+before\s+(january|february|march|april|may|june|july|august|september|october|november|december)$/i);
    if (beforeMonthNameMatch) {
        const weekday = capitalize(beforeMonthNameMatch[1]);
        const month = capitalize(beforeMonthNameMatch[2]);
        const monthIdx = MONTHS.indexOf(month) - 1; // 0-indexed previous month
        if (monthIdx >= 0 && monthIdx < 12) {
            const key = `last${MONTHS[monthIdx]}${weekday}`;
            if (SUPPORTED_VAR_DATES.has(key)) return { variable_date: key };
        }
        return null;
    }

    // "Nth weekday after MM-01" → first{Month}{Weekday} + offset (N-1)*7
    const afterMatch = clean.match(/^(\d+)(?:st|nd|rd|th)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+after\s+(\d{2})-01$/i);
    if (afterMatch) {
        const n = parseInt(afterMatch[1]);
        const weekday = capitalize(afterMatch[2]);
        const monthIdx = parseInt(afterMatch[3]) - 1; // 0-indexed
        if (monthIdx >= 0 && monthIdx < 12) {
            const key = `first${MONTHS[monthIdx]}${weekday}`;
            if (SUPPORTED_VAR_DATES.has(key)) {
                const offset = (n - 1) * 7;
                if (offset === 0) return { variable_date: key };
                return { variable_date: key, offset };
            }
        }
        return null;
    }

    return null; // unsupported
}

// ---------------------------------------------------------------------------
// YAML formatting helpers
// ---------------------------------------------------------------------------

/**
 * Escape a holiday name for use in a single-quoted YAML string.
 * Single quotes are doubled: O'Brien → O''Brien
 */
function escapeYamlSingleQuote(str) {
    return str.replace(/'/g, '\'\'');
}

function formatYamlKey(key) {
    if (/^[A-Za-z0-9 ._()\-/À-ÖØ-öø-ÿ'’]+$/u.test(key)) {
        return key;
    }
    return `'${escapeYamlSingleQuote(key)}'`;
}

/**
 * Format a single PH holiday as an inline YAML object string.
 * Uses the same style as the existing YAML files.
 */
function formatHoliday(name, def, indent) {
    const prefix = `${indent}- {`;
    const safeName = escapeYamlSingleQuote(name);
    const parts = [`'name': '${safeName}'`];

    if (def.fixed_date) {
        parts.push(`'fixed_date': [${def.fixed_date[0]}, ${def.fixed_date[1]}]`);
        if (def.shift_rule) {
            parts.push(`'shift_rule': '${escapeYamlSingleQuote(def.shift_rule)}'`);
        }
        if (def.substitute_rule) {
            parts.push(`'substitute_rule': '${escapeYamlSingleQuote(def.substitute_rule)}'`);
        }
        if (def.substitute_name) {
            parts.push(`'substitute_name': '${escapeYamlSingleQuote(def.substitute_name)}'`);
        }
    } else if (def.variable_date) {
        // All variable_date values are unquoted in the existing YAML format.
        // Bare scalars with spaces (like 'orthodox easter') are valid YAML plain scalars.
        parts.push(`'variable_date': ${def.variable_date}`);
        if (def.offset !== undefined) {
            parts.push(`'offset': ${def.offset}`);
        }
    }

    if (Array.isArray(def.only_states) && def.only_states.length > 0) {
        function formatYamlSimpleArrayValue(value) {
            if (/^[A-Za-z0-9 ._()\-/À-ÖØ-öø-ÿ'’]+$/u.test(value)) {
                return value;
            }
            return `'${escapeYamlSingleQuote(value)}'`;
        }

        const onlyStates = def.only_states
            .map((stateName) => formatYamlSimpleArrayValue(stateName))
            .join(', ');
        parts.push(`'only_states': [${onlyStates}]`);
    }

    return `${prefix}${parts.join(', ')}}`;
}

// ---------------------------------------------------------------------------
// Existing YAML readers
// ---------------------------------------------------------------------------

function readExistingYaml(filePath) {
    if (!fs.existsSync(filePath)) return {};
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return parse(content) || {};
    } catch (err) {
        console.warn(`  ⚠️  Could not parse ${filePath}: ${err.message}`);
        return {};
    }
}

/**
 * Extract the _nominatim_url from existing YAML data.
 * For state-level entries, returns the URL from the state sub-object if available.
 */
function getNominatimUrl(data) {
    return data._nominatim_url || null;
}

function getStateNominatimUrl(data, stateName) {
    const stateData = data[stateName];
    if (stateData && stateData._nominatim_url) return stateData._nominatim_url;
    return null;
}

/**
 * Build a Nominatim search URL for a state if no explicit URL is configured.
 */
function buildStateNominatimSearchUrl(ccUppercase, stateName) {
    const yamlData = loadDateHolidaysYaml(ccUppercase);
    if (!yamlData || !yamlData.holidays || !yamlData.holidays[ccUppercase]) {
        return null;
    }

    const countryData = yamlData.holidays[ccUppercase];
    const langs = Array.isArray(countryData.langs) && countryData.langs.length > 0
        ? countryData.langs
        : ['en'];

    const names = countryData.names && typeof countryData.names === 'object'
        ? countryData.names
        : null;
    if (!names) return null;

    const preferredLang = langs.find((lang) => names[lang]);
    const countryName = preferredLang
        ? names[preferredLang]
        : (names.en || names.de || Object.values(names)[0]);

    if (!countryName) return null;

    const acceptLanguageList = langs.includes('en') ? langs : [...langs, 'en'];
    const acceptLanguage = acceptLanguageList.join(',');
    const encodedAcceptLanguage = acceptLanguage
        .split(',')
        .map(part => encodeURIComponent(part))
        .join(',');
    return `https://nominatim.openstreetmap.org/search?format=json&country=${encodeURIComponent(countryName)}&state=${encodeURIComponent(stateName)}&zoom=18&addressdetails=1&limit=1&accept-language=${encodedAcceptLanguage}`;
}

function normalizeNominatimAcceptLanguage(urlString, acceptLanguage) {
    if (!urlString || !acceptLanguage) return urlString;
    try {
        const url = new URL(urlString);
        if (url.hostname !== 'nominatim.openstreetmap.org') {
            return urlString;
        }
        url.searchParams.set('accept-language', acceptLanguage);
        const encodedAcceptLanguage = acceptLanguage
            .split(',')
            .map(part => encodeURIComponent(part))
            .join(',');
        return url.toString().replace(/accept-language=[^&]*/, `accept-language=${encodedAcceptLanguage}`);
    } catch {
        return urlString;
    }
}

/**
 * Extract SH entries from existing YAML data (top-level and per-state).
 */
function extractSH(data) {
    return (data.SH && Array.isArray(data.SH) && data.SH.length > 0)
        ? data.SH
        : null;
}

function extractStateSH(data, stateName) {
    const stateData = data[stateName];
    if (!stateData) return null;
    return (stateData.SH && Array.isArray(stateData.SH) && stateData.SH.length > 0)
        ? stateData.SH
        : null;
}

// ---------------------------------------------------------------------------
// PH fetcher
// ---------------------------------------------------------------------------


/**
 * Fetch public holidays from date-holidays for a given country (and optional state).
 * Returns an array of { name, rule } objects.
 */
/**
 * Load a date-holidays YAML file directly from the submodule.
 * @param {string} ccUppercase - Country code in uppercase (e.g., 'DE', 'DK')
 * @returns {Object|null} Parsed YAML or null if not found
 */
function loadDateHolidaysYaml(ccUppercase) {
    const yamlPath = path.join(SUBMODULE_COUNTRIES_DIR, `${ccUppercase}.yaml`);
    if (!fs.existsSync(yamlPath)) return null;
    try {
        const content = fs.readFileSync(yamlPath, 'utf8');
        return parse(content) || null;
    } catch (err) {
        console.error(`Failed to parse ${yamlPath}: ${err.message}`);
        return null;
    }
}

/**
 * Build a state-code -> state-name map directly from date-holidays country YAML.
 */
function getStatesFromCountryYaml(ccUppercase) {
    const yamlData = loadDateHolidaysYaml(ccUppercase);
    if (!yamlData || !yamlData.holidays || !yamlData.holidays[ccUppercase]) {
        return null;
    }

    const countryData = yamlData.holidays[ccUppercase];
    if (!countryData.states || typeof countryData.states !== 'object') {
        return null;
    }

    const states = {};
    const nameLanguagePriority = ['de', 'en', 'fr', 'it', 'es', 'pt'];

    function normalizeStateName(rawName) {
        return rawName
            .replace(/^Kanton\s+/i, '')
            .replace(/^Canton\s+of\s+/i, '')
            .replace(/^Canton\s+(?:de|du)\s+/i, '')
            .replace(/^Canton\s+d['’]/i, '')
            .replace(/^Cant[oó]n\s+de\s+/i, '')
            .trim();
    }

    for (const [stateCode, stateData] of Object.entries(countryData.states)) {
        if (!stateData || typeof stateData !== 'object') continue;
        if (stateData.name && typeof stateData.name === 'string') {
            states[stateCode] = stateData.name;
            continue;
        }
        if (stateData.names && typeof stateData.names === 'object') {
            let chosenName = null;
            for (const lang of nameLanguagePriority) {
                if (stateData.names[lang]) {
                    chosenName = stateData.names[lang];
                    break;
                }
            }
            if (!chosenName) {
                chosenName = Object.values(stateData.names)[0] || null;
            }
            if (typeof chosenName === 'string' && chosenName.length > 0) {
                states[stateCode] = normalizeStateName(chosenName);
            }
        }
    }

    return Object.keys(states).length > 0 ? states : null;
}

/**
 * Load the global names.yaml from date-holidays submodule (cache once).
 */
let namesCache = null;
function loadNamesYaml() {
    if (namesCache !== null) return namesCache;
    const namesPath = path.join(SUBMODULE_COUNTRIES_DIR, '..', 'names.yaml');
    if (!fs.existsSync(namesPath)) {
        console.warn(`  ⚠️  names.yaml not found at ${namesPath}`);
        return {};
    }
    try {
        const content = fs.readFileSync(namesPath, 'utf8');
        const data = parse(content) || {};
        namesCache = data.names || {};
        return namesCache;
    } catch (err) {
        console.error(`Failed to parse names.yaml: ${err.message}`);
        namesCache = {};
        return namesCache;
    }
}

/**
 * Resolve a holiday name from the rule key.
 * Respects the country's language preference list, then yamlName, then generic fallback.
 */
function resolveHolidayName(rule, yamlName, countryLangs, canonicalNameKey) {
    const namesData = loadNamesYaml();
    const langPrefs = Array.isArray(countryLangs) && countryLangs.length > 0
        ? countryLangs
        : ['en'];

    const lookupKeys = [rule, canonicalNameKey, yamlName].filter(Boolean);

    // First pass: return direct match for the country's language preferences.
    for (const key of lookupKeys) {
        if (namesData[key] && namesData[key].name && typeof namesData[key].name === 'object') {
            const name = namesData[key].name;
            for (const lang of langPrefs) {
                if (lang && name[lang]) {
                    return name[lang];
                }
            }
        }
    }

    // If country YAML already provides a localized name, prefer it over English global fallback.
    if (yamlName) {
        return yamlName;
    }

    // Second pass: generic fallback chain.
    for (const key of lookupKeys) {
        if (namesData[key] && namesData[key].name && typeof namesData[key].name === 'object') {
            const name = namesData[key].name;
            // Prefer common defaults if no preferred language is available.
            return (
                name.en ||
                name.de ||
                Object.values(name)[0] ||
                yamlName ||
                rule
            );
        }
    }
    // Fallback to the name provided from country YAML or rule itself
    return yamlName || rule;
}

/**
 * Resolve the preferred localized name from a dayData.name object/string.
 */
function getPreferredYamlName(dayData, countryLangs, rule) {
    if (dayData.name && typeof dayData.name === 'object') {
        for (const lang of countryLangs) {
            if (dayData.name[lang]) {
                return { name: dayData.name[lang], hasPreferredLanguage: true };
            }
        }
        return {
            name: dayData.name.de || dayData.name.en || Object.values(dayData.name)[0] || null,
            hasPreferredLanguage: false,
        };
    }

    if (dayData.name && typeof dayData.name === 'string') {
        return { name: dayData.name, hasPreferredLanguage: false };
    }

    if (dayData._name && dayData._name !== rule) {
        return { name: dayData._name, hasPreferredLanguage: false };
    }

    return { name: null, hasPreferredLanguage: false };
}

/**
 * Build a multi-language holiday name from YAML/name dictionary sources.
 * Returns null if the requested language combination is not available.
 */
function getMultiLanguageHolidayName(rule, dayData, nameLangs, canonicalNameKey, nameSeparator = ' - ', preferGlobalNames = false) {
    if (!Array.isArray(nameLangs) || nameLangs.length === 0) {
        return null;
    }

    const namesByLang = {};
    const namesData = loadNamesYaml();

    const lookupKeys = [rule, canonicalNameKey, dayData && dayData._name].filter(Boolean);

    function mergeGlobalNames(overwriteExisting) {
        for (const key of lookupKeys) {
            if (namesData[key] && namesData[key].name && typeof namesData[key].name === 'object') {
                for (const [lang, value] of Object.entries(namesData[key].name)) {
                    if (!value) continue;
                    if (overwriteExisting || !namesByLang[lang]) {
                        namesByLang[lang] = value;
                    }
                }
            }
        }
    }

    function mergeLocalDayNames(overwriteExisting) {
        if (!dayData || !dayData.name || typeof dayData.name !== 'object') return;
        for (const [lang, value] of Object.entries(dayData.name)) {
            if (!value) continue;
            if (overwriteExisting || !namesByLang[lang]) {
                namesByLang[lang] = value;
            }
        }
    }

    if (preferGlobalNames) {
        mergeGlobalNames(true);
        mergeLocalDayNames(false);
    } else {
        mergeLocalDayNames(true);
        mergeGlobalNames(false);
    }

    const parts = [];
    for (const lang of nameLangs) {
        const value = namesByLang[lang];
        if (value && !parts.includes(value)) {
            parts.push(value);
        }
    }

    return parts.length >= 2 ? parts.join(nameSeparator) : null;
}

/**
 * Check whether a holiday rule is relevant from a reference date onward.
 * date-holidays uses `active` ranges (from/to). If absent, assume always active.
 */
function isRuleActiveInYear(dayData, referenceDate) {
    if (!dayData || !Array.isArray(dayData.active) || dayData.active.length === 0) {
        return true;
    }

    return dayData.active.some((range) => {
        if (!range) return false;

        // Exact one-off dates can be represented as plain strings.
        if (typeof range === 'string') {
            return range >= referenceDate;
        }

        if (typeof range !== 'object') return false;

        const to = typeof range.to === 'string' ? range.to : '9999-12-31';

        // Relevant if date range overlaps [referenceDate, +infinity).
        return to >= referenceDate;
    });
}

/**
 * Check textual year qualifiers embedded in rule strings.
 * Examples: "... since 2023", "... prior to 2023", "... until 2019".
 */
function isRuleRelevantByRuleText(rule, referenceDate) {
    const year = parseInt(referenceDate.slice(0, 4), 10);

    const sinceMatch = rule.match(/\bsince\s+(\d{4})\b/i);
    if (sinceMatch && year < parseInt(sinceMatch[1], 10)) {
        return false;
    }

    const untilMatch = rule.match(/\buntil\s+(\d{4})\b/i);
    if (untilMatch && year > parseInt(untilMatch[1], 10)) {
        return false;
    }

    const priorMatch = rule.match(/\bprior\s+to\s+(\d{4})\b/i);
    if (priorMatch && year >= parseInt(priorMatch[1], 10)) {
        return false;
    }

    return true;
}

// Sub-regions whose public holidays should NOT be promoted to state level because
// they apply only to a small minority of the state's population (individual Landkreise
// or municipality clusters). By contrast, confessional splits like DE/BY/KATH cover
// the majority of the state and are kept.
// Format: "<CC>/<stateCode>/<regionCode>"
const SKIP_SUBREGION_PROMOTION = new Set([
    'DE/SN/BZ',  // Landkreis Bautzen — only ~14 specific municipalities
    'DE/TH/EIC', // Landkreis Eichfeld
    'DE/TH/UH',  // Unstrut-Hainich-Kreis — only specific municipalities
    'DE/TH/WAK', // Wartburgkreis — only specific municipalities
]);

/**
 * Fetch public holidays from date-holidays submodule YAML.
 * Rules and names come directly from YAML files + names.yaml global i18n.
 */
function fetchPublicHolidays(cc, stateCode, options = {}) {
    const yamlData = loadDateHolidaysYaml(cc);
    if (!yamlData || !yamlData.holidays || !yamlData.holidays[cc]) {
        throw new Error(`No YAML found for ${cc}. Ensure submodules/date-holidays is initialized: git submodule update --init --recursive`);
    }

    const countryData = yamlData.holidays[cc];
    if (!countryData.days) {
        throw new Error(`No days defined for ${cc} in date-holidays submodule`);
    }

    // Extract the country's language preferences for name resolution.
    const countryLangs = (countryData.langs && Array.isArray(countryData.langs) && countryData.langs.length > 0)
        ? countryData.langs
        : ['en'];
    const today = new Date().toISOString().slice(0, 10);

    const holidays = [];
    let optionalCount = 0;

    function getBaseRuleForSubstitute(rule) {
        if (/^substitutes?\b/i.test(rule)) {
            return rule
                .replace(/^substitutes?\s+/i, '')
                .replace(/\s+if\s+.*/i, '')
                .trim();
        }
        if (/\band\s+if\b/i.test(rule)) {
            return rule
                .replace(/\s+and\s+if\s+.*/i, '')
                .trim();
        }
        return null;
    }

    function resolveEffectiveHolidayName(rule, dayData, countryLangs) {
        const { name: yamlName, hasPreferredLanguage } = getPreferredYamlName(dayData, countryLangs, rule);
        const hasExplicitName = !!dayData.name;
        const canonicalNameKey = dayData._name && dayData._name !== rule ? dayData._name : null;

        let finalName = (hasExplicitName && hasPreferredLanguage)
            ? yamlName
            : resolveHolidayName(rule, yamlName, countryLangs, canonicalNameKey);

        const multiLanguageName = getMultiLanguageHolidayName(
            rule,
            dayData,
            options.nameLangs,
            canonicalNameKey,
            options.nameSeparator,
            options.preferGlobalNames,
        );
        if (multiLanguageName) {
            finalName = multiLanguageName;
        }

        if (options.nameOverrides && options.nameOverrides[finalName]) {
            finalName = options.nameOverrides[finalName];
        }

        return finalName;
    }

    function collectReplacementSubstitutes(days) {
        const replacements = new Map();
        if (!days) return replacements;

        for (const [rule, dayData] of Object.entries(days)) {
            if (!/^substitutes?\b/i.test(rule)) continue;
            if (!dayData || dayData === false) continue;
            if (!isIncludedDayType(dayData)) continue;
            if (!isRuleRelevantByRuleText(rule, today)) continue;
            if (!isRuleActiveInYear(dayData, today)) continue;

            const baseRule = getBaseRuleForSubstitute(rule);
            if (baseRule) {
                replacements.set(baseRule, { rule, dayData });
            }
        }

        return replacements;
    }

    function isDayApplicable(rule, dayData) {
        if (!isIncludedDayType(dayData)) return false;
        if (!isRuleRelevantByRuleText(rule, today)) return false;
        if (!isRuleActiveInYear(dayData, today)) return false;
        return true;
    }

    function isIncludedDayType(dayData) {
        if (!dayData || typeof dayData !== 'object') return false;
        const type = dayData && dayData.type;
        const allowedDayTypes = Array.isArray(options.includeDayTypes) && options.includeDayTypes.length > 0
            ? new Set(options.includeDayTypes)
            : INCLUDED_DAY_TYPES;
        return !type || allowedDayTypes.has(type);
    }

    function addHoliday(rule, dayData, countryLangs, baseDayLookups = [], replacementSubstitute = null) {
        if (!isDayApplicable(rule, dayData)) return;

        let finalName = resolveEffectiveHolidayName(rule, dayData, countryLangs);

        // If the substitute rule carries a different display name than the original
        // holiday, preserve that as substitute_name while the base holiday keeps its
        // original name. This applies to both additive ("MM-DD and if ...") and
        // replacement ("substitutes MM-DD if ...") substitutes.
        let substitute_name = null;
        const baseKey = getBaseRuleForSubstitute(rule);
        if (baseKey) {
            let baseDayData = null;
            for (const days of baseDayLookups) {
                if (days && days[baseKey] && days[baseKey] !== false) {
                    baseDayData = days[baseKey];
                    break;
                }
            }
            if (baseDayData && isRuleActiveInYear(baseDayData, today)) {
                const baseName = resolveEffectiveHolidayName(baseKey, baseDayData, countryLangs);
                if (baseName && baseName !== finalName) {
                    substitute_name = finalName;
                    finalName = baseName;
                }
            }
        }

        let substitute_rule_override = null;
        if (replacementSubstitute) {
            const replacementParsed = parseRule(replacementSubstitute.rule);
            if (replacementParsed && replacementParsed.shift_rule) {
                substitute_rule_override = replacementParsed.shift_rule;
            }
            const replacementName = resolveEffectiveHolidayName(replacementSubstitute.rule, replacementSubstitute.dayData, countryLangs);
            if (replacementName && replacementName !== finalName) {
                substitute_name = replacementName;
            }
        }

        holidays.push({
            name: finalName,
            rule,
            ...(substitute_name ? { substitute_name } : {}),
            ...(substitute_rule_override ? { substitute_rule_override } : {}),
        });
        if (dayData.type === 'optional') {
            optionalCount++;
        }
    }

    const disabledStateRules = new Set();
    if (stateCode && countryData.states && countryData.states[stateCode] && countryData.states[stateCode].days) {
        for (const [rule, dayData] of Object.entries(countryData.states[stateCode].days)) {
            if (dayData === false) {
                disabledStateRules.add(rule);
            } else if (/\band\s+if\b/i.test(rule) && isRuleActiveInYear(dayData, today)) {
                // An active "MM-DD and if ..." state entry supersedes the national plain "MM-DD".
                // Add the base date so the national plain entry is suppressed, avoiding
                // a duplicate where both plain and substitute entries appear for the same date.
                const baseRule = rule.replace(/\s+and\s+if\s+.*/i, '').trim();
                disabledStateRules.add(baseRule);
            }
        }
    }

    const nationalReplacementSubstitutes = collectReplacementSubstitutes(countryData.days);

    // Iterate over all days/rules in the national level
    for (const [rule, dayData] of Object.entries(countryData.days)) {
        if (disabledStateRules.has(rule)) {
            continue;
        }
        if (nationalReplacementSubstitutes.has(rule)) {
            const replacement = nationalReplacementSubstitutes.get(rule);
            addHoliday(rule, dayData, countryLangs, [countryData.days], replacement);
            continue;
        }
        // Also suppress "MM-DD and if ..." national entries when the state has its own
        // active "MM-DD and if ..." entry (which adds the base "MM-DD" to disabledStateRules).
        // Example: SA has "12-26 and if ..." (Proclamation Day) superseding national Boxing Day.
        if (/\band\s+if\b/i.test(rule)) {
            const baseOfNatRule = rule.replace(/\s+and\s+if\s+.*/i, '').trim();
            if (disabledStateRules.has(baseOfNatRule)) {
                continue;
            }
        }
        // Replacement substitutes are merged into their base holiday above.
        if (/^substitutes?\b/i.test(rule)) continue;
        addHoliday(rule, dayData, countryLangs, [countryData.days]);
    }

    // Handle standalone replacement substitutes (no applicable base holiday rule).
    for (const [baseRule, replacement] of nationalReplacementSubstitutes.entries()) {
        const baseDayData = countryData.days[baseRule];
        if (baseDayData && baseDayData !== false && isDayApplicable(baseRule, baseDayData)) {
            continue;
        }
        addHoliday(replacement.rule, replacement.dayData, countryLangs, [countryData.days]);
    }

    // If state-specific data exists, add state holidays
    if (stateCode && countryData.states && countryData.states[stateCode]) {
        const stateData = countryData.states[stateCode];
        if (stateData.days) {
            const stateReplacementSubstitutes = collectReplacementSubstitutes(stateData.days);
            for (const [rule, dayData] of Object.entries(stateData.days)) {
                if (stateReplacementSubstitutes.has(rule)) {
                    const replacement = stateReplacementSubstitutes.get(rule);
                    addHoliday(rule, dayData, countryLangs, [stateData.days, countryData.days], replacement);
                    continue;
                }
                if (/^substitutes?\b/i.test(rule)) continue;
                addHoliday(rule, dayData, countryLangs, [stateData.days, countryData.days]);
            }

            for (const [baseRule, replacement] of stateReplacementSubstitutes.entries()) {
                const stateBase = stateData.days[baseRule];
                const countryBase = countryData.days[baseRule];
                const hasApplicableBase = (stateBase && stateBase !== false && isDayApplicable(baseRule, stateBase))
                    || (countryBase && countryBase !== false && isDayApplicable(baseRule, countryBase));
                if (hasApplicableBase) {
                    continue;
                }
                addHoliday(replacement.rule, replacement.dayData, countryLangs, [stateData.days, countryData.days]);
            }
        }

        // Promote sub-region public holidays to state level.
        // Some states have regions (e.g. DE/BY: KATH/EVANG) where a holiday is
        // `type: public` only in a sub-region but `type: observance` at state level.
        // Since opening_hours.js resolves holidays at country/state level only (via
        // nominatim), we include any sub-region `type: public` entry that is not
        // already present at state level (avoiding duplicates).
        if (stateData.regions) {
            const addedRules = new Set(holidays.map(h => h.rule));
            for (const [regionCode, regionData] of Object.entries(stateData.regions)) {
                if (SKIP_SUBREGION_PROMOTION.has(`${cc}/${stateCode}/${regionCode}`)) continue;
                if (!regionData || !regionData.days) continue;
                const regionReplacementSubstitutes = collectReplacementSubstitutes(regionData.days);
                for (const [rule, dayData] of Object.entries(regionData.days)) {
                    if (regionReplacementSubstitutes.has(rule)) {
                        const replacement = regionReplacementSubstitutes.get(rule);
                        if (addedRules.has(rule)) continue;
                        addHoliday(rule, dayData, countryLangs, [regionData.days, stateData.days, countryData.days], replacement);
                        addedRules.add(rule);
                        continue;
                    }
                    if (/^substitutes?\b/i.test(rule)) continue;
                    if (!dayData || !isIncludedDayType(dayData)) continue;
                    if (addedRules.has(rule)) continue;
                    addHoliday(rule, dayData, countryLangs, [regionData.days, stateData.days, countryData.days]);
                    addedRules.add(rule);
                }

                for (const [baseRule, replacement] of regionReplacementSubstitutes.entries()) {
                    const regionBase = regionData.days[baseRule];
                    const stateBase = stateData.days && stateData.days[baseRule];
                    const countryBase = countryData.days[baseRule];
                    const hasApplicableBase = (regionBase && regionBase !== false && isDayApplicable(baseRule, regionBase))
                        || (stateBase && stateBase !== false && isDayApplicable(baseRule, stateBase))
                        || (countryBase && countryBase !== false && isDayApplicable(baseRule, countryBase));
                    if (hasApplicableBase) {
                        continue;
                    }
                    if (addedRules.has(replacement.rule)) continue;
                    addHoliday(replacement.rule, replacement.dayData, countryLangs, [regionData.days, stateData.days, countryData.days]);
                    addedRules.add(replacement.rule);
                }
            }
        }
    }

    return { holidays, optionalCount };
}

// ---------------------------------------------------------------------------
// YAML generator
// ---------------------------------------------------------------------------

/**
 * Convert an array of date-holidays holiday objects to opening_hours.js holiday defs.
 * Returns { holidays: [{name, def}], skipped: [{name, rule}] }
 */
function convertHolidays(rawHolidays) {
    const holidays = [];
    const skipped = [];
    const seen = new Set();
    const nearestExactYearByName = new Map();
    const exactEntriesByNameYear = new Map();
    const today = new Date().toISOString().slice(0, 10);
    const windowEnd = new Date();
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 365);
    const windowEndDate = windowEnd.toISOString().slice(0, 10);

    function pushUnique(name, def) {
        const key = `${name}::${JSON.stringify(def)}`;
        if (seen.has(key)) return;
        seen.add(key);
        holidays.push({ name, def });
    }

    for (const h of rawHolidays) {
        const def = parseRule(h.rule);
        if (def === null) {
            // Skip old/historical rules silently. Only warn about genuinely unsupported formats.
            const yearDateMatch = h.rule.match(/\d{4}-\d{2}-\d{2}/);
            if (yearDateMatch && yearDateMatch[0] < today) {
                continue; // Old historical date, skip silently
            }
            skipped.push({ name: h.name, rule: h.rule });
        } else if (Array.isArray(def)) {
            // Duration rule: expand to multiple single-day entries
            for (const d of def) {
                pushUnique(h.name, d);
            }
        } else {
            if (def.exact_date && (def.exact_date < today || def.exact_date > windowEndDate)) {
                // Old or future exact date outside the rolling 1-year window, skip silently
                continue;
            }
            if (def.exact_date) {
                // opening_hours.js cannot model year-specific fixed dates yet.
                // Keep all exact-date entries for the nearest upcoming year per
                // holiday name (e.g. AR tourism non-working days), but ignore
                // future-year duplicates that would appear as pseudo-annual
                // duplicates (e.g. Matariki dates from two different years).
                const year = parseInt(def.exact_date.slice(0, 4));
                const prevYear = nearestExactYearByName.get(h.name);
                if (prevYear === undefined || year < prevYear) {
                    nearestExactYearByName.set(h.name, year);
                }

                if (h.substitute_name) {
                    def.substitute_name = h.substitute_name;
                }
                if (h.substitute_rule_override) {
                    def.substitute_rule = h.substitute_rule_override;
                }

                const byYear = exactEntriesByNameYear.get(h.name) || new Map();
                const entries = byYear.get(year) || [];
                entries.push({ name: h.name, def });
                byYear.set(year, entries);
                exactEntriesByNameYear.set(h.name, byYear);
                continue;
            }
            if (def.exact_date) {
                delete def.exact_date;
            }
            if (h.substitute_name) {
                def.substitute_name = h.substitute_name;
            }
            if (h.substitute_rule_override) {
                def.substitute_rule = h.substitute_rule_override;
            }
            pushUnique(h.name, def);
        }
    }

    exactEntriesByNameYear.forEach(function (byYear, name) {
        const year = nearestExactYearByName.get(name);
        const entries = byYear.get(year) || [];
        entries.forEach(function (entry) {
            delete entry.def.exact_date;
            pushUnique(entry.name, entry.def);
        });
    });

    return { holidays, skipped };
}

function monthFromVariableDate(variableDate) {
    for (let i = 0; i < MONTHS.length; i++) {
        if (variableDate.includes(MONTHS[i])) {
            return i + 1;
        }
    }
    return null;
}

function estimateHolidaySortKey(def) {
    if (def.fixed_date) {
        const [month, day] = def.fixed_date;
        return month * 100 + day;
    }

    if (!def.variable_date) {
        return 9999;
    }

    const offset = def.offset || 0;
    const variableDate = def.variable_date;

    if (variableDate === 'easter') {
        // Easter is in Mar/Apr. Small offsets stay around Mar/Apr; larger
        // offsets (Ascension/Pentecost) are usually in May/June and should
        // sort after fixed early-May holidays like 05-01.
        if (offset >= 30) {
            return 520 + (offset - 30);
        }
        return 350 + offset;
    }
    if (variableDate === 'orthodox easter') {
        return 430 + offset;
    }
    if (variableDate === 'victoriaDay') {
        return 523;
    }
    if (variableDate === 'nextWednesday16Nov') {
        return 1116;
    }
    if (variableDate === 'nextSaturday20Jun') {
        return 620;
    }
    if (variableDate === 'nextSaturday31Oct') {
        return 1031;
    }

    const month = monthFromVariableDate(variableDate);
    if (month !== null) {
        if (variableDate.startsWith('first')) {
            return month * 100 + 1 + offset;
        }
        if (variableDate.startsWith('last')) {
            return month * 100 + 28 + offset;
        }
        return month * 100 + 15 + offset;
    }

    return 9999 + offset;
}

function compareGeneratedHolidays(a, b) {
    const keyA = estimateHolidaySortKey(a.def);
    const keyB = estimateHolidaySortKey(b.def);

    if (keyA !== keyB) {
        return keyA - keyB;
    }

    const aHasFixed = !!a.def.fixed_date;
    const bHasFixed = !!b.def.fixed_date;
    if (aHasFixed !== bHasFixed) {
        return aHasFixed ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
}

/**
 * Build YAML lines for a PH block.
 */
function buildPhLines(rawHolidays, indent, countryCode, stateCode, includeHeader = true) {
    const { holidays, skipped } = convertHolidays(rawHolidays);
    const sortedHolidays = holidays.slice().sort(compareGeneratedHolidays);

    const lines = [];
    if (includeHeader) {
        lines.push(`${indent}PH:`);
    }
    for (const { name, def } of sortedHolidays) {
        lines.push(formatHoliday(name, def, `${indent}  `));
    }

    for (const { name, rule } of skipped) {
        const loc = stateCode ? `${countryCode}/${stateCode}` : countryCode;
        // Explain why the rule was skipped: only full-day holidays are supported, not time-based rules
        const reason = rule.includes(':') ? '(time-based, only full-day holidays supported)' : '(unsupported format)';
        console.warn(`  ⚠️  Skipped unsupported rule [${loc}] "${name}": ${rule} ${reason}`);
    }

    return lines;
}

/**
 * Build top-level PH with only_states from per-state holiday sets.
 * Holidays present in all states are emitted without only_states.
 */
function buildOnlyStatesPhLinesFromStateResults(stateResults, indent, countryCode, includeHeader = true) {
    const allStateNames = stateResults.map(result => result.stateName);
    const grouped = new Map();

    for (const { stateCode, stateName, rawHolidays } of stateResults) {
        const { holidays, skipped } = convertHolidays(rawHolidays);

        for (const { name, rule } of skipped) {
            const loc = `${countryCode}/${stateCode}`;
            const reason = rule.includes(':') ? '(time-based, only full-day holidays supported)' : '(unsupported format)';
            console.warn(`  ⚠️  Skipped unsupported rule [${loc}] "${name}": ${rule} ${reason}`);
        }

        for (const { name, def } of holidays) {
            const normalizedDef = { ...def };
            delete normalizedDef.only_states;
            const key = `${name}::${JSON.stringify(normalizedDef)}`;

            if (!grouped.has(key)) {
                grouped.set(key, {
                    name,
                    def: normalizedDef,
                    states: new Set(),
                });
            }

            grouped.get(key).states.add(stateName);
        }
    }

    const holidays = [];
    for (const entry of grouped.values()) {
        const states = Array.from(entry.states).sort((a, b) => a.localeCompare(b));
        const def = { ...entry.def };
        if (states.length !== allStateNames.length) {
            def.only_states = states;
        }
        holidays.push({ name: entry.name, def });
    }

    const sortedHolidays = holidays.slice().sort(compareGeneratedHolidays);
    const lines = [];
    if (includeHeader) {
        lines.push(`${indent}PH:`);
    }
    for (const { name, def } of sortedHolidays) {
        lines.push(formatHoliday(name, def, `${indent}  `));
    }
    return lines;
}

function getDateHolidaysSourceUrl(countryCode) {
    return `https://github.com/commenthol/date-holidays/blob/master/data/countries/${countryCode}.yaml`;
}

/**
 * Generate YAML content for a simple country (no state subdivisions).
 */
function generateSimpleYaml(ccLower, config, existingData) {
    const { holidays: rawHolidays, optionalCount } = fetchPublicHolidays(config.cc, undefined, config);
    const existingFilePath = path.join(HOLIDAYS_DIR, `${ccLower}.yaml`);
    const existingPrefix = extractExistingPrefixBeforePh(existingFilePath);
    const lines = existingPrefix
        ? existingPrefix.split(/\r?\n/)
        : buildGeneratedYamlHeader(config.cc);

    lines.push(...buildPhLines(rawHolidays, '', ccLower, null, !existingPrefix));

    lines.push('');
    return { content: lines.join('\n'), optionalCount };
}

/**
 * Generate YAML content for a country with state subdivisions.
 * Each state gets its own PH section.
 */
function generateStateYaml(ccLower, config, existingData) {
    const existingFilePath = path.join(HOLIDAYS_DIR, `${ccLower}.yaml`);
    const existingPrefix = extractExistingPrefixBeforePh(existingFilePath);
    const lines = existingPrefix
        ? existingPrefix.split(/\r?\n/)
        : buildGeneratedYamlHeader(config.cc);
    let optionalCount = 0;
    const stateResults = [];

    // Pre-fetch state holidays once. Some national strategies (like intersection)
    // are derived from per-state data, and we also reuse these results below.
    for (const [stateCode, stateName] of Object.entries(config.states)) {
        const { holidays: rawHolidays, optionalCount: stateOptionalCount } = fetchPublicHolidays(config.cc, stateCode, config);
        optionalCount += stateOptionalCount;
        stateResults.push({ stateCode, stateName, rawHolidays });
    }

    if (config.emitOnlyStatesAtTopLevel) {
        lines.push(...buildOnlyStatesPhLinesFromStateResults(stateResults, '', ccLower, !existingPrefix));
    } else {
        const { holidays: nationalRawHolidays, optionalCount: nationalOptionalCount } = fetchPublicHolidays(config.cc, undefined, config);
        optionalCount += nationalOptionalCount;
        lines.push(...buildPhLines(nationalRawHolidays, '', ccLower, null, !existingPrefix));
    }
    lines.push('');

    const orderedStateResults = config.sortStatesByName
        ? stateResults.slice().sort((left, right) => left.stateName.localeCompare(right.stateName, 'de'))
        : stateResults;

    // Per-state sections
    for (const { stateCode, stateName, rawHolidays } of orderedStateResults) {
        let stateNominatimUrl = getStateNominatimUrl(existingData, stateName)
            || (config.stateNominatimUrls && config.stateNominatimUrls[stateCode])
            || buildStateNominatimSearchUrl(config.cc, stateName)
            || null;
        if (stateNominatimUrl && config.stateAcceptLanguage) {
            stateNominatimUrl = normalizeNominatimAcceptLanguage(stateNominatimUrl, config.stateAcceptLanguage);
        }
        const stateSH = extractStateSH(existingData, stateName);

        lines.push(`${formatYamlKey(stateName)}:`);

        if (config.includeStateCode) {
            lines.push(`  _state_code: ${stateCode.toLowerCase()}`);
        }

        if (stateNominatimUrl) {
            lines.push(`  _nominatim_url: '${stateNominatimUrl}'`);
        }

        if (!config.emitOnlyStatesAtTopLevel) {
            lines.push(...buildPhLines(rawHolidays, '  ', ccLower, stateCode, true));
        }

        if (stateSH) {
            lines.push('  SH:');
            for (const entry of stateSH) {
                lines.push(`    - ${JSON.stringify(entry)}`);
            }
        }

        lines.push('');
    }

    return { content: lines.join('\n'), optionalCount };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const requestedCodes = args.filter(a => !a.startsWith('--'));

    const toProcess = requestedCodes.length > 0
        ? requestedCodes
        : Object.keys(COUNTRY_CONFIGS);

    let processed = 0;
    let skippedCountries = 0;
    let errors = 0;
    const countriesWithOptional = [];

    for (const ccLower of toProcess) {
        const config = COUNTRY_CONFIGS[ccLower];
        if (!config) {
            console.warn(`⚠️  Unknown country code: ${ccLower}`);
            continue;
        }

        if (config.skip) {
            console.log(`⏭️  Skipping ${ccLower}: ${config.skip}`);
            skippedCountries++;
            continue;
        }

        const yamlPath = path.join(HOLIDAYS_DIR, `${ccLower}.yaml`);
        const existingData = readExistingYaml(yamlPath);

        let effectiveConfig = config;
        if (!config.states && config.statesFromSource) {
            const sourceStates = getStatesFromCountryYaml(config.cc);
            if (!sourceStates) {
                console.warn(`  ⚠️  No states found in source for ${config.cc}; falling back to national PH only`);
            } else {
                effectiveConfig = { ...config, states: sourceStates };
            }
        }

        console.log(`🔄 Generating ${ccLower}.yaml...`);

        try {
            const result = effectiveConfig.states
                ? generateStateYaml(ccLower, effectiveConfig, existingData)
                : generateSimpleYaml(ccLower, effectiveConfig, existingData);

            if (result.optionalCount > 0) {
                countriesWithOptional.push(ccLower);
                console.log(`  ℹ️  Found ${result.optionalCount} optional holiday entr${result.optionalCount === 1 ? 'y' : 'ies'} in source`);
            }

            if (dryRun) {
                console.log(`\n--- ${ccLower}.yaml ---`);
                console.log(result.content);
            } else {
                fs.writeFileSync(yamlPath, result.content, 'utf8');
                console.log(`  ✅ Written ${yamlPath}`);
            }
            processed++;
        } catch (err) {
            console.error(`  ❌ Error generating ${ccLower}: ${err.message}`);
            errors++;
        }
    }

    console.log(`\n📊 Summary: ${processed} processed, ${skippedCountries} skipped, ${errors} errors`);
    if (countriesWithOptional.length > 0) {
        console.log(`ℹ️  Optional holidays found in ${countriesWithOptional.length} countries: ${countriesWithOptional.join(', ')}`);
    }
}

main();
