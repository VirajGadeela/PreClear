"""Normalize the payer strings that appear in hospital price transparency files.

Hospitals name payers however their billing system does. One Indianapolis file
carries 46 distinct values for what is really a handful of payers, mixed
together with government lines and with catch-all buckets that name no payer at
all.

Three distinctions this module refuses to blur, because getting any of them
wrong produces a confidently wrong price:

  1. **Catch-all buckets are not payers.** "MANAGED CARE" and "COMMERCIAL" are
     the two most common values in the data and neither identifies a plan. They
     resolve to `is_bucket=True` and are never usable for routing.
  2. **Out-of-state Blue plans are not Anthem Indiana.** "BLUE CROSS ILLINOIS"
     and "BLUE CROSS OUT OF STATE" sit right next to "BLUE CROSS" in the same
     file at different rates. Treating them as one payer is exactly the silent
     failure CLAUDE.md warns about for partial payer coverage.
  3. **Medicare and Medicaid rates are not commercial rates.** A commercially
     insured patient will not pay them, so they are excluded from routing rather
     than averaged in.

An unrecognized but specific payer name resolves to `canonical=None` with
`is_bucket=False` — a real payer we have no rules for, which is different from a
bucket that names nobody. Both are excluded from routing; only the reason
differs.
"""

import re
from dataclasses import dataclass, replace
from typing import Optional

from pipeline import plans

COMMERCIAL = "commercial"
MEDICARE = "medicare"
MEDICAID = "medicaid"
WORKERS_COMP = "workers_comp"
GOVERNMENT = "government"
UNKNOWN = "unknown"

# Trailing internal payer code, e.g. "BLUE CROSS [1014]".
_TRAILING_CODE = re.compile(r"\s*\[[0-9]+\]\s*$")


@dataclass(frozen=True)
class PayerIdentity:
    raw: str
    label: str
    canonical: Optional[str]
    line_of_business: str
    # True when the string names no payer at all (a billing bucket).
    is_bucket: bool = False
    # True when the plan is a Blue affiliate outside Indiana.
    out_of_state: bool = False

    @property
    def usable_for_commercial_routing(self):
        """Whether a rate under this payer can be shown to a commercial member."""
        return (
            self.canonical is not None
            and not self.is_bucket
            and not self.out_of_state
            and self.line_of_business == COMMERCIAL
        )


# Ordered most specific first; the first match wins. Each entry is
# (pattern, canonical, line_of_business, out_of_state).
_RULES = (
    # Government lines, matched before the commercial brands so that
    # "UNITED HEALTHCARE MEDICARE" does not read as commercial UHC.
    (r"MEDICARE REPLACEMENT", None, MEDICARE, False),
    (r"\bMEDICARE\b", None, MEDICARE, False),
    (r"\bMEDICAID\b", None, MEDICAID, False),
    # Indiana Medicaid managed care organizations.
    (r"\bMDWISE\b", None, MEDICAID, False),
    (r"MANAGED HEALTH SERVICES", None, MEDICAID, False),
    (r"\bTRICARE\b", None, GOVERNMENT, False),
    (r"WORKERS?\s*COMP", None, WORKERS_COMP, False),
    (r"GOVERNMENT", None, GOVERNMENT, False),
    # Out-of-state Blue affiliates, before the bare Anthem match. The state
    # qualifier only counts inside a Blue-branded string: matching a bare "IL"
    # anywhere would sweep in unrelated payers.
    (r"BLUE CROSS OUT OF STATE", "anthem", COMMERCIAL, True),
    (r"BLUE.*(ILLINOIS|\bIL\b)|(ILLINOIS|\bIL\b).*BLUE", "anthem", COMMERCIAL, True),
    # UniCare is an Elevance brand, but the plans observed in Indianapolis files
    # carry out-of-state plan names, so it is not treated as Anthem Indiana.
    (r"\bUNICARE\b", "anthem", COMMERCIAL, True),
    (r"\bANTHEM\b", "anthem", COMMERCIAL, False),
    (r"BLUE CROSS", "anthem", COMMERCIAL, False),
    # Elevance Health is Anthem's parent. IU Health — the largest system in the
    # metro — files every Anthem rate under this name, so missing it drops that
    # system out of the comparison entirely.
    (r"\bELEVANCE\b", "anthem", COMMERCIAL, False),
    # Sagamore is a network rented by Cigna in Indiana.
    (r"SAGAMORE.*CIGNA|CIGNA.*SAGAMORE", "cigna", COMMERCIAL, False),
    # UMR is UnitedHealthcare's third-party administrator.
    (r"UNITED MEDICAL RESOURCES|\bUMR\b", "unitedhealthcare", COMMERCIAL, False),
    (r"UNITED\s*HEALTH", "unitedhealthcare", COMMERCIAL, False),
    (r"\bAETNA\b", "aetna", COMMERCIAL, False),
    (r"\bCIGNA\b", "cigna", COMMERCIAL, False),
    (r"\bHUMANA\b", "humana", COMMERCIAL, False),
)

# Values that name a billing category rather than a payer.
_BUCKETS = (
    r"^MANAGED CARE$",
    r"^COMMERCIAL$",
    r"^ALL OTHER",
    r"^OTHER$",
    r"^SELF[\s-]?PAY$",
)


def normalize(raw):
    """Resolve one payer string from a hospital file into a PayerIdentity."""
    label = _TRAILING_CODE.sub("", (raw or "").strip())
    # "ALT PAYER INDIANA BLUE CROSS" and friends are alternate fee schedules for
    # the same payer; the prefix carries no payer information.
    stripped = re.sub(r"^ALT\s+(PAYER|TRADITIONAL)\s+", "", label, flags=re.I).strip()
    upper = stripped.upper()

    if not upper:
        return PayerIdentity(raw, label, None, UNKNOWN, is_bucket=True)

    for pattern in _BUCKETS:
        if re.match(pattern, upper):
            return PayerIdentity(raw, label, None, UNKNOWN, is_bucket=True)

    for pattern, canonical, line_of_business, out_of_state in _RULES:
        if re.search(pattern, upper):
            return PayerIdentity(
                raw, label, canonical, line_of_business, False, out_of_state
            )

    # A specific payer we have no mapping for. Not a bucket.
    return PayerIdentity(raw, label, None, COMMERCIAL)


def resolve(payer_raw, plan_raw):
    """Identify a row from its payer *and* plan strings together.

    The plan name can only ever move a row out of commercial, never into it.
    Hospitals file Medicaid and Medicare managed-care plans under payer strings
    that read as commercial — Ascension St. Vincent Carmel publishes
    `ANTHEM CONNECT MEDICAID REPLACEMENT` under an Anthem payer — and showing a
    commercial member that $49.04 rate would be a price they can never be
    charged. Reading only the payer string is how that happens.
    """
    identity = normalize(payer_raw)
    plan = plans.classify(plan_raw)

    if plan.line_of_business in (plans.MEDICAID, plans.MEDICARE):
        return replace(identity, line_of_business=plan.line_of_business)
    return identity
