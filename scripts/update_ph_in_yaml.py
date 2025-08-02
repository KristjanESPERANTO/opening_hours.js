import datetime
import holidays
import yaml
import glob

YEAR = datetime.datetime.now().year


def get_ph_list(country, year):
    ph = holidays.country_holidays(country, years=year)
    result = []
    for dt, name in sorted(ph.items()):
        result.append({"name": name, "fixed_date": [dt.month, dt.day]})

    # Get all subdivisions for the country
    subdivisions = holidays.country_holidays(country).subdivisions_aliases

    # Temporary dictionary to collect subdivisions for each holiday
    holiday_dict = {}

    # Add holidays from subdivisions
    for subdivision in subdivisions:
        sub_ph = holidays.country_holidays(country, subdiv=subdivision, years=year)
        for dt, name in sorted(sub_ph.items()):
            key = (name, dt.month, dt.day)
            if key not in holiday_dict:
                holiday_dict[key] = {
                    "name": name,
                    "fixed_date": [dt.month, dt.day],
                    "only_states": [],
                }
            holiday_dict[key]["only_states"].append(subdivision)

    # Add collected holidays to result
    result.extend(holiday_dict.values())

    # Remove duplicates (e.g. same holidays in multiple federal states)
    seen = set()
    unique = []
    for item in result:
        key = (item["name"], tuple(item["fixed_date"]))
        if key not in seen:
            unique.append(item)
            seen.add(key)
    return unique


def update_yaml_file(filepath, ph_list):

    with open(filepath, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("---\n\n")  # Add YAML document separator at the beginning

        if "_nominatim_url" in data:
            f.write(f"_nominatim_url: {data['_nominatim_url']}\n\n")
            del data["_nominatim_url"]

        if "PH" in data:
            del data["PH"]

        if len(ph_list) == 0:
            yaml.dump({"PH": []}, f)
        else:
            f.write("PH:\n")
            for item in ph_list:
                f.write(f"  - {item}\n")
        # if data not empty, merge with existing data
        if data:
            yaml.dump(
                data,
                f,
                allow_unicode=True,
                sort_keys=False,
                default_flow_style=None,
                indent=2,
            )

    print(f"Updated: {filepath}")


def main():
    for filename in glob.glob("src/holidays/*.yaml"):
        country = filename.split("/")[-1].split(".")[0].upper()
        if country in holidays.list_supported_countries():
            ph_list = get_ph_list(country, YEAR)
            update_yaml_file(filename, ph_list)
        else:
            print(f"Warning: {country} is not a supported country.")

    # Create new files for countries that are not in the supported list
    index_string = ""
    for country in holidays.list_supported_countries():
        country_filename = f"src/holidays/{country.lower()}.yaml"

        if not glob.glob(country_filename):
            # Create empty file if it does not exist
            with open(country_filename, "w", encoding="utf-8") as f:
                yaml.dump({"PH": []}, f)
            ph_list = get_ph_list(country, YEAR)
            update_yaml_file(country_filename, ph_list)

        index_string += f"export {{ default as {country.lower()} }} from './{country.lower()}.yaml';\n"

    # write index file
    with open("src/holidays/index.js", "w", encoding="utf-8") as f:
        f.write("// This file is auto-generated. Do not edit manually.\n")
        f.write(index_string)


if __name__ == "__main__":
    main()
