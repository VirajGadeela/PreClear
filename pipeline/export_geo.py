"""Export the coordinates the location screen needs.

The walkthrough asks for a ZIP code and a driving radius, and lists each route
with its distance. Hospital price files carry street addresses but no
coordinates, so this builds them from two public US Census sources:

  - Hospital locations: the Census Bureau geocoder, one request per address.
    Each facility uses the first address in its price file, which is the
    location the app names. Eskenazi Health's file publishes no address, so
    its public street address is supplied below.
  - ZIP code centres: the Census ZCTA Gazetteer (internal point of each ZIP
    Code Tabulation Area), Indiana only (prefixes 460 to 479).

Distances in the app are straight-line miles from the ZIP centre to the
hospital. They are not driving distances, and the app does not claim they are.

Usage:
    python -m pipeline.export_geo --gazetteer 2023_Gaz_zcta_national.txt \\
        --out app/assets/preclear-geo.json
"""

import argparse
import csv
import json
import time
import urllib.parse
import urllib.request

GEOCODER = (
    "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
    "?benchmark=Public_AR_Current&format=json&address="
)

# Files that publish no usable address. Public street addresses.
KNOWN_ADDRESSES = {
    "eskenazi": "720 Eskenazi Ave, Indianapolis, IN 46202",
}


def geocode(address):
    url = GEOCODER + urllib.parse.quote(address)
    with urllib.request.urlopen(url, timeout=60) as response:
        matches = json.load(response)["result"]["addressMatches"]
    if not matches:
        return None
    best = matches[0]
    return {
        "lat": round(best["coordinates"]["y"], 6),
        "lon": round(best["coordinates"]["x"], 6),
        "matched": best["matchedAddress"],
    }


def facility_addresses(bundle):
    found = {}
    for procedure in bundle["procedures"]:
        for facilities in procedure["payers"].values():
            for facility in facilities:
                first = (facility.get("facility_address") or "").split("|")[0].strip()
                found.setdefault(facility["facility_key"], first)
    for key, address in KNOWN_ADDRESSES.items():
        if key in found and not found[key]:
            found[key] = address
    return found


def indiana_zips(path):
    zips = {}
    with open(path, encoding="utf-8") as handle:
        reader = csv.reader(handle, delimiter="\t")
        header = [cell.strip() for cell in next(reader)]
        lat_i, lon_i = header.index("INTPTLAT"), header.index("INTPTLONG")
        for row in reader:
            zip_code = row[0].strip()
            if 460 <= int(zip_code[:3]) <= 479:
                zips[zip_code] = [round(float(row[lat_i]), 5), round(float(row[lon_i].strip()), 5)]
    return zips


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gazetteer", required=True, help="Census ZCTA Gazetteer .txt")
    parser.add_argument("--bundle", default="app/assets/preclear-data.json")
    parser.add_argument("--out", default="app/assets/preclear-geo.json")
    args = parser.parse_args(argv)

    with open(args.bundle, encoding="utf-8") as handle:
        bundle = json.load(handle)

    facilities = {}
    for key, address in sorted(facility_addresses(bundle).items()):
        if not address:
            print(f"  skip  {key}: no address")
            continue
        result = geocode(address)
        if result is None:
            print(f"  FAIL  {key}: no match for {address!r}")
            continue
        facilities[key] = result
        print(f"  ok    {key}: {result['matched']}")
        time.sleep(0.3)

    payload = {
        "source": "US Census Bureau geocoder (hospitals) and 2023 ZCTA Gazetteer (ZIP centres)",
        "facilities": facilities,
        "zips": indiana_zips(args.gazetteer),
    }
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))
        handle.write("\n")
    print(f"wrote {args.out}: {len(facilities)} hospitals, {len(payload['zips'])} ZIP codes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
