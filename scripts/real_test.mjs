#!/usr/bin/env node
/* Info, license and author {{{
 * SPDX-FileCopyrightText: © 2015 Robin Schneider <ypid@riseup.net>
 * SPDX-License-Identifier: AGPL-3.0-only
 * @license AGPLv3 <https://www.gnu.org/licenses/agpl-3.0.html>
 * @author Copyright (C) 2015 Robin Schneider <ypid@riseup.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, version 3 of the
 * License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 *
 * Additional features:
 *   * Can log all values and if they could be evaluated or not to a log file
 *   to compare versions.  Just `touch real_test.opening_hours.log` to generate
 *   this for the tag opening_hours.
 *
 *   * Can write out statistics to compare the number of values and how many
 *   could be parsed.  Just `touch real_test.opening_hours.stats.csv` to
 *   generate this for the tag opening_hours.
 *
 *   * You can restrict the tags which should be parsed. Just specify them as
 *   parameter.
 * }}}
 */

/* Required modules {{{ */
import opening_hours from 'opening_hours';
import fs from 'node:fs';
import { styleText } from 'node:util';
import assert from 'node:assert';
/* }}} */

/** @typedef {{ manually_ignored?: string[], oh_mode?: number, map?: Record<string, string> }} TagOptions */
/** @typedef {{ key: string, filename: string, export_format: 'overpass' | 'taginfo', value?: string, timestamp?: string | Date }} ExportInfo */
/** @typedef {{ value: string, count: number }} TagValueCount */
/** @typedef {{ data: TagValueCount[] }} TagData */
/** @typedef {{ elements: Array<{ tags?: Record<string, string> }> }} OverpassResponse */

const related_tags_file = 'related_tags.txt';
const nominatimTestJSON = {'place_id':'44651229','licence':'Data \u00a9 OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright','osm_type':'way','osm_id':'36248375','lat':'49.5400039','lon':'9.7937133','display_name':'K 2847, Lauda-K\u00f6nigshofen, Main-Tauber-Kreis, Regierungsbezirk Stuttgart, Baden-W\u00fcrttemberg, Germany, European Union','address':{'road':'K 2847','city':'Lauda-K\u00f6nigshofen','county':'Main-Tauber-Kreis','state_district':'Regierungsbezirk Stuttgart','state':'Baden-W\u00fcrttemberg','country':'Germany','country_code':'de','continent':'European Union'}};

/**
 * @param {unknown} value - Value to check.
 * @returns {value is Record<string, unknown>} Whether the value is a non-array object.
 */
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value - Value to check.
 * @returns {value is TagData} Whether the value contains valid tag counts.
 */
function isTagData(value) {
    return isRecord(value)
        && Array.isArray(value.data)
        && value.data.every(item => isRecord(item)
            && typeof item.value === 'string'
            && typeof item.count === 'number');
}

/**
 * @param {unknown} value - Value to check.
 * @returns {value is OverpassResponse} Whether the value is a valid Overpass response.
 */
function isOverpassResponse(value) {
    return isRecord(value)
        && Array.isArray(value.elements)
        && value.elements.every(element => {
            if (!isRecord(element)) {
                return false;
            }
            const tags = element.tags;
            return tags === undefined
                || (isRecord(tags) && Object.values(tags).every(tag => typeof tag === 'string'));
        });
}

/* Add as much tests (for different tags) as you like. Just make sure that the
 * export is present by adding it as dependence to the related_tags.txt file.
 * Tests will not be executed in order listed there due to non-blocking aspect
 * of JS and node.js.
 */

/* Configuration {{{ */

// Text style helpers using built-in util.styleText (Node >= 20.12)
const c = {
    /** @type {(text: string) => string} */
    warning: text => styleText(['yellow', 'bold'], text),
    /** @type {(text: string) => string} */
    tag: text => styleText(['blue', 'bold'], text),
};

/* Also used by opening_hours_map/opening_hours_map.html */
const test_config = {
    'opening_hours:kitchen': {
    },
    'opening_hours:warm_kitchen': {
    },
    'smoking_hours': {
        manually_ignored: [ 'yes' ],
    },
    'collection_times': {
        oh_mode: 2
        /* oh_mode 2: "including the hyphen because there are post boxes which are
         * emptied several (undefined) times or one (undefined) time in a certain time
         * frame. This shall be covered also.".
         * Ref: https://wiki.openstreetmap.org/wiki/Key:collection_times */
    },
    'service_times': {
        manually_ignored: [ 'automatic' ],
        oh_mode: 2,
    },
    'fee': {
        manually_ignored: [ 'yes', 'no', 'interval', 'unknown' ],
    },
    'lit': {
        manually_ignored: [ 'interval', 'limited' ],
        map: {
            'yes'      : 'sunset-sunrise open "specified as yes: At night (unknown time schedule or daylight detection)"',
            'automatic': 'unknown "specified as automatic: When someone enters the way the lights are turned on."',
            'no'       : 'off "specified as no: There are no lights installed."',
            // 'interval' : 'unknown "specified as interval"',
            // 'limited'  : 'unknown "specified as limited"',
        }
    },
}

/*
 * Difference when ignoring values and when not ignoring values based on:
 * exportISO3166-2DE-HB2015-02-21T00:00:00.json
 *
 * fee:
 * not ignoring 2018-02-21T00:00:00.000Z, 568, 12, 9, 3, 0, 0, 2, 5
 * ignoring     2018-02-21T00:00:00.000Z, 115, 9, 9, 3, 0, 0, 2, 5
 *
 * lit:
 * not ignoring 2018-02-21T00:00:00.000Z, 6852, 2, 0, 0, 0, 0, 0, 0
 * ignoring     2018-02-21T00:00:00.000Z, 0, 0, 0, 0, 0, 0, 0, 0
 *
 * opening_hours:
 * not ignoring 2018-02-21T00:00:00.000Z, 1994, 1388, 1987, 1381, 5, 5, 965, 1539
 * ignoring     2018-02-21T00:00:00.000Z, 1994, 1388, 1987, 1381, 5, 5, 965, 1539
 */

/* }}} */

/* Parameter handling {{{ */
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

const cli = yargs(hideBin(process.argv))
    .usage('Usage: $0 export*.json [export*.json]')
    .option('verbose', { alias: 'v', type: 'boolean' })
    .option('debug', { alias: 'd', type: 'boolean' })
    .option('punchcard', { alias: 'p', type: 'boolean' })
    .option('ignore-manual-values', { alias: 'I', type: 'boolean' })
    .option('ignore-bad-oh-values', { alias: 'i', type: 'boolean' })
    .option('map-bad-oh-values', { alias: 'm', type: 'boolean' })
    .describe('v', 'Verbose output')
    .describe('d', 'Debug output')
    .describe('p', 'Generate a CSV file containing a overview of the following week showing how many facilities will be open for each hour of the week.')
    .describe('I', 'Ignore all bad values which are defined manually like the value "fixme". Does not include --ignore-bad-oh-values.')
    .describe('i', 'Ignore values which are not covered by the specification for opening_hours but might be used like "on" for the "lit" tag.'
        + ' The default is to not ignore any which will result in those values not being parsed as correct values.')
    .describe('m', 'Map values which would get ignored by the --ignore-bad-oh-values option to there meaning in the opening_hours syntax.'
        + ' For example, map "yes" to "sunset-sunrise open "specified as yes"".')
    .help('help', 'Display the usage')
    .alias('help', 'h');

const argv = cli.parseSync();

if (argv._.length === 0) {
    cli.showHelp();
    process.exit(0);
}
/* }}} */

/**
 * Test framework {{{
 */
class OpeningHoursTest {
    /** @type {Partial<Record<string, TagOptions>>} */
    config = test_config;

    constructor() {
        console.log('The holiday definitions for the country ' + nominatimTestJSON.address.country_code + ' are used so the result will probably be a bit worse in reality but you can change that by providing the definition for missing holidays.\n');
    }

    /**
     * @param {string} tag_key_name - Tag key being parsed.
     * @param {ExportInfo} info - Export metadata for the tag.
     * @param {TagData} data - Value counts for the tag.
     */
    parse_tag(tag_key_name, info, data) { /* {{{ */
        const options = this.config[tag_key_name];

        const how_often_print_stats = 15000;
        const importance_threshold  = 30;
        const global_manually_ignored = [ 'fixme', 'FIXME' ];
        const manually_ignored = options?.manually_ignored;
        const ignored_values = argv['ignore-manual-values'] && Array.isArray(manually_ignored)
            ? [...global_manually_ignored, ...manually_ignored]
            : [];

            console.log('Parsing ' + c.tag(tag_key_name)
                + (ignored_values.length === 0 ? '' : ' (ignoring: ' + ignored_values.join(', ') + ')') + ' …');

            let success_differ       = 0; // increment only by one despite that the value might appears more than one time
            let success              = 0; // increment by number of appearances
            let warnings             = 0; // number of values which throw warnings
            let warnings_differ      = 0; // number of values which throw warnings (only one warning is counted for each value if more appear)
            let not_pretty           = 0; // number of values which are not the same as the value returned by oh.prettifyValue()
            let not_pretty_differ    = 0; // number of values which are not pretty (only one warning is counted for each value if more appear)
            /** @type {[string, number][]} */
            let important_and_failed = [];

            let logfile_out_string = '';

            const values_to_test = data.data.filter(
                data_item => !ignored_values.includes(data_item.value)
            ); // values which are not ignored
            const total_differ = values_to_test.length; // number of different values
            const total = values_to_test.reduce((sum, data_item) => sum + data_item.count, 0); // total number of values

            const time_at_test_begin = new Date();

            /** @type {number[][]} */
            const punchcard_data = [];
            /** @type {Record<string, string[]>} */
            const punchcard_data_out = {};
            // eslint-disable-next-line no-unused-vars
            const punchcard_debug = [];
            // eslint-disable-next-line no-unused-vars
            const punchcard_debug2 = [];
            const day_number_to_name = [ 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday' ];
            const cur_date = new Date();
            let punchcard_csv = '';
            for (let i = 0; i < day_number_to_name.length; i++) {
                punchcard_data[i] = [];
                for (let hours_per_day = 0; hours_per_day < 24; hours_per_day++) {
                    punchcard_data[i][hours_per_day] = 0;
                    if (i === 0) {
                        punchcard_csv += ',' + hours_per_day;
                    }
                }
            }
            punchcard_csv += '\n';

            let parsed_values = 0; // total number of values which are "parsed" (if one value appears more than one, it counts more than one)
            for (let i = 0; i < total_differ; i++) {
                const data_item = values_to_test[i];
                const oh_value = data_item.value;
                let oh_crashed = false;
                let oh_warnings = 0;
                let oh_value_prettified = '';
                /** @type {import('opening_hours').opening_hours | undefined} */
                let oh;
                if (argv.debug) {
                    console.info(oh_value);
                }
                try {
                    oh = new opening_hours(
                        oh_value,
                        nominatimTestJSON,
                        {
                            'mode': undefined,
                            'tag_key': tag_key_name,
                            'map_value': argv['map-bad-oh-values'],
                            'warnings_severity': undefined,
                            'locale': undefined,
                        }
                    );
                    oh_warnings = oh.getWarnings().length;
                    oh_value_prettified = oh.prettifyValue();

                } catch {
                    oh_crashed = true;
                }

                    logfile_out_string += (Number(!oh_crashed)) + ' ' + oh_value + '\n';
                    if (!oh_crashed && oh !== undefined) {
                        success_differ++;
                        success += data_item.count;
                        warnings_differ += Number(!!oh_warnings);
                        warnings += data_item.count * Number(!!oh_warnings);
                        not_pretty_differ += Number(oh_value_prettified !== oh_value);
                        not_pretty += data_item.count * Number(oh_value_prettified !== oh_value);
                        // console.log('passed', oh_value);
                        if (argv.punchcard && tag_key_name === 'opening_hours') {
                            const check_date = new Date(cur_date.getFullYear(), cur_date.getMonth(), cur_date.getDate(), 0, 1, 0);
                            const iterator = oh.getIterator(check_date);
                            for (let t_offset = 0; t_offset < 7 * 24; t_offset++) {
                                if (iterator.getState()) {
                                    punchcard_data[check_date.getDay()][check_date.getHours()] += data_item.count;
                                    // if (argv.verbose && check_date.getDay() === 3 && check_date.getHours() === 0) {
                                        // punchcard_debug.push([data.data[i].count, oh_value]);
                                    // }
                                    // if (argv.verbose && check_date.getDay() === 3 && check_date.getHours() === 1) {
                                        // punchcard_debug2.push([data.data[i].count, oh_value]);
                                    // }
                                }

                                check_date.setHours(check_date.getHours() + 1);
                                iterator.setDate(check_date);
                            }
                        }

                    } else if (data_item.count > importance_threshold) {
                        important_and_failed.push([oh_value, data_item.count]);
                    }
                    parsed_values += data_item.count;

                    if (i !== 0 && i % how_often_print_stats === 0) {
                        this.log_to_user(false, total, i, i, parsed_values,
                            success, success_differ, warnings, warnings_differ, not_pretty, not_pretty_differ,
                            time_at_test_begin);
                }
            }
            if (total_differ >= how_often_print_stats) {
                console.log();
            }

            this.log_to_user(true, total, total_differ, undefined, parsed_values,
                success, success_differ, warnings, warnings_differ, not_pretty, not_pretty_differ,
                time_at_test_begin);

            if (important_and_failed.length > 0) {
                important_and_failed = important_and_failed.sort(this.Comparator);
                for (let i = 0; i < important_and_failed.length; i++) {
                    const value = important_and_failed[i][0];
                    const count = important_and_failed[i][1];
                    console.log('Failed with value which appears ' + String(count).padStart(6) + ' times: ' + value);
                }
            }
            console.log();

            /* Generate logs {{{ */
            /* Just `touch` the file that you want logs for. */
            if (fs.existsSync('real_test.' + tag_key_name + '.log')) {
                try {
                    fs.renameSync('real_test.' + tag_key_name + '.log', 'real_test.last.' + tag_key_name + '.log');
                } catch {
                    /* Ignore */
                }
                fs.writeFile('real_test.' + tag_key_name + '.log', logfile_out_string, function(err) {
                        if (err) {
                            throw(err);
                        }
                    }
                );
            } /* }}} */

            let csv_filename;
            let csv_punchcard_filename;
            switch (info.export_format) {
            case 'overpass':
                csv_filename = [
                     'export',
                     tag_key_name,
                     info.key,
                     info.value,
                     'stats.csv'
                ].join('♡');
                csv_punchcard_filename = [
                     'punchcard',
                     info.key,
                     info.value,
                     'csv'
                ].join('♡');
                break;
            case 'taginfo':
                csv_filename = 'real_test.' + tag_key_name + '.stats.csv';
                csv_punchcard_filename = 'punchcard.csv';
                break;
            default: throw('Unknown export_format.');
            }

            if (argv.punchcard && tag_key_name === 'opening_hours') {
                for (let i = 0; i < day_number_to_name.length; i++) {
                    punchcard_data_out[day_number_to_name[i]] = punchcard_data[i].map(
                        value => (value / total * 100).toFixed(2)
                    );
                    punchcard_csv += day_number_to_name[i] + ',' + punchcard_data_out[day_number_to_name[i]].join(',') + '\n';
                }
                if (argv.verbose) {
                    console.log(punchcard_data_out);
                    // if (punchcard_debug.length > 0) {
                        // punchcard_debug = punchcard_debug.sort(Comparator);
                        // for (let i = 0; i < punchcard_debug.length; i++) {
                            // let count = punchcard_debug[i][0];
                            // let value = punchcard_debug[i][1];
                            // console.log('Open ' + sprintf(total_differ_value_number_format, count) + ' times: ' + value);
                        // }
                    // }
                    // console.log("NeXt debug");
                    // if (punchcard_debug2.length > 0) {
                        // punchcard_debug2 = punchcard_debug2.sort(Comparator);
                        // for (let i = 0; i < punchcard_debug2.length; i++) {
                            // let count = punchcard_debug2[i][0];
                            // let value = punchcard_debug2[i][1];
                            // console.log('Open ' + sprintf(total_differ_value_number_format, count) + ' times: ' + value);
                        // }
                    // }
                }
                fs.writeFile(csv_punchcard_filename, punchcard_csv, function(err) {
                    if (err) {
                        throw(err);
                    }
                });
            }

            if (info.export_format === 'overpass' || fs.existsSync('real_test.' + tag_key_name + '.stats.csv')) { /* Generate stats {{{ */
                if (!fs.existsSync(csv_filename)) {
                    fs.closeSync(fs.openSync(csv_filename, 'w'));
                }
                if (fs.statSync(csv_filename).size === 0) {
                    fs.appendFile(
                        csv_filename,
                        [
                            'Time',
                            'Number of values', 'Number of different values',
                            'Number of values which could be parsed', 'Number of different values which could be parsed',
                            'Number of values which returned a warning', 'Number of different values which returned a warning',
                            'Number of values which are not prettified', 'Number of different values which are not prettified',
                        ].join(', ') + '\n',
                        function(err) {
                            if (err) {
                                throw(err);
                            }
                        }
                    );
                }
                if (info.export_format === 'taginfo') {
                    info.timestamp = this.get_dump_creation_time_from_file('taginfo_sources.json');
                    console.log(info.timestamp);
                }
                if (!(info.timestamp instanceof Date) || Number.isNaN(info.timestamp.getTime())) {
                    throw('dump creation time is unknown.');
                }
                const timestamp = info.timestamp.toISOString();
                let known_timestamp = false;
                const csv_line = [
                    timestamp,
                    total, total_differ,
                    success, success_differ,
                    warnings, warnings_differ,
                    not_pretty, not_pretty_differ
                ].join(', ');
                fs.readFileSync(csv_filename, 'utf8').split('\n').forEach(function (line) {
                    if (!known_timestamp && line.match(new RegExp('^' + timestamp))) {
                        console.error('Skipping write to stats file. An entry does already exist for the timestamp: ' + timestamp);
                        console.log('Line: ' + csv_line);
                        known_timestamp = true;
                    }
                });
                if (!known_timestamp) {
                    fs.appendFile(
                        csv_filename,
                        csv_line + '\n',
                        function(err) {
                            if (err)
                                throw(err);
                        }
                    );
                }
            } /* }}} */

    } /* }}} */

    /** @param {string} tag_key_name - Tag key to load from the taginfo API. */
    tag_key_name(tag_key_name /* tag key, uses the data from the taginfo API */) { /* {{{ */
        this.json_file('export.' + tag_key_name + '.json');
    } /* }}} */

    /** @param {string} filename - File exported by the taginfo API or Overpass. */
    json_file(filename /* file exported by the taginfo API */) { /* {{{ */
        if (!fs.existsSync(filename)) {
            console.error('File ' + filename + ' does not exist.');
            return;
        }

        const filename_asciified = filename.replace(/♡/g, '@');
        /* TODO: JavaScript could not handle [^♡] */
        let re = filename_asciified.match(/^export@([^@]+)@([^@]+)(@[^@]+|).json$/);
        /** @type {ExportInfo} */
        let info;
        /** @type {string[]} */
        const related_tags = [];
        if (re !== null) {
            info = {
                'key': re[1],
                'value': re[2],
                'timestamp': re[3].replace(/^@/, ''),
                'filename': filename,
                'export_format': 'overpass',
            };
            assert.strictEqual(typeof(info.key)       , 'string')
            assert.strictEqual(typeof(info.value)     , 'string')
            assert.strictEqual(typeof(info.timestamp) , 'string')
            const timestamp = typeof info.timestamp === 'string' ? info.timestamp : '';
            if (timestamp.length > 0) {
                info.timestamp = new Date(timestamp);
            } else {
                info.timestamp = new Date();
            }
            // console.log(info);
            fs.readFileSync(related_tags_file, 'utf8').split('\n').forEach(function (line) {
                if (line.match(/^[^#]/)) {
                    related_tags.push(line);
                }
            });
        } else if ((re = filename.match(/^export\.([^.]+).json$/))) {
            info = {
                'key': re[1],
                'filename': filename,
                'export_format': 'taginfo',
            };
            assert.strictEqual(typeof(info.key)       , 'string')
        } else {
            throw 'Filename of unknown type given.';
        }

        fs.readFile(filename, 'utf8', (err, data) => {
            if (err) {
                console.error('Error for tag "' + info.key + '": ' + err);
                return;
            }

            // Check if file is empty or contains invalid JSON
            if (!data || data.trim().length === 0) {
                console.warn(c.warning('Warning:') + ' File "' + filename + '" is empty, skipping.');
                return;
            }

            /** @type {Record<string, TagData>} */
            const taginfo_format = {};

            /** @type {unknown} */
            let parsed_data;
            try {
                parsed_data = JSON.parse(data);
            } catch (parseError) {
                const message = parseError instanceof Error ? parseError.message : String(parseError);
                console.error('Error parsing JSON in file "' + filename + '": ' + message);
                console.error('File content preview: ' + data.substring(0, 200));
                return;
            }

            if (info.export_format === 'overpass') {
                if (!isOverpassResponse(parsed_data)) {
                    console.error('Invalid Overpass response in file "' + filename + '".');
                    return;
                }
                let no_data_returned = true;
                for (let elements_number = 0; elements_number < parsed_data.elements.length; elements_number++) {
                    const element = parsed_data.elements[elements_number];
                    const tags = element.tags ?? {};
                    element.tags = tags;
                    Object.keys(tags).forEach(function (key) {
                        if (related_tags.includes(key)) {
                            const val = tags[key];
                            const tag_data = taginfo_format[key] ??= { data: [] };
                            const known_value = tag_data.data.find(tag => tag.value === val);
                            if (known_value !== undefined) {
                                known_value.count++;
                            } else {
                                tag_data.data.push({ value: val, count: 1 });
                            }
                            no_data_returned = false;
                        }
                    });
                }
                if (no_data_returned) {
                    /*
                     * The following line fixes the problem when no data is returned at all.
                     * This can happen when the overpass API returns no elements for a query (when no
                     * opening_hours, lit, … did exist at the given time). The problem then would
                     * be that the check if the statistics have already been processed would fail and
                     * the non existing data would be downloaded again on the next run. This did
                     * not yet happen: ^The holiday definitions.\+\(\_.\)\{1,8\}rm
                     */
                    taginfo_format['no_data_returned'] = { data: [] };
                }
            }


            if (info.export_format === 'overpass') {
                // console.log(JSON.stringify(taginfo_format, null, '    '));
                Object.keys(taginfo_format).forEach((tag_key_name) => {
                    this.parse_tag(tag_key_name, info, taginfo_format[tag_key_name]);
                });
            } else {
                if (!isTagData(parsed_data)) {
                    console.error('Invalid Taginfo response in file "' + filename + '".');
                    return;
                }
                this.parse_tag(info.key, info, parsed_data);
            }
        });
    }; /* }}} */

    /**
     * log_to_user {{{
     * @param {boolean} tests_done - Whether all tests are done.
     * @param {number} total - Total number of tests.
     * @param {number} total_differ - Number of differing tests.
     * @param {number | undefined} currently_parsed_value - Current value number.
     * @param {number} parsed_values - Number of parsed values.
     * @param {number} success - Number of successful tests.
     * @param {number} success_differ - Number of differing successes.
     * @param {number} warnings - Number of warnings.
     * @param {number} warnings_differ - Number of differing warnings.
     * @param {number} not_pretty - Number of non-pretty values.
     * @param {number} not_pretty_differ - Number of differing non-pretty values.
     * @param {Date} time_at_test_begin - Test start time.
     */
    log_to_user(tests_done, total, total_differ, currently_parsed_value, parsed_values,
        success, success_differ, warnings, warnings_differ, not_pretty, not_pretty_differ, time_at_test_begin) {

        const delta = (new Date()).getTime() - time_at_test_begin.getTime();

        // if (tests_done)
            // console.log('Done:');

        console.log(
            String(success).padStart(7) + '/' + String(total).padStart(7) +
            ' (' + this.get_percent(success, parsed_values) +
                ( tests_done ?
                    ', not pretty: ' + this.get_percent(not_pretty, parsed_values)
                  :
                    '' /* Need the space to fit one line on the screen … */
                ) +
            ', with warnings: ' + this.get_percent(warnings , parsed_values) + ')' +
            ', only different values: '+ String(success_differ).padStart(6) +'/'+ String(total_differ).padStart(6) +
            ' (' + this.get_percent(success_differ, total_differ) + ')' +
            ' tests passed. ' +
                ( tests_done ?
                    String(total).padStart(7) + ' values' +
                    ' in ' + String(delta).padStart(5) + ' ms (' + (total/delta*1000).toFixed(1) + ' n/sec).\n'
                :
                    // String(total_differ - currently_parsed_value).padStart(7) + ' left … ' +
                    String(currently_parsed_value).padStart(7) + ' values' +
                    ' in ' + String(delta).padStart(5) + ' ms (' + ((currently_parsed_value ?? 0)/delta*1000).toFixed(1) + ' n/sec).'
                )
        );
    } /* }}} */

    /**
     * @param {number} passing_values - Number of passing values.
     * @param {number} parsed_values - Number of parsed values.
     * @returns {string} The percentage formatted for console output.
     */
    get_percent(passing_values, parsed_values) {
        return String((passing_values / parsed_values * 100).toFixed(1) + ' %').padStart(6);
        /* "100.0 %" would be 7 characters long, but that does not happen to often. */
    }

    // Helper functions {{{

    /**
     * @param {[string, number]} a - First value.
     * @param {[string, number]} b - Second value.
     * @returns {number} Sort order by descending count.
     */
    Comparator(a, b){
        if (a[1] > b[1]) return -1;
        if (a[1] < b[1]) return 1;
        return 0;
    }
    /**
     * @param {string} file - Path to the taginfo dump file.
     * @returns {Date | undefined} The dump timestamp, if available.
     */
    get_dump_creation_time_from_file(file) {
        try {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            for (let i = 0; i < data.length; i++) {
                if (data[i].name === 'Database') {
                    return new Date(data[i].data_until);
                }
            }
        } catch {
            return;
        }
    }
    /* }}} */
}
/* }}} */

const test_framework = new OpeningHoursTest();
for (let i = 0; i < argv._.length; i++) {
    const filename = String(argv._[i]);
    test_framework.json_file(filename);
}
