"""Gate 2 tests. Every order here is synthetic — see CLAUDE.md."""

import unittest

from pipeline.policies.check import check_order, checklist, requirements_for, unmet
from pipeline.policies.rules import (
    REQUIREMENTS,
    ImagingOrder,
    Status,
    evaluate_check,
)


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


class TestAnthemCoverage(unittest.TestCase):
    """Carelon spine and brain, CPT 72148 and 70450.

    Anthem is this metro's primary payer but carried knee rules only, so an
    Anthem member ordering a lumbar MRI or head CT reached route 3 and found
    nothing. These cover the two codes that were dark.
    """

    def test_lumbar_six_week_trial_is_unmet_below_threshold(self):
        order = ImagingOrder(
            cpt="72148",
            payer="Anthem",
            indication="low_back_pain",
            conservative_therapy_weeks=2,
        )
        statuses = {f.requirement.key: f.status for f in check_order(order)}
        self.assertIs(
            statuses["carelon-lumbar-six-week-conservative"], Status.UNMET
        )

    def test_lumbar_six_week_trial_is_met_at_threshold(self):
        order = ImagingOrder(
            cpt="72148",
            payer="Anthem",
            indication="low_back_pain",
            conservative_therapy_weeks=6,
        )
        statuses = {f.requirement.key: f.status for f in check_order(order)}
        self.assertIs(statuses["carelon-lumbar-six-week-conservative"], Status.MET)

    def test_lumbar_weeks_absent_is_not_documented_not_unmet(self):
        """The distinction the ordering office acts on differently."""
        order = ImagingOrder(cpt="72148", payer="Anthem", indication="low_back_pain")
        statuses = {f.requirement.key: f.status for f in check_order(order)}
        self.assertIs(
            statuses["carelon-lumbar-six-week-conservative"], Status.NOT_DOCUMENTED
        )

    def test_head_ct_headache_feature_drives_the_finding(self):
        absent = ImagingOrder(cpt="70450", payer="Anthem", indication="headache")
        documented = ImagingOrder(
            cpt="70450",
            payer="Anthem",
            indication="headache",
            headache_concerning_feature=True,
        )
        self.assertIs(
            check_order(absent)[0].status, Status.NOT_DOCUMENTED
        )
        self.assertIs(check_order(documented)[0].status, Status.MET)

    def test_head_ct_checklist_is_citable_and_hedged(self):
        text = checklist(
            ImagingOrder(cpt="70450", payer="Anthem", indication="headache")
        )
        self.assertIn("Imaging of the Brain", text)
        # Carelon lists the features as alternatives, so the output must not
        # read as though the study fails to qualify.
        self.assertIn("alternative criteria", text)

    def test_anthem_now_covers_all_three_target_codes(self):
        covered = {
            code
            for requirement in REQUIREMENTS
            if requirement.citation.payer.startswith("Anthem")
            for code in requirement.cpt_codes
        }
        self.assertEqual(covered, {"73721", "72148", "70450"})


class TestPayerScoping(unittest.TestCase):
    def test_requirements_do_not_leak_across_payers(self):
        """A Cigna rule must not be applied to an Anthem order.

        This used to assert the Anthem result was empty, which passed only
        because Anthem had no lumbar rule to find. That made it a test of a
        coverage gap rather than of payer scoping, and it broke the moment the
        gap was closed. Assert the actual property instead: whatever comes back
        is Anthem's, and none of it is Cigna's.
        """
        anthem = ImagingOrder(cpt="72148", payer="Anthem", indication="low_back_pain")
        found = requirements_for(anthem)
        self.assertTrue(found, "Anthem should now have a lumbar requirement")
        for requirement in found:
            self.assertEqual(
                requirement.citation.payer, "Anthem Blue Cross and Blue Shield"
            )
        cigna = ImagingOrder(cpt="72148", payer="Cigna", indication="low_back_pain")
        self.assertTrue(found)
        self.assertFalse(
            {r.key for r in found} & {r.key for r in requirements_for(cigna)}
        )

    def test_uncovered_combination_says_so_plainly(self):
        order = ImagingOrder(cpt="70450", payer="Aetna", indication="head_trauma")
        self.assertIn("does not cover it", checklist(order))



class TestDeclarativeChecks(unittest.TestCase):
    """The check descriptors are the spec the app mirrors, so they are tested.

    A regex over the quote text used to stand in for these on the mobile side
    and got both the threshold and the met/not-documented distinction wrong.
    """

    KNOWN_TYPES = {
        'boolean',
        'min_weeks',
        'radiographs_nondiagnostic',
        'meniscal_pathway',
        'ligament_pathway',
        'objective_findings_then_weeks',
    }

    def test_every_requirement_has_a_known_check_type(self):
        for requirement in REQUIREMENTS:
            self.assertIn(
                requirement.check['type'], self.KNOWN_TYPES, requirement.key
            )

    def test_unknown_check_type_is_rejected_loudly(self):
        order = ImagingOrder(cpt='73721', payer='Anthem', indication='meniscal_tear')
        with self.assertRaises(ValueError):
            evaluate_check({'type': 'not_a_real_check'}, order)

    def test_thresholds_live_in_the_check_not_the_prose(self):
        """The app reads these numbers; they must not be parsed out of quotes."""
        by_key = {r.key: r for r in REQUIREMENTS}
        self.assertEqual(by_key['evicore-lumbar-six-week-treatment'].check['weeks'], 6)
        self.assertEqual(by_key['aetna-spine-degenerative-four-weeks'].check['weeks'], 4)
        self.assertEqual(by_key['carelon-knee-ligament-conservative'].check['weeks'], 4)

    def test_missing_input_reads_as_not_documented_not_unmet(self):
        order = ImagingOrder(cpt='72148', payer='Cigna', indication='low_back_pain')
        for requirement in requirements_for(order):
            self.assertIs(
                requirement.evaluate(order), Status.NOT_DOCUMENTED, requirement.key
            )


if __name__ == "__main__":
    unittest.main()
