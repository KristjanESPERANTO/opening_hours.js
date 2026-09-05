export type HolidayDefinition = Record<string, unknown> | unknown[] | string | number | boolean | null;
export type CountryHolidayDefinitions = Record<string, HolidayDefinition>;
export type HolidayDefinitions = Record<string, CountryHolidayDefinitions>;