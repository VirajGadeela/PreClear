"""Published payer requirements for advanced imaging orders, as structured data.

What this is: a verbatim record of criteria the payers publish themselves, each
carrying the document, section identifier, version, effective date and source
URL it came from, so any statement about an order can be traced back to the
payer's own words.

What this is not: this does not estimate, score or predict whether a payer will
deny a claim. It reports which published requirements an order does not yet
document as satisfied, and cites the requirement. Nothing here models payer
behaviour, and nothing here recommends clinical care or an alternative study.

A modelling caveat that matters for honesty: payers list criteria as
alternatives ("any of the following"). An order that fails one listed pathway
may satisfy a different one, so a requirement reported as unmet means "this
pathway is not documented as met", never "this order does not qualify". The
`alternative_pathway` flag records which requirements work that way.

Sources were retrieved 2026-08-11. Payers revise these documents on published
review cycles — re-check `effective_date` and `next_review` before relying on
any rule, and never edit a `quote` field to paraphrase.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Optional


class Status(Enum):
    """Outcome of checking one requirement against one order."""

    MET = "met"
    UNMET = "unmet"
    # The order did not carry the fact needed to judge. Distinct from UNMET:
    # missing documentation is not the same as a failed criterion.
    NOT_DOCUMENTED = "not_documented"
    NOT_APPLICABLE = "not_applicable"


# Red Flag Indications, eviCore Spine Imaging Guidelines SP-1.2
# (SP.GG.0001.2.A, v1.0.2026). Their presence removes the conservative-therapy
# waiting period rather than adding a requirement.
EVICORE_RED_FLAGS = (
    "motor_weakness",
    "aortic_aneurysm_or_dissection",
    "cancer",
    "cauda_equina_syndrome",
    "fracture",
    "infection",
    "severe_radicular_pain",
)

# Physical exam findings of meniscal tear, Carelon Imaging of the Extremities.
MENISCAL_EXAM_FINDINGS = (
    "joint_swelling_or_effusion",
    "positive_mcmurray_or_apley",
    "joint_line_tenderness",
    "reduced_range_of_motion",
)


@dataclass(frozen=True)
class Citation:
    """Everything needed to find the exact language again."""

    payer: str
    # Payers delegate advanced imaging review. The document that governs a
    # member is often published by the delegate, not the payer.
    reviewed_by: str
    document_title: str
    section_id: str
    version: str
    effective_date: str
    source_url: str
    retrieved_on: str = "2026-08-11"
    next_review: str = ""


@dataclass(frozen=True)
class ImagingOrder:
    """A synthetic imaging order. No real patient data, ever — see CLAUDE.md.

    Every clinical field is Optional so that "not recorded" stays
    distinguishable from "recorded as absent".
    """

    cpt: str
    payer: str
    indication: str
    conservative_therapy_weeks: Optional[float] = None
    # "nondiagnostic", "diagnostic", or None when no radiographs are recorded.
    prior_radiographs: Optional[str] = None
    in_person_evaluation_this_episode: Optional[bool] = None
    reevaluation_after_treatment: Optional[bool] = None
    mechanical_symptoms: Optional[bool] = None
    meniscal_exam_findings: tuple = ()
    positive_ligament_stress_tests: tuple = ()
    radiculopathy_objective_findings: Optional[bool] = None
    red_flags: tuple = ()


@dataclass(frozen=True)
class Requirement:
    key: str
    cpt_codes: tuple
    indication: str
    summary: str
    quote: str
    citation: Citation
    evaluate: Callable[[ImagingOrder], Status]
    alternative_pathway: bool = False
    note: str = ""


def _weeks_at_least(order, threshold):
    if order.conservative_therapy_weeks is None:
        return Status.NOT_DOCUMENTED
    return Status.MET if order.conservative_therapy_weeks >= threshold else Status.UNMET


def _flag(value):
    if value is None:
        return Status.NOT_DOCUMENTED
    return Status.MET if value else Status.UNMET


# --------------------------------------------------------------------------
# Anthem, reviewed by Carelon Medical Benefits Management
# --------------------------------------------------------------------------

CARELON_EXTREMITIES = Citation(
    payer="Anthem Blue Cross and Blue Shield",
    reviewed_by="Carelon Medical Benefits Management",
    document_title="Clinical Appropriateness Guidelines: Imaging of the Extremities",
    section_id="Imaging of the Extremities — Knee",
    version="2025-11-15",
    effective_date="2025-11-15",
    source_url="https://guidelines.carelonmedicalbenefitsmanagement.com/imaging-of-the-extremities-2025-11-15/",
)


def _carelon_radiographs(order):
    if order.prior_radiographs is None:
        return Status.NOT_DOCUMENTED
    return Status.MET if order.prior_radiographs == "nondiagnostic" else Status.UNMET


def _carelon_meniscal_pathway(order):
    """Either scenario in the guideline satisfies this; check both."""
    findings = len(order.meniscal_exam_findings)
    if order.mechanical_symptoms and findings >= 2:
        return Status.MET
    if findings >= 1:
        weeks = _weeks_at_least(order, 6)
        if weeks is Status.MET:
            return Status.MET
        return weeks
    if order.mechanical_symptoms is None and not findings:
        return Status.NOT_DOCUMENTED
    return Status.UNMET


def _carelon_ligament_pathway(order):
    if order.positive_ligament_stress_tests:
        return Status.MET
    return _weeks_at_least(order, 4)


# --------------------------------------------------------------------------
# Cigna, reviewed by eviCore by EVERNORTH
# --------------------------------------------------------------------------

EVICORE_LUMBAR = Citation(
    payer="Cigna Healthcare",
    reviewed_by="eviCore by EVERNORTH",
    document_title=(
        "Cigna Medical Coverage Policies - Radiology: Spine Imaging Guidelines, "
        "Low Back (Lumbar Spine) Pain without Neurological Features (SP-5.1)"
    ),
    section_id="SP.LB.0005.1.A",
    version="v1.0.2026",
    effective_date="2026-02-03",
    source_url=(
        "https://www.evicore.com/sites/default/files/clinical-guidelines/2025-10/"
        "Cigna_Spine%20Imaging%20Guidelines_V1.0.2026_eff02.03.2026_PUB10.29.2025.pdf"
    ),
)


def _evicore_conservative(order):
    # The guideline waives the waiting period, not the whole pathway, when a
    # red flag is present.
    if order.red_flags:
        return Status.NOT_APPLICABLE
    return _weeks_at_least(order, 6)


# --------------------------------------------------------------------------
# Aetna, self-published Clinical Policy Bulletin
# --------------------------------------------------------------------------

AETNA_SPINE = Citation(
    payer="Aetna",
    reviewed_by="Aetna (self-published)",
    document_title=(
        "Clinical Policy Bulletin 0236: Magnetic Resonance Imaging (MRI) and "
        "Computed Tomography (CT) of the Spine"
    ),
    section_id="CPB 0236 — Medical Necessity",
    version="Last Review 2026-04-09",
    effective_date="1998-05-06",
    next_review="2027-02-25",
    source_url="https://www.aetna.com/cpb/medical/data/200_299/0236.html",
)


def _aetna_radiculopathy(order):
    findings = _flag(order.radiculopathy_objective_findings)
    if findings is not Status.MET:
        return findings
    return _weeks_at_least(order, 6)


REQUIREMENTS = (
    Requirement(
        key="carelon-knee-nondiagnostic-radiographs",
        cpt_codes=("73721",),
        indication="meniscal_tear",
        summary="Radiographs must have been obtained and be nondiagnostic before "
        "advanced imaging of the knee.",
        quote="Advanced imaging is considered medically necessary following "
        "nondiagnostic radiographs",
        citation=CARELON_EXTREMITIES,
        evaluate=_carelon_radiographs,
    ),
    Requirement(
        key="carelon-knee-meniscal-pathway",
        cpt_codes=("73721",),
        indication="meniscal_tear",
        summary="Either mechanical symptoms with at least two meniscal exam "
        "findings, or at least one exam finding with 6 weeks of failed "
        "conservative management.",
        quote="Knee pain with symptoms of locking, catching, or instability AND at "
        "least TWO of the following physical exam findings of meniscal tear "
        "[...] Knee pain with at least ONE physical exam finding of meniscal "
        "tear and failure of at least 6 weeks of conservative management",
        citation=CARELON_EXTREMITIES,
        evaluate=_carelon_meniscal_pathway,
        alternative_pathway=True,
    ),
    Requirement(
        key="carelon-knee-ligament-conservative",
        cpt_codes=("73721",),
        indication="ligament_tear",
        summary="4 weeks of failed conservative management, unless preoperative "
        "stress testing is positive.",
        quote="Failure of at least 4 weeks of conservative management",
        citation=CARELON_EXTREMITIES,
        evaluate=_carelon_ligament_pathway,
        alternative_pathway=True,
        note="The guideline also allows postoperative evaluation following "
        "ligament or tendon repair when there are new symptoms.",
    ),
    Requirement(
        key="evicore-lumbar-in-person-evaluation",
        cpt_codes=("72148",),
        indication="low_back_pain",
        summary="An in-person clinical evaluation for the current episode must "
        "precede advanced imaging.",
        quote="An in-person clinical evaluation for the current episode of the "
        "condition is required to have been performed before advanced imaging "
        "is considered.",
        citation=EVICORE_LUMBAR,
        evaluate=lambda order: _flag(order.in_person_evaluation_this_episode),
    ),
    Requirement(
        key="evicore-lumbar-six-week-treatment",
        cpt_codes=("72148",),
        indication="low_back_pain",
        summary="6-week trial of provider-directed treatment must have failed, "
        "unless a red flag indication is present.",
        quote="Failure of a 6-week trial of provider-directed treatment after the "
        "current set of symptoms or physical exam findings started or changed "
        "(unless presence of a red flag as defined in Red Flag Indications "
        "(SP-1.2))",
        citation=EVICORE_LUMBAR,
        evaluate=_evicore_conservative,
        note="Red flags per SP.GG.0001.2.A: " + ", ".join(EVICORE_RED_FLAGS),
    ),
    Requirement(
        key="evicore-lumbar-reevaluation",
        cpt_codes=("72148",),
        indication="low_back_pain",
        summary="Clinical re-evaluation must occur after the treatment period.",
        quote="Clinical re-evaluation after treatment period (may consist of an "
        "in-person evaluation or other meaningful contact)",
        citation=EVICORE_LUMBAR,
        evaluate=lambda order: _flag(order.reevaluation_after_treatment),
    ),
    Requirement(
        key="aetna-spine-radiculopathy-six-weeks",
        cpt_codes=("72148",),
        indication="low_back_pain_with_radiculopathy",
        summary="Objective motor or reflex findings in the nerve root distribution "
        "plus no improvement after 6 weeks of conservative therapy.",
        quote="Persistent back or neck pain with radiculopathy as evidenced by pain "
        "plus objective findings of motor or reflex changes in the specific "
        "nerve root distribution, and no improvement after 6 weeks of "
        "conservative therapy",
        citation=AETNA_SPINE,
        evaluate=_aetna_radiculopathy,
        alternative_pathway=True,
    ),
    Requirement(
        key="aetna-spine-degenerative-four-weeks",
        cpt_codes=("72148",),
        indication="degenerative_spine_disease",
        summary="Has not responded to 4 weeks of conservative therapy.",
        quote="Spondylolisthesis and degenerative disease of the spine that has not "
        "responded to 4 weeks of conservative therapy",
        citation=AETNA_SPINE,
        evaluate=lambda order: _weeks_at_least(order, 4),
        alternative_pathway=True,
    ),
)
