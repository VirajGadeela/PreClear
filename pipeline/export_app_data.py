"""Export the price and requirement data the app bundles.

The app recomputes costs locally as the user moves the deductible slider, so it
needs the underlying prices rather than a precomputed answer. This writes a
small JSON bundle: eligible facility rates per CPT and payer, the hospital's
cash price, and a summary of the published requirements for each indication.

Eligibility here is exactly the routing engine's — payer buckets, out-of-state
plans, government lines and service-line carve-outs are all excluded — so the
app can never surface a rate the engine itself would refuse.

Usage:
    python -m pipeline.export_app_data --out app/assets/preclear-data.json
"""

import argparse
import glob
import json
import os
from collections import defaultdict

from pipeline.costing.routes import eligible_in_network
from pipeline.policies.rules import REQUIREMENTS
from pipeline.route import load_prices

# CPT -> what a patient would call it. Descriptions stay clinical and neutral:
# the app never proposes a different study, so these are labels, not options.
PROCEDURES = {
    "73721": {
        "label": "Knee MRI",
        "detail": "MRI, lower extremity joint, without contrast",
        "indications": [
            {"key": "meniscal_tear", "label": "Suspected meniscal tear"},
            {"key": "ligament_tear", "label": "Suspected ligament tear"},
        ],
    },
    "72148": {
        "label": "Lower back MRI",
        "detail": "MRI, lumbar spine, without contrast",
        "indications": [
            {"key": "low_back_pain", "label": "Low back pain"},
            {
                "key": "low_back_pain_with_radiculopathy",
                "label": "Low back pain with leg symptoms",
            },
            {
                "key": "degenerative_spine_disease",
                "label": "Known degenerative spine disease",
            },
        ],
    },
    "70450": {
        "label": "Head CT",
        "detail": "CT, head or brain, without contrast",
        "indications": [
            {"key": "headache", "label": "Headache"},
        ],
    },
}

PAYERS = ("anthem", "unitedhealthcare", "aetna", "cigna")


def facility_bundle(prices, payer):
    """Eligible rates grouped by facility, plus that facility's cash price."""
    eligible = eligible_in_network(prices, payer)
    by_facility = defaultdict(list)
    for price in eligible:
        by_facility[price.facility_key].append(price)

    # Cash price is a property of the facility, not the payer, and is published
    # even where no negotiated rate is.
    cash = {}
    gross = {}
    names = {}
    addresses = {}
    for price in prices:
        names.setdefault(price.facility_key, price.facility_name)
        addresses.setdefault(price.facility_key, price.facility_address)
        if price.cash_price is not None:
            current = cash.get(price.facility_key)
            if current is None or price.cash_price < current:
                cash[price.facility_key] = price.cash_price
        if price.gross_charge is not None:
            gross.setdefault(price.facility_key, price.gross_charge)

    bundles = []
    for key, rows in sorted(by_facility.items()):
        plans = sorted(
            (
                {
                    "plan_name": row.plan.label or row.plan_name,
                    "rate": round(row.negotiated_dollar, 2),
                    "product": row.plan.product,
                }
                for row in rows
            ),
            key=lambda entry: entry["rate"],
        )
        # Collapse duplicate (plan, rate) pairs; hospitals repeat rows heavily.
        seen = set()
        unique = []
        for plan in plans:
            token = (plan["plan_name"], plan["rate"])
            if token in seen:
                continue
            seen.add(token)
            unique.append(plan)
        # Hospitals that publish one price list for several locations put every
        # location in `location_name`, pipe separated. Show the first as the
        # facility and carry the rest, because the price genuinely applies to
        # all of them and hiding that would overstate how many independent
        # price observations the comparison has.
        raw_name = names.get(key, key)
        locations = [part.strip() for part in raw_name.split("|") if part.strip()]
        bundles.append(
            {
                "facility_key": key,
                "facility_name": locations[0] if locations else raw_name,
                "also_at": locations[1:],
                "facility_address": addresses.get(key, ""),
                "plans": unique,
                "cash_price": cash.get(key),
                "gross_charge": gross.get(key),
            }
        )
    return bundles


def requirement_bundle():
    """Published requirements, keyed for lookup by payer, CPT and indication."""
    entries = []
    for requirement in REQUIREMENTS:
        citation = requirement.citation
        entries.append(
            {
                "key": requirement.key,
                "payer": citation.payer,
                "reviewed_by": citation.reviewed_by,
                "cpt_codes": list(requirement.cpt_codes),
                "indication": requirement.indication,
                "summary": requirement.summary,
                "quote": requirement.quote,
                # The declarative check the app evaluates. Exported so the app
                # applies the identical rule rather than re-deriving thresholds
                # from the quote text.
                "check": requirement.check,
                "document_title": citation.document_title,
                "section_id": citation.section_id,
                "version": citation.version,
                "effective_date": citation.effective_date,
                "source_url": citation.source_url,
                "alternative_pathway": requirement.alternative_pathway,
            }
        )
    return entries


EOB_SOURCE = os.path.join("data", "samples", "household_eobs.json")
EOB_DEST = os.path.join("app", "assets", "household-eobs.json")


def copy_household_sample(source=EOB_SOURCE, dest=EOB_DEST):
    """Copy the synthetic EOB fixture into the app bundle.

    Copied rather than duplicated by hand so there is one source of truth. The
    Python tests and the parity script read `data/samples/`, the app reads its
    own assets, and two files that drift would let the parity check pass while
    the app shows different findings than the engine.
    """
    with open(source, encoding="utf-8") as handle:
        payload = json.load(handle)
    with open(dest, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    return len(payload["eobs"])


def refresh_metadata(path):
    """Rewrite the indication and requirement halves of an existing bundle.

    Requirement rules and indication labels are derived entirely from this
    module and `pipeline.policies`, with no dependency on the price files. Those
    files are gigabytes, live outside the repo, and are slow to rebuild, so
    editing a rule should not force a re-extraction. Facility prices are left
    exactly as they were.

    This is deliberately not the default: a bundle whose prices are stale is a
    real hazard, and only the caller knows whether that matters.
    """
    with open(path, encoding="utf-8") as handle:
        payload = json.load(handle)

    known = {procedure["cpt"] for procedure in payload["procedures"]}
    missing = set(PROCEDURES) - known
    if missing:
        raise SystemExit(
            f"{path} has no price data for CPT {', '.join(sorted(missing))}. "
            "Run a full export instead — metadata refresh cannot invent prices."
        )

    for procedure in payload["procedures"]:
        meta = PROCEDURES.get(procedure["cpt"])
        if meta:
            procedure["label"] = meta["label"]
            procedure["detail"] = meta["detail"]
            procedure["indications"] = meta["indications"]
    payload["requirements"] = requirement_bundle()

    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    return payload


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prices", nargs="+", default=None)
    parser.add_argument("--out", default=os.path.join("app", "assets", "preclear-data.json"))
    parser.add_argument(
        "--metadata-only",
        action="store_true",
        help="Refresh indications and requirements in --out, keeping its prices. "
        "Use after editing rules, when the price files are not to hand.",
    )
    args = parser.parse_args(argv)

    if args.metadata_only:
        payload = refresh_metadata(args.out)
        claims = copy_household_sample()
        print(f"copied {claims} synthetic EOBs to {EOB_DEST}")
        print(
            f"refreshed {len(payload['requirements'])} requirements and "
            f"{len(payload['procedures'])} procedures in {args.out}; prices untouched"
        )
        return 0

    paths = args.prices or sorted(glob.glob(os.path.join("data", "gate1", "*.csv")))
    paths = [path for path in paths if os.path.getsize(path) > 0]
    if not paths:
        parser.error("no price files; run pipeline.hospital.extract_charges first")

    procedures = []
    for cpt, meta in PROCEDURES.items():
        prices = load_prices(paths, cpt)
        payers = {}
        for payer in PAYERS:
            bundle = facility_bundle(prices, payer)
            if bundle:
                payers[payer] = bundle
        procedures.append(
            {
                "cpt": cpt,
                "label": meta["label"],
                "detail": meta["detail"],
                "indications": meta["indications"],
                "payers": payers,
            }
        )

    payload = {
        "metro": "Indianapolis",
        "generated_from": "hospital price transparency files",
        "disclosure": (
            "All figures are estimates built from files hospitals and payers "
            "publish. Requirement findings quote the payer's own criteria and "
            "describe documentation, not coverage outcomes."
        ),
        "procedures": procedures,
        "requirements": requirement_bundle(),
    }

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")

    for procedure in procedures:
        for payer, bundle in procedure["payers"].items():
            print(
                f"{procedure['cpt']} {payer}: {len(bundle)} facilities, "
                f"{sum(len(f['plans']) for f in bundle)} plan rates"
            )
    print(f"wrote {args.out} ({os.path.getsize(args.out):,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
