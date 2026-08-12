"""Classify and match the plan names hospitals publish alongside each rate.

The payer alone does not determine the price. Franciscan publishes five Anthem
rates for CPT 73721, from $360.22 to $992.51, and which one applies depends on
the member's specific plan. So plan strings have to be read, not ignored.

Two jobs here, and the first is a correctness fix rather than a refinement:

  1. **Line of business often lives in the plan name, not the payer name.**
     Ascension St. Vincent Carmel publishes `ANTHEM CONNECT MEDICAID REPLACEMENT`
     and `ANTHEM MEDICARE REPLACEMENT` rows under a payer string that reads as
     commercial. Judging by payer alone shows a commercial member a Medicaid
     managed-care rate — a $49.04 knee MRI that they will never be charged.
     A plan name can only ever *downgrade* a row out of commercial, never
     promote one into it.

  2. **Matching a member's plan to the hospital's string**, and refusing when
     the answer is genuinely ambiguous. `ANTHEM BLUE ACCESS PPO WITH COPPS` and
     `ANTHEM BLUE ACCESS PPO-CID` are the same product name at $992.51 and
     $360.22. No amount of string matching resolves that, so the honest output
     is a range and a disclosure, not a confident single number.
"""

import re
from dataclasses import dataclass
from typing import Optional

COMMERCIAL = "commercial"
MEDICARE = "medicare"
MEDICAID = "medicaid"
UNKNOWN = "unknown"

# Leading internal identifiers, e.g. "8255_ANTHEM CONNECT ..." or a trailing
# "[319068]", and trailing effective dates like "20240101".
_LEADING_ID = re.compile(r"^\s*\d+[_\-\s]+")
_TRAILING_CODE = re.compile(r"\s*\[[0-9]+\]\s*$")
_TRAILING_DATE = re.compile(r"\s*\b(19|20)\d{6}\b\s*$")

# Ordered: the most specific line-of-business signal wins.
_LINE_OF_BUSINESS = (
    (r"MEDICAID\s+REPLACEMENT", MEDICAID),
    (r"MEDICARE\s+REPLACEMENT", MEDICARE),
    (r"MEDICARE\s+ADVANTAGE", MEDICARE),
    (r"\bHEALTHY\s+INDIANA\b|\bHIP\s+2\.0\b", MEDICAID),
    (r"\bMEDICAID\b", MEDICAID),
    (r"\bMEDICARE\b", MEDICARE),
)

# Plan rows scoped to a specific service line. A vein-treatment or behavioural
# fee schedule appearing against a knee MRI is a carve-out row, not the price a
# member would pay for the study.
_CARVE_OUT = (
    r"\bVEIN\b",
    r"\bBEHAVIORAL\b",
    r"\bTRANSPLANT\b",
    r"\bDIALYSIS\b",
    r"\bONCOLOGY\b",
    r"\bMATERNITY\b",
)

_PRODUCTS = (
    ("ppo", r"\bPPO\b"),
    ("hmo", r"\bHMO\b"),
    ("pos", r"\bPOS\b"),
    ("epo", r"\bEPO\b"),
    ("hdhp", r"\bHDHP\b|HIGH\s+DEDUCTIBLE"),
)

# Words that carry no distinguishing information when comparing plan strings.
_STOPWORDS = frozenset(
    {
        "with", "and", "the", "of", "all", "plan", "plans", "health",
        "insurance", "ins", "locations", "location", "outpatient", "asc",
    }
)


@dataclass(frozen=True)
class PlanIdentity:
    raw: str
    label: str
    product: Optional[str]
    line_of_business: str
    is_carve_out: bool
    tokens: frozenset

    @property
    def is_commercial(self):
        return self.line_of_business == COMMERCIAL


def _clean(plan_name):
    label = (plan_name or "").strip()
    label = _LEADING_ID.sub("", label)
    label = _TRAILING_CODE.sub("", label)
    label = _TRAILING_DATE.sub("", label)
    return label.strip(" -_")


def tokenize(text):
    """Distinguishing words, lowercased, minus filler and bare numbers."""
    words = re.split(r"[^A-Za-z0-9]+", (text or "").lower())
    return frozenset(
        word for word in words
        if word and word not in _STOPWORDS and not word.isdigit() and len(word) > 1
    )


def classify(plan_name):
    """Read one published plan string."""
    label = _clean(plan_name)
    upper = label.upper()

    line_of_business = COMMERCIAL if label else UNKNOWN
    for pattern, value in _LINE_OF_BUSINESS:
        if re.search(pattern, upper):
            line_of_business = value
            break

    product = None
    for name, pattern in _PRODUCTS:
        if re.search(pattern, upper):
            product = name
            break

    is_carve_out = any(re.search(pattern, upper) for pattern in _CARVE_OUT)

    return PlanIdentity(
        raw=plan_name or "",
        label=label,
        product=product,
        line_of_business=line_of_business,
        is_carve_out=is_carve_out,
        tokens=tokenize(label),
    )


def match_score(member_plan_text, plan):
    """How well a member's stated plan matches a published plan string, 0 to 1.

    Deliberately blunt: overlap of distinguishing words, with the product type
    required to agree when both name one. A member holding an HMO should never
    be matched to a PPO fee schedule just because the brand words line up.
    """
    member_tokens = tokenize(member_plan_text)
    if not member_tokens or not plan.tokens:
        return 0.0

    member_product = classify(member_plan_text).product
    if member_product and plan.product and member_product != plan.product:
        return 0.0

    overlap = member_tokens & plan.tokens
    if not overlap:
        return 0.0
    # Measured against the member's own words, so a long hospital string full of
    # location suffixes is not penalised for being verbose.
    return len(overlap) / len(member_tokens)


def rank_matches(member_plan_text, candidates, threshold=0.5):
    """Published plans that plausibly match, best first.

    `candidates` is an iterable of (plan_name, payload). Returns
    (score, plan_identity, payload) for everything at or above the threshold.
    """
    scored = []
    for plan_name, payload in candidates:
        plan = classify(plan_name)
        score = match_score(member_plan_text, plan)
        if score >= threshold:
            scored.append((score, plan, payload))
    scored.sort(key=lambda row: -row[0])
    return scored
