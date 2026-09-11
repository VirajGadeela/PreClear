"""Choose how a household pays for several planned procedures in one year.

`oop.py` answers "what does this one scan cost me this year". This answers the
question a household actually has: *we know about three scans; which of them do
we run through insurance and which do we pay cash for?* They share one
deductible, so the answer for any one of them depends on the others.

Three things were established before this module was written, and each one
removes a feature somebody will otherwise try to add.

**Order does not matter.** The year total is

    min(D, A) + c * max(0, A - D)   capped at M

where A is the *sum* of everything billed through insurance. A sum has no
order, so scheduling the expensive scan first cannot save a cent.
`test_total_is_order_independent` permutes a three-procedure plan and asserts
one distinct total, which is the durable record of why there is no sequencer
here.

**The decision is cash-versus-insured, per procedure.** That is where the money
is, because a cash payment buys care without buying any deductible progress —
the same asymmetry `oop.py` exists to model, now with several procedures
competing for one deductible. On real published UnitedHealthcare rates, a
household with $2,000 of deductible left should pay cash for all three scans if
it expects $1,000 of other care, and run all three through insurance if it
expects $2,000. Each scan considered alone says "pay cash" in both cases.

**The answer is nearly always a corner.** A 7,905-point sweep over deductible,
other care and coinsurance found a mixed plan optimal 11.8% of the time and
never winning by more than $5.79. So the exhaustive search below is insurance
against being wrong rather than a source of clever answers, and what a member
is told stays one sentence: fund the deductible, or don't.

Members are household roles — "Adult 1", "Child 2" — never names, matching
`data/samples/household_eobs.json`. See CLAUDE.md hard rule 1.
"""

from dataclasses import dataclass
from itertools import product
from typing import Optional

from .oop import PlanBenefits, estimate_payment

# 2**8 = 256 evaluations of ten lines of arithmetic, which is free. The cap is
# here to fail loudly on a pathological input rather than to bound a realistic
# household; nobody plans nine imaging studies in a year.
MAX_PROCEDURES = 8


@dataclass(frozen=True)
class PlannedProcedure:
    """One scan a household knows is coming, priced both ways.

    `insured_allowed` is the cheapest plausible in-network rate, and taking the
    cheapest is provably right rather than merely reasonable: the year total is
    nondecreasing in the summed insured allowed amount, so no facility search
    can beat picking the smallest one. See `representativeRate` in
    app/src/routes.ts for how a facility's single rate is chosen.

    `cash_price` is None where no facility publishes one, and such a procedure
    can only ever be run through insurance.
    """

    id: str
    cpt: str
    member: str
    insured_allowed: float
    insured_facility: str
    cash_price: Optional[float] = None
    cash_facility: Optional[str] = None


@dataclass(frozen=True)
class ProcedureDecision:
    """How one procedure is paid for, under one plan.

    There is deliberately no dollar figure for an insured procedure. The total
    is order-independent but the *attribution* is not: whichever insured
    procedure is evaluated first absorbs the deductible and looks expensive,
    and the one after it looks cheap. Printing that split would invent a
    ranking between two scans that the arithmetic does not support. A cash
    procedure carries its figure because a cash price is what it is regardless
    of what else the household does.
    """

    procedure: PlannedProcedure
    pay_cash: bool
    facility: str
    cash_paid: Optional[float]


@dataclass(frozen=True)
class YearPlan:
    """What one way of paying for the whole list costs."""

    decisions: tuple
    # What the planned procedures cost between them.
    procedures_cost: float
    # What the rest of the year's care costs, given what the procedures left.
    other_care_cost: float
    total_this_year: float
    deductible_remaining_after: float

    @property
    def cash_count(self):
        return sum(1 for decision in self.decisions if decision.pay_cash)


def evaluate_year_plan(
    procedures,
    pay_cash,
    benefits,
    expected_other_allowed_spend=0.0,
):
    """Cost one specific choice of cash-versus-insured across the list.

    The benefit position is threaded from each payment into the next, exactly
    as `estimate_year` threads the scan into the rest of the year — this is
    that same chain extended from two payments to N + 1.

    `expected_other_allowed_spend` is care *not* itemised in `procedures`.
    Counting a planned scan there as well as here would charge it twice.
    """
    if len(procedures) != len(pay_cash):
        raise ValueError(
            f"got {len(procedures)} procedures and {len(pay_cash)} decisions"
        )
    if expected_other_allowed_spend < 0:
        raise ValueError("expected_other_allowed_spend cannot be negative")

    decisions = []
    procedures_cost = 0.0
    position = benefits

    for procedure, cash in zip(procedures, pay_cash):
        if cash:
            if procedure.cash_price is None:
                raise ValueError(
                    f"{procedure.id} has no published cash price and cannot be "
                    "paid cash"
                )
            amount = procedure.cash_price
            facility = procedure.cash_facility or procedure.insured_facility
        else:
            amount = procedure.insured_allowed
            facility = procedure.insured_facility

        payment = estimate_payment(amount, position, counts_toward_deductible=not cash)
        procedures_cost += payment.patient_pays
        position = payment.benefits_after
        decisions.append(
            ProcedureDecision(
                procedure=procedure,
                pay_cash=cash,
                facility=facility,
                cash_paid=round(payment.patient_pays, 2) if cash else None,
            )
        )

    # The rest of the year runs through insurance however the scans were paid
    # for. This is the payment the deductible credit is bought for.
    other = estimate_payment(expected_other_allowed_spend, position)

    return YearPlan(
        decisions=tuple(decisions),
        procedures_cost=round(procedures_cost, 2),
        other_care_cost=round(other.patient_pays, 2),
        total_this_year=round(procedures_cost + other.patient_pays, 2),
        deductible_remaining_after=round(other.benefits_after.deductible_remaining, 2),
    )


@dataclass(frozen=True)
class YearPlanComparison:
    """The best plan, against the two a household would otherwise pick."""

    best: YearPlan
    all_cash: YearPlan
    all_insured: YearPlan

    @property
    def alternative(self):
        """The costlier of the two obvious approaches — what `best` avoids."""
        return max(
            (self.all_cash, self.all_insured), key=lambda plan: plan.total_this_year
        )

    @property
    def saving(self):
        """What the recommended plan saves against that alternative."""
        return round(
            self.alternative.total_this_year - self.best.total_this_year, 2
        )


def _cashable(procedures):
    """Paying cash is only an option where a facility publishes a cash price."""
    return [procedure.cash_price is not None for procedure in procedures]


def optimize_year_plan(procedures, benefits, expected_other_allowed_spend=0.0):
    """The cheapest way to pay for the list, found exhaustively.

    Every assignment of cash-or-insured is tried. That is 2**N, and N is capped
    at `MAX_PROCEDURES`, so the search is exact and there is no heuristic to be
    subtly wrong. Procedures with no published cash price are held to insurance
    rather than being dropped.

    Ties break on (total, how many are paid cash, then the bit pattern), so the
    same input always returns the same plan — the app mirrors this function and
    a nondeterministic tie would fail parity intermittently, which is the worst
    way for it to fail.

    `cashIsWorthOffering` in app/src/routes.ts is deliberately not consulted.
    That gate keeps the single-scan comparison from volunteering cash to
    somebody who will clear their deductible anyway; here both corners are
    costed outright and compared, which answers the same question with more
    information rather than less. Do not "reconcile" the two.
    """
    if len(procedures) > MAX_PROCEDURES:
        raise ValueError(
            f"{len(procedures)} procedures exceeds the {MAX_PROCEDURES} this "
            "search is bounded to"
        )

    allowed = _cashable(procedures)
    all_insured = evaluate_year_plan(
        procedures, [False] * len(procedures), benefits, expected_other_allowed_spend
    )
    # "All cash" means cash wherever it is published — a procedure nobody
    # prices for cash cannot be part of any plan, best or naive.
    all_cash = evaluate_year_plan(
        procedures, list(allowed), benefits, expected_other_allowed_spend
    )

    candidates = []
    for index, mask in enumerate(product([False, True], repeat=len(procedures))):
        if any(cash and not ok for cash, ok in zip(mask, allowed)):
            continue
        plan = evaluate_year_plan(
            procedures, list(mask), benefits, expected_other_allowed_spend
        )
        candidates.append((plan.total_this_year, plan.cash_count, index, plan))

    best = min(candidates)[3]
    return YearPlanComparison(best=best, all_cash=all_cash, all_insured=all_insured)
