"""Gate 1: pull negotiated rates for specific CPT codes out of one payer MRF.

Single pass over a gzipped in-network rate file:

  Phase 1  build a group_id -> provider map in SQLite (on disk, because a
           national file can carry hundreds of thousands of groups).
  Phase 2  keep only rate records whose billing code we asked for, and write
           one CSV row per negotiated price.
  Phase 3  export just the provider groups those rates actually referenced.

Rates and providers are written as separate CSVs joined on provider_group_id.
Expanding them into one table would multiply every price by every NPI in the
group, which for a national network runs to tens of millions of rows.

Usage:
    python -m pipeline.mrf.extract_rates --url URL --codes 73721 70450
"""

import argparse
import csv
import os
import re
import sqlite3
import sys
import time

from pipeline.mrf.stream import (
    IN_NETWORK_MARKER,
    PROVIDER_MARKER,
    RATE_MARKER,
    RecordScanner,
    decode_record,
    open_stream,
)

# billing_code sits within the first ~200 bytes of a rate record, so only the
# head of each record is searched. Spacing around the colon varies by payer.
_BILLING_CODE = re.compile(rb'"billing_code"\s*:\s*"([^"]+)"')
_HEAD_BYTES = 600

RATE_COLUMNS = [
    "billing_code",
    "billing_code_type",
    "description",
    "negotiation_arrangement",
    "billing_class",
    "setting",
    "negotiated_type",
    "negotiated_rate",
    "service_codes",
    "billing_code_modifiers",
    "expiration_date",
    "provider_group_id",
]

PROVIDER_COLUMNS = [
    "provider_group_id",
    "npi",
    "tin_type",
    "tin_value",
    "business_name",
]


def open_provider_db(path):
    if os.path.exists(path):
        os.remove(path)
    db = sqlite3.connect(path)
    # This database is a scratch index rebuilt on every run, so durability
    # buys nothing and costs a lot of time on a few hundred thousand inserts.
    db.execute("PRAGMA journal_mode = OFF")
    db.execute("PRAGMA synchronous = OFF")
    db.execute(
        "CREATE TABLE providers ("
        " provider_group_id INTEGER,"
        " npi TEXT,"
        " tin_type TEXT,"
        " tin_value TEXT,"
        " business_name TEXT)"
    )
    return db


def load_provider_references(scanner, db, progress):
    """Phase 1: index every provider group, keyed by provider_group_id."""
    batch = []
    groups = 0
    for record in scanner.records(PROVIDER_MARKER, stop_marker=IN_NETWORK_MARKER):
        try:
            reference = decode_record(record)
        except ValueError:
            # A malformed record costs us one provider group, not the run.
            continue
        group_id = reference.get("provider_group_id")
        if group_id is None:
            continue
        groups += 1
        for group in reference.get("provider_groups", []):
            tin = group.get("tin") or {}
            tin_type = tin.get("type", "")
            tin_value = tin.get("value", "")
            business_name = tin.get("business_name", "")
            for npi in group.get("npi", []):
                batch.append(
                    (group_id, str(npi), tin_type, tin_value, business_name)
                )
        if len(batch) >= 20000:
            db.executemany(
                "INSERT INTO providers VALUES (?, ?, ?, ?, ?)", batch
            )
            batch.clear()
            progress(f"phase 1: {groups:,} provider groups indexed")
    if batch:
        db.executemany("INSERT INTO providers VALUES (?, ?, ?, ?, ?)", batch)
    db.commit()
    db.execute("CREATE INDEX idx_group ON providers (provider_group_id)")
    db.commit()
    return groups


def extract_rates(scanner, wanted_codes, writer, progress):
    """Phase 2: write one row per negotiated price for the wanted codes."""
    # Search for the code in its billing_code position rather than bare, so a
    # code appearing inside a description or a rate does not trigger a match.
    patterns = [
        template % code.encode("utf-8")
        for code in sorted(wanted_codes)
        for template in (b'"billing_code":"%s"', b'"billing_code": "%s"')
    ]
    matched = 0
    rows = 0
    referenced_groups = set()
    inline_groups_seen = False

    for record in scanner.matching_records(RATE_MARKER, patterns):
        head = record[:_HEAD_BYTES]
        found = _BILLING_CODE.search(head)
        if not found or found.group(1).decode("utf-8") not in wanted_codes:
            # The pattern matched somewhere past the head of the record, so
            # this record is for some other code.
            continue
        try:
            item = decode_record(record)
        except ValueError as error:
            progress(f"phase 2: skipped malformed record for {found.group(1)!r}: {error}")
            continue

        matched += 1
        base = {
            "billing_code": item.get("billing_code", ""),
            "billing_code_type": item.get("billing_code_type", ""),
            "description": item.get("description", ""),
            "negotiation_arrangement": item.get("negotiation_arrangement", ""),
        }
        for rate in item.get("negotiated_rates", []):
            group_ids = rate.get("provider_references")
            if group_ids is None:
                # Some payers inline provider_groups here instead of using
                # references. This extractor does not handle that layout.
                inline_groups_seen = True
                continue
            referenced_groups.update(group_ids)
            for price in rate.get("negotiated_prices", []):
                for group_id in group_ids:
                    writer.writerow(
                        {
                            **base,
                            "billing_class": price.get("billing_class", ""),
                            "setting": price.get("setting", ""),
                            "negotiated_type": price.get("negotiated_type", ""),
                            "negotiated_rate": price.get("negotiated_rate", ""),
                            "service_codes": "|".join(price.get("service_code") or []),
                            "billing_code_modifiers": "|".join(
                                price.get("billing_code_modifier") or []
                            ),
                            "expiration_date": price.get("expiration_date", ""),
                            "provider_group_id": group_id,
                        }
                    )
                    rows += 1
        progress(f"phase 2: matched {base['billing_code']}, {rows:,} price rows so far")

    if inline_groups_seen:
        progress(
            "WARNING: some negotiated_rates used inline provider_groups and "
            "were skipped. This payer needs a different provider resolver.",
            force=True,
        )
    return matched, rows, referenced_groups


def export_providers(db, group_ids, path, progress):
    """Phase 3: write only the provider groups the matched rates referenced."""
    written = 0
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=PROVIDER_COLUMNS)
        writer.writeheader()
        group_list = sorted(group_ids)
        for start in range(0, len(group_list), 500):
            window = group_list[start : start + 500]
            placeholders = ",".join("?" * len(window))
            cursor = db.execute(
                "SELECT provider_group_id, npi, tin_type, tin_value, business_name"
                f" FROM providers WHERE provider_group_id IN ({placeholders})",
                window,
            )
            for row in cursor:
                writer.writerow(dict(zip(PROVIDER_COLUMNS, row)))
                written += 1
    progress(f"phase 3: {written:,} provider rows exported")
    return written


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--url", required=True, help="gzipped in-network rate file URL or local path"
    )
    parser.add_argument(
        "--codes", nargs="+", required=True, help="billing codes to keep, e.g. 73721"
    )
    parser.add_argument(
        "--out-dir",
        default="data/gate1",
        help="where rates.csv and providers.csv are written (gitignored)",
    )
    parser.add_argument(
        "--tag", default="rates", help="filename prefix for this run's output"
    )
    args = parser.parse_args(argv)

    os.makedirs(args.out_dir, exist_ok=True)
    rates_path = os.path.join(args.out_dir, f"{args.tag}.csv")
    providers_path = os.path.join(args.out_dir, f"{args.tag}_providers.csv")
    db_path = os.path.join(args.out_dir, f"{args.tag}_providers.sqlite")

    started = time.time()
    scanner = RecordScanner(open_stream(args.url))
    last_report = [0.0]

    def progress(message, force=False):
        now = time.time()
        if not force and now - last_report[0] < 5:
            return
        last_report[0] = now
        gigabytes = scanner.bytes_read / 1e9
        elapsed = now - started
        print(
            f"[{elapsed:6.0f}s] [{gigabytes:7.2f} GB decompressed] {message}",
            file=sys.stderr,
            flush=True,
        )

    phase = ["phase 1"]
    scanner.on_block = lambda: progress(f"{phase[0]}: scanning")

    db = open_provider_db(db_path)
    try:
        groups = load_provider_references(scanner, db, progress)
        progress(f"phase 1 done: {groups:,} provider groups", force=True)

        phase[0] = "phase 2"
        with open(rates_path, "w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=RATE_COLUMNS)
            writer.writeheader()
            matched, rows, referenced = extract_rates(
                scanner, set(args.codes), writer, progress
            )
        progress(
            f"phase 2 done: {matched} records matched, {rows:,} price rows",
            force=True,
        )

        export_providers(db, referenced, providers_path, progress)
    finally:
        db.close()

    print(f"\nrates:     {rates_path}", file=sys.stderr)
    print(f"providers: {providers_path}", file=sys.stderr)
    if matched == 0:
        print(
            "\nNo records matched. Either this plan does not cover these codes "
            "or the file uses a different layout.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
