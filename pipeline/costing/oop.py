"""Estimate what a patient pays out of pocket for one imaging route.

This is the part of Preclear that no consumer tool does, and the reason is one
asymmetry: an insured payment buys down the deductible, and a cash payment does
not. So the cheaper payment today can be the more expensive decision for the
year.

Comparing routes on the price of the scan alone cannot see that. What makes the
comparison honest is carrying the *state of the benefit year* through the
calculation: pay $992 insured and the next claim starts $992 further along; pay
$574 cash and the next claim starts exactly where it did before. Whether that
trade is worth it depends on how much other care the patient expects, so that
expectation is an explicit input rather than a hidden assumption.

Every figure produced here is an estimate. Negotiated rates come from files
hospitals publish for compliance, they carry percent-of-charge artifacts and
stale rows, and the benefit inputs are user-reported. Callers must label figures
as estimates in the UI string itself — see the hard rules in CLAUDE.md.
"""

from dataclasses import dataclass, replace


@dataclass(frozen=True)
class PlanBenefits:
    """A patient's remaining benefit position. User-reported for Shipaton.

    coinsurance_rate is the patient's share after the deductible: 0.2 means the
    plan pays 80%.
    """

    deductible_remaining: float
    coinsurance_rate: float
    oop_max_remaining: float
    # A flat per-visit amount some plans charge instead of coinsurance.
    copay: float = 0.0

    def __post_init__(self):
        if not 0.0 <= self.coinsurance_rate <= 1.0:
            raise ValueError(f"coinsurance_rate out of range: {self.coinsurance_rate}")
        for field in ("deductible_remaining", "oop_max_remaining", "copay"):
            if getattr(self, field) < 0:
                raise ValueError(f"{field} cannot be negative")


@dataclass(frozen=True)
class CostEstimate:
    """What one payment costs, and what it buys toward the year."""

    allowed_amount: float
    patient_pays: float
    applied_to_deductible: float
    coinsurance_paid: float
    copay_paid: float
    # How much of patient_pays was cut off by the out-of-pocket maximum.
    shielded_by_oop_max: float
    counts_toward_deductible: bool
    benefits_after: PlanBenefits


def estimate_payment(allowed_amount, benefits, counts_toward_deductible=True):
    """Estimate one payment and return the benefit position it leaves behind.

    A cash payment at a non-contracted facility earns no credit: the patient
    pays the full price and the benefit year is untouched. That is the whole
    asymmetry, and it lives in this branch.
    """
    if allowed_amount < 0:
        raise ValueError("allowed_amount cannot be negative")

    if not counts_toward_deductible:
        return CostEstimate(
            allowed_amount=allowed_amount,
            patient_pays=allowed_amount,
            applied_to_deductible=0.0,
            coinsurance_paid=0.0,
            copay_paid=0.0,
            shielded_by_oop_max=0.0,
            counts_toward_deductible=False,
            benefits_after=benefits,
        )

    to_deductible = min(allowed_amount, benefits.deductible_remaining)
    after_deductible = allowed_amount - to_deductible

    copay = min(benefits.copay, allowed_amount)
    coinsurance = after_deductible * benefits.coinsurance_rate

    uncapped = to_deductible + coinsurance + copay
    patient_pays = min(uncapped, benefits.oop_max_remaining)
    shielded = uncapped - patient_pays

    # The deductible only absorbs what the patient actually paid toward it.
    credited_to_deductible = min(to_deductible, patient_pays)

    benefits_after = replace(
        benefits,
        deductible_remaining=benefits.deductible_remaining - credited_to_deductible,
        oop_max_remaining=benefits.oop_max_remaining - patient_pays,
    )
    return CostEstimate(
        allowed_amount=allowed_amount,
        patient_pays=patient_pays,
        applied_to_deductible=credited_to_deductible,
        coinsurance_paid=coinsurance,
        copay_paid=copay,
        shielded_by_oop_max=shielded,
        counts_toward_deductible=True,
        benefits_after=benefits_after,
    )


@dataclass(frozen=True)
class YearEstimate:
    """The scan plus the other care expected this year, under one route."""

    scan: CostEstimate
    expected_other_care_cost: float
    total_this_year: float

    @property
    def deductible_credit_earned(self):
        return self.scan.applied_to_deductible


def estimate_year(
    allowed_amount,
    benefits,
    counts_toward_deductible=True,
    expected_other_allowed_spend=0.0,
):
    """Estimate the scan and its knock-on effect on the rest of the year.

    `expected_other_allowed_spend` is the allowed amount of *other* care the
    patient expects before the plan year resets. It is what decides whether a
    deductible credit is worth anything:

      - at 0, nothing else will use the credit, and the cheapest payment wins
      - when it is large, the insured route's credit reduces the later bills,
        and paying more today can cost less over the year

    Setting it to 0 is not neutral — it is the assumption that no further care
    happens, which is why it is a named argument rather than a default buried in
    the comparison.
    """
    if expected_other_allowed_spend < 0:
        raise ValueError("expected_other_allowed_spend cannot be negative")

    scan = estimate_payment(allowed_amount, benefits, counts_toward_deductible)
    # Other care runs through insurance regardless of how the scan was paid for.
    other = estimate_payment(
        expected_other_allowed_spend, scan.benefits_after, counts_toward_deductible=True
    )
    return YearEstimate(
        scan=scan,
        expected_other_care_cost=other.patient_pays,
        total_this_year=scan.patient_pays + other.patient_pays,
    )


def money(amount):
    """Format a figure for display, always marked as an estimate.

    CLAUDE.md requires the word "estimate" in the string itself, not as a
    footnote, and forbids "guaranteed", "approved" or "you will pay".
    """
    return f"${amount:,.2f} (estimate)"
