"""Household year plan tests. Every procedure here is synthetic — CLAUDE.md.

The rates are real published Indianapolis figures for the three CPTs in the
bundle; the households planning them are not real.
"""

import unittest
from itertools import permutations

from pipeline.costing.oop import PlanBenefits
from pipeline.costing.yearplan import (
    MAX_PROCEDURES,
    PlannedProcedure,
    evaluate_year_plan,
    optimize_year_plan,
)

# Cheapest in-network and cheapest cash under UnitedHealthcare, from
# app/assets/preclear-data.json.
KNEE = PlannedProcedure(
    "p1", "73721", "Adult 1", 925.00, "Franciscan Indianapolis", 367.93, "IU Health University"
)
LUMBAR = PlannedProcedure(
    "p2", "72148", "Adult 2", 807.00, "Franciscan Indianapolis", 367.93, "IU Health University"
)
HEAD_CT = PlannedProcedure(
    "p3", "70450", "Child 1", 493.20, "Franciscan Indianapolis", 252.39, "IU Health University"
)
ALL_THREE = [KNEE, LUMBAR, HEAD_CT]


def benefits(deductible=2000.0, coinsurance=0.2, oop_max=9000.0):
    return PlanBenefits(deductible, coinsurance, oop_max)


class TestOrderIndependence(unittest.TestCase):
    """The finding that killed the sequencing feature, kept as a test.

    A "do the expensive one first" recommendation would change nothing and
    claim to change something, in an app whose numbers are meant to be
    checkable. If this ever fails, the cost model has changed shape and that
    conclusion needs revisiting before anyone acts on it.
    """

    def test_total_is_order_independent_when_all_insured(self):
        totals = {
            evaluate_year_plan(
                list(order), [False] * 3, benefits(), 1500.0
            ).total_this_year
            for order in permutations(ALL_THREE)
        }
        self.assertEqual(len(totals), 1)

    def test_total_is_order_independent_with_cash_in_the_mix(self):
        totals = set()
        for order in permutations(ALL_THREE):
            mask = [procedure.id == "p1" for procedure in order]
            totals.add(
                evaluate_year_plan(list(order), mask, benefits(), 1500.0).total_this_year
            )
        self.assertEqual(len(totals), 1)


class TestEvaluate(unittest.TestCase):
    def test_empty_plan_is_just_the_rest_of_the_year(self):
        plan = evaluate_year_plan([], [], benefits(), 1000.0)
        self.assertEqual(plan.decisions, ())
        self.assertEqual(plan.procedures_cost, 0.0)
        self.assertEqual(plan.total_this_year, 1000.0)

    def test_cash_earns_no_deductible_credit(self):
        cash = evaluate_year_plan([KNEE], [True], benefits(), 0.0)
        insured = evaluate_year_plan([KNEE], [False], benefits(), 0.0)
        self.assertEqual(cash.deductible_remaining_after, 2000.0)
        self.assertEqual(insured.deductible_remaining_after, 2000.0 - 925.00)

    def test_insured_decision_carries_no_dollar_figure(self):
        """The total is order-independent; the attribution is not."""
        plan = evaluate_year_plan(ALL_THREE, [False, False, False], benefits(), 0.0)
        for decision in plan.decisions:
            self.assertIsNone(decision.cash_paid)

    def test_cash_decision_carries_its_price(self):
        plan = evaluate_year_plan([KNEE], [True], benefits(), 0.0)
        self.assertEqual(plan.decisions[0].cash_paid, 367.93)
        self.assertEqual(plan.decisions[0].facility, "IU Health University")

    def test_cash_without_a_published_price_is_refused(self):
        no_cash = PlannedProcedure("p9", "73721", "Adult 1", 925.00, "Somewhere")
        with self.assertRaises(ValueError):
            evaluate_year_plan([no_cash], [True], benefits(), 0.0)

    def test_mismatched_lengths_are_refused(self):
        with self.assertRaises(ValueError):
            evaluate_year_plan(ALL_THREE, [False], benefits(), 0.0)

    def test_negative_other_spend_is_refused(self):
        with self.assertRaises(ValueError):
            evaluate_year_plan([KNEE], [False], benefits(), -1.0)


class TestOptimize(unittest.TestCase):
    """The product's central claim, on real published rates."""

    def test_cash_wins_when_little_other_care_is_expected(self):
        comparison = optimize_year_plan(ALL_THREE, benefits(), 1000.0)
        self.assertEqual(comparison.best.cash_count, 3)
        self.assertEqual(comparison.best.total_this_year, 1988.25)

    def test_insurance_wins_once_the_deductible_is_reachable(self):
        comparison = optimize_year_plan(ALL_THREE, benefits(), 2000.0)
        self.assertEqual(comparison.best.cash_count, 0)
        self.assertEqual(comparison.best.total_this_year, 2445.04)
        self.assertEqual(comparison.all_cash.total_this_year, 2988.25)
        self.assertEqual(comparison.saving, 543.21)

    def test_each_scan_alone_would_say_cash_in_both_cases(self):
        """Why the household answer is not the single-scan answer repeated."""
        for other in (1000.0, 2000.0):
            for procedure in ALL_THREE:
                alone = optimize_year_plan([procedure], benefits(), 0.0)
                self.assertEqual(alone.best.cash_count, 1, procedure.cpt)

    def test_best_is_never_worse_than_either_naive_plan(self):
        for other in (0.0, 500.0, 1500.0, 4000.0, 9000.0):
            comparison = optimize_year_plan(ALL_THREE, benefits(), other)
            self.assertLessEqual(
                comparison.best.total_this_year, comparison.all_cash.total_this_year
            )
            self.assertLessEqual(
                comparison.best.total_this_year, comparison.all_insured.total_this_year
            )

    def test_saving_is_measured_against_the_costlier_naive_plan(self):
        comparison = optimize_year_plan(ALL_THREE, benefits(), 2000.0)
        self.assertIs(comparison.alternative, comparison.all_cash)
        self.assertEqual(
            comparison.saving,
            round(
                comparison.all_cash.total_this_year
                - comparison.best.total_this_year,
                2,
            ),
        )

    def test_a_procedure_without_a_cash_price_stays_insured(self):
        no_cash = PlannedProcedure("p9", "72148", "Adult 2", 807.00, "Somewhere")
        comparison = optimize_year_plan([KNEE, no_cash], benefits(), 0.0)
        self.assertFalse(comparison.best.decisions[1].pay_cash)
        self.assertEqual(comparison.all_cash.decisions[1].pay_cash, False)

    def test_ties_break_deterministically(self):
        repeated = [
            optimize_year_plan(ALL_THREE, benefits(0.0, 0.5), 0.0).best.decisions
            for _ in range(5)
        ]
        for plan in repeated[1:]:
            self.assertEqual(
                [d.pay_cash for d in plan], [d.pay_cash for d in repeated[0]]
            )

    def test_too_many_procedures_is_refused(self):
        many = [
            PlannedProcedure(f"p{i}", "73721", "Adult 1", 100.0, "X", 50.0, "Y")
            for i in range(MAX_PROCEDURES + 1)
        ]
        with self.assertRaises(ValueError):
            optimize_year_plan(many, benefits(), 0.0)


if __name__ == "__main__":
    unittest.main()
