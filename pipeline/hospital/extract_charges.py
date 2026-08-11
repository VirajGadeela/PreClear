"""Gate 1: facility-level prices for specific CPT codes, per hospital.

Hospital price transparency files are the source for the facility (technical)
component and the cash price. Payer MRFs do not carry either for outpatient
imaging — see CLAUDE.md.

These files follow the CMS template, but only loosely, so the parsing is
defensive in three places:

  1. The header row is not row 0. Hospitals put one or two metadata rows above
     it, so the header is found by looking for the row that names `description`.
  2. Codes appear in numbered slots (`code|1`, `code|2`, ...) and the CPT is
     rarely in slot 1 — slot 1 is usually the hospital's internal CDM number.
  3. Both CMS layouts exist. "Tall" files have `payer_name` / `plan_name`
     columns with one row per payer. "Wide" files encode the payer into the
     column name, as `standard_charge|<payer>|<plan>|negotiated_dollar`.

Usage:
    python -m pipeline.hospital.extract_charges --codes 73721 70450
"""

import argparse
import csv
import io
import itertools
import os
import re
import sys
import time
import urllib.request
import zipfile

from pipeline.hospital.facilities import FACILITIES, MISSING

# Some hospitals put very long notes in a single cell.
csv.field_size_limit(10**7)

# Enough rows to find the header and the metadata above it, without holding a
# multi-gigabyte file in memory.
_HEAD_ROWS = 15

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
)

# Matches the payer/plan encoded in a wide-format column name.
_WIDE_COLUMN = re.compile(
    r"^standard_charge\|(?P<payer>.+?)\|(?P<plan>.+?)\|negotiated_dollar$",
    re.IGNORECASE,
)

CODE_TYPES = {"CPT", "HCPCS"}

OUTPUT_COLUMNS = [
    "facility_key",
    "facility_name",
    "facility_address",
    "cpt",
    "description",
    "setting",
    "modifiers",
    "payer_name",
    "plan_name",
    "gross_charge",
    "cash_price",
    "negotiated_dollar",
    "negotiated_percentage",
    "methodology",
    "source_url",
]

# CMS caps codes at 4 slots but some hospitals publish more.
_MAX_CODE_SLOTS = 12


def iter_rows(url, timeout=600, attempts=3):
    """Yield CSV rows from a hospital file without buffering it.

    Community Hospital East publishes 7.8 GB of *uncompressed* CSV, so reading
    the whole response into a string is not an option. Zips are the exception:
    the format needs random access, but every zip here is a few megabytes.

    The archive check sniffs the leading bytes rather than trusting the URL.
    Ascension serves a zip from a path ending in `.csv`, and going by the
    extension feeds compressed bytes straight into the CSV parser.
    """
    request = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    for attempt in range(1, attempts + 1):
        try:
            response = urllib.request.urlopen(request, timeout=timeout)
            break
        except Exception:
            # These hosts reset connections intermittently under load.
            if attempt == attempts:
                raise
            time.sleep(2 * attempt)

    with response:
        buffered = io.BufferedReader(response)
        if buffered.peek(2)[:2] == b"PK":
            archive = zipfile.ZipFile(io.BytesIO(buffered.read()))
            names = [n for n in archive.namelist() if n.lower().endswith(".csv")]
            if not names:
                raise ValueError(f"zip has no csv member: {archive.namelist()}")
            text = archive.read(names[0]).decode("utf-8", errors="replace")
            yield from csv.reader(io.StringIO(text))
            return
        stream = io.TextIOWrapper(
            buffered, encoding="utf-8", errors="replace", newline=""
        )
        yield from csv.reader(stream)


def find_header(rows):
    """Return (header_index, columns). The header is the row naming description."""
    for index, row in enumerate(rows[:15]):
        lowered = [cell.strip().lower() for cell in row]
        if "description" in lowered and any(
            cell.startswith("code|") or cell == "setting" for cell in lowered
        ):
            return index, lowered
    raise ValueError("no header row found in first 15 rows")


def read_metadata(rows, header_index):
    """Pull hospital name and address out of the rows above the header."""
    name = address = ""
    for index in range(header_index):
        labels = [cell.strip().lower() for cell in rows[index]]
        if "hospital_name" not in labels or index + 1 >= header_index + 1:
            continue
        values = rows[index + 1]
        for label, value in zip(labels, values):
            if label == "location_name" and value.strip():
                name = value.strip()
            elif label == "hospital_name" and not name:
                name = value.strip()
            elif label == "hospital_address":
                address = value.strip()
    return name, address


def codes_in_row(row, index_of):
    """Every (code, type) pair present in this row's numbered code slots."""
    found = set()
    for slot in range(1, _MAX_CODE_SLOTS + 1):
        code_column = index_of.get(f"code|{slot}")
        type_column = index_of.get(f"code|{slot}|type")
        if code_column is None or code_column >= len(row):
            continue
        code = row[code_column].strip()
        if not code:
            continue
        code_type = ""
        if type_column is not None and type_column < len(row):
            code_type = row[type_column].strip().upper()
        found.add((code, code_type))
    return found


def cell(row, index_of, column):
    position = index_of.get(column)
    if position is None or position >= len(row):
        return ""
    return row[position].strip()


def extract_facility(facility, wanted_codes, rows):
    """Yield normalized price rows for one hospital file."""
    rows = iter(rows)
    head = list(itertools.islice(rows, _HEAD_ROWS))
    header_index, columns = find_header(head)
    index_of = {column: position for position, column in enumerate(columns)}
    name, address = read_metadata(head, header_index)
    name = name or facility["name"]

    wide_columns = []
    for column, position in index_of.items():
        match = _WIDE_COLUMN.match(column)
        if match:
            wide_columns.append((position, match.group("payer"), match.group("plan")))
    is_tall = "payer_name" in index_of

    for row in itertools.chain(head[header_index + 1 :], rows):
        if not any(value.strip() for value in row):
            continue
        matches = {
            code
            for code, code_type in codes_in_row(row, index_of)
            if code in wanted_codes and (not code_type or code_type in CODE_TYPES)
        }
        if not matches:
            continue

        base = {
            "facility_key": facility["key"],
            "facility_name": name,
            "facility_address": address,
            "description": cell(row, index_of, "description"),
            "setting": cell(row, index_of, "setting"),
            "modifiers": cell(row, index_of, "modifiers"),
            "gross_charge": cell(row, index_of, "standard_charge|gross"),
            "cash_price": cell(row, index_of, "standard_charge|discounted_cash"),
            "methodology": cell(row, index_of, "standard_charge|methodology"),
            "source_url": facility["url"],
        }
        for code in sorted(matches):
            if is_tall:
                yield {
                    **base,
                    "cpt": code,
                    "payer_name": cell(row, index_of, "payer_name"),
                    "plan_name": cell(row, index_of, "plan_name"),
                    "negotiated_dollar": cell(
                        row, index_of, "standard_charge|negotiated_dollar"
                    ),
                    "negotiated_percentage": cell(
                        row, index_of, "standard_charge|negotiated_percentage"
                    ),
                }
            for position, payer, plan in wide_columns:
                value = row[position].strip() if position < len(row) else ""
                if not value:
                    continue
                yield {
                    **base,
                    "cpt": code,
                    "payer_name": payer,
                    "plan_name": plan,
                    "negotiated_dollar": value,
                    "negotiated_percentage": "",
                }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--codes", nargs="+", required=True, help="CPT codes to keep")
    parser.add_argument("--out-dir", default="data/gate1")
    parser.add_argument("--tag", default="indy_facility_prices")
    parser.add_argument(
        "--only",
        nargs="+",
        help="facility keys to run; skips the rest so a retry does not "
        "re-download the multi-gigabyte files",
    )
    args = parser.parse_args(argv)

    wanted = set(args.codes)
    facilities = FACILITIES
    if args.only:
        facilities = [f for f in FACILITIES if f["key"] in set(args.only)]
        if not facilities:
            parser.error(f"no facility matches {args.only}")
    os.makedirs(args.out_dir, exist_ok=True)
    out_path = os.path.join(args.out_dir, f"{args.tag}.csv")

    total = 0
    succeeded = []
    failed = []
    with open(out_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        for facility in facilities:
            try:
                rows = list(
                    extract_facility(facility, wanted, iter_rows(facility["url"]))
                )
            except Exception as error:
                # One unreachable or malformed hospital must not lose the others.
                failed.append((facility["name"], f"{type(error).__name__}: {error}"))
                print(f"  FAIL  {facility['name']}: {error}", file=sys.stderr)
                continue
            for row in rows:
                writer.writerow(row)
            total += len(rows)
            succeeded.append((facility["name"], len(rows)))
            codes_found = sorted({row["cpt"] for row in rows})
            print(
                f"  ok    {facility['name']}: {len(rows)} rows, codes {codes_found}",
                file=sys.stderr,
            )

    print(f"\n{len(succeeded)}/{len(facilities)} facilities parsed, {total:,} rows",
          file=sys.stderr)
    print(f"wrote {out_path}", file=sys.stderr)
    if failed:
        print("\nfailed:", file=sys.stderr)
        for name, error in failed:
            print(f"  {name}: {error}", file=sys.stderr)
    if MISSING:
        print("\nnot yet covered (need URLs by hand):", file=sys.stderr)
        for name in MISSING:
            print(f"  {name}", file=sys.stderr)
    return 0 if total else 1


if __name__ == "__main__":
    sys.exit(main())
