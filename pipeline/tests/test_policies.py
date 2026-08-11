"""Gate 2 tests. Every order here is synthetic — see CLAUDE.md."""

import unittest

from pipeline.policies.check import check_order, checklist, requirements_for, unmet
from pipeline.policies.rules import REQUIREMENTS, ImagingOrder, Status


class TestRuleSet(unittest.TestCase):
    def test_gate_2_bar_is_met(self):
        """Five clean citable rules across three payers is the gate."""
        self.assertGreaterEqual(len(REQUIREMENTS), 5)
        payers = {r.citation.payer for r in REQUIREMENTS}
        self.assertGreaterEqual(len(payers), 3)

    def test_every_requirement_is_citable(self):
        for requirement in REQUIREMENTS:
            citation = requirement.citation
            for field in ("document_title", "section_id", "version", "source_url"):
                self.assertTrue(
                    getattr(citation, field), f"{requirement.key} missing {field}"
                )
            self.assertTrue(requirement.quote.strip(), requirement.key)
            self.assertTrue(citation.source_url.startswith("https://"))


class TestLumbarMri(unittest.TestCase):
    """Cigna / eviCore SP-5.1, CPT 72148."""

    def order(self, **overrides):
        base = dict(cpt="72148", payer="Cigna", indication="low_back_pain")
        base.update(overrides)
        return ImagingOrder(**base)

    def test_three_requirements_apply(self):
        self.assertEqual(len(requirements_for(self.order())), 3)

    def test_bare_order_reports_all_three_as_undocumented(self):
        findings = unmet(self.order())
        self.assertEqual(len(findings), 3)
        self.assertTrue(
            all(f.status is Status.NOT_DOCUMENTED for f in findings)
        )

    def test_four_weeks_is_unmet_not_merely_undocumented(self):
        findings = {f.requirement.key: f.status for f in check_order(
            self.order(
                conservative_therapy_weeks=4,
                in_person_evaluation_this_episode=True,
                reevaluation_after_treatment=True,
            )
        )}
        self.assertIs(
            findings["evicore-lumbar-six-week-treatment"], Status.UNMET
        )

    def test_six_weeks_with_full_documentation_passes(self):
        order = self.order(
            conservative_therapy_weeks=6,
            in_person_evaluation_this_episode=True,
            reevaluation_after_treatment=True,
        )
        self.assertEqual(unmet(order), [])
        self.assertIn("documented as met", checklist(order))

    def test_red_flag_waives_the_waiting_period(self):
        order = self.order(
            conservative_therapy_weeks=1,
            in_person_evaluation_this_episode=True,
            reevaluation_after_treatment=True,
            red_flags=("cauda_equina_syndrome",),
        )
        statuses = {f.requirement.key: f.status for f in check_order(order)}
        self.assertIs(
            statuses["evicore-lumbar-six-week-treatment"], Status.NOT_APPLICABLE
        )
        self.assertEqual(unmet(order), [])

    def test_checklist_quotes_the_payer_and_cites_the_section(self):
        text = checklist(self.order(conservative_therapy_weeks=2))
        self.assertIn("6-week trial of provider-directed treatment", text)
        self.assertIn("SP.LB.0005.1.A", text)
        self.assertIn("https://", text)


class TestKneeMri(unittest.TestCase):
    """Anthem / Carelon Imaging of the Extremities, CPT 73721."""

    def order(self, **overrides):
        base = dict(cpt="73721", payer="Anthem", indication="meniscal_tear")
        base.update(overrides)
        return ImagingOrder(**base)

    def test_mechanical_symptoms_with_two_findings_needs_no_waiting_period(self):
        order = self.order(
            prior_radiographs="nondiagnostic",
            mechanical_symptoms=True,
            meniscal_exam_findings=("joint_line_tenderness", "positive_mcmurray_or_apley"),
        )
        self.assertEqual(unmet(order), [])

    def test_one_finding_requires_six_weeks(self):
        order = self.order(
            prior_radiographs="nondiagnostic",
            mechanical_symptoms=False,
            meniscal_exam_findings=("joint_line_tenderness",),
            conservative_therapy_weeks=3,
        )
        statuses = {f.requirement.key: f.status for f in check_order(order)}
        self.assertIs(statuses["carelon-knee-meniscal-pathway"], Status.UNMET)

    def test_diagnostic_radiographs_fail_the_prerequisite(self):
        order = self.order(
            prior_radiographs="diagnostic",
            mechanical_symptoms=True,
            meniscal_exam_findings=("joint_line_tenderness", "reduced_range_of_motion"),
        )
        statuses = {f.requirement.key: f.status for f in check_order(order)}
        self.assertIs(
            statuses["carelon-knee-nondiagnostic-radiographs"], Status.UNMET
        )

    def test_alternative_pathway_is_hedged_in_the_checklist(self):
        text = checklist(
            self.order(prior_radiographs="nondiagnostic", conservative_therapy_weeks=1)
        )
        self.assertIn("alternative criteria", text)


class TestPayerScoping(unittest.TestCase):
    def test_requirements_do_not_leak_across_payers(self):
        """A Cigna rule must not be applied to an Anthem order."""
        anthem = ImagingOrder(cpt="72148", payer="Anthem", indication="low_back_pain")
        self.assertEqual(requirements_for(anthem), [])

    def test_uncovered_combination_says_so_plainly(self):
        order = ImagingOrder(cpt="70450", payer="Aetna", indication="head_trauma")
        self.assertIn("does not cover it", checklist(order))


if __name__ == "__main__":
    unittest.main()
