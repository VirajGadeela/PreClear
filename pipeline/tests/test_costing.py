"""Tests for the deductible-aware cost math and route ranking.

All patients here are synthetic. Prices mirror real published Indianapolis
figures so the tests fail if the math stops matching the real comparison.
"""

import unittest

from pipeline.costing.oop import PlanBenefits, estimate_payment, estimate_year, money
from pipeline.costing.routes import (
    CASH_NON_CONTRACTED,
    IN_NETWORK_AS_WRITTEN,
    IN_NETWORK_CHEAPER_SITE,
    FacilityPrice,
    build_routes,
    eligible_in_network,
    explain_ranking,
    rank_routes,
)
from pipeline.payers import normalize


class TestPayerNormalization(unittest.TestCase):
    def test_strips_internal_code(self):
        self.assertEqual(normalize("BLUE CROSS [1014]").label, "BLUE CROSS")

    def test_anthem_indiana_is_usable(self):
        identity = normalize("BLUE CROSS [1014]")
        self.assertEqual(identity.canonical, "anthem")
        self.assertTrue(identity.usable_for_commercial_routing)

    def test_out_of_state_blue_is_not_anthem_indiana(self):
        for raw in (
            "BLUE CROSS ILLINOIS [1210]",
            "BLUE CROSS OUT OF STATE [1211]",
            "UNICARE [1150]",
        ):
            identity = normalize(raw)
            self.assertTrue(identity.out_of_state, raw)
            self.assertFalse(identity.usable_for_commercial_routing, raw)

    def test_buckets_name_no_payer(self):
        for raw in ("MANAGED CARE [2000]", "COMMERCIAL [2001]"):
            identity = normalize(raw)
            self.assertTrue(identity.is_bucket, raw)
            self.assertIsNone(identity.canonical, raw)
            self.assertFalse(identity.usable_for_commercial_routing, raw)

    def test_government_lines_excluded(self):
        for raw, lob in (
            ("MEDICARE [1099]", "medicare"),
            ("MEDICARE REPLACEMENT [2003]", "medicare"),
            ("MEDICAID [1092]", "medicaid"),
            ("MDWISE [1175]", "medicaid"),
            ("MANAGED HEALTH SERVICES [1302]", "medicaid"),
            ("WORKERS COMP [1172]", "workers_comp"),
            ("TRICARE [1177]", "government"),
        ):
            identity = normalize(raw)
            self.assertEqual(identity.line_of_business, lob, raw)
            self.assertFalse(identity.usable_for_commercial_routing, raw)

    def test_uhc_medicare_is_not_commercial_uhc(self):
        identity = normalize("UNITED HEALTHCARE MEDICARE [1007]")
        self.assertEqual(identity.line_of_business, "medicare")
        self.assertFalse(identity.usable_for_commercial_routing)

    def test_umr_maps_to_unitedhealthcare(self):
        self.assertEqual(
            normalize("UNITED MEDICAL RESOURCES [1301]").canonical, "unitedhealthcare"
        )

    def test_alt_payer_prefix_is_stripped(self):
        identity = normalize("ALT PAYER INDIANA BLUE CROSS [121003]")
        self.assertEqual(identity.canonical, "anthem")
        self.assertTrue(identity.usable_for_commercial_routing)

    def test_unknown_specific_payer_is_not_a_bucket(self):
        identity = normalize("GREAT WEST INSURANCE [1055]")
        self.assertIsNone(identity.canonical)
        self.assertFalse(identity.is_bucket)


class TestPaymentMath(unittest.TestCase):
    def test_full_cost_when_deductible_not_met(self):
        benefits = PlanBenefits(2000, 0.2, 6000)
        estimate = estimate_payment(992.51, benefits)
        self.assertAlmostEqual(estimate.patient_pays, 992.51, places=2)
        self.assertAlmostEqual(estimate.applied_to_deductible, 992.51, places=2)
        self.assertAlmostEqual(estimate.benefits_after.deductible_remaining, 1007.49, 2)

    def test_coinsurance_only_when_deductible_met(self):
        benefits = PlanBenefits(0, 0.2, 6000)
        estimate = estimate_payment(1000, benefits)
        self.assertAlmostEqual(estimate.patient_pays, 200.0, places=2)
        self.assertAlmostEqual(estimate.applied_to_deductible, 0.0, places=2)

    def test_deductible_then_coinsurance_split(self):
        benefits = PlanBenefits(400, 0.2, 6000)
        estimate = estimate_payment(1000, benefits)
        # 400 to deductible, 20% of the remaining 600.
        self.assertAlmostEqual(estimate.patient_pays, 520.0, places=2)
        self.assertAlmostEqual(estimate.coinsurance_paid, 120.0, places=2)

    def test_oop_max_caps_the_payment(self):
        benefits = PlanBenefits(5000, 0.2, 300)
        estimate = estimate_payment(1000, benefits)
        self.assertAlmostEqual(estimate.patient_pays, 300.0, places=2)
        self.assertAlmostEqual(estimate.shielded_by_oop_max, 700.0, places=2)
        self.assertEqual(estimate.benefits_after.oop_max_remaining, 0)

    def test_deductible_credit_never_exceeds_amount_paid(self):
        """With the OOP max binding, the deductible cannot absorb unpaid money."""
        benefits = PlanBenefits(5000, 0.2, 300)
        estimate = estimate_payment(1000, benefits)
        self.assertLessEqual(estimate.applied_to_deductible, estimate.patient_pays)

    def test_cash_payment_earns_no_credit(self):
        benefits = PlanBenefits(2000, 0.2, 6000)
        estimate = estimate_payment(574.27, benefits, counts_toward_deductible=False)
        self.assertAlmostEqual(estimate.patient_pays, 574.27, places=2)
        self.assertEqual(estimate.applied_to_deductible, 0.0)
        self.assertEqual(estimate.benefits_after.deductible_remaining, 2000)

    def test_negative_amount_rejected(self):
        with self.assertRaises(ValueError):
            estimate_payment(-1, PlanBenefits(0, 0.2, 100))

    def test_invalid_coinsurance_rejected(self):
        with self.assertRaises(ValueError):
            PlanBenefits(0, 1.5, 100)


class TestTheCoreAsymmetry(unittest.TestCase):
    """Real Franciscan Health Indianapolis figures for CPT 73721."""

    ANTHEM_NEGOTIATED = 992.51
    CASH = 574.27

    def test_cash_wins_when_no_other_care_expected(self):
        benefits = PlanBenefits(2000, 0.2, 6000)
        insured = estimate_year(self.ANTHEM_NEGOTIATED, benefits, True, 0)
        cash = estimate_year(self.CASH, benefits, False, 0)
        self.assertLess(cash.total_this_year, insured.total_this_year)

    def test_insured_wins_when_the_deductible_will_be_met_anyway(self):
        """The whole thesis: the cheaper payment is the worse decision here."""
        benefits = PlanBenefits(2000, 0.2, 6000)
        insured = estimate_year(self.ANTHEM_NEGOTIATED, benefits, True, 8000)
        cash = estimate_year(self.CASH, benefits, False, 8000)
        self.assertLess(insured.total_this_year, cash.total_this_year)
        # Paying cash leaves the full deductible to clear on the later care.
        self.assertEqual(cash.deductible_credit_earned, 0.0)
        self.assertAlmostEqual(
            insured.deductible_credit_earned, self.ANTHEM_NEGOTIATED, places=2
        )

    def test_cash_saving_today_is_smaller_than_it_looks(self):
        benefits = PlanBenefits(2000, 0.2, 6000)
        scan_only_saving = self.ANTHEM_NEGOTIATED - self.CASH
        insured = estimate_year(self.ANTHEM_NEGOTIATED, benefits, True, 3000)
        cash = estimate_year(self.CASH, benefits, False, 3000)
        year_saving = cash.total_this_year - insured.total_this_year
        self.assertGreater(scan_only_saving, 0)
        # Over the year the sign flips.
        self.assertGreater(year_saving, 0)


class TestRouteBuilding(unittest.TestCase):
    def prices(self):
        return [
            FacilityPrice(
                "franciscan-indianapolis", "Franciscan Health Indianapolis",
                "8111 S EMERSON AVE, INDIANAPOLIS, IN", "73721",
                "BLUE CROSS [1014]", "ANTHEM BLUE ACCESS PPO",
                negotiated_dollar=992.51, cash_price=574.27, gross_charge=2486.0,
            ),
            FacilityPrice(
                "hendricks-regional", "Hendricks Regional Health",
                "1000 E MAIN ST, DANVILLE, IN", "73721",
                "BLUE CROSS [1014]", "ANTHEM PPO",
                negotiated_dollar=610.44, cash_price=565.20, gross_charge=1413.0,
            ),
            # Must be excluded: out-of-state Blue affiliate.
            FacilityPrice(
                "elsewhere", "Out Of State Facility", "", "73721",
                "BLUE CROSS ILLINOIS [1210]", "ANTHEM WI",
                negotiated_dollar=120.0, gross_charge=2000.0,
            ),
            # Must be excluded: catch-all bucket.
            FacilityPrice(
                "bucketed", "Bucketed Facility", "", "73721",
                "MANAGED CARE [2000]", "", negotiated_dollar=99.0, gross_charge=2000.0,
            ),
        ]

    def test_only_eligible_rows_are_compared(self):
        eligible = eligible_in_network(self.prices(), "anthem")
        self.assertEqual(
            {p.facility_key for p in eligible},
            {"franciscan-indianapolis", "hendricks-regional"},
        )

    def test_cheaper_site_route_is_built(self):
        routes = build_routes(
            self.prices(), "anthem", PlanBenefits(2000, 0.2, 6000),
            ordered_facility_key="franciscan-indianapolis",
        )
        kinds = {r.kind for r in routes}
        self.assertIn(IN_NETWORK_AS_WRITTEN, kinds)
        self.assertIn(IN_NETWORK_CHEAPER_SITE, kinds)
        cheaper = next(r for r in routes if r.kind == IN_NETWORK_CHEAPER_SITE)
        self.assertEqual(cheaper.facility_name, "Hendricks Regional Health")

    def test_cash_route_only_when_appropriate(self):
        args = (self.prices(), "anthem", PlanBenefits(2000, 0.2, 6000))
        without = build_routes(*args, ordered_facility_key="franciscan-indianapolis")
        self.assertNotIn(CASH_NON_CONTRACTED, {r.kind for r in without})
        with_cash = build_routes(
            *args, ordered_facility_key="franciscan-indianapolis",
            cash_is_appropriate=True,
        )
        self.assertIn(CASH_NON_CONTRACTED, {r.kind for r in with_cash})

    def test_suspect_rate_above_gross_charge_is_flagged(self):
        prices = [
            FacilityPrice(
                "f", "Flagged Facility", "", "73721", "BLUE CROSS [1014]", "PPO",
                negotiated_dollar=2817.0, gross_charge=2486.0,
            )
        ]
        routes = build_routes(prices, "anthem", PlanBenefits(2000, 0.2, 6000))
        self.assertTrue(
            any("exceeds this hospital's gross charge" in w
                for r in routes for w in r.warnings)
        )

    def test_order_corrected_route_carries_the_checklist(self):
        routes = build_routes(
            self.prices(), "anthem", PlanBenefits(2000, 0.2, 6000),
            ordered_facility_key="franciscan-indianapolis",
            unmet_requirements=("6-week trial of provider-directed treatment",),
        )
        corrected = next(
            r for r in routes if r.kind == "in_network_order_corrected"
        )
        self.assertEqual(len(corrected.unmet_requirements), 1)
        # Correcting the order does not change the price.
        baseline = next(r for r in routes if r.kind == IN_NETWORK_AS_WRITTEN)
        self.assertAlmostEqual(
            corrected.total_this_year, baseline.total_this_year, places=2
        )


class TestRanking(unittest.TestCase):
    def prices(self):
        return [
            FacilityPrice(
                "expensive", "Expensive Hospital", "", "73721",
                "BLUE CROSS [1014]", "PPO",
                negotiated_dollar=992.51, cash_price=574.27, gross_charge=2486.0,
            ),
        ]

    def test_ranks_on_year_total_not_scan_price(self):
        """With heavy expected care, the insured route must outrank cash."""
        routes = build_routes(
            self.prices(), "anthem", PlanBenefits(2000, 0.2, 6000),
            ordered_facility_key="expensive",
            expected_other_allowed_spend=8000,
            cash_is_appropriate=True,
        )
        ranked = rank_routes(routes)
        self.assertEqual(ranked[0].kind, IN_NETWORK_AS_WRITTEN)
        explanation = explain_ranking(routes)
        self.assertIn("earns no deductible credit", explanation)

    def test_cash_ranks_first_when_no_other_care_expected(self):
        routes = build_routes(
            self.prices(), "anthem", PlanBenefits(2000, 0.2, 6000),
            ordered_facility_key="expensive",
            expected_other_allowed_spend=0,
            cash_is_appropriate=True,
        )
        self.assertEqual(rank_routes(routes)[0].kind, CASH_NON_CONTRACTED)


class TestDisclosure(unittest.TestCase):
    def test_every_figure_is_labelled_an_estimate(self):
        self.assertEqual(money(1234.5), "$1,234.50 (estimate)")

    def test_forbidden_language_absent_from_route_output(self):
        routes = build_routes(
            [
                FacilityPrice(
                    "a", "A Hospital", "", "73721", "BLUE CROSS [1014]", "PPO",
                    negotiated_dollar=500.0, cash_price=400.0, gross_charge=1000.0,
                )
            ],
            "anthem", PlanBenefits(1000, 0.2, 5000),
            cash_is_appropriate=True,
        )
        text = " ".join(r.summary() for r in routes) + explain_ranking(routes)
        for banned in (
            "guaranteed", "you will pay", "Good Faith Estimate", "approved",
            "HIPAA", "denial", "deny",
        ):
            self.assertNotIn(banned.lower(), text.lower(), banned)
        self.assertIn("(estimate)", text)


if __name__ == "__main__":
    unittest.main()


class TestNoiseSuppression(unittest.TestCase):
    def test_equal_priced_alternative_is_not_offered_as_cheaper(self):
        prices = [
            FacilityPrice(
                "a", "Hospital A", "", "73721", "BLUE CROSS [1014]", "PPO",
                negotiated_dollar=610.44, gross_charge=2486.0,
            ),
            FacilityPrice(
                "b", "Hospital B", "", "73721", "BLUE CROSS [1014]", "PPO",
                negotiated_dollar=610.44, gross_charge=2486.0,
            ),
        ]
        routes = build_routes(
            prices, "anthem", PlanBenefits(2000, 0.2, 6000), ordered_facility_key="a"
        )
        self.assertNotIn(IN_NETWORK_CHEAPER_SITE, {r.kind for r in routes})
