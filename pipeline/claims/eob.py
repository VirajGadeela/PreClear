"""Check explanations of benefit for discrepancies the EOB itself demonstrates.

This is the paid tier: imaging happens every few years, claims arrive all year,
so this is what makes Preclear a subscription rather than a one-time tool.

The discipline here is the same one `pipeline/policies/` follows, and it is the
whole reason this is defensible. Every finding is either **arithmetic that does
not reconcile against the EOB's own numbers**, or **a fact the document states
about itself**. Nothing here predicts whether an appeal will succeed, scores a
claim, guesses at payer behaviour, or offers an opinion about care. A finding
means "these published numbers disagree", never "your insurer is wrong" and
never "you will get this money back".

That distinction is not pedantry. "Your plan applied $400 to a deductible that
had $150 left" is checkable by anyone with the same document. "This denial will
be overturned" is a prediction, and this file must never make one.

No real patient data, ever — see CLAUDE.md hard rule 1. The fixtures in
`data/samples/` are synthetic and are the only claims this repo has ever seen.
"""

from dataclasses import dataclass
from typing import Optional

# EOBs round to cents, and plans differ on how they round coinsurance. Anything
# under a cent is noise rather than a discrepancy worth a member's attention.
TOLERANCE = 0.01


@dataclass(frozen=True)
class Eob:
    """One line of one explanation of benefits. Synthetic only.

    `member` is a household label such as "Adult 1", never a name. This module
    is written so that it never needs an identity to do its job.
    """

    claim_id: str
    member: str
    service_date: str
    provider: str
    code: str
    description: str
    billed: float
    allowed: float
    plan_paid: float
    patient_responsibility: float
    deductible_applied: float = 0.0
    coinsurance: float = 0.0
    copay: float = 0.0
    network: str = "in_network"
    denial_code: str = ""
    denial_reason: str = ""


@dataclass(frozen=True)
class HouseholdPlan:
    """The benefit limits the year is measured against. User-reported."""

    deductible: float
    oop_max: float


@dataclass(frozen=True)
class Finding:
    kind: str
    claim_id: str
    member: str
    summary: str
    # What the member could be owed if the discrepancy resolves their way. None
    # when the finding is real but its value cannot be computed from the EOB.
    amount: Optional[float]
    # What to do about it, in the member's words. Administrative only.
    action: str


def _over(value, limit):
    return value - limit > TOLERANCE


def patient_owes_more_than_allowed(eob):
    """In-network, the member cannot be charged past the contracted rate.

    The provider agreed to the allowed amount, so anything above
    allowed - plan_paid is balance billing, which in-network contracts forbid.
    Out-of-network providers have no such agreement, so this cannot apply.
    """
    if eob.network != "in_network":
        return None
    ceiling = eob.allowed - eob.plan_paid
    if not _over(eob.patient_responsibility, ceiling):
        return None
    return Finding(
        kind="balance_billed_in_network",
        claim_id=eob.claim_id,
        member=eob.member,
        summary=(
            f"Billed ${eob.patient_responsibility:,.2f} where the in-network "
            f"contract leaves ${max(ceiling, 0):,.2f}."
        ),
        amount=round(eob.patient_responsibility - ceiling, 2),
        action=(
            "Ask the provider's billing office to reprocess against the "
            "contracted rate on this EOB."
        ),
    )


def components_do_not_sum(eob):
    """Deductible + coinsurance + copay should equal what the member owes.

    When it does not, one of the four numbers on the member's own EOB is wrong,
    and which one is a question for the payer rather than for this code.
    """
    parts = eob.deductible_applied + eob.coinsurance + eob.copay
    if abs(parts - eob.patient_responsibility) <= TOLERANCE:
        return None
    return Finding(
        kind="components_do_not_sum",
        claim_id=eob.claim_id,
        member=eob.member,
        summary=(
            f"Deductible, coinsurance and copay total ${parts:,.2f}, but the "
            f"amount owed reads ${eob.patient_responsibility:,.2f}."
        ),
        amount=round(abs(eob.patient_responsibility - parts), 2),
        action="Ask the plan which of the two figures on this EOB is correct.",
    )


def denial_carries_appeal_rights(eob):
    """A denied claim is reported as denied, with the right that attaches to it.

    Non-grandfathered plans must offer an internal appeal and an independent
    external review of an adverse benefit determination. That right exists
    regardless of the merits, which is precisely why stating it is safe and
    predicting an outcome would not be.
    """
    if not eob.denial_code:
        return None
    return Finding(
        kind="denial_with_appeal_right",
        claim_id=eob.claim_id,
        member=eob.member,
        summary=(
            f"Denied as {eob.denial_code}"
            + (f" — {eob.denial_reason}." if eob.denial_reason else ".")
        ),
        amount=None,
        action=(
            "This denial can be appealed to the plan, and then to an "
            "independent external reviewer. Ask the plan for the deadline."
        ),
    )


PER_CLAIM_CHECKS = (
    patient_owes_more_than_allowed,
    components_do_not_sum,
    denial_carries_appeal_rights,
)


def duplicate_claims(eobs):
    """The same service billed twice.

    Matched on member, date, provider and code together. Any one of those alone
    repeats legitimately — a member has many claims, a provider bills many
    members — so only the combination is evidence.
    """
    seen = {}
    findings = []
    for eob in eobs:
        key = (eob.member, eob.service_date, eob.provider, eob.code)
        if key in seen:
            findings.append(
                Finding(
                    kind="duplicate_claim",
                    claim_id=eob.claim_id,
                    member=eob.member,
                    summary=(
                        f"Same service as claim {seen[key]}: {eob.description} "
                        f"at {eob.provider} on {eob.service_date}."
                    ),
                    amount=round(eob.patient_responsibility, 2),
                    action="Ask the plan to void the duplicate claim.",
                )
            )
        else:
            seen[key] = eob.claim_id
    return findings


def deductible_over_applied(eobs, plan):
    """More applied to the deductible across the year than the plan has.

    Ordered by service date, so the finding names the claim that crossed the
    line rather than whichever happened to be last in the file.
    """
    if plan.deductible <= 0:
        return []
    running = 0.0
    findings = []
    for eob in sorted(eobs, key=lambda item: item.service_date):
        running += eob.deductible_applied
        if _over(running, plan.deductible):
            excess = round(running - plan.deductible, 2)
            findings.append(
                Finding(
                    kind="deductible_over_applied",
                    claim_id=eob.claim_id,
                    member=eob.member,
                    summary=(
                        f"${running:,.2f} applied to a ${plan.deductible:,.2f} "
                        f"deductible across the household this year."
                    ),
                    amount=excess,
                    action="Ask the plan to reprocess claims after the deductible was met.",
                )
            )
            break
    return findings


def charged_past_oop_max(eobs, plan):
    """Cost sharing after the out-of-pocket maximum is reached.

    Once the maximum is met the plan owes 100% of covered, in-network care, so
    anything charged beyond it is cost sharing the member does not owe.
    """
    if plan.oop_max <= 0:
        return []
    running = 0.0
    for eob in sorted(eobs, key=lambda item: item.service_date):
        running += eob.patient_responsibility
        if _over(running, plan.oop_max):
            return [
                Finding(
                    kind="charged_past_oop_max",
                    claim_id=eob.claim_id,
                    member=eob.member,
                    summary=(
                        f"${running:,.2f} charged against a ${plan.oop_max:,.2f} "
                        f"out-of-pocket maximum."
                    ),
                    amount=round(running - plan.oop_max, 2),
                    action="Ask the plan to reprocess care received after the maximum was met.",
                )
            ]
    return []


def review(eobs, plan):
    """Every finding across a household's claims, worst first.

    Ordered by recoverable amount because that is the order a member would work
    through them. Findings with no computable amount sort last; they are real
    but there is nothing to weigh them by.
    """
    findings = []
    for eob in eobs:
        for check in PER_CLAIM_CHECKS:
            finding = check(eob)
            if finding is not None:
                findings.append(finding)
    findings.extend(duplicate_claims(eobs))
    findings.extend(deductible_over_applied(eobs, plan))
    findings.extend(charged_past_oop_max(eobs, plan))
    return sorted(findings, key=lambda f: (f.amount is None, -(f.amount or 0)))


def total_at_stake(findings):
    """What the findings add up to. An upper bound, not an expectation.

    Counts each claim once, at its largest finding, because two checks can catch
    the same discrepancy from different directions — an in-network balance bill
    almost always fails the components check too. Summing every finding would
    report a member is owed twice what one claim can return, and overstating
    that number is precisely the kind of dishonesty this product exists to
    correct. One claim can only be overcharged by one amount.
    """
    largest = {}
    for finding in findings:
        if finding.amount is None:
            continue
        largest[finding.claim_id] = max(
            largest.get(finding.claim_id, 0.0), finding.amount
        )
    return round(sum(largest.values()), 2)
