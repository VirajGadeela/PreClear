"""CARIN mapping tests. Every EOB here is synthetic — see CLAUDE.md.

The first class is the one that matters day to day: `data/samples/` holds the
CARIN bundle and a flat file generated from it, and a generated file checked
into a repo drifts the first time somebody edits the wrong one. The rest test
the mapper against the variation a real payer feed would bring.
"""

import json
import os
import unittest

from pipeline.claims.eob import Eob, HouseholdPlan, review, total_at_stake
from pipeline.claims.fhir import (
    FLAT_FIXTURE,
    FHIR_FIXTURE,
    eob_from_item,
    eobs_from_bundle,
    load,
    to_flat,
)

BASE = "http://terminology.hl7.org/CodeSystem/adjudication"
C4BB = "http://hl7.org/fhir/us/carin-bb/CodeSystem/C4BBAdjudication"


def amount(system, code, value):
    return {
        "category": {"coding": [{"system": system, "code": code}]},
        "amount": {"value": value, "currency": "USD"},
    }


def item(adjudication=None, **overrides):
    """A line item carrying the four required amounts, plus whatever is added."""
    base = [
        amount(BASE, "submitted", 200.0),
        amount(BASE, "eligible", 100.0),
        amount(BASE, "benefit", 80.0),
        amount(C4BB, "memberliability", 20.0),
    ]
    payload = {
        "sequence": 1,
        "productOrService": {
            "coding": [
                {
                    "system": "http://www.ama-assn.org/go/cpt",
                    "code": "99213",
                    "display": "Office visit",
                }
            ]
        },
        "servicedDate": "2026-01-01",
        "adjudication": base + (adjudication or []),
    }
    payload.update(overrides)
    return payload


def resource(items=None, **overrides):
    payload = {
        "resourceType": "ExplanationOfBenefit",
        "id": "C-1",
        "patient": {"reference": "Patient/adult-1", "display": "Adult 1"},
        "provider": {"display": "Test Facility"},
        "billablePeriod": {"start": "2026-01-01", "end": "2026-01-01"},
        "item": items if items is not None else [item()],
    }
    payload.update(overrides)
    return payload


def bundle(*resources):
    return {
        "resourceType": "Bundle",
        "type": "searchset",
        "entry": [{"resource": r} for r in resources],
    }


class TestFixtureIsInSyncWithItsSource(unittest.TestCase):
    """The flat fixture is generated. These fail when it has been hand-edited."""

    def setUp(self):
        self.eobs, self.plan = load(FHIR_FIXTURE)
        with open(FLAT_FIXTURE, encoding="utf-8") as handle:
            self.flat = json.load(handle)

    def test_generated_file_matches_the_bundle(self):
        self.assertEqual(
            to_flat(self.eobs, self.plan, comment=self.flat["_comment"]),
            self.flat,
            "data/samples/household_eobs.json is stale. Regenerate it with "
            "`python -m pipeline.claims.fhir`.",
        )

    def test_both_sources_produce_the_same_records(self):
        from_flat = [
            Eob(**{k: v for k, v in entry.items() if not k.startswith("_")})
            for entry in self.flat["eobs"]
        ]
        self.assertEqual(self.eobs, from_flat)

    def test_both_sources_produce_the_same_findings(self):
        """The engine cannot tell which file its claims came from."""
        plan = HouseholdPlan(**self.flat["plan"])
        from_flat = [
            Eob(**{k: v for k, v in entry.items() if not k.startswith("_")})
            for entry in self.flat["eobs"]
        ]
        self.assertEqual(review(self.eobs, self.plan), review(from_flat, plan))
        self.assertEqual(total_at_stake(review(self.eobs, self.plan)), 384.09)

    def test_the_bundle_is_a_bundle(self):
        with open(FHIR_FIXTURE, encoding="utf-8") as handle:
            payload = json.load(handle)
        self.assertEqual(payload["bundle"]["resourceType"], "Bundle")
        self.assertTrue(
            all(
                entry["resource"]["resourceType"] == "ExplanationOfBenefit"
                for entry in payload["bundle"]["entry"]
            )
        )

    def test_no_member_is_named(self):
        """Hard rule 1: household roles only, on both sides of the mapping."""
        for record in self.eobs:
            self.assertRegex(record.member, r"^(Adult|Child) \d$")


class TestAmounts(unittest.TestCase):
    def test_the_four_required_amounts_are_read(self):
        record = eob_from_item(resource(), item(), "C-1")
        self.assertEqual(record.billed, 200.0)
        self.assertEqual(record.allowed, 100.0)
        self.assertEqual(record.plan_paid, 80.0)
        self.assertEqual(record.patient_responsibility, 20.0)

    def test_optional_amounts_default_to_zero(self):
        record = eob_from_item(resource(), item(), "C-1")
        self.assertEqual(record.deductible_applied, 0.0)
        self.assertEqual(record.coinsurance, 0.0)
        self.assertEqual(record.copay, 0.0)

    def test_a_missing_required_amount_raises(self):
        """Never guess a zero here — see the constant's comment in fhir.py."""
        stripped = item()
        stripped["adjudication"] = [
            entry
            for entry in stripped["adjudication"]
            if entry["category"]["coding"][0]["code"] != "eligible"
        ]
        with self.assertRaises(ValueError) as caught:
            eob_from_item(resource(), stripped, "C-1")
        self.assertIn("allowed", str(caught.exception))
        self.assertIn("eligible", str(caught.exception))

    def test_the_code_is_matched_and_the_system_ignored(self):
        """A payer sending a category under an unexpected system still maps."""
        moved = item()
        for entry in moved["adjudication"]:
            entry["category"]["coding"][0]["system"] = "urn:example:payer-codes"
        record = eob_from_item(resource(), moved, "C-1")
        self.assertEqual(record.allowed, 100.0)

    def test_a_category_sent_twice_is_not_summed(self):
        record = eob_from_item(
            resource(), item([amount(C4BB, "eligible", 100.0)]), "C-1"
        )
        self.assertEqual(record.allowed, 100.0)

    def test_unknown_adjudication_categories_are_ignored(self):
        record = eob_from_item(
            resource(), item([amount(C4BB, "drugcost", 42.0)]), "C-1"
        )
        self.assertEqual(record.billed, 200.0)


class TestNetworkStatus(unittest.TestCase):
    def status(self, code):
        return eob_from_item(
            resource(),
            item(
                [
                    {
                        "category": {
                            "coding": [
                                {"system": C4BB, "code": "benefitpaymentstatus"}
                            ]
                        },
                        "reason": {"coding": [{"code": code}]},
                    }
                ]
            ),
            "C-1",
        ).network

    def test_in_network(self):
        self.assertEqual(self.status("innetwork"), "in_network")

    def test_out_of_network(self):
        self.assertEqual(self.status("outofnetwork"), "out_of_network")

    def test_an_unknown_status_is_not_treated_as_in_network(self):
        """Balance billing is only checkable against a contract."""
        self.assertEqual(self.status("other"), "out_of_network")

    def test_an_absent_status_defaults_to_in_network(self):
        self.assertEqual(eob_from_item(resource(), item(), "C-1").network, "in_network")


class TestDenials(unittest.TestCase):
    def test_the_payers_own_code_and_reason_come_through_verbatim(self):
        record = eob_from_item(
            resource(),
            item(
                [
                    {
                        "category": {"coding": [{"system": C4BB, "code": "denialreason"}]},
                        "reason": {
                            "coding": [
                                {"code": "CO-197", "display": "Precertification absent"}
                            ]
                        },
                    }
                ]
            ),
            "C-1",
        )
        self.assertEqual(record.denial_code, "CO-197")
        self.assertEqual(record.denial_reason, "Precertification absent")

    def test_an_undenied_claim_carries_no_denial(self):
        record = eob_from_item(resource(), item(), "C-1")
        self.assertEqual(record.denial_code, "")
        self.assertEqual(record.denial_reason, "")


class TestBundleTraversal(unittest.TestCase):
    def test_one_item_keeps_the_plain_claim_number(self):
        records = eobs_from_bundle(bundle(resource()))
        self.assertEqual([r.claim_id for r in records], ["C-1"])

    def test_several_items_stay_distinguishable(self):
        """Two findings on one claim have to name different lines."""
        second = item(sequence=2)
        records = eobs_from_bundle(bundle(resource(items=[item(), second])))
        self.assertEqual([r.claim_id for r in records], ["C-1-1", "C-1-2"])

    def test_other_resource_types_are_skipped(self):
        """A real searchset carries OperationOutcome and Coverage alongside."""
        noise = {"resourceType": "OperationOutcome", "id": "warn-1"}
        records = eobs_from_bundle(bundle(resource(), noise))
        self.assertEqual(len(records), 1)

    def test_order_is_preserved(self):
        first = resource(id="C-1")
        second = resource(id="C-2")
        records = eobs_from_bundle(bundle(first, second))
        self.assertEqual([r.claim_id for r in records], ["C-1", "C-2"])

    def test_an_empty_bundle_reviews_to_nothing(self):
        self.assertEqual(eobs_from_bundle({"entry": []}), [])

    def test_the_service_date_falls_back_to_the_billable_period(self):
        undated = item()
        del undated["servicedDate"]
        record = eob_from_item(resource(), undated, "C-1")
        self.assertEqual(record.service_date, "2026-01-01")


if __name__ == "__main__":
    unittest.main()
