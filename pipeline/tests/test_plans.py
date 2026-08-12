"""Tests for plan classification and member-plan matching.

Every plan string here is copied verbatim from a real published Indianapolis
hospital file, because the failure modes are specific to how hospitals actually
write these strings.
"""

import unittest

from pipeline.costing.routes import FacilityPrice, eligible_in_network
from pipeline.payers import normalize, resolve
from pipeline.plans import classify, match_score, rank_matches


class TestPlanClassification(unittest.TestCase):
    def test_strips_leading_id_and_trailing_date(self):
        plan = classify("8255_ANTHEM CONNECT  MEDICAID REPLACEMENT OUTPATIENT 20240101")
        self.assertTrue(plan.label.startswith("ANTHEM CONNECT"))
        self.assertNotIn("8255", plan.label)
        self.assertNotIn("20240101", plan.label)

    def test_strips_trailing_bracket_code(self):
        self.assertEqual(classify("ANTHEM HMO [101405]").label, "ANTHEM HMO")

    def test_medicaid_replacement_detected(self):
        plan = classify("8255_ANTHEM CONNECT  MEDICAID REPLACEMENT OUTPATIENT 20240101")
        self.assertEqual(plan.line_of_business, "medicaid")
        self.assertFalse(plan.is_commercial)

    def test_medicare_replacement_detected(self):
        plan = classify("8964_ANTHEM MEDICARE REPLACEMENT ASC OUTPATIENT")
        self.assertEqual(plan.line_of_business, "medicare")

    def test_ordinary_commercial_plan(self):
        plan = classify("ANTHEM BLUE ACCESS PPO WITH COPPS - INDIANAPOLIS & CARMEL")
        self.assertEqual(plan.line_of_business, "commercial")
        self.assertEqual(plan.product, "ppo")
        self.assertFalse(plan.is_carve_out)

    def test_service_line_carve_outs_flagged(self):
        for raw in (
            "9399_ANTHEM HEALTHSYNC HMO VEIN 20250101",
            "4090_ANTHEM BEHAVIORAL  MEDICAID REPLACEMENT OUTPATIENT 202002",
        ):
            self.assertTrue(classify(raw).is_carve_out, raw)

    def test_product_detection(self):
        self.assertEqual(classify("ANTHEM HEALTHSYNC POS WITH COPPS").product, "pos")
        self.assertEqual(classify("ANTHEM HMO [101405]").product, "hmo")
        self.assertIsNone(classify("ANTHEM FRANCISCAN EMPLOYEE COPPS").product)


class TestLineOfBusinessFromPlan(unittest.TestCase):
    """The bug this layer exists to fix.

    Ascension St. Vincent Carmel files Medicaid managed care under an Anthem
    payer string. Reading the payer alone offers a commercial member a $49.04
    knee MRI they can never be charged.
    """

    MEDICAID_PLAN = "8255_ANTHEM CONNECT  MEDICAID REPLACEMENT OUTPATIENT 20240101"

    def test_payer_string_alone_looks_commercial(self):
        self.assertTrue(normalize("BLUE CROSS [1014]").usable_for_commercial_routing)

    def test_plan_string_downgrades_it(self):
        identity = resolve("BLUE CROSS [1014]", self.MEDICAID_PLAN)
        self.assertEqual(identity.line_of_business, "medicaid")
        self.assertFalse(identity.usable_for_commercial_routing)

    def test_plan_can_never_promote_into_commercial(self):
        """A Medicare payer with a commercial-looking plan stays Medicare."""
        identity = resolve("MEDICARE [1099]", "ANTHEM BLUE ACCESS PPO")
        self.assertEqual(identity.line_of_business, "medicare")
        self.assertFalse(identity.usable_for_commercial_routing)

    def test_medicaid_row_is_excluded_from_routing(self):
        prices = [
            FacilityPrice(
                "asc", "Ascension St. Vincent Carmel", "", "73721",
                "BLUE CROSS [1014]", self.MEDICAID_PLAN,
                negotiated_dollar=49.04, gross_charge=1942.0,
            ),
        ]
        self.assertEqual(eligible_in_network(prices, "anthem"), [])

    def test_vein_carve_out_is_excluded_from_routing(self):
        prices = [
            FacilityPrice(
                "asc", "Ascension St. Vincent Carmel", "", "73721",
                "BLUE CROSS [1014]", "9399_ANTHEM HEALTHSYNC HMO VEIN 20250101",
                negotiated_dollar=311.13, gross_charge=1942.0,
            ),
        ]
        self.assertEqual(eligible_in_network(prices, "anthem"), [])


class TestMemberPlanMatching(unittest.TestCase):
    FRANCISCAN_PLANS = [
        "ANTHEM BLUE ACCESS PPO WITH COPPS - INDIANAPOLIS & CARMEL",
        "ANTHEM BLUE ACCESS PPO-CID",
        "ANTHEM FRANCISCAN EMPLOYEE COPPS- ALL LOCATIONS",
        "ANTHEM HEALTHSYNC HMO WITH COPPS - INDIANAPOLIS & CARMEL",
        "ANTHEM HEALTHSYNC POS WITH COPPS - INDIANAPOLIS & CARMEL",
    ]

    def candidates(self):
        return [(name, name) for name in self.FRANCISCAN_PLANS]

    def test_blue_access_ppo_matches_both_blue_access_rows(self):
        matches = rank_matches("Anthem Blue Access PPO", self.candidates())
        matched = {payload for _, _, payload in matches}
        self.assertIn("ANTHEM BLUE ACCESS PPO WITH COPPS - INDIANAPOLIS & CARMEL", matched)
        self.assertIn("ANTHEM BLUE ACCESS PPO-CID", matched)

    def test_hmo_member_is_never_matched_to_a_ppo_schedule(self):
        """Product disagreement is disqualifying, not merely low-scoring."""
        ppo = classify("ANTHEM BLUE ACCESS PPO WITH COPPS - INDIANAPOLIS & CARMEL")
        self.assertEqual(match_score("Anthem HealthSync HMO", ppo), 0.0)

    def test_healthsync_hmo_does_not_match_the_pos_row(self):
        matches = rank_matches("Anthem HealthSync HMO", self.candidates())
        matched = {payload for _, _, payload in matches}
        self.assertNotIn(
            "ANTHEM HEALTHSYNC POS WITH COPPS - INDIANAPOLIS & CARMEL", matched
        )

    def test_unrecognised_plan_matches_nothing(self):
        self.assertEqual(rank_matches("Some Other Carrier Gold", self.candidates()), [])

    def test_ambiguity_is_preserved_not_resolved(self):
        """Two Blue Access PPO rows exist at different rates.

        $992.51 and $360.22 under the same product name. Matching must return
        both rather than invent confidence it does not have.
        """
        matches = rank_matches("Anthem Blue Access PPO", self.candidates())
        blue_access = [m for m in matches if "BLUE ACCESS" in m[2]]
        self.assertGreaterEqual(len(blue_access), 2)


class TestPayerAliases(unittest.TestCase):
    def test_elevance_is_anthem(self):
        """IU Health files every Anthem rate under the parent company name."""
        identity = normalize("Elevance Health")
        self.assertEqual(identity.canonical, "anthem")
        self.assertTrue(identity.usable_for_commercial_routing)

    def test_elevance_medicaid_plan_still_downgraded(self):
        identity = resolve("Elevance Health", "All Government Medicaid HIP")
        self.assertEqual(identity.line_of_business, "medicaid")
        self.assertFalse(identity.usable_for_commercial_routing)

    def test_state_qualifier_only_applies_inside_blue_branding(self):
        """A bare 'IL' must not sweep an unrelated payer into Anthem."""
        self.assertTrue(normalize("BLUE CROSS ILLINOIS [1210]").out_of_state)
        for unrelated in ("SIHO Insurance Services", "Encore Health Network"):
            identity = normalize(unrelated)
            self.assertNotEqual(identity.canonical, "anthem", unrelated)

    def test_sagamore_maps_to_cigna(self):
        self.assertEqual(normalize("Sagamore Health Network/Cigna").canonical, "cigna")

    def test_self_pay_is_a_bucket(self):
        self.assertTrue(normalize("Self-Pay").is_bucket)


if __name__ == "__main__":
    unittest.main()
