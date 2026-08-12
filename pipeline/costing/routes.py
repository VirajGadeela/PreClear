"""Build and rank the four routes to a scan.

The four routes from CLAUDE.md:

  1. in-network, order as written — the baseline
  2. in-network, cheaper site of service — same coverage, same deductible
     credit, lower cost because negotiated rates vary by facility
  3. in-network, order corrected first — the order does not document a specific
     published payer requirement; output is a checklist for the ordering
     physician
  4. cash at a non-contracted facility — surfaced only when the patient is
     uninsured, on a high-deductible plan unlikely to be met, or the study is
     non-covered

Route 3 reports which published requirements an order does not document as met,
quoting the payer. It does not estimate denial risk. Nothing here suggests a
different procedure or imaging modality; every output is financial or
administrative.
"""

from dataclasses import dataclass, field
from typing import Optional

from pipeline.costing.oop import YearEstimate, estimate_year, money
from pipeline.payers import resolve
from pipeline.plans import classify

IN_NETWORK_AS_WRITTEN = "in_network_as_written"
IN_NETWORK_CHEAPER_SITE = "in_network_cheaper_site"
IN_NETWORK_ORDER_CORRECTED = "in_network_order_corrected"
CASH_NON_CONTRACTED = "cash_non_contracted"

ROUTE_LABELS = {
    IN_NETWORK_AS_WRITTEN: "in-network as ordered",
    IN_NETWORK_CHEAPER_SITE: "in-network at a different facility",
    IN_NETWORK_ORDER_CORRECTED: "in-network with the order corrected first",
    CASH_NON_CONTRACTED: "cash paid directly to the facility",
}


@dataclass(frozen=True)
class FacilityPrice:
    """One facility's price for one CPT code under one payer.

    `negotiated_dollar` is the in-network allowed amount; `cash_price` is the
    hospital's discounted cash price. Both come from the hospital's published
    file, so either may be missing.
    """

    facility_key: str
    facility_name: str
    facility_address: str
    cpt: str
    payer_raw: str
    plan_name: str
    negotiated_dollar: Optional[float] = None
    cash_price: Optional[float] = None
    gross_charge: Optional[float] = None

    @property
    def payer(self):
        # Resolved from payer *and* plan: a plan string is what reveals that an
        # Anthem-branded row is really Medicaid or Medicare managed care.
        return resolve(self.payer_raw, self.plan_name)

    @property
    def plan(self):
        return classify(self.plan_name)


@dataclass(frozen=True)
class Route:
    kind: str
    facility_name: str
    facility_address: str
    allowed_amount: float
    estimate: YearEstimate
    reasoning: str
    unmet_requirements: tuple = ()
    warnings: tuple = ()

    @property
    def total_this_year(self):
        return self.estimate.total_this_year

    def summary(self):
        lines = [
            f"{self.facility_name}: {money(self.estimate.scan.patient_pays)} for this scan",
            f"  Total this year including other expected care: "
            f"{money(self.total_this_year)}",
            f"  Counts toward deductible: "
            f"{'yes' if self.estimate.scan.counts_toward_deductible else 'no'}"
            f" (credit earned {money(self.estimate.deductible_credit_earned)})",
            f"  Why: {self.reasoning}",
        ]
        for warning in self.warnings:
            lines.append(f"  Note: {warning}")
        for requirement in self.unmet_requirements:
            lines.append(f"  Requirement not documented as met: {requirement}")
        return "\n".join(lines)


def _is_suspect(price):
    """Flag rows the hospital files are known to publish badly.

    A negotiated rate above the gross charge comes from percent-of-charge
    methodologies and carve-out rows; a near-zero rate is a carve-out too. These
    are surfaced rather than silently dropped, because dropping them quietly
    would misrepresent how much real coverage the comparison has.
    """
    warnings = []
    if price.negotiated_dollar is None:
        return warnings
    if price.gross_charge and price.negotiated_dollar > price.gross_charge:
        warnings.append(
            "published negotiated rate exceeds this hospital's gross charge, "
            "which usually means a percent-of-charge row rather than a real price"
        )
    # Judge implausibility against this hospital's own charge rather than a flat
    # dollar floor: a $49 row against a $2,486 gross charge is a carve-out, but
    # $49 could be legitimate for a cheap code elsewhere.
    if price.gross_charge and price.negotiated_dollar < 0.05 * price.gross_charge:
        warnings.append(
            "published negotiated rate is under 5% of this hospital's gross "
            "charge, which is characteristic of a carve-out row rather than a "
            "full price for the study"
        )
    return warnings


def is_plausible(price):
    """Whether a row looks like a real full price for the study."""
    return not _is_suspect(price)


def eligible_in_network(prices, payer_canonical):
    """In-network rows for one payer that are safe to compare.

    Excludes catch-all payer buckets, out-of-state Blue affiliates, and
    Medicare/Medicaid lines, none of which a commercial member would pay — and
    service-line carve-outs, because a vein-treatment or behavioural-health fee
    schedule quoted against a knee MRI is not the price for that study.
    """
    eligible = []
    for price in prices:
        if price.negotiated_dollar is None:
            continue
        identity = price.payer
        if not identity.usable_for_commercial_routing:
            continue
        if identity.canonical != payer_canonical:
            continue
        if price.plan.is_carve_out:
            continue
        eligible.append(price)
    return eligible


def build_routes(
    prices,
    payer_canonical,
    benefits,
    ordered_facility_key=None,
    expected_other_allowed_spend=0.0,
    unmet_requirements=(),
    cash_is_appropriate=False,
):
    """Build every route the data supports. Ranking is a separate step."""
    routes = []
    eligible = eligible_in_network(prices, payer_canonical)

    def year(amount, counts):
        return estimate_year(
            amount,
            benefits,
            counts_toward_deductible=counts,
            expected_other_allowed_spend=expected_other_allowed_spend,
        )

    baseline = None
    if eligible:
        if ordered_facility_key:
            matches = [p for p in eligible if p.facility_key == ordered_facility_key]
            baseline = min(matches, key=lambda p: p.negotiated_dollar, default=None)
        if baseline is None:
            # No facility was named in the order, so the highest-priced eligible
            # facility is not a fair stand-in and neither is the lowest. Use the
            # median so the baseline reflects a typical order.
            ordered = sorted(eligible, key=lambda p: p.negotiated_dollar)
            baseline = ordered[len(ordered) // 2]

    if baseline is not None:
        routes.append(
            Route(
                kind=IN_NETWORK_AS_WRITTEN,
                facility_name=baseline.facility_name,
                facility_address=baseline.facility_address,
                allowed_amount=baseline.negotiated_dollar,
                estimate=year(baseline.negotiated_dollar, True),
                reasoning="In-network at the facility as ordered. Negotiated rate "
                f"{money(baseline.negotiated_dollar)} under {baseline.payer.label}.",
                warnings=tuple(_is_suspect(baseline)),
            )
        )

        cheapest = min(eligible, key=lambda p: p.negotiated_dollar)
        saving = baseline.negotiated_dollar - cheapest.negotiated_dollar
        # Offering a "cheaper site" that costs the same is noise dressed as
        # advice. A cent of difference is not a reason to send someone
        # elsewhere either, so require a saving worth acting on.
        if cheapest.facility_key != baseline.facility_key and saving >= 1.0:
            routes.append(
                Route(
                    kind=IN_NETWORK_CHEAPER_SITE,
                    facility_name=cheapest.facility_name,
                    facility_address=cheapest.facility_address,
                    allowed_amount=cheapest.negotiated_dollar,
                    estimate=year(cheapest.negotiated_dollar, True),
                    reasoning="Same coverage and the same deductible credit at a "
                    f"different in-network facility. Its negotiated rate is "
                    f"{money(cheapest.negotiated_dollar)}, "
                    f"{money(saving)} below the facility as ordered.",
                    warnings=tuple(_is_suspect(cheapest)),
                )
            )

        if unmet_requirements:
            routes.append(
                Route(
                    kind=IN_NETWORK_ORDER_CORRECTED,
                    facility_name=baseline.facility_name,
                    facility_address=baseline.facility_address,
                    allowed_amount=baseline.negotiated_dollar,
                    estimate=year(baseline.negotiated_dollar, True),
                    reasoning="Same facility and the same estimated cost, but the "
                    "order does not document requirements this payer publishes. "
                    "The checklist below is for the ordering physician.",
                    unmet_requirements=tuple(unmet_requirements),
                    warnings=tuple(_is_suspect(baseline)),
                )
            )

    if cash_is_appropriate:
        cash_options = [p for p in prices if p.cash_price is not None]
        if cash_options:
            cheapest_cash = min(cash_options, key=lambda p: p.cash_price)
            routes.append(
                Route(
                    kind=CASH_NON_CONTRACTED,
                    facility_name=cheapest_cash.facility_name,
                    facility_address=cheapest_cash.facility_address,
                    allowed_amount=cheapest_cash.cash_price,
                    estimate=year(cheapest_cash.cash_price, False),
                    reasoning="Discounted cash price paid directly to the facility. "
                    "This payment earns no deductible credit, so it does not "
                    "reduce what later care costs this year.",
                )
            )
    return routes


def rank_routes(routes):
    """Cheapest total for the year first.

    Ranking on the scan alone would favour cash whenever its sticker price is
    lower, which is the mistake this project exists to correct. Ties break toward
    the route that earns deductible credit, since that credit retains value
    against care the patient has not predicted.
    """
    return sorted(
        routes,
        key=lambda route: (
            round(route.total_this_year, 2),
            0 if route.estimate.scan.counts_toward_deductible else 1,
            route.facility_name,
        ),
    )


def explain_ranking(routes):
    """A short account of why the winner won, for the UI's reasoning panel."""
    ranked = rank_routes(routes)
    if not ranked:
        return "No routes could be built from the available published prices."
    best = ranked[0]

    def describe(route):
        # Two routes can share a facility, so the route kind has to appear or the
        # explanation reads as though one option were listed twice.
        return f"{route.facility_name} ({ROUTE_LABELS.get(route.kind, route.kind)})"

    lines = [f"Lowest estimated total for this year: {describe(best)}."]
    for route in ranked[1:]:
        difference = route.total_this_year - best.total_this_year
        if abs(difference) < 0.01:
            lines.append(f"{describe(route)} is an equivalent estimated total.")
            continue
        note = f"{describe(route)} is {money(difference)} more over the year"
        if (
            not route.estimate.scan.counts_toward_deductible
            and route.estimate.scan.patient_pays < best.estimate.scan.patient_pays
        ):
            note += (
                ", even though the scan itself costs less, because paying cash "
                "earns no deductible credit"
            )
        lines.append(note + ".")
    return " ".join(lines)
