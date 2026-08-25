// SPDX-FileCopyrightText: © opening_hours.js contributors
// SPDX-License-Identifier: LGPL-3.0-only

/**
 * Helpers for OSM variable times such as sunrise, sunset, dawn, and dusk.
 *
 * This module resolves solar events for a location, provides fallback values
 * when no coordinates are available, and converts events to minutes since
 * local midnight. Range handling remains the responsibility of the parser.
 */

import { getTimes } from 'suncalc';

/**
 * Default minute-of-day values used when no coordinates are available.
 * @type {Record<string, number>}
 */
export const VARIABLE_TIME_DEFAULTS = {
    dawn    : 60 * 5 + 30,
    sunrise : 60 * 6,
    sunset  : 60 * 18,
    dusk    : 60 * 18 + 30,
};

/**
 * Local (process time zone) calendar day identity for a Date, comparable with ===.
 * @param {Date} date - date to derive the calendar day from
 * @returns {number} an integer uniquely identifying the local calendar day
 */
function localDayKey(date) {
    return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/**
 * SunCalc event time for a variable-time name, or null when it does not occur.
 * @param {Date} date - instant to query
 * @param {number|string} lat - latitude
 * @param {number|string} lon - longitude
 * @param {string} eventName - SunCalc event name, e.g. 'sunrise', 'sunset'
 * @returns {Date|null} the event time, or null (e.g. polar day/night)
 */
function sunEvent(date, lat, lon, eventName) {
    const times = getTimes(date, Number(lat), Number(lon));
    const eventTime = times[eventName];
    return eventTime instanceof Date ? eventTime : null; // guards SunCalc's boolean/custom fields
}

/**
 * Resolve the solar event for the local calendar day of `date`.
 * SunCalc can return an event for the previous or next local day when the
 * location's longitude differs significantly from the process time zone.
 * Check nearby dates and use the result that belongs to `date`'s local day.
 * @see https://github.com/opening-hours/opening_hours.js/issues/377
 * @param {Date} date - date being evaluated, in the process time zone
 * @param {number|string} lat - latitude
 * @param {number|string} lon - longitude
 * @param {string} eventName - SunCalc event name, e.g. 'sunrise'
 * @returns {Date|null} the event on `date`'s local calendar day, if available
 */
export function getVariableTimeEvent(date, lat, lon, eventName) {
    const targetDay = localDayKey(date);

    for (const dayOffset of [0, -1, 1]) {
        const probe = new Date(date);
        probe.setDate(probe.getDate() + dayOffset);
        const eventTime = sunEvent(probe, lat, lon, eventName);
        if (eventTime && localDayKey(eventTime) === targetDay) {
            return eventTime;
        }
    }

    // dayOffset 0 above already checked date itself; nothing else to try.
    return null;
}

/**
 * Resolve the minutes since local midnight of `date` for a variable time
 * (e.g. 'sunrise', 'sunset', 'dawn', 'dusk').
 * @param {Date} date - the moment being evaluated, in local (process) time
 * @param {number|string} lat - latitude
 * @param {number|string} lon - longitude
 * @param {string} eventName - SunCalc event name, e.g. 'sunrise', 'sunset'
 * @param {number} offsetMinutes - minute offset from calculations like `(sunrise+01:00)`
 * @returns {number} minutes since local midnight of `date`
 * @throws {RangeError} if the variable time does not occur on this date
 */
export function getVariableTimeMinutes(date, lat, lon, eventName, offsetMinutes) {
    const eventTime = getVariableTimeEvent(date, lat, lon, eventName);
    if (eventTime === null) {
        throw new RangeError(`Variable time "${eventName}" does not occur on this date`);
    }
    return eventTime.getHours() * 60 + eventTime.getMinutes() + offsetMinutes;
}
