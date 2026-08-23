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

from dataclasses import dataclass
from enum import Enum
from typing import Optional


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

# Concerning headache features, Carelon Imaging of the Brain — Headache.
# The guideline lists these as alternatives ("ANY of the following"), so one
# documented feature satisfies the criterion and none documented means the
# pathway is undocumented, never that the study fails to qualify.
#
# Deliberately NOT recorded here: the same section names a preferred modality.
# Hard rule 6 forbids this product suggesting a different study, so modality
# preference is left out of the rule set entirely rather than carried in a field
# that some later screen might surface.
CARELON_HEADACHE_FEATURES = (
    "thunderclap_or_sentinel_headache",
    "exertional_or_valsalva_trigger",
    "positional_or_orthostatic",
    "new_onset_after_age_50",
    "change_in_headache_pattern",
    "abnormal_neurological_exam",
    "unexplained_increase_in_frequency_or_severity",
    "trigeminal_autonomic_cephalgia",
    "comorbidity_raising_intracranial_lesion_likelihood",
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
    # At least one concerning headache feature documented, per
    # CARELON_HEADACHE_FEATURES. A single flag rather than a list because the
    # criterion is satisfied by any one of them, so which one does not change
    # the outcome and asking a patient to name it would not be answerable.
    headache_concerning_feature: Optional[bool] = None


@dataclass(frozen=True)
class Requirement:
    key: str
    cpt_codes: tuple
    indication: str
    summary: str
    quote: str
    citation: Citation
    # A declarative description of the test this requirement applies. Kept
    # declarative rather than as a Python callable so the app can evaluate the
    # identical rule instead of re-deriving it: the first version of the mobile
    # screen scraped week thresholds out of the quote text with a regex and got
    # both the threshold and the met/not-documented distinction wrong.
    check: dict
    alternative_pathway: bool = False
    note: str = ""

    def evaluate(self, order):
        return evaluate_check(self.check, order)


def _weeks_at_least(order, threshold):
    if order.conservative_therapy_weeks is None:
        return Status.NOT_DOCUMENTED
    return Status.MET if order.conservative_therapy_weeks >= threshold else Status.UNMET


def _flag(value):
    if value is None:
        return Status.NOT_DOCUMENTED
    return Status.MET if value else Status.UNMET


def evaluate_check(check, order):
    """Evaluate one declarative check against an order.

    This is the single implementation in Python, and `app/src/requirements.ts`
    mirrors it case for case. Adding a new `type` here means adding it there.
    """
    kind = check["type"]

    if kind == "boolean":
        return _flag(getattr(order, check["field"]))

    if kind == "min_weeks":
        # Red flags waive the waiting period; they do not add a requirement.
        if check.get("waived_by_red_flag") and order.red_flags:
            return Status.NOT_APPLICABLE
        return _weeks_at_least(order, check["weeks"])

    if kind == "radiographs_performed":
        # Weaker than `radiographs_nondiagnostic`, and deliberately separate.
        # Carelon requires the films to have been *nondiagnostic*; eviCore and
        # UnitedHealthcare only require that plain x-rays were performed after
        # the current episode began. Collapsing the two would overstate what
        # those payers ask for.
        if order.prior_radiographs is None:
            return Status.NOT_DOCUMENTED
        return Status.MET

    if kind == "radiographs_nondiagnostic":
        if order.prior_radiographs is None:
            return Status.NOT_DOCUMENTED
        return (
            Status.MET
            if order.prior_radiographs == "nondiagnostic"
            else Status.UNMET
        )

    if kind == "meniscal_pathway":
        # Either scenario in the guideline satisfies this, so check both.
        findings = len(order.meniscal_exam_findings)
        if order.mechanical_symptoms and findings >= 2:
            return Status.MET
        if findings >= 1:
            return _weeks_at_least(order, check["weeks"])
        if order.mechanical_symptoms is None and not findings:
            return Status.NOT_DOCUMENTED
        return Status.UNMET

    if kind == "ligament_pathway":
        if order.positive_ligament_stress_tests:
            return Status.MET
        return _weeks_at_least(order, check["weeks"])

    if kind == "objective_findings_then_weeks":
        findings = _flag(getattr(order, check["field"]))
        if findings is not Status.MET:
            return findings
        return _weeks_at_least(order, check["weeks"])

    raise ValueError(f"unknown check type: {kind!r}")


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

CARELON_SPINE = Citation(
    payer="Anthem Blue Cross and Blue Shield",
    reviewed_by="Carelon Medical Benefits Management",
    document_title="Clinical Appropriateness Guidelines: Imaging of the Spine",
    section_id="Imaging of the Spine — Low back pain or lumbar radiculopathy",
    version="2025-11-15",
    effective_date="2025-11-15",
    source_url="https://guidelines.carelonmedicalbenefitsmanagement.com/imaging-of-the-spine-2025-11-15/",
    retrieved_on="2026-08-13",
)

# Headache criteria live in Imaging of the Brain, not Imaging of the Head and
# Neck. The head-and-neck document covers sinusitis, trauma, hearing loss and
# similar, and carries no headache section at all — checked 2026-08-13.
CARELON_BRAIN = Citation(
    payer="Anthem Blue Cross and Blue Shield",
    reviewed_by="Carelon Medical Benefits Management",
    document_title="Clinical Appropriateness Guidelines: Imaging of the Brain",
    section_id="Imaging of the Brain — Headache",
    version="2025-11-15, updated 2026-01-01",
    effective_date="2025-11-15",
    source_url=(
        "https://guidelines.carelonmedicalbenefitsmanagement.com/"
        "imaging-of-the-brain-2025-11-15-updated-2026-01-01/"
    ),
    retrieved_on="2026-08-13",
)


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


# --------------------------------------------------------------------------
# Cigna, reviewed by eviCore — knee and head
#
# Retrieved 2026-08-22. Same delegate and the same document family as
# EVICORE_LUMBAR above, but a different guideline per body region, which is the
# trap Carelon has too: the knee criteria are in the Musculoskeletal guideline,
# not in a knee-specific one.
# --------------------------------------------------------------------------

EVICORE_MSK = Citation(
    payer="Cigna Healthcare",
    reviewed_by="eviCore by EVERNORTH",
    document_title=(
        "Cigna Medical Coverage Policies - Radiology: Musculoskeletal Imaging "
        "Guidelines"
    ),
    section_id="MS.CS.0029.1",
    version="V1.0.2026",
    effective_date="2026-02-03",
    retrieved_on="2026-08-22",
    source_url=(
        "https://www.evicore.com/sites/default/files/clinical-guidelines/2025-10/"
        "Cigna_Musculoskeletal%20Imaging%20Guidelines_V1.0.2026_eff02.03.2026_"
        "PUB10.29.2025.pdf"
    ),
)

EVICORE_MSK_LIGAMENT = Citation(
    payer="Cigna Healthcare",
    reviewed_by="eviCore by EVERNORTH",
    document_title=(
        "Cigna Medical Coverage Policies - Radiology: Musculoskeletal Imaging "
        "Guidelines"
    ),
    section_id="MS.LM.0031.1",
    version="V1.0.2026",
    effective_date="2026-02-03",
    retrieved_on="2026-08-22",
    source_url=(
        "https://www.evicore.com/sites/default/files/clinical-guidelines/2025-10/"
        "Cigna_Musculoskeletal%20Imaging%20Guidelines_V1.0.2026_eff02.03.2026_"
        "PUB10.29.2025.pdf"
    ),
)

# A V2.0.2026 of this document is already published and becomes effective
# 2026-09-01. Both versions were read on 2026-08-22 and HD.HA.0011.0.C is
# word-for-word identical in each, so the criterion below does not change when
# the version does — only the string in `version` will.
EVICORE_HEAD = Citation(
    payer="Cigna Healthcare",
    reviewed_by="eviCore by EVERNORTH",
    document_title=(
        "Cigna Medical Coverage Policies - Radiology: Head Imaging Guidelines, "
        "Headache General Guidelines (HD-11.0)"
    ),
    section_id="HD.HA.0011.0.C",
    version="V1.0.2026",
    effective_date="2026-02-03",
    next_review="2026-09-01 (superseded by V2.0.2026, section text unchanged)",
    retrieved_on="2026-08-22",
    source_url=(
        "https://www.evicore.com/sites/default/files/clinical-guidelines/2025-10/"
        "Cigna_Head%20Imaging%20Guidelines_V1.0.2026_eff02.03.2026_PUB10.30.2025.pdf"
    ),
)


# --------------------------------------------------------------------------
# Aetna, self-published Clinical Policy Bulletin — extremities
# --------------------------------------------------------------------------

AETNA_EXTREMITIES = Citation(
    payer="Aetna",
    reviewed_by="Aetna (self-published)",
    document_title=(
        "Clinical Policy Bulletin 0171: Magnetic Resonance Imaging (MRI) of the "
        "Extremities"
    ),
    section_id="CPB 0171 - Medical Necessity, knee",
    version="Last Review 2026-03-31",
    effective_date="1997-08-18",
    next_review="2027-02-11",
    retrieved_on="2026-08-22",
    source_url="https://www.aetna.com/cpb/medical/data/100_199/0171.html",
)


# --------------------------------------------------------------------------
# UnitedHealthcare, self-published
#
# CLAUDE.md recorded that no UHC document applicable to Indiana had been found,
# because the guideline that surfaces most readily is marked "For Ohio Only".
# That was a search failure, not an absence: UHC publishes a national
# Commercial and Exchange guideline covering all three target codes, with no
# state restriction. Corrected 2026-08-22.
#
# Note the section identifiers match eviCore's for the spine (SP.LB.0005.1.A).
# That is not a copy-paste error in this file — both organisations number these
# sections the same way, and the thresholds agree independently.
# --------------------------------------------------------------------------

_UHC_DOC = (
    "UnitedHealthcare Commercial and Exchange Plans: Cardiovascular and "
    "Radiology Imaging Guidelines"
)
_UHC_URL = (
    "https://www.uhcprovider.com/content/dam/provider/docs/public/prior-auth/"
    "radiology/COMM-Exchange-Rad-Card-Guidelines-Nov-2025.pdf"
)

UHC_KNEE = Citation(
    payer="UnitedHealthcare",
    reviewed_by="UnitedHealthcare (self-published)",
    document_title=_UHC_DOC + ", Knee (MS-25)",
    section_id="MS.KN.0025.A",
    version="V5.0.2025 (section v2.0.2025)",
    effective_date="2025-11-18",
    retrieved_on="2026-08-22",
    source_url=_UHC_URL,
)

UHC_HEAD = Citation(
    payer="UnitedHealthcare",
    reviewed_by="UnitedHealthcare (self-published)",
    document_title=_UHC_DOC + ", Headache General Guidelines (HD-11.0)",
    section_id="HD.HA.0011.0.A",
    version="V5.0.2025 (section v1.0.2025)",
    effective_date="2025-11-18",
    retrieved_on="2026-08-22",
    source_url=_UHC_URL,
)

UHC_LUMBAR = Citation(
    payer="UnitedHealthcare",
    reviewed_by="UnitedHealthcare (self-published)",
    document_title=_UHC_DOC
    + ", Low Back (Lumbar Spine) Pain without Neurological Features (SP-5.1)",
    section_id="SP.LB.0005.1.A",
    version="V5.0.2025 (section v2.0.2025)",
    effective_date="2025-11-18",
    retrieved_on="2026-08-22",
    source_url=_UHC_URL,
)


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
        check={"type": "radiographs_nondiagnostic"},
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
        check={"type": "meniscal_pathway", "weeks": 6},
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
        check={"type": "ligament_pathway", "weeks": 4},
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
        check={"type": "boolean", "field": "in_person_evaluation_this_episode"},
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
        check={"type": "min_weeks", "weeks": 6, "waived_by_red_flag": True},
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
        check={"type": "boolean", "field": "reevaluation_after_treatment"},
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
        check={"type": "objective_findings_then_weeks",
               "field": "radiculopathy_objective_findings", "weeks": 6},
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
        check={"type": "min_weeks", "weeks": 4},
        alternative_pathway=True,
    ),
    # ----------------------------------------------------------------------
    # Anthem is the primary payer for this metro but previously carried rules
    # for the knee only, so an Anthem member ordering a lumbar MRI or a head CT
    # got no requirement check at all. These close that.
    # ----------------------------------------------------------------------
    Requirement(
        key="carelon-lumbar-six-week-conservative",
        cpt_codes=("72148",),
        indication="low_back_pain",
        summary="6 weeks of conservative management must have been tried and "
        "failed.",
        quote="Pain or radiculopathy (including chronic neurogenic claudication) "
        "following at least 6 weeks of conservative management (imaging no more "
        "than annually)",
        citation=CARELON_SPINE,
        check={"type": "min_weeks", "weeks": 6},
        alternative_pathway=True,
        note="The guideline's other listed scenario is neurologic exam findings "
        "suggesting nerve root or cord compression, which does not require the "
        "6-week trial.",
    ),
    Requirement(
        key="carelon-lumbar-neurologic-findings",
        cpt_codes=("72148",),
        indication="low_back_pain_with_radiculopathy",
        summary="Neurologic exam findings suggesting nerve root or cord "
        "compression, not previously imaged or new since the last imaging.",
        quote="Neurologic exam findings suggesting lumbar nerve root or cord "
        "compression that has not previously been imaged or is new since last "
        "imaging was performed",
        citation=CARELON_SPINE,
        check={"type": "boolean", "field": "radiculopathy_objective_findings"},
        alternative_pathway=True,
    ),
    Requirement(
        key="carelon-brain-headache-concerning-feature",
        cpt_codes=("70450",),
        indication="headache",
        summary="At least one concerning headache feature must be documented.",
        quote="Advanced imaging is considered medically necessary to evaluate "
        "headache not previously imaged by MRI in ANY of the following scenarios",
        citation=CARELON_BRAIN,
        check={"type": "boolean", "field": "headache_concerning_feature"},
        alternative_pathway=True,
        note="Listed features: " + ", ".join(CARELON_HEADACHE_FEATURES),
    ),
    # ------------------------------------------------------------------
    # Cigna / eviCore — knee, added 2026-08-22
    # ------------------------------------------------------------------
    Requirement(
        key="evicore-knee-meniscal-radiographs",
        cpt_codes=("73721",),
        indication="meniscal_tear",
        summary="Plain x-rays must have been performed after this episode of "
        "symptoms began, with results available to the requesting provider.",
        quote="Plain x-rays have been performed after the beginning of the "
        "current episode of symptoms started",
        citation=EVICORE_MSK,
        check={"type": "radiographs_performed"},
    ),
    Requirement(
        key="evicore-knee-meniscal-six-week-conservative",
        cpt_codes=("73721",),
        indication="meniscal_tear",
        summary="Six weeks of provider-directed conservative treatment, unless "
        "at least two of four listed exam criteria are documented instead.",
        quote="Failure of 6 weeks of provider-directed conservative treatment, "
        "including clinical re-evaluation, occurring after the current episode "
        "of symptoms started OR at least 2 of the following 4 criteria met",
        citation=EVICORE_MSK,
        check={"type": "min_weeks", "weeks": 6},
        alternative_pathway=True,
        note="The alternative is 2 of: positive McMurray's, Thessaly or Apley's "
        "compression test; twisting or acute injury; locked knee; knee effusion. "
        "The app does not collect exam findings, so this reports as the weeks "
        "pathway only.",
    ),
    Requirement(
        key="evicore-knee-ligament-radiographs",
        cpt_codes=("73721",),
        indication="ligament_tear",
        summary="Plain x-rays of the knee must have been performed after this "
        "episode of symptoms began or changed.",
        quote="Initial plain x-ray imaging of the suspected area must first be "
        "performed after the current episode of symptoms started or changed "
        "with results available to the requesting provider",
        citation=EVICORE_MSK_LIGAMENT,
        check={"type": "radiographs_performed"},
    ),
    Requirement(
        key="evicore-knee-ligament-six-week-conservative",
        cpt_codes=("73721",),
        indication="ligament_tear",
        summary="Six weeks of provider-directed conservative treatment, unless "
        "an instability test is positive compared with the other knee.",
        quote="Otherwise, failure of 6 weeks of provider-directed conservative "
        "treatment, including clinical re-evaluation, occurring after the "
        "current episode of symptoms started is required",
        citation=EVICORE_MSK_LIGAMENT,
        check={"type": "ligament_pathway", "weeks": 6},
        alternative_pathway=True,
        note="Waived if Anterior Drawer, Lachman, Pivot Shift, Posterior Drawer "
        "or Sag, Valgus Stress or Varus Stress is positive in comparison to the "
        "opposite knee.",
    ),
    # ------------------------------------------------------------------
    # Cigna / eviCore — head, added 2026-08-22
    # ------------------------------------------------------------------
    Requirement(
        key="evicore-headache-red-flag",
        cpt_codes=("70450",),
        indication="headache",
        summary="A focal neurological deficit or a published red-flag feature "
        "must be documented; imaging is not indicated for primary headache "
        "without one.",
        quote="Advanced imaging of the head is NOT medically necessary for any "
        "of the following: Primary headache disorder in the absence of focal "
        "neurological deficits or \u201cred flags\u201d",
        citation=EVICORE_HEAD,
        check={"type": "boolean", "field": "headache_concerning_feature"},
        alternative_pathway=True,
        note="A significant change in the character, severity or frequency of a "
        "chronic headache is a separate qualifying pathway in the same section.",
    ),
    # ------------------------------------------------------------------
    # Aetna — knee, added 2026-08-22
    # ------------------------------------------------------------------
    Requirement(
        key="aetna-knee-three-week-conservative",
        cpt_codes=("73721",),
        indication="meniscal_tear",
        summary="Three weeks of conservative therapy where the knee pain is not "
        "associated with an injury.",
        quote="Persistent knee pain/swelling and/or instability (giving way) "
        "when: Not associated with an injury and not responding to at least 3 "
        "weeks of conservative therapy",
        citation=AETNA_EXTREMITIES,
        check={"type": "min_weeks", "weeks": 3},
        alternative_pathway=True,
        note="Aetna lists injury-related knee pain, true locking, tumour and "
        "suspected osteomyelitis as separate qualifying criteria. Three weeks is "
        "the shortest published threshold of any payer in this file.",
    ),
    # ------------------------------------------------------------------
    # UnitedHealthcare, added 2026-08-22
    # ------------------------------------------------------------------
    Requirement(
        key="uhc-knee-meniscal-radiographs",
        cpt_codes=("73721",),
        indication="meniscal_tear",
        summary="An initial plain x-ray must have been obtained and the results "
        "available to the provider.",
        quote="After an initial plain x-ray has been obtained, and results are "
        "available to the provider, the following advanced imaging is indicated",
        citation=UHC_KNEE,
        check={"type": "radiographs_performed"},
    ),
    Requirement(
        key="uhc-knee-meniscal-six-week-conservative",
        cpt_codes=("73721",),
        indication="meniscal_tear",
        summary="Six weeks of provider-directed conservative treatment, unless "
        "at least two of four listed exam criteria are documented instead.",
        quote="Conservative treatment is not required if at least 2 of following "
        "4 criteria are met: 1) Positive McMurray\u2019s, positive Thessaly, or "
        "positive Apley\u2019s Compression Test 2) twisting or acute injury of "
        "the knee 3) locked knee/inability to fully extend the knee on exam in "
        "comparison to the opposite knee 4) knee effusion",
        citation=UHC_KNEE,
        check={"type": "min_weeks", "weeks": 6},
        alternative_pathway=True,
        note="Same two-of-four alternative as eviCore's knee section, worded "
        "almost identically. The app does not collect exam findings, so this "
        "reports as the weeks pathway only.",
    ),
    Requirement(
        key="uhc-headache-red-flag",
        cpt_codes=("70450",),
        indication="headache",
        summary="A focal neurological deficit or a published red-flag feature "
        "must be documented; imaging is not indicated for primary headache "
        "without one.",
        quote="Advanced imaging of the head is NOT indicated for any of the "
        "following: Primary headache disorder in the absence of focal "
        "neurological deficits or \"red flags\"",
        citation=UHC_HEAD,
        check={"type": "boolean", "field": "headache_concerning_feature"},
        alternative_pathway=True,
    ),
    Requirement(
        key="uhc-lumbar-six-week-conservative",
        cpt_codes=("72148",),
        indication="low_back_pain",
        summary="A six-week trial of provider-directed treatment within the last "
        "twelve weeks, unless a red flag is present.",
        quote="Failure of recent (within 12 weeks) 6-week trial of "
        "provider-directed treatment (unless presence of a red flag as defined "
        "in Red Flag Indications (SP-1.2))",
        citation=UHC_LUMBAR,
        check={"type": "min_weeks", "weeks": 6, "waived_by_red_flag": True},
    ),
)
