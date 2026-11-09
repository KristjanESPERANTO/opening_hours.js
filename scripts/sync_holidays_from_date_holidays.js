#!/usr/bin/env node
/* eslint-disable jsdoc/require-returns */
/* eslint-disable jsdoc/require-param-description */

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
 *   node scripts/sync_holidays_from_date_holidays.js [--dry-run] [cc ...]
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
let warnedAboutJulianDateConversion = false;

/**
 * @typedef {object} HolidayDefinition
 * @property {number[]} [fixed_date] Fixed month and day.
 * @property {number} [year] One-off calendar year.
 * @property {string} [variable_date] Supported variable-date key.
 * @property {number} [offset] Day offset from the base date.
 * @property {string} [shift_rule] Replacement-date weekday rule.
 * @property {string} [substitute_rule] Additional substitute-date rule.
 * @property {string} [substitute_name] Localized name for a substitute date.
 * @property {string[]} [only_states] State names where the holiday applies.
 * @property {'even' | 'odd'} [years] Alternating-year recurrence.
 */

/**
 * @typedef {object} DateHolidayDay
 * @property {string} [type] Upstream holiday classification.
 * @property {string | Record<string, string>} [name] Localized or plain holiday name.
 * @property {string} [_name] Canonical name lookup key.
 * @property {Array<string | number | { from?: string | number, to?: string | number }>} [active] Active date ranges.
 */

/**
 * @typedef {object} DateHolidayPartition
 * @property {DateHolidayDays} [days] Holiday rules at this level.
 * @property {Record<string, DateHolidayPartition>} [states] State-level data.
 * @property {Record<string, DateHolidayPartition>} [regions] Sub-region data.
 * @property {string[]} [langs] Preferred language codes.
 * @property {Record<string, string>} [names] Localized country names.
 * @property {string} [name] Plain subdivision name.
 */

/** @typedef {{ holidays?: Record<string, DateHolidayPartition> }} DateHolidayYaml */
/** @typedef {Record<string, DateHolidayDay | false>} DateHolidayDays */
/** @typedef {{ name?: Record<string, string> }} HolidayNameEntry */
/** @typedef {Record<string, HolidayNameEntry>} HolidayNameRegistry */
/** @typedef {{ name: string, rule: string, substitute_name?: string, substitute_rule_override?: string }} RawHoliday */
/** @typedef {{ name: string, def: HolidayDefinition }} GeneratedHoliday */
/** @typedef {{ rule: string, dayData: DateHolidayDay, combinedRule: string }} ReplacementSubstitute */
/** @typedef {{ _nominatim_url?: string, _state_code?: string, SH?: unknown[] }} ExistingYamlSection */
/** @typedef {Record<string, ExistingYamlSection>} ExistingYamlData */

/**
 * @typedef {object} CountryConfig
 * @property {string} cc Upstream country code.
 * @property {string} [baseCc] Base country whose rules are inherited.
 * @property {string} [skip] Reason to skip this country.
 * @property {Record<string, string>} [states] State code to display name map.
 * @property {Record<string, string>} [additionalStates] Extra state names.
 * @property {Record<string, string>} [stateSourceCountries] Source country per state.
 * @property {Record<string, string>} [stateNameOverrides] State-name overrides.
 * @property {Record<string, string>} [stateCodeOverrides] Output state-code overrides.
 * @property {Record<string, string>} [stateNominatimUrls] Nominatim URL per state.
 * @property {Record<string, string[]>} [stateIncludeDayTypes] Included types per state.
 * @property {Record<string, string[]>} [statePreferredLangs] Name languages per state.
 * @property {string[]} [stateNameLanguagePriority] Preferred source languages for state names.
 * @property {string[]} [statesWithoutNominatimUrl] States with no geocoding URL.
 * @property {string[]} [includeDayTypes] Included upstream holiday types.
 * @property {string[]} [includeDayRules] Included exact upstream rule keys.
 * @property {string[]} [preferredLangs] Preferred name languages.
 * @property {string[]} [nameLangs] Languages combined in output names.
 * @property {string} [nameSeparator] Separator for combined names.
 * @property {string} [stateAcceptLanguage] Nominatim language preference.
 * @property {string} [nominatimUrl] Country-level Nominatim URL.
 * @property {Record<string, string>} [nameOverrides] Final holiday-name overrides.
 * @property {boolean} [statesFromSource] Whether to load states from source YAML.
 * @property {boolean} [includeStateCode] Whether to emit state-code metadata.
 * @property {boolean} [includeNationalHolidaysAtTopLevel] Whether to emit national holidays.
 * @property {boolean} [emitOnlyStatesAtTopLevel] Whether to derive top-level state holidays.
 * @property {boolean} [emitStatePhNested] Whether state PH blocks include national holidays.
 * @property {boolean} [sortStatesByName] Whether to sort subdivisions by display name.
 * @property {boolean} [preferGlobalNames] Whether global names take precedence.
 */
/** @typedef {Omit<CountryConfig, 'cc'>} HolidayFetchOptions */
/** @typedef {CountryConfig & { states: Record<string, string> }} StateCountryConfig */
/** @typedef {{ stateCode: string, stateName: string, rawHolidays: RawHoliday[] }} StateHolidayResult */

// REUSE-IgnoreStart
const GENERATED_YAML_HEADER = [
    '# SPDX-FileCopyrightText: date-holidays contributors',
    '# SPDX-FileCopyrightText: opening_hours.js contributors',
    '# SPDX-License-Identifier: CC-BY-SA-3.0',
    '---',
    '',
];
// REUSE-IgnoreEnd

/** @param {string} countryCode */
function buildGeneratedYamlHeader(countryCode) {
    return [
        ...GENERATED_YAML_HEADER,
        `# @source ${getDateHolidaysSourceUrl(countryCode)}`,
        '',
    ];
}

/** @param {string} existingDataPath */
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
    'firstJuneMonday', 'firstJuneFriday',
    'firstJulyMonday',
    'firstAugustMonday', 'firstAugustTuesday', 'firstAugustFriday',
    'firstSeptemberMonday', 'firstSeptemberTuesday', 'firstSeptemberSunday',
    'firstOctoberMonday', 'firstOctoberSunday',
    'firstNovemberMonday', 'firstNovemberTuesday', 'firstNovemberThursday',
    'lastNovemberWednesday',
    'lastMayMonday', 'lastMarchMonday', 'lastAprilMonday', 'lastAprilFriday',
    'lastAugustMonday', 'lastSeptemberMonday', 'lastSeptemberFriday',
    'lastOctoberMonday', 'lastOctoberFriday', 'lastOctoberSunday',
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

/** @param {string} name */
function isCanadaDayName(name) {
    return /^(Canada Day|F[êe]te du Canada)$/u.test(name);
}

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

/** @param {string[]} codes */
const sameCodeMap = (codes) => Object.fromEntries(codes.map((code) => [code, code]));

// French overseas territories are separate date-holidays countries.
const FR_OVERSEAS_CODES = ['BL', 'GF', 'GP', 'MF', 'MQ', 'RE', 'YT', 'WF', 'NC', 'PF'];

const US_TERRITORIES = {
    AS: 'American Samoa',
    GU: 'Guam',
    PR: 'Puerto Rico',
    VI: 'United States Virgin Islands',
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
/** @type {Record<string, CountryConfig>} */
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
    ca: {
        cc: 'CA',
        statesFromSource: true,
        includeStateCode: true,
        stateAcceptLanguage: 'en,fr',
        stateIncludeDayTypes: {
            NU: ['public', 'bank'],
            QC: ['public', 'optional'],
        },
        statePreferredLangs: {
            QC: ['fr', 'en'],
        },
    },
    ci: { cc: 'CI', skip: 'CI relies on Islamic calendar holidays (Ramadan etc.) which are not supported' },
    cn: { cc: 'CN', skip: 'CN relies on Chinese lunisolar calendar which is not supported' },
    cz: { cc: 'CZ' },
    dk: {
        cc: 'DK',
        includeDayRules: ['06-05', '12-24'], // Danish retail shops are closed by law.
    },
    es: {
        cc: 'ES',
        statesFromSource: true,
        includeStateCode: true,
        stateNameLanguagePriority: ['es', 'ca', 'en'],
        stateNameOverrides: {
            CM: 'Castilla-La Mancha',
            CE: 'Ceuta',
            MC: 'Región de Murcia',
            ML: 'Melilla',
        },
        stateAcceptLanguage: 'es,ca,eu,gl,oc,ast',
        includeNationalHolidaysAtTopLevel: true,
        emitOnlyStatesAtTopLevel: true,
    },
    fi: { cc: 'FI', nameLangs: ['fi', 'sv'] },
    fr: {
        cc: 'FR',
        statesFromSource: true,
        includeStateCode: true,
        stateNameLanguagePriority: ['fr', 'en'],
        stateNameOverrides: {
            '57': 'Moselle',
            '67': 'Bas-Rhin',
            '68': 'Haut-Rhin',
            BL: 'Saint-Barthélemy',
            GF: 'Guyane',
            GP: 'Guadeloupe',
            MF: 'Saint-Martin',
            MQ: 'Martinique',
            RE: 'La Réunion',
            YT: 'Mayotte',
            WF: 'Wallis-et-Futuna',
            NC: 'Nouvelle-Calédonie',
            PF: 'Polynésie française',
        },
        stateSourceCountries: sameCodeMap(FR_OVERSEAS_CODES),
        additionalStates: {
            WF: 'Wallis-et-Futuna',
            NC: 'Nouvelle-Calédonie',
            PF: 'Polynésie française',
        },
        stateIncludeDayTypes: Object.fromEntries(
            FR_OVERSEAS_CODES.map((code) => [code, ['public', 'bank', 'optional']]),
        ),
        stateAcceptLanguage: 'fr,en',
        includeNationalHolidaysAtTopLevel: true,
        emitOnlyStatesAtTopLevel: true,
    },
    gr: { cc: 'GR' },
    gg: { cc: 'GG', baseCc: 'GB' },
    hr: { cc: 'HR' },
    hu: { cc: 'HU' },
    je: {
        cc: 'JE',
        baseCc: 'GB',
        nominatimUrl: 'https://nominatim.openstreetmap.org/reverse?format=json&lat=49.2&lon=-2.1&zoom=11&addressdetails=1&accept-language=en',
    },
    ie: { cc: 'IE' },
    it: { cc: 'IT' },
    jp: { cc: 'JP' },
    lu: { cc: 'LU', nameLangs: ['lb', 'de', 'fr'] },
    na: { cc: 'NA' },
    nl: { cc: 'NL' },
    no: { cc: 'NO' },
    nz: { cc: 'NZ' },
    pl: { cc: 'PL' },
    pm: { cc: 'PM', baseCc: 'FR' },
    ro: { cc: 'RO' },
    ru: {
        cc: 'RU',
        statesFromSource: true,
        includeStateCode: true,
        statesWithoutNominatimUrl: ['CR', 'SEV'],
        stateNameLanguagePriority: ['ru', 'en'],
        stateNameOverrides: {
            AD: 'Адыгея',
            BA: 'Башкортостан',
            CE: 'Чечня',
            CU: 'Чувашия',
            DA: 'Дагестан',
            IN: 'Ингушетия',
            KB: 'Кабардино-Балкария',
            KC: 'Карачаево-Черкесия',
            KL: 'Калмыкия',
            MR: 'Мордовия',
            NO: 'Северная Осетия — Алания',
            TA: 'Татарстан',
        },
        stateCodeOverrides: {
            MR: 'MO',
            NO: 'SE',
        },
        stateAcceptLanguage: 'ru,en',
    },
    se: { cc: 'SE' },
    si: { cc: 'SI' },
    sk: { cc: 'SK' },
    sj: { cc: 'SJ', baseCc: 'NO' },
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
    gi: { cc: 'GI', baseCc: 'GB' },
    im: { cc: 'IM', baseCc: 'GB' },
    nf: { cc: 'NF', baseCc: 'AU' },
    de: {
        cc: 'DE',
        states: DE_STATES,
        includeStateCode: true,
        includeNationalHolidaysAtTopLevel: true,
        emitOnlyStatesAtTopLevel: true,
    },

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
        includeNationalHolidaysAtTopLevel: true,
        emitOnlyStatesAtTopLevel: true,
    },
    us: {
        cc: 'US',
        nominatimUrl: 'https://nominatim.openstreetmap.org/search?format=json&country=United+States+of+America&zoom=18&addressdetails=1&limit=1&accept-language=en',
        statesFromSource: true,
        additionalStates: US_TERRITORIES,
        stateSourceCountries: sameCodeMap(Object.keys(US_TERRITORIES)),
        includeStateCode: true,
        stateNameLanguagePriority: ['en'],
        stateAcceptLanguage: 'en',
        includeNationalHolidaysAtTopLevel: true,
        emitStatePhNested: true,
    },
};

// ---------------------------------------------------------------------------
// Rule parser: date-holidays rule → opening_hours.js holiday object
// ---------------------------------------------------------------------------

/** @param {string} str */
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * @param {unknown} error
 * @returns {string} Readable error message.
 */
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Convert a date-holidays `rule` string to an opening_hours.js holiday definition.
 *
 * Returns an object with some subset of:
 *   { fixed_date, variable_date, offset }
 *
 * Returns null if the rule is unsupported.
 * @param {string} rule
 * @returns {HolidayDefinition | HolidayDefinition[] | null} Parsed definition or null when unsupported.
 */
function parseRuleBase(rule) {
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

    /** @param {string} raw */
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

    const equinoxRule = clean
        .replace(/\s+in\s+[+-]\d{2}:\d{2}$/i, '')
        .toLowerCase();
    if (equinoxRule === 'march equinox') {
        /** @type {HolidayDefinition} */
        const def = { variable_date: 'springEquinox' };
        if (substitute_rule) def.substitute_rule = substitute_rule;
        return def;
    }
    if (equinoxRule === 'september equinox') {
        /** @type {HolidayDefinition} */
        const def = { variable_date: 'autumnalEquinox' };
        if (substitute_rule) def.substitute_rule = substitute_rule;
        return def;
    }

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

    // The holiday format has no Julian-calendar recurrence. Use the 13-day
    // Julian/Gregorian difference that applies through 2099, and warn once
    // so this approximation is revisited before the offset changes in 2100.
    const julianMatch = clean.match(/^julian\s+(\d{2})-(\d{2})(?:\s+P(\d+)D)?$/i);
    if (julianMatch) {
        if (!warnedAboutJulianDateConversion) {
            console.warn('⚠️  Julian dates are converted with a 13-day offset; review this approximation before 2100.');
            warnedAboutJulianDateConversion = true;
        }

        const month = parseInt(julianMatch[1]);
        const day = parseInt(julianMatch[2]);
        const duration = julianMatch[3] ? parseInt(julianMatch[3]) : 1;
        const gregorianStart = new Date(Date.UTC(2000, month - 1, day + 13));
        const definitions = [];

        for (let index = 0; index < duration; index++) {
            const date = new Date(Date.UTC(
                gregorianStart.getUTCFullYear(),
                gregorianStart.getUTCMonth(),
                gregorianStart.getUTCDate() + index,
            ));
            const def = {
                fixed_date: [date.getUTCMonth() + 1, date.getUTCDate()],
                ...(shift_rule ? { shift_rule } : {}),
                ...(substitute_rule ? { substitute_rule } : {}),
            };
            definitions.push(def);
        }

        return julianMatch[3] ? definitions : definitions[0];
    }

    // "saturday after MM-DD" → specific nextSaturday keys
    /** @type {Record<string, string>} */
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
        /** @type {HolidayDefinition} */
        const def = { fixed_date: [parseInt(fixedMatch[1]), parseInt(fixedMatch[2])] };
        if (shift_rule) def.shift_rule = shift_rule;
        if (substitute_rule) def.substitute_rule = substitute_rule;
        return def;
    }

    // Exact date: "YYYY-MM-DD". Keep the year so annual resolution can select
    // the correct date without turning a one-off holiday into an annual one.
    const exactDateMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (exactDateMatch) {
        return {
            fixed_date: [parseInt(exactDateMatch[2]), parseInt(exactDateMatch[3])],
            year: parseInt(exactDateMatch[1]),
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
    /** @type {Record<string, string>} */
    const NAMED_RULES = {
        'monday before 05-25': 'victoriaDay',
        'monday after 05-27': 'lastMayMonday',
        'monday before 06-20': 'mondayBefore20Jun',
    };
    const cleanLower = clean.toLowerCase();
    if (NAMED_RULES[cleanLower]) {
        return { variable_date: NAMED_RULES[cleanLower] };
    }

    // "weekday before MM-DD" patterns
    // Special cases where the result maps to a named opening_hours.js variable_date:
    //   "wednesday before 11-23" → nextWednesday16Nov  (Buß- und Bettag)
    /** @type {Record<string, string>} */
    const BEFORE_SPECIAL = {
        'wednesday before 11-23': 'nextWednesday16Nov',
        'wednesday before 12-01': 'lastNovemberWednesday',
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

/**
 * @param {string} rule
 * @returns {HolidayDefinition | HolidayDefinition[] | null} Parsed definition or null when unsupported.
 */
function parseRule(rule) {
    const yearsMatch = rule.match(/\s+in\s+(even|odd)\s+years\s*$/i);
    const cleanRule = yearsMatch
        ? rule.slice(0, yearsMatch.index).trim()
        : rule;
    const def = parseRuleBase(cleanRule);
    if (!yearsMatch || def === null) return def;

    /** @type {'even' | 'odd'} */
    const years = /** @type {'even' | 'odd'} */ (yearsMatch[1].toLowerCase());
    /** @param {HolidayDefinition} holidayDef */
    const addYears = (holidayDef) => ({ ...holidayDef, years });
    return Array.isArray(def) ? def.map(addYears) : addYears(def);
}

// ---------------------------------------------------------------------------
// YAML formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a string as a YAML scalar. Plain scalars are preferred; JSON quoting
 * is used when YAML would otherwise change the value or parse it incorrectly.
 * @param {string} str
 */
function formatYamlString(str) {
    try {
        // Most generated strings are used inside flow mappings or sequences.
        // Validate them in that context so separators such as ',' are quoted.
        const parsed = parse(`value: [${str}]\n`).value;
        if (Array.isArray(parsed) && parsed.length === 1 && parsed[0] === str) {
            return str;
        }
    } catch {
        // Use a quoted scalar for values that cannot be represented plainly.
    }
    return JSON.stringify(str);
}

/** @param {string} key */
function formatYamlKey(key) {
    if (/^[\p{L}\p{N} ._()'’\u2010-\u2015-]+$/u.test(key)) {
        return key;
    }
    return JSON.stringify(key);
}

/**
 * Format a single PH holiday as an inline YAML object string.
 * Uses the same style as the existing YAML files.
 * @param {string} name
 * @param {HolidayDefinition} def
 * @param {string} indent
 */
function formatHoliday(name, def, indent) {
    const prefix = `${indent}- {`;
    const parts = [`name: ${formatYamlString(name)}`];

    if (def.fixed_date) {
        parts.push(`fixed_date: [${def.fixed_date[0]}, ${def.fixed_date[1]}]`);
        if (def.year !== undefined) {
            parts.push(`year: ${def.year}`);
        }
        if (def.shift_rule) {
            parts.push(`shift_rule: ${formatYamlString(def.shift_rule)}`);
        }
        if (def.substitute_rule) {
            parts.push(`substitute_rule: ${formatYamlString(def.substitute_rule)}`);
        }
        if (def.substitute_name) {
            parts.push(`substitute_name: ${formatYamlString(def.substitute_name)}`);
        }
    } else if (def.variable_date) {
        // All variable_date values are unquoted in the existing YAML format.
        // Bare scalars with spaces (like 'orthodox easter') are valid YAML plain scalars.
        parts.push(`variable_date: ${formatYamlString(def.variable_date)}`);
        if (def.offset !== undefined) {
            parts.push(`offset: ${def.offset}`);
        }
        if (def.substitute_rule) {
            parts.push(`substitute_rule: ${formatYamlString(def.substitute_rule)}`);
        }
    }

    if (Array.isArray(def.only_states) && def.only_states.length > 0) {
        const onlyStates = def.only_states
            .map((stateName) => formatYamlString(stateName))
            .join(', ');
        parts.push(`only_states: [${onlyStates}]`);
    }

    if (def.years !== undefined) {
        parts.push(`years: ${def.years}`);
    }

    return `${prefix}${parts.join(', ')}}`;
}

// ---------------------------------------------------------------------------
// Existing YAML readers
// ---------------------------------------------------------------------------

/**
 * @param {string} filePath
 * @returns {ExistingYamlData} Parsed existing holiday YAML.
 */
function readExistingYaml(filePath) {
    if (!fs.existsSync(filePath)) return {};
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return parse(content) || {};
    } catch (err) {
        console.warn(`  ⚠️  Could not parse ${filePath}: ${getErrorMessage(err)}`);
        return {};
    }
}

/**
 * @param {ExistingYamlData} data
 * @param {string} stateName
 */
function getStateNominatimUrl(data, stateName) {
    const stateData = data[stateName];
    if (stateData && stateData._nominatim_url) return stateData._nominatim_url;
    return null;
}

/**
 * Build a Nominatim search URL for a state if no explicit URL is configured.
 * @param {string} ccUppercase
 * @param {string} stateName
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

/**
 * @param {string | null} urlString
 * @param {string | undefined} acceptLanguage
 */
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
 * @param {ExistingYamlData} data
 * @param {string} stateName
 */
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
 * Load a date-holidays YAML file directly from the submodule.
 * @param {string} ccUppercase - Country code in uppercase (e.g., 'DE', 'DK')
 * @returns {DateHolidayYaml | null} Parsed YAML or null if not found
 */
function loadDateHolidaysYaml(ccUppercase) {
    const yamlPath = path.join(SUBMODULE_COUNTRIES_DIR, `${ccUppercase}.yaml`);
    if (!fs.existsSync(yamlPath)) return null;
    try {
        const content = fs.readFileSync(yamlPath, 'utf8');
        return parse(content) || null;
    } catch (err) {
        console.error(`Failed to parse ${yamlPath}: ${getErrorMessage(err)}`);
        return null;
    }
}

/**
 * Build a state-code -> state-name map directly from date-holidays country YAML.
 * @param {string} ccUppercase
 * @param {string[] | undefined} stateNameLanguagePriority
 * @param {Record<string, string> | undefined} stateNameOverrides
 * @returns {Record<string, string> | null} State-name map, or null when unavailable.
 */
function getStatesFromCountryYaml(ccUppercase, stateNameLanguagePriority, stateNameOverrides) {
    const yamlData = loadDateHolidaysYaml(ccUppercase);
    if (!yamlData || !yamlData.holidays || !yamlData.holidays[ccUppercase]) {
        return null;
    }

    const countryData = yamlData.holidays[ccUppercase];
    if (!countryData.states || typeof countryData.states !== 'object') {
        return null;
    }

    /** @type {Record<string, string>} */
    const states = {};
    const nameLanguagePriority = stateNameLanguagePriority || ['de', 'en', 'fr', 'it', 'es', 'pt'];

    /** @param {string} rawName */
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
            states[stateCode] = stateNameOverrides && stateNameOverrides[stateCode]
                ? stateNameOverrides[stateCode]
                : stateData.name;
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
                states[stateCode] = stateNameOverrides && stateNameOverrides[stateCode]
                    ? stateNameOverrides[stateCode]
                    : normalizeStateName(chosenName);
            }
        }
    }

    return Object.keys(states).length > 0 ? states : null;
}

/**
 * Load the global names.yaml from date-holidays submodule (cache once).
 */
/** @type {HolidayNameRegistry | null} */
let namesCache = null;
/** @returns {HolidayNameRegistry} Registry of localized holiday names. */
function loadNamesYaml() {
    if (namesCache !== null) return namesCache;
    const namesPath = path.join(SUBMODULE_COUNTRIES_DIR, '..', 'names.yaml');
    if (!fs.existsSync(namesPath)) {
        console.warn(`  ⚠️  names.yaml not found at ${namesPath}`);
        namesCache = {};
        return {};
    }
    try {
        const content = fs.readFileSync(namesPath, 'utf8');
        const data = parse(content) || {};
        const names = data.names || {};
        namesCache = names;
        return names;
    } catch (err) {
        console.error(`Failed to parse names.yaml: ${getErrorMessage(err)}`);
        namesCache = {};
        return {};
    }
}

/**
 * Resolve a holiday name from the rule key.
 * Respects the country's language preference list, then yamlName, then generic fallback.
 * @param {string} rule
 * @param {string | null} yamlName
 * @param {string[]} countryLangs
 * @param {string | null} canonicalNameKey
 * @returns {string} Best available localized holiday name.
 */
function resolveHolidayName(rule, yamlName, countryLangs, canonicalNameKey) {
    const namesData = loadNamesYaml();
    const langPrefs = Array.isArray(countryLangs) && countryLangs.length > 0
        ? countryLangs
        : ['en'];

    const lookupKeys = [rule, canonicalNameKey, yamlName].filter((key) => typeof key === 'string');

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
 * @param {DateHolidayDay} dayData
 * @param {string[]} countryLangs
 * @param {string} rule
 * @returns {{ name: string | null, hasPreferredLanguage: boolean }} Name and language-match status.
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
 * @param {string} rule
 * @param {DateHolidayDay} dayData
 * @param {string[] | undefined} nameLangs
 * @param {string | null} canonicalNameKey
 * @param {string | undefined} nameSeparator
 * @param {boolean | undefined} preferGlobalNames
 * @returns {string | null} Combined name when enough translations are available.
 */
function getMultiLanguageHolidayName(rule, dayData, nameLangs, canonicalNameKey, nameSeparator = ' - ', preferGlobalNames = false) {
    if (!Array.isArray(nameLangs) || nameLangs.length === 0) {
        return null;
    }

    /** @type {Record<string, string>} */
    const namesByLang = {};
    const namesData = loadNamesYaml();

    const lookupKeys = [rule, canonicalNameKey, dayData._name].filter((key) => typeof key === 'string');

    /** @param {boolean} overwriteExisting */
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

    /** @param {boolean} overwriteExisting */
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

    /** @type {string[]} */
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
 * @param {DateHolidayDay} dayData
 * @param {string} referenceDate
 * @returns {boolean} Whether the holiday remains active on or after the reference date.
 */
function isRuleActiveInYear(dayData, referenceDate) {
    if (!dayData || !Array.isArray(dayData.active) || dayData.active.length === 0) {
        return true;
    }

    /**
     * @param {string | number | undefined} value
     * @param {'from' | 'to'} boundaryType
     */
    function normalizeActiveBoundary(value, boundaryType) {
        if (typeof value === 'number' && Number.isInteger(value)) {
            const year = String(value).padStart(4, '0');
            return boundaryType === 'from' ? `${year}-01-01` : `${year}-12-31`;
        }

        if (typeof value === 'string') {
            const normalized = value.trim();
            if (/^\d{4}$/.test(normalized)) {
                return boundaryType === 'from' ? `${normalized}-01-01` : `${normalized}-12-31`;
            }
            if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
                return normalized;
            }
        }

        return null;
    }

    return dayData.active.some((range) => {
        if (!range) return false;

        // Exact one-off dates can be represented as plain strings.
        if (typeof range === 'string') {
            const to = normalizeActiveBoundary(range, 'to') || range;
            return to >= referenceDate;
        }

        if (typeof range !== 'object') return false;

        const to = normalizeActiveBoundary(range.to, 'to') || '9999-12-31';

        // Relevant if date range overlaps [referenceDate, +infinity).
        return to >= referenceDate;
    });
}

/**
 * Check textual year qualifiers embedded in rule strings.
 * Examples: "... since 2023", "... prior to 2023", "... until 2019".
 * @param {string} rule
 * @param {string} referenceDate
 * @returns {boolean} Whether the rule's year qualifiers include the reference year.
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
 * @param {string} cc
 * @param {string | undefined} stateCode
 * @param {HolidayFetchOptions} [options]
 * @returns {{ holidays: RawHoliday[], optionalCount: number }} Applicable holidays and optional count.
 */
function fetchPublicHolidays(cc, stateCode, options = {}) {
    const yamlData = loadDateHolidaysYaml(cc);
    if (!yamlData || !yamlData.holidays || !yamlData.holidays[cc]) {
        throw new Error(`No YAML found for ${cc}. Ensure submodules/date-holidays is initialized: git submodule update --init --recursive`);
    }

    let countryData = yamlData.holidays[cc];
    if (!countryData.days && !options.baseCc) {
        throw new Error(`No days defined for ${cc} in date-holidays submodule`);
    }

    if (!countryData.days) {
        countryData = { ...countryData, days: {} };
    }

    if (options.baseCc) {
        const baseYamlData = loadDateHolidaysYaml(options.baseCc);
        const baseCountryData = baseYamlData && baseYamlData.holidays
            ? baseYamlData.holidays[options.baseCc]
            : null;
        if (!baseCountryData || !baseCountryData.days) {
            throw new Error(`No days defined for base country ${options.baseCc}`);
        }
        // date-holidays uses _days to inherit the base country's rules. A local
        // false entry disables an inherited rule, while any other local entry
        // overrides the inherited rule with the same key.
        countryData = {
            ...countryData,
            days: { ...baseCountryData.days, ...countryData.days },
        };
    }

    const countryDays = countryData.days || {};

    // Extract the country's language preferences for name resolution.
    const defaultCountryLangs = (countryData.langs && Array.isArray(countryData.langs) && countryData.langs.length > 0)
        ? countryData.langs
        : ['en'];
    const countryLangs = (Array.isArray(options.preferredLangs) && options.preferredLangs.length > 0)
        ? options.preferredLangs
        : defaultCountryLangs;
    const today = new Date().toISOString().slice(0, 10);

    /** @type {RawHoliday[]} */
    const holidays = [];
    let optionalCount = 0;

    /** @param {string} rule */
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

    /**
     * @param {string} rule
     * @param {DateHolidayDay} dayData
     * @param {string[]} countryLangs
     */
    function resolveEffectiveHolidayName(rule, dayData, countryLangs) {
        const { name: yamlName, hasPreferredLanguage } = getPreferredYamlName(dayData, countryLangs, rule);
        const hasExplicitName = !!dayData.name;
        const canonicalNameKey = dayData._name && dayData._name !== rule ? dayData._name : null;

        let finalName = (hasExplicitName && hasPreferredLanguage && yamlName)
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

    /**
     * @param {DateHolidayDays | undefined} days
     * @returns {Map<string, ReplacementSubstitute>} Replacement rules by base date.
     */
    function collectReplacementSubstitutes(days) {
        /** @type {Map<string, ReplacementSubstitute>} */
        const replacements = new Map();
        if (!days) return replacements;

        /**
         * @param {string} baseRule
         * @param {string} currentRule
         * @param {string} replacementRule
         */
        function mergeReplacementRule(baseRule, currentRule, replacementRule) {
            const rules = [currentRule, replacementRule];
            const groupedClauses = new Map();
            const weekdayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
            for (const rule of rules) {
                const match = rule.match(/\bif\s+([\w,]+)\s+then\s+(previous|next)\s+(\w+)/i);
                if (!match) continue;
                const key = `${match[2].toLowerCase()} ${match[3].toLowerCase()}`;
                if (!groupedClauses.has(key)) groupedClauses.set(key, new Set());
                for (const weekday of match[1].toLowerCase().split(',')) {
                    groupedClauses.get(key).add(weekday);
                }
            }
            const clauses = Array.from(groupedClauses.entries()).map(([target, weekdays]) => {
                const orderedWeekdays = weekdayOrder.filter(weekday => weekdays.has(weekday));
                return `if ${orderedWeekdays.join(',')} then ${target}`;
            });
            return `${baseRule} ${clauses.join(' ')}`;
        }

        for (const [rule, dayData] of Object.entries(days)) {
            if (!/^substitutes?\b/i.test(rule)) continue;
            if (!dayData) continue;
            if (!isIncludedDayType(dayData, rule)) continue;
            if (!isRuleRelevantByRuleText(rule, today)) continue;
            if (!isRuleActiveInYear(dayData, today)) continue;

            const baseRule = getBaseRuleForSubstitute(rule);
            if (baseRule) {
                const existing = replacements.get(baseRule);
                replacements.set(baseRule, existing
                    ? {
                        ...existing,
                        combinedRule: mergeReplacementRule(baseRule, existing.combinedRule, rule),
                    }
                    : { rule, dayData, combinedRule: rule });
            }
        }

        return replacements;
    }

    /**
     * @param {string} rule
     * @param {DateHolidayDay | false} dayData
     * @returns {dayData is DateHolidayDay} Whether the rule is applicable and enabled.
     */
    function isDayApplicable(rule, dayData) {
        if (!isIncludedDayType(dayData, rule)) return false;
        if (!isRuleRelevantByRuleText(rule, today)) return false;
        if (!isRuleActiveInYear(dayData, today)) return false;
        return true;
    }

    /**
     * @param {DateHolidayDay | false | null | undefined} dayData
     * @param {string} rule
     * @returns {dayData is DateHolidayDay} Whether the source type is included.
     */
    function isIncludedDayType(dayData, rule) {
        if (!dayData || typeof dayData !== 'object') return false;
        if (Array.isArray(options.includeDayRules) && options.includeDayRules.includes(rule)) return true;
        const type = dayData && dayData.type;
        const allowedDayTypes = Array.isArray(options.includeDayTypes) && options.includeDayTypes.length > 0
            ? new Set(options.includeDayTypes)
            : INCLUDED_DAY_TYPES;
        return !type || allowedDayTypes.has(type);
    }

    /**
     * @param {string} rule
     * @param {DateHolidayDay | false} dayData
     * @param {string[]} countryLangs
     * @param {Array<DateHolidayDays | undefined>} [baseDayLookups]
     * @param {ReplacementSubstitute | null} [replacementSubstitute]
     */
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
                if (days && days[baseKey]) {
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
            const replacementParsed = parseRule(replacementSubstitute.combinedRule || replacementSubstitute.rule);
            if (replacementParsed && !Array.isArray(replacementParsed) && replacementParsed.shift_rule) {
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

    /**
     * Add the holidays of one level (country, state or sub-region).
     * `lookups` are the day maps of this and all parent levels, nearest first.
     * `seen` de-duplicates rules across sibling sub-regions.
     * @param {DateHolidayDays} days
     * @param {Array<DateHolidayDays | undefined>} lookups
     * @param {{ isSuppressed?: (rule: string) => boolean, seen?: Set<string> }} [levelOptions]
     */
    function addLevelHolidays(days, lookups, { isSuppressed, seen } = {}) {
        const replacements = collectReplacementSubstitutes(days);

        for (const [rule, dayData] of Object.entries(days)) {
            if (isSuppressed && isSuppressed(rule)) continue;
            const replacement = replacements.get(rule);
            // Replacement substitutes are merged into their base holiday.
            if (!replacement) {
                if (/^substitutes?\b/i.test(rule)) continue;
                if (!isIncludedDayType(dayData, rule)) continue;
            }
            if (seen && seen.has(rule)) continue;
            addHoliday(rule, dayData, countryLangs, lookups, replacement || null);
            if (seen) seen.add(rule);
        }

        // Standalone replacement substitutes (no applicable base holiday rule).
        for (const [baseRule, replacement] of replacements) {
            const hasApplicableBase = lookups.some(
                (lookup) => lookup && lookup[baseRule] && isDayApplicable(baseRule, lookup[baseRule]),
            );
            if (hasApplicableBase || (seen && seen.has(replacement.rule))) continue;
            addHoliday(replacement.rule, replacement.dayData, countryLangs, lookups);
            if (seen) seen.add(replacement.rule);
        }
    }

    /** @type {Set<string>} */
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
                if (isDayApplicable(rule, dayData)) {
                    // Keep same-key override behavior for completeness.
                    disabledStateRules.add(rule);
                }
            } else if (isDayApplicable(rule, dayData)) {
                // State-level applicable rules override the same national rule key.
                // This prevents duplicate holidays on the same date where the state
                // uses a different local holiday name for that key.
                disabledStateRules.add(rule);
            }
        }
    }

    // A state rule suppresses the national rule with the same key. An active
    // "MM-DD and if ..." state entry also suppresses the national "MM-DD" and its
    // own substitute variants (e.g. SA Proclamation Day supersedes Boxing Day).
    addLevelHolidays(countryDays, [countryDays], {
        isSuppressed: (rule) => disabledStateRules.has(rule)
            || (/\band\s+if\b/i.test(rule)
                && disabledStateRules.has(rule.replace(/\s+and\s+if\s+.*/i, '').trim())),
    });

    if (stateCode && countryData.states && countryData.states[stateCode]) {
        const stateData = countryData.states[stateCode];
        if (stateData.days) {
            addLevelHolidays(stateData.days, [stateData.days, countryDays]);
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
                addLevelHolidays(regionData.days, [regionData.days, stateData.days, countryDays], { seen: addedRules });
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
 * @param {RawHoliday[]} rawHolidays
 * @returns {{ holidays: GeneratedHoliday[], skipped: RawHoliday[] }} Supported and skipped holiday definitions.
 */
function convertHolidays(rawHolidays) {
    /** @type {GeneratedHoliday[]} */
    const holidays = [];
    /** @type {RawHoliday[]} */
    const skipped = [];
    const seen = new Set();
    const currentYear = new Date().getFullYear();
    const lastIncludedYear = currentYear + 3;

    /**
     * @param {string} name
     * @param {HolidayDefinition} def
     */
    function pushUnique(name, def) {
        const baseDef = { ...def };
        delete baseDef.substitute_rule;
        delete baseDef.substitute_name;
        const existing = holidays.find((holiday) => {
            const existingBaseDef = { ...holiday.def };
            delete existingBaseDef.substitute_rule;
            delete existingBaseDef.substitute_name;
            return holiday.name === name
                && JSON.stringify(existingBaseDef) === JSON.stringify(baseDef);
        });
        if (existing) {
            if (def.substitute_rule && !existing.def.substitute_rule) {
                existing.def = { ...existing.def, ...def };
            }
            return;
        }

        const key = `${name}::${JSON.stringify(def)}`;
        if (seen.has(key)) return;
        seen.add(key);
        holidays.push({ name, def });
    }

    for (const h of rawHolidays) {
        const def = parseRule(h.rule);
        if (def === null) {
            // Skip old/historical rules silently. Only warn about genuinely unsupported formats.
            skipped.push({ name: h.name, rule: h.rule });
        } else if (Array.isArray(def)) {
            // Duration rule: expand to multiple single-day entries
            for (const d of def) {
                pushUnique(h.name, d);
            }
        } else {
            if (def.year !== undefined && (def.year < currentYear || def.year > lastIncludedYear)) {
                continue;
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

    return { holidays, skipped };
}

/** @typedef {(holidays: GeneratedHoliday[], stateCode: string | null) => GeneratedHoliday[]} HolidayOverride */

/**
 * Country-specific corrections applied after rule conversion.
 * Add an entry here instead of branching in the generator.
 * @type {Record<string, HolidayOverride>}
 */
const COUNTRY_OVERRIDES = {
    au(holidays, stateCode) {
        if (stateCode) return holidays;
        // Easter Saturday/Sunday are not public holidays in every AU state.
        return holidays.filter(({ def }) => def.variable_date !== 'easter'
            || (def.offset !== -1 && def.offset !== undefined));
    },

    jp(holidays, stateCode) {
        if (stateCode) return holidays;

        // date-holidays has year-dependent "Citizen's Holiday" rules.
        // A fixed 09-22 entry is too broad for opening_hours country-level output.
        let adjusted = holidays.filter(({ name, def }) => !(name === '国民の休日'
            && def.fixed_date && def.fixed_date[0] === 9 && def.fixed_date[1] === 22));

        // If the same fixed holiday appears both plain and with substitute_rule,
        // keep only the substitute-aware variant.
        /** @param {GeneratedHoliday} holiday */
        const fixedKey = ({ name, def }) => def.fixed_date ? `${name}|${def.fixed_date[0]}-${def.fixed_date[1]}` : null;
        const substituteAwareFixed = new Set(
            adjusted.filter(({ def }) => def.substitute_rule).map(fixedKey),
        );
        adjusted = adjusted.filter((holiday) => {
            const key = fixedKey(holiday);
            return key === null || !substituteAwareFixed.has(key) || Boolean(holiday.def.substitute_rule);
        });

        // The equinox holidays are not part of the upstream rules.
        for (const [variable_date, name] of [['springEquinox', '春分の日'], ['autumnalEquinox', '秋分の日']]) {
            if (!adjusted.some(({ def }) => def.variable_date === variable_date)) {
                adjusted.push({ name, def: { variable_date } });
            }
        }
        return adjusted;
    },

    ca(holidays, stateCode) {
        const adjusted = holidays.map((holiday) => {
            const { name, def } = holiday;
            if (!def.fixed_date || !isCanadaDayName(name)) return holiday;
            if (def.fixed_date[0] !== 7 || def.fixed_date[1] !== 1) return holiday;
            const rest = { ...def };
            delete rest.fixed_date;
            return { name, def: { ...rest, variable_date: 'canadaDay' } };
        });

        return adjusted.filter(({ def }) => {
            // The generic Easter entry would make Easter Sunday a holiday, which
            // the primary sources we checked do not support.
            if (def.variable_date === 'easter' && def.offset === undefined) return false;
            // Quebec has no general August civic holiday.
            if (stateCode === 'QC' && def.variable_date === 'firstAugustMonday') return false;
            return true;
        });
    },
};

/**
 * @param {string} countryCode
 * @param {string | null} stateCode
 * @param {GeneratedHoliday[]} holidays
 * @returns {GeneratedHoliday[]} Country-adjusted holiday definitions.
 */
function applyCountrySpecificOverrides(countryCode, stateCode, holidays) {
    const override = COUNTRY_OVERRIDES[countryCode];
    return override ? override(holidays, stateCode) : holidays;
}

/**
 * @param {string} variableDate
 * @returns {number | null} Estimated month or null when it cannot be inferred.
 */
function monthFromVariableDate(variableDate) {
    for (let i = 0; i < MONTHS.length; i++) {
        if (variableDate.includes(MONTHS[i])) {
            return i + 1;
        }
    }
    return null;
}

/**
 * @param {HolidayDefinition} def
 * @returns {number} Approximate calendar sort key.
 */
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
    if (variableDate === 'canadaDay') {
        return 701;
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

/**
 * @param {GeneratedHoliday} a
 * @param {GeneratedHoliday} b
 * @returns {number} Sort comparison result.
 */
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
 * @param {RawHoliday[]} skipped
 * @param {string} location Country or country/state code for the message.
 */
function warnSkippedRules(skipped, location) {
    for (const { name, rule } of skipped) {
        // Only full-day holidays are supported, not time-based rules.
        const reason = rule.includes(':') ? '(time-based, only full-day holidays supported)' : '(unsupported format)';
        console.warn(`  ⚠️  Skipped unsupported rule [${location}] "${name}": ${rule} ${reason}`);
    }
}

/**
 * Build YAML lines for a PH block.
 * @param {RawHoliday[]} rawHolidays
 * @param {string} indent
 * @param {string} countryCode
 * @param {string | null} stateCode
 * @param {boolean} includeHeader
 * @returns {string[]} YAML lines for one PH block.
 */
function buildPhLines(rawHolidays, indent, countryCode, stateCode, includeHeader = true) {
    const { holidays, skipped } = convertHolidays(rawHolidays);
    const adjustedHolidays = applyCountrySpecificOverrides(countryCode, stateCode, holidays);
    const sortedHolidays = adjustedHolidays.slice().sort(compareGeneratedHolidays);

    const lines = [];
    if (includeHeader) {
        lines.push(`${indent}PH:`);
    }
    for (const { name, def } of sortedHolidays) {
        lines.push(formatHoliday(name, def, `${indent}  `));
    }

    warnSkippedRules(skipped, stateCode ? `${countryCode}/${stateCode}` : countryCode);

    return lines;
}

/**
 * Build top-level PH with only_states from per-state holiday sets.
 * Holidays present in all states are emitted without only_states.
 * @param {StateHolidayResult[]} stateResults
 * @param {string} indent
 * @param {string} countryCode
 * @param {boolean} includeHeader
 * @param {RawHoliday[] | null} nationalRawHolidays
 * @returns {string[]} YAML lines for shared and state-specific holidays.
 */
function buildOnlyStatesPhLinesFromStateResults(stateResults, indent, countryCode, includeHeader = true, nationalRawHolidays = null) {
    const allStateNames = stateResults.map(result => result.stateName);
    /** @type {Map<string, { name: string, def: HolidayDefinition, states: Set<string> }>} */
    const grouped = new Map();
    const nationalHolidayKeys = new Set();

    if (nationalRawHolidays) {
        for (const { def } of convertHolidays(nationalRawHolidays).holidays) {
            nationalHolidayKeys.add(JSON.stringify(def));
        }
    }

    for (const { stateCode, stateName, rawHolidays } of stateResults) {
        const { holidays, skipped } = convertHolidays(rawHolidays);

        warnSkippedRules(skipped, `${countryCode}/${stateCode}`);

        for (const { name, def } of holidays) {
            const normalizedDef = { ...def };
            delete normalizedDef.only_states;
            const key = `${name}::${JSON.stringify(normalizedDef)}`;

            if (nationalHolidayKeys.has(JSON.stringify(normalizedDef))) continue;

            if (!grouped.has(key)) {
                grouped.set(key, {
                    name,
                    def: normalizedDef,
                    states: new Set(),
                });
            }

            grouped.get(key)?.states.add(stateName);
        }
    }

    /** @type {GeneratedHoliday[]} */
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

/** @param {string} countryCode */
function getDateHolidaysSourceUrl(countryCode) {
    return `https://github.com/commenthol/date-holidays/blob/master/data/countries/${countryCode}.yaml`;
}

/**
 * Generate YAML content for a simple country (no state subdivisions).
 * @param {string} ccLower
 * @param {CountryConfig} config
 * @returns {{ content: string, optionalCount: number }} Generated YAML and optional holiday count.
 */
function generateSimpleYaml(ccLower, config) {
    const { holidays: rawHolidays, optionalCount } = fetchPublicHolidays(config.cc, undefined, config);
    const existingFilePath = path.join(HOLIDAYS_DIR, `${ccLower}.yaml`);
    const existingPrefix = extractExistingPrefixBeforePh(existingFilePath);
    const lines = existingPrefix
        ? existingPrefix.split(/\r?\n/)
        : buildGeneratedYamlHeader(config.cc);

    if (!existingPrefix && config.nominatimUrl) {
        lines.push(`_nominatim_url: ${config.nominatimUrl}`);
        lines.push('');
    }

    lines.push(...buildPhLines(rawHolidays, '', ccLower, null, !existingPrefix));

    lines.push('');
    return { content: lines.join('\n'), optionalCount };
}

/**
 * Generate YAML content for a country with state subdivisions.
 * Each state gets its own PH section.
 * @param {string} ccLower
 * @param {StateCountryConfig} config
 * @param {ExistingYamlData} existingData
 * @returns {{ content: string, optionalCount: number }} Generated YAML and optional holiday count.
 */
function generateStateYaml(ccLower, config, existingData) {
    const existingFilePath = path.join(HOLIDAYS_DIR, `${ccLower}.yaml`);
    const existingPrefix = extractExistingPrefixBeforePh(existingFilePath);
    const lines = existingPrefix
        ? existingPrefix.split(/\r?\n/)
        : buildGeneratedYamlHeader(config.cc);
    let optionalCount = 0;
    /** @type {StateHolidayResult[]} */
    const stateResults = [];

    // Pre-fetch state holidays once. Some national strategies (like intersection)
    // are derived from per-state data, and we also reuse these results below.
    for (const [stateCode, stateName] of Object.entries(config.states)) {
        const statePreferredLangs = config.statePreferredLangs && config.statePreferredLangs[stateCode]
            ? config.statePreferredLangs[stateCode]
            : undefined;
        const stateIncludeDayTypes = config.stateIncludeDayTypes && config.stateIncludeDayTypes[stateCode]
            ? config.stateIncludeDayTypes[stateCode]
            : undefined;
        let stateConfig = config;
        if (statePreferredLangs || stateIncludeDayTypes) {
            stateConfig = {
                ...config,
                ...(statePreferredLangs ? { preferredLangs: statePreferredLangs } : {}),
                ...(stateIncludeDayTypes ? { includeDayTypes: stateIncludeDayTypes } : {}),
            };
        }
        const stateSourceCountry = config.stateSourceCountries && config.stateSourceCountries[stateCode];
        const sourceConfig = stateSourceCountry
            ? { ...stateConfig, baseCc: config.cc }
            : stateConfig;
        const { holidays: rawHolidays, optionalCount: stateOptionalCount } = fetchPublicHolidays(
            stateSourceCountry || config.cc,
            stateSourceCountry ? undefined : stateCode,
            sourceConfig,
        );
        optionalCount += stateOptionalCount;
        stateResults.push({ stateCode, stateName, rawHolidays });
    }

    // Multiple source subdivisions can share one Nominatim state name.
    // Keep one metadata section for that state to avoid duplicate YAML keys.
    const uniqueStateResults = Array.from(
        new Map(stateResults.map((result) => [result.stateName, result])).values(),
    );

    /** @type {RawHoliday[] | null} */
    let nationalRawHolidays = null;
    if (config.includeNationalHolidaysAtTopLevel || !config.emitOnlyStatesAtTopLevel) {
        const nationalResult = fetchPublicHolidays(config.cc, undefined, config);
        nationalRawHolidays = nationalResult.holidays;
        optionalCount += nationalResult.optionalCount;
    }

    if (config.emitOnlyStatesAtTopLevel) {
        if (nationalRawHolidays) {
            lines.push(...buildPhLines(nationalRawHolidays, '', ccLower, null, !existingPrefix));
        }
        lines.push(...buildOnlyStatesPhLinesFromStateResults(
            uniqueStateResults,
            '',
            ccLower,
            !existingPrefix && !nationalRawHolidays,
            nationalRawHolidays,
        ));
    } else {
        lines.push(...buildPhLines(nationalRawHolidays || [], '', ccLower, null, !existingPrefix));
    }
    lines.push('');

    const orderedStateResults = uniqueStateResults.slice()
        .sort((left, right) => left.stateName.localeCompare(right.stateName, 'de'));

    // Per-state sections
    for (const { stateCode, stateName, rawHolidays } of orderedStateResults) {
        let stateNominatimUrl = config.statesWithoutNominatimUrl?.includes(stateCode)
            ? null
            : getStateNominatimUrl(existingData, stateName)
                || (config.stateNominatimUrls && config.stateNominatimUrls[stateCode])
                || buildStateNominatimSearchUrl(config.cc, stateName)
                || null;
        if (stateNominatimUrl && config.stateAcceptLanguage) {
            stateNominatimUrl = normalizeNominatimAcceptLanguage(stateNominatimUrl, config.stateAcceptLanguage);
        }
        const stateSH = extractStateSH(existingData, stateName);

        lines.push(`${formatYamlKey(stateName)}:`);

        if (config.includeStateCode) {
            const normalizedStateCode = (config.stateCodeOverrides && config.stateCodeOverrides[stateCode]
                ? config.stateCodeOverrides[stateCode]
                : stateCode).toLowerCase();
            const formattedStateCode = /^\d+$/.test(normalizedStateCode)
                ? JSON.stringify(normalizedStateCode)
                : normalizedStateCode;
            lines.push(`  _state_code: ${formattedStateCode}`);
        }

        if (stateNominatimUrl) {
            lines.push(`  _nominatim_url: ${JSON.stringify(stateNominatimUrl)}`);
        }

        if (config.emitStatePhNested && nationalRawHolidays) {
            const nationalKeys = new Set(
                convertHolidays(nationalRawHolidays).holidays
                    .map(({ def }) => JSON.stringify(def)),
            );
            const stateOnlyHolidays = convertHolidays(rawHolidays).holidays
                .filter(({ def }) => !nationalKeys.has(JSON.stringify(def)));

            lines.push(...buildPhLines(nationalRawHolidays, '  ', ccLower, stateCode, true));
            for (const { name, def } of stateOnlyHolidays.sort((left, right) => compareGeneratedHolidays(left, right))) {
                lines.push(formatHoliday(name, def, '    '));
            }
        } else if (!config.emitOnlyStatesAtTopLevel) {
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
    /** @type {string[]} */
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const requestedCodes = args.filter(a => !a.startsWith('--'));

    const toProcess = requestedCodes.length > 0
        ? requestedCodes
        : Object.keys(COUNTRY_CONFIGS);

    let processed = 0;
    let skippedCountries = 0;
    let errors = 0;
    /** @type {string[]} */
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
            const sourceStates = getStatesFromCountryYaml(
                config.cc,
                config.stateNameLanguagePriority,
                config.stateNameOverrides,
            );
            if (!sourceStates) {
                console.warn(`  ⚠️  No states found in source for ${config.cc}; falling back to national PH only`);
            } else {
                effectiveConfig = {
                    ...config,
                    states: { ...sourceStates, ...(config.additionalStates || {}) },
                };
            }
        }

        console.log(`🔄 Generating ${ccLower}.yaml...`);

        try {
            const result = effectiveConfig.states
                ? generateStateYaml(ccLower, { ...effectiveConfig, states: effectiveConfig.states }, existingData)
                : generateSimpleYaml(ccLower, effectiveConfig);

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
            console.error(`  ❌ Error generating ${ccLower}: ${getErrorMessage(err)}`);
            errors++;
        }
    }

    console.log(`\n📊 Summary: ${processed} processed, ${skippedCountries} skipped, ${errors} errors`);
    if (countriesWithOptional.length > 0) {
        console.log(`ℹ️  Optional holidays found in ${countriesWithOptional.length} countries: ${countriesWithOptional.join(', ')}`);
    }
}

main();
