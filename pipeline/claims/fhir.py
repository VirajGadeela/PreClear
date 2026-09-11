"""Read CARIN for Blue Button EOB resources into this repo's `Eob` records.

Under the CMS Interoperability rules a payer exposes a member's claims as FHIR
`ExplanationOfBenefit` resources, shaped by the CARIN for Blue Button
implementation guide, and a member authorises an app to read them. This module
is the seam where that data would enter: a payer's bundle goes in, `Eob` records
come out, and `pipeline/claims/eob.py` reviews them without knowing the
difference.

WHAT THIS IS AND IS NOT
-----------------------
This is the mapping layer only. There is no HTTP client here, no OAuth, no
token, and nothing in `app/` speaks FHIR -- the app still receives the flat
shape `export_app_data.py` writes. Reading a real member's claims needs the
authorisation half as well, and that crosses into holding PHI, which CLAUDE.md
records as a decision to be made deliberately rather than drifted into. Until
that decision is made, the only bundle this reads is the synthetic fixture in
`data/samples/`, and hard rule 1 still holds without qualification.

Keeping FHIR on this side of `export_app_data.py` is also what stops the repo
growing a fourth parity script. `app/src/claims.ts` mirrors `eob.py`; if the app
parsed bundles too, the mapping below would exist twice and could drift, and
CLAUDE.md already records claims drift as the worst of the three kinds.

MATCHING IS BY CODE, NOT BY SYSTEM, AND THAT IS DELIBERATE
----------------------------------------------------------
CARIN carries each money amount as an `adjudication` entry whose category is a
coded concept. Some of those codes come from the base FHIR adjudication code
system and some from CARIN's own, and payers vary in which they send and in
whether they send both. Matching on the code alone tolerates that variation;
matching on the system would reject a payer for a URL difference that changes no
meaning. The constant below records the systems seen in the guide for the
reader's benefit, and nothing compares against it.

**The system URLs and profile names have not been verified against the
published IG from inside this repo.** They were written from reference and are
documentation, not behaviour -- no code path depends on them being right. Verify
them against hl7.org/fhir/us/carin-bb before pointing this at a live payer, and
expect the first real bundle to need adjustments here regardless.
"""

import json

from pipeline.claims.eob import Eob, HouseholdPlan

# Recorded for the reader. Nothing matches against these -- see the docstring.
ADJUDICATION_SYSTEMS = (
    "http://terminology.hl7.org/CodeSystem/adjudication",
    "http://hl7.org/fhir/us/carin-bb/CodeSystem/C4BBAdjudication",
)

# CARIN adjudication code -> the `Eob` field it carries.
ADJUDICATION_FIELDS = {
    "submitted": "billed",
    "eligible": "allowed",
    "benefit": "plan_paid",
    "memberliability": "patient_responsibility",
    "deductible": "deductible_applied",
    "coinsurance": "coinsurance",
    "copay": "copay",
}

# The four `Eob` fields with no default. A bundle missing one of these is not a
# claim this engine can review, and guessing a zero would invent a finding --
# an absent `allowed` would read as a contract allowing nothing, which every
# balance-billing check would then fail.
REQUIRED_FIELDS = ("billed", "allowed", "plan_paid", "patient_responsibility")

# C4BBPayerAdjudicationStatus -> the `network` values `eob.py` gates on. The
# distinction is load-bearing: `patient_owes_more_than_allowed` does not apply
# out of network, because there is no contract to exceed.
NETWORK_STATUS = {
    "innetwork": "in_network",
    "outofnetwork": "out_of_network",
}


def _codings(concept):
    """Every coding in a CodeableConcept, tolerating an absent or empty one."""
    if not concept:
        return []
    return concept.get("coding") or []


def _first_code(concept):
    for coding in _codings(concept):
        if coding.get("code"):
            return coding
    return None


def _adjudication(item, code):
    """The first adjudication entry on `item` carrying `code` in its category."""
    for entry in item.get("adjudication") or []:
        for coding in _codings(entry.get("category")):
            if coding.get("code") == code:
                return entry
    return None


def _amounts(item):
    """Every adjudication amount on one line item, keyed by `Eob` field name.

    A payer may send the same category twice under two systems. The amounts
    agree when that happens, so the first wins and the second is ignored rather
    than summed -- summing would silently double a figure every check compares
    against.
    """
    found = {}
    for entry in item.get("adjudication") or []:
        for coding in _codings(entry.get("category")):
            field = ADJUDICATION_FIELDS.get(coding.get("code"))
            if field is None or field in found:
                continue
            amount = entry.get("amount") or {}
            if "value" in amount:
                found[field] = float(amount["value"])
    return found


def _network(item):
    entry = _adjudication(item, "benefitpaymentstatus")
    if entry is None:
        return "in_network"
    coding = _first_code(entry.get("reason"))
    if coding is None:
        return "in_network"
    # An unrecognised status is not in-network by default. CARIN's third value
    # is "other", and treating an unknown status as in-network would turn on the
    # balance-billing check for a claim with no contract behind it.
    return NETWORK_STATUS.get(coding["code"], "out_of_network")


def _denial(item):
    """The payer's own denial code and reason, or a pair of empty strings.

    Returned verbatim. `eob.py` reports a denial and names its appeal route; it
    never interprets the code, and nothing here should start.
    """
    entry = _adjudication(item, "denialreason")
    if entry is None:
        return "", ""
    coding = _first_code(entry.get("reason"))
    if coding is None:
        return "", ""
    return coding.get("code", ""), coding.get("display", "")


def eob_from_item(resource, item, claim_id):
    """One CARIN line item as one `Eob`.

    `Eob` is one line of one claim, so a resource with several items yields
    several records -- see `eobs_from_bundle` for how their ids stay distinct.
    """
    amounts = _amounts(item)
    missing = [field for field in REQUIRED_FIELDS if field not in amounts]
    if missing:
        raise ValueError(
            f"{claim_id}: no adjudication amount for {', '.join(missing)}. "
            "Expected CARIN categories "
            f"{', '.join(c for c, f in ADJUDICATION_FIELDS.items() if f in missing)}."
        )

    service = _first_code(item.get("productOrService")) or {}
    denial_code, denial_reason = _denial(item)

    return Eob(
        claim_id=claim_id,
        # The household role, never a name -- hard rule 1. A real payer sends a
        # Patient reference here and the role would be assigned on this side,
        # from who the member says the person is, not from anything the payer
        # knows them as.
        member=(resource.get("patient") or {}).get("display", ""),
        service_date=(
            item.get("servicedDate")
            or (resource.get("billablePeriod") or {}).get("start", "")
        ),
        provider=(resource.get("provider") or {}).get("display", ""),
        code=service.get("code", ""),
        description=service.get("display", ""),
        network=_network(item),
        denial_code=denial_code,
        denial_reason=denial_reason,
        **amounts,
    )


def eobs_from_bundle(bundle):
    """Every line item in a FHIR searchset Bundle, in the order it appears.

    Order is preserved because two checks depend on it: `duplicate_claims`
    reports the second of a pair, and `deductible_over_applied` names the claim
    that crossed the line.
    """
    records = []
    for entry in bundle.get("entry") or []:
        resource = entry.get("resource") or {}
        if resource.get("resourceType") != "ExplanationOfBenefit":
            continue
        items = resource.get("item") or []
        for item in items:
            # A single-line claim keeps the plain claim number, which is what a
            # member sees on the document and what a finding has to quote back.
            # Several lines on one claim need distinguishing, or two findings
            # would point at the same id and the member could not tell which
            # line either meant.
            claim_id = resource.get("id", "")
            if len(items) > 1:
                claim_id = f"{claim_id}-{item.get('sequence', len(records) + 1)}"
            records.append(eob_from_item(resource, item, claim_id))
    return records


def load(path):
    """Read a fixture file into the pair `review()` takes.

    The file holds the payer's bundle under `bundle` and the member's benefit
    limits under `plan`, and the split is the honest one: a Patient Access API
    returns claims, while the deductible and out-of-pocket maximum are
    user-reported here exactly as CLAUDE.md says they are everywhere else in
    this repo. Inventing a `benefitBalance` to carry them would dress a slider
    value up as something the payer said.
    """
    with open(path, encoding="utf-8") as handle:
        payload = json.load(handle)
    plan = HouseholdPlan(**payload["plan"])
    return eobs_from_bundle(payload["bundle"]), plan


# The flat fixture this writes is what `export_app_data.py` copies into the app
# bundle and what `check-claims-parity.sh` runs both engines against. Those two
# deliberately do not know FHIR exists: the parity script's whole job is to
# compare the Python and TypeScript *checks*, and giving it a second thing to
# disagree about would blunt it.
FLAT_FIXTURE = "data/samples/household_eobs.json"
FHIR_FIXTURE = "data/samples/household_eobs_fhir.json"

FLAT_COMMENT = (
    "GENERATED FILE -- edit data/samples/household_eobs_fhir.json instead, then "
    "run `python -m pipeline.claims.fhir`. This is the CARIN bundle flattened "
    "into the shape pipeline/claims/eob.py and app/src/claims.ts both read; "
    "pipeline/tests/test_fhir.py fails if it drifts from its source. Synthetic "
    "only, no real patient data -- CLAUDE.md hard rule 1."
)


def to_flat(eobs, plan, comment=FLAT_COMMENT):
    """The flat fixture shape, as a plain dict.

    Empty denial fields are dropped rather than written as empty strings, so a
    claim that was not denied does not carry two blank keys saying so. `Eob`
    defaults them, and the file reads as it did before this module existed.
    """
    records = []
    for eob in eobs:
        record = {
            "claim_id": eob.claim_id,
            "member": eob.member,
            "service_date": eob.service_date,
            "provider": eob.provider,
            "code": eob.code,
            "description": eob.description,
            "billed": eob.billed,
            "allowed": eob.allowed,
            "plan_paid": eob.plan_paid,
            "patient_responsibility": eob.patient_responsibility,
            "deductible_applied": eob.deductible_applied,
            "coinsurance": eob.coinsurance,
            "copay": eob.copay,
            "network": eob.network,
        }
        if eob.denial_code:
            record["denial_code"] = eob.denial_code
            record["denial_reason"] = eob.denial_reason
        records.append(record)
    return {
        "_comment": comment,
        "plan": {"deductible": plan.deductible, "oop_max": plan.oop_max},
        "eobs": records,
    }


def main(source=FHIR_FIXTURE, dest=FLAT_FIXTURE):
    eobs, plan = load(source)
    with open(dest, "w", encoding="utf-8") as handle:
        json.dump(to_flat(eobs, plan), handle, indent=2)
        handle.write("\n")
    print(f"{dest}: {len(eobs)} claims from {len(eobs)} CARIN line items in {source}")


if __name__ == "__main__":
    main()
