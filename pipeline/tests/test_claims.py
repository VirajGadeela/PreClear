"""Claims review tests. Every EOB here is synthetic — see CLAUDE.md."""

import json
import os
import unittest

from pipeline.claims.eob import (
    Eob,
    HouseholdPlan,
    charged_past_oop_max,
    components_do_not_sum,
    deductible_over_applied,
    denial_carries_appeal_rights,
    duplicate_claims,
    patient_owes_more_than_allowed,
    review,
    total_at_stake,
)

SAMPLE = os.path.join("data", "samples", "household_eobs.json")


def eob(**overrides):
    base = dict(
        claim_id="C-1",
        member="Adult 1",
        service_date="2026-01-01",
        provider="Test Facility",
        code="99213",
        description="Office visit",
        billed=200.0,
        allowed=100.0,
        plan_paid=80.0,
        patient_responsibility=20.0,
        deductible_applied=0.0,
        coinsurance=20.0,
        copay=0.0,
    )
    base.update(overrides)
    return Eob(**base)


class TestBalanceBilling(unittest.TestCase):
    def test_clean_claim_produces_nothing(self):
        self.assertIsNone(patient_owes_more_than_allowed(eob()))

    def test_charge_above_contract_is_caught(self):
        finding = patient_owes_more_than_allowed(eob(patient_responsibility=55.0))
        self.assertIsNotNone(finding)
        self.assertEqual(finding.amount, 35.0)

    def test_out_of_network_cannot_balance_bill(self):
        """No contract, so the check does not apply — not a silent pass."""
        self.assertIsNone(
            patient_owes_more_than_allowed(
                eob(patient_responsibility=55.0, network="out_of_network")
            )
        )

    def test_rounding_noise_is_not_a_finding(self):
        self.assertIsNone(patient_owes_more_than_allowed(eob(patient_responsibility=20.005)))


class TestComponents(unittest.TestCase):
    def test_parts_matching_the_total_is_clean(self):
        self.assertIsNone(components_do_not_sum(eob()))

    def test_mismatch_is_caught(self):
        finding = components_do_not_sum(eob(coinsurance=5.0))
        self.assertIsNotNone(finding)
        self.assertEqual(finding.amount, 15.0)


class TestDenial(unittest.TestCase):
    def test_paid_claim_has_no_denial_finding(self):
        self.assertIsNone(denial_carries_appeal_rights(eob()))

    def test_denial_states_the_right_without_predicting_outcome(self):
        finding = denial_carries_appeal_rights(
            eob(denial_code="CO-197", denial_reason="Precertification absent")
        )
        self.assertIsNotNone(finding)
        # A value would imply a predicted recovery. This must stay unpriced.
        self.assertIsNone(finding.amount)
        text = (finding.summary + finding.action).lower()
        for forbidden in ("will be", "likely", "should win", "guarantee"):
            self.assertNotIn(forbidden, text)


class TestDuplicates(unittest.TestCase):
    def test_same_service_twice_is_caught_once(self):
        pair = [eob(claim_id="C-1"), eob(claim_id="C-2")]
        findings = duplicate_claims(pair)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].claim_id, "C-2")

    def test_same_code_different_day_is_not_a_duplicate(self):
        pair = [eob(claim_id="C-1"), eob(claim_id="C-2", service_date="2026-02-02")]
        self.assertEqual(duplicate_claims(pair), [])

    def test_same_day_different_member_is_not_a_duplicate(self):
        """Two children seen the same day at the same place is ordinary."""
        pair = [eob(claim_id="C-1"), eob(claim_id="C-2", member="Child 1")]
        self.assertEqual(duplicate_claims(pair), [])


class TestYearLimits(unittest.TestCase):
    def test_deductible_within_limit_is_clean(self):
        claims = [eob(deductible_applied=500.0, patient_responsibility=500.0, coinsurance=0.0)]
        self.assertEqual(deductible_over_applied(claims, HouseholdPlan(3000.0, 7500.0)), [])

    def test_deductible_overshoot_is_caught_once(self):
        claims = [
            eob(claim_id=f"C-{i}", service_date=f"2026-0{i}-01",
                deductible_applied=1200.0, patient_responsibility=1200.0, coinsurance=0.0)
            for i in range(1, 5)
        ]
        findings = deductible_over_applied(claims, HouseholdPlan(3000.0, 7500.0))
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].claim_id, "C-3")
        self.assertEqual(findings[0].amount, 600.0)

    def test_charges_past_oop_max_are_caught(self):
        claims = [
            eob(claim_id=f"C-{i}", service_date=f"2026-0{i}-01", patient_responsibility=3000.0)
            for i in range(1, 4)
        ]
        findings = charged_past_oop_max(claims, HouseholdPlan(3000.0, 7500.0))
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].amount, 1500.0)


class TestTotals(unittest.TestCase):
    def test_one_claim_is_counted_once_across_overlapping_findings(self):
        """A balance bill usually fails the components check too.

        Summing both would tell a member they are owed twice what one claim can
        return, which is the exact dishonesty this product exists to correct.
        """
        bad = eob(patient_responsibility=55.0)
        findings = review([bad], HouseholdPlan(3000.0, 7500.0))
        self.assertGreater(len(findings), 1, "expected overlapping findings")
        self.assertEqual(total_at_stake(findings), 35.0)

    def test_unpriced_findings_do_not_break_the_total(self):
        claims = [eob(denial_code="CO-197")]
        self.assertEqual(total_at_stake(review(claims, HouseholdPlan(3000.0, 7500.0))), 0)


class TestSampleHousehold(unittest.TestCase):
    """The committed fixture, which the app ships and the demo shows."""

    def setUp(self):
        with open(SAMPLE, encoding="utf-8") as handle:
            raw = json.load(handle)
        self.plan = HouseholdPlan(**raw["plan"])
        self.eobs = [
            Eob(**{k: v for k, v in item.items() if not k.startswith("_")})
            for item in raw["eobs"]
        ]

    def test_every_check_is_exercised(self):
        kinds = {f.kind for f in review(self.eobs, self.plan)}
        self.assertIn("balance_billed_in_network", kinds)
        self.assertIn("components_do_not_sum", kinds)
        self.assertIn("duplicate_claim", kinds)
        self.assertIn("denial_with_appeal_right", kinds)

    def test_most_claims_are_clean(self):
        """A fixture where everything is wrong would not resemble a real year."""
        flagged = {f.claim_id for f in review(self.eobs, self.plan)}
        self.assertLess(len(flagged), len(self.eobs) / 2)

    def test_total_is_the_deduplicated_figure(self):
        self.assertEqual(total_at_stake(review(self.eobs, self.plan)), 384.09)

    def test_fixture_carries_no_names(self):
        """Hard rule 1. Members are household roles, never people."""
        for item in self.eobs:
            self.assertRegex(item.member, r"^(Adult|Child) \d$")

    def test_findings_are_ordered_by_what_is_recoverable(self):
        findings = review(self.eobs, self.plan)
        priced = [f.amount for f in findings if f.amount is not None]
        self.assertEqual(priced, sorted(priced, reverse=True))
        self.assertIsNone(findings[-1].amount, "unpriced findings sort last")


if __name__ == "__main__":
    unittest.main()
