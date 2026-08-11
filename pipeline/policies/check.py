"""Check an imaging order against the requirements its payer publishes.

This reports which published requirements an order does not yet document as
satisfied, and cites each one. It does not estimate denial risk, score an order,
or comment on clinical appropriateness, and it never suggests a different
procedure or imaging modality — output is administrative only.
"""

from dataclasses import dataclass

from pipeline.policies.rules import REQUIREMENTS, ImagingOrder, Requirement, Status


@dataclass(frozen=True)
class Finding:
    requirement: Requirement
    status: Status

    def as_checklist_line(self):
        """One line an ordering physician's office could act on."""
        citation = self.requirement.citation
        if self.status is Status.NOT_DOCUMENTED:
            lead = "Not documented in the order"
        else:
            lead = "Documented as not met"
        hedge = ""
        if self.requirement.alternative_pathway:
            hedge = (
                " This is one of several alternative criteria; another listed "
                "criterion may apply instead."
            )
        return (
            f"{lead}: {self.requirement.summary}{hedge}\n"
            f'  Payer requirement: "{self.requirement.quote}"\n'
            f"  Source: {citation.payer} — {citation.document_title}\n"
            f"  Section {citation.section_id}, {citation.version}, "
            f"effective {citation.effective_date}\n"
            f"  {citation.source_url}"
        )


def requirements_for(order, requirements=REQUIREMENTS):
    """Requirements that apply to this order's payer, CPT code and indication."""
    payer = order.payer.strip().lower()
    return [
        requirement
        for requirement in requirements
        if order.cpt in requirement.cpt_codes
        and requirement.indication == order.indication
        # Match on the payer named in the citation, so a requirement published
        # by a delegate is still attributed to the payer that adopted it.
        and requirement.citation.payer.strip().lower().startswith(payer)
    ]


def check_order(order, requirements=REQUIREMENTS):
    """Every applicable requirement paired with its status."""
    return [
        Finding(requirement, requirement.evaluate(order))
        for requirement in requirements_for(order, requirements)
    ]


def unmet(order, requirements=REQUIREMENTS):
    """Only the requirements that are unmet or undocumented."""
    return [
        finding
        for finding in check_order(order, requirements)
        if finding.status in (Status.UNMET, Status.NOT_DOCUMENTED)
    ]


def checklist(order, requirements=REQUIREMENTS):
    """A citable checklist for the ordering physician, or a clean-pass note."""
    findings = unmet(order, requirements)
    if not findings:
        applicable = requirements_for(order, requirements)
        if not applicable:
            return (
                f"No requirements recorded for {order.payer} at CPT {order.cpt} "
                f"with indication '{order.indication}'. This means the rule set "
                f"does not cover it, not that the order has no requirements."
            )
        return (
            f"All {len(applicable)} recorded requirement(s) for {order.payer} at "
            f"CPT {order.cpt} are documented as met."
        )
    lines = [finding.as_checklist_line() for finding in findings]
    return "\n\n".join(lines)
