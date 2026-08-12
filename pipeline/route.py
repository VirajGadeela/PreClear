"""End-to-end routing: published prices in, four ranked routes out.

Ties the pieces together — hospital price files for the facility cost, the
payer's own published requirements for the order, and the deductible-aware math
for the ranking. One payer, real data, no network access at this stage.

Benefit inputs are user-reported, as CLAUDE.md specifies for Shipaton: there is
no eligibility API here and none is implied.

Usage:
    python -m pipeline.route --cpt 73721 --payer anthem \\
        --deductible-remaining 2000 --coinsurance 0.2 --oop-max 6000 \\
        --expected-other-spend 8000 --indication meniscal_tear
"""

import argparse
import csv
import glob
import os
import sys

from pipeline.costing.oop import PlanBenefits, money
from pipeline.costing.routes import (
    FacilityPrice,
    build_routes,
    eligible_in_network,
    explain_ranking,
    is_plausible,
    rank_routes,
)
from pipeline.plans import rank_matches
from pipeline.policies.check import unmet
from pipeline.policies.rules import ImagingOrder

# Canonical payer key -> the payer name the rule set is filed under.
RULE_PAYERS = {
    "anthem": "Anthem",
    "cigna": "Cigna",
    "aetna": "Aetna",
    "unitedhealthcare": "UnitedHealthcare",
}


def _number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def load_prices(paths, cpt):
    """Read facility prices for one CPT from the extractor's CSV output."""
    prices = []
    for path in paths:
        with open(path, newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                if row.get("cpt") != cpt:
                    continue
                prices.append(
                    FacilityPrice(
                        facility_key=row["facility_key"],
                        facility_name=row["facility_name"],
                        facility_address=row["facility_address"],
                        cpt=row["cpt"],
                        payer_raw=row["payer_name"],
                        plan_name=row["plan_name"],
                        negotiated_dollar=_number(row.get("negotiated_dollar")),
                        cash_price=_number(row.get("cash_price")),
                        gross_charge=_number(row.get("gross_charge")),
                    )
                )
    return prices


def eligible_by_facility(prices, payer_canonical, plan_contains=None, member_plan=None):
    """Eligible commercial rows for this payer, grouped by facility.

    Uses exactly the same eligibility rules as route building — payer buckets,
    out-of-state plans, government lines and service-line carve-outs all
    excluded — so the disclosure block cannot describe rows the routes refused.
    """
    grouped = {}
    for price in eligible_in_network(prices, payer_canonical):
        if plan_contains and plan_contains.lower() not in price.plan_name.lower():
            continue
        grouped.setdefault(price.facility_key, []).append(price)

    if not member_plan:
        return grouped

    # Narrow to the member's own plan where a confident match exists. A facility
    # with no match keeps its full set rather than disappearing: "we cannot tell
    # which of these applies to you" is a usable answer, "this facility has no
    # price" is a false one.
    narrowed = {}
    for key, rows in grouped.items():
        matches = rank_matches(member_plan, [(row.plan_name, row) for row in rows])
        narrowed[key] = [payload for _, _, payload in matches] or rows
    return narrowed


def plan_spread(rows):
    """Ratio between the highest and lowest rate a facility publishes.

    A wide spread means the payer alone does not determine the price — the
    member's specific plan does. Franciscan publishes five different Anthem
    rates for CPT 73721, from $360.22 to $992.51, so collapsing them to one
    number is only defensible as a placeholder and has to be disclosed.
    """
    amounts = [row.negotiated_dollar for row in rows if row.negotiated_dollar]
    if len(amounts) < 2 or min(amounts) <= 0:
        return 1.0
    return max(amounts) / min(amounts)


def representative_per_facility(prices, payer_canonical, plan_contains=None, member_plan=None):
    """One row per facility: the median plausible rate for this payer.

    Two mistakes are easy here and both were made before this was written.

    Collapsing facilities before filtering by payer silently drops any facility
    whose cheapest row happens to be Medicaid, so the payer filter comes first.

    Taking the *cheapest* row per facility systematically selects carve-out
    artifacts — it found a $49 knee MRI against a $2,486 gross charge. The median
    of the plausible rows is robust to both carve-outs and plan variants, so that
    is what represents a facility. Implausible rows are dropped only if the
    facility has something better; if every row is suspect the facility is still
    represented, carrying its warnings, rather than vanishing.
    """
    by_facility = eligible_by_facility(prices, payer_canonical, plan_contains, member_plan)
    representatives = []
    for rows in by_facility.values():
        plausible = [row for row in rows if is_plausible(row)] or rows
        plausible.sort(key=lambda row: row.negotiated_dollar)
        representatives.append(plausible[len(plausible) // 2])
    return representatives


def cash_price_for(prices, facility_key=None):
    """Lowest published discounted cash price, optionally at one facility."""
    options = [p for p in prices if p.cash_price is not None]
    if facility_key:
        options = [p for p in options if p.facility_key == facility_key] or options
    if not options:
        return None
    return min(options, key=lambda p: p.cash_price)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cpt", default="73721")
    parser.add_argument("--payer", default="anthem", choices=sorted(RULE_PAYERS))
    parser.add_argument("--prices", nargs="+", default=None,
                        help="price CSVs; defaults to data/gate1/*.csv")
    parser.add_argument("--deductible-remaining", type=float, required=True)
    parser.add_argument("--coinsurance", type=float, default=0.2)
    parser.add_argument("--oop-max", type=float, required=True)
    parser.add_argument(
        "--expected-other-spend", type=float, default=0.0,
        help="allowed amount of OTHER care expected this plan year. This is what "
        "decides whether a deductible credit is worth anything; 0 is the "
        "assumption that no further care happens.",
    )
    parser.add_argument("--ordered-facility", default=None)
    parser.add_argument(
        "--plan-contains", default=None,
        help="restrict to plans whose name contains this text, e.g. 'BLUE ACCESS'. "
        "Hospitals publish several rates per payer and the member's specific plan "
        "decides which one applies.",
    )
    parser.add_argument(
        "--plan", default=None,
        help="the member's plan as printed on their card, e.g. "
        "'Anthem Blue Access PPO'. Matched against each hospital's published "
        "plan strings; where no confident match exists the facility keeps its "
        "full range rather than being dropped.",
    )
    parser.add_argument("--indication", default="meniscal_tear")
    parser.add_argument("--conservative-weeks", type=float, default=None)
    parser.add_argument("--radiographs", default=None,
                        choices=["nondiagnostic", "diagnostic"])
    parser.add_argument("--mechanical-symptoms", action="store_true", default=None)
    parser.add_argument("--exam-findings", nargs="*", default=())
    parser.add_argument("--uninsured", action="store_true",
                        help="surface the cash route regardless of plan position")
    args = parser.parse_args(argv)

    paths = args.prices or sorted(glob.glob(os.path.join("data", "gate1", "*.csv")))
    paths = [p for p in paths if os.path.getsize(p) > 0]
    if not paths:
        parser.error("no price files found; run pipeline.hospital.extract_charges first")

    all_prices = load_prices(paths, args.cpt)
    if not all_prices:
        parser.error(f"no published prices for CPT {args.cpt} in {paths}")

    benefits = PlanBenefits(
        deductible_remaining=args.deductible_remaining,
        coinsurance_rate=args.coinsurance,
        oop_max_remaining=args.oop_max,
    )

    order = ImagingOrder(
        cpt=args.cpt,
        payer=RULE_PAYERS[args.payer],
        indication=args.indication,
        conservative_therapy_weeks=args.conservative_weeks,
        prior_radiographs=args.radiographs,
        mechanical_symptoms=args.mechanical_symptoms,
        meniscal_exam_findings=tuple(args.exam_findings),
    )
    findings = unmet(order)
    checklist_lines = tuple(f.requirement.summary for f in findings)

    # The cash route is appropriate when the patient is uninsured or is unlikely
    # to reach the deductible, which is when the credit has little value.
    cash_is_appropriate = args.uninsured or (
        args.expected_other_spend < benefits.deductible_remaining
    )

    per_facility = representative_per_facility(
        all_prices, args.payer, args.plan_contains, args.plan
    )
    cash_source = cash_price_for(all_prices, args.ordered_facility)
    if cash_source is not None:
        per_facility = per_facility + [cash_source]

    routes = build_routes(
        per_facility,
        payer_canonical=args.payer,
        benefits=benefits,
        ordered_facility_key=args.ordered_facility,
        expected_other_allowed_spend=args.expected_other_spend,
        unmet_requirements=checklist_lines,
        cash_is_appropriate=cash_is_appropriate,
    )
    if not routes:
        eligible = eligible_in_network(per_facility, args.payer)
        print(
            f"No routes for {args.payer} at CPT {args.cpt}. "
            f"{len(all_prices)} published rows, {len(eligible)} usable after "
            f"excluding payer buckets, out-of-state plans and government lines.",
            file=sys.stderr,
        )
        return 1

    ranked = rank_routes(routes)
    print(f"CPT {args.cpt} — {args.payer}, Indianapolis metro")
    print(
        f"Deductible remaining {money(benefits.deductible_remaining)}, "
        f"coinsurance {benefits.coinsurance_rate:.0%}, "
        f"other care expected this year {money(args.expected_other_spend)}"
    )
    print(
        f"Compared {len({p.facility_key for p in eligible_in_network(per_facility, args.payer)})}"
        f" eligible facilities out of {len(all_prices)} published rows\n"
    )
    for position, route in enumerate(ranked, start=1):
        print(f"{position}. [{route.kind}]")
        print(route.summary())
        print()
    print("Ranking:", explain_ranking(routes))

    grouped = eligible_by_facility(
        all_prices, args.payer, args.plan_contains, args.plan
    )
    wide = {
        key: rows for key, rows in grouped.items() if plan_spread(rows) >= 2.0
    }
    if wide and not args.plan_contains:
        print(
            "\nPlan-level caution: these facilities publish rates for this payer "
            "that differ by 2x or more depending on the specific plan, so the "
            "figures above use the median as a placeholder. Pass --plan-contains "
            "to pin a plan:"
        )
        for key, rows in sorted(wide.items()):
            amounts = sorted(r.negotiated_dollar for r in rows)
            print(
                f"  {rows[0].facility_name[:44]:46} "
                f"{money(amounts[0])} to {money(amounts[-1])} "
                f"across {len({r.plan_name for r in rows})} plans"
            )
    print(
        "\nAll figures are estimates from files hospitals and payers publish. "
        "Requirement findings quote the payer's own criteria and describe "
        "documentation, not coverage outcomes."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
