/**
 * Evaluate published payer requirements against an order.
 *
 * This mirrors `evaluate_check` in pipeline/policies/rules.py case for case.
 * The Python is the source of truth and is the tested version; the checks
 * themselves travel in the data bundle so the thresholds are never re-derived
 * here. An earlier version of this screen scraped week counts out of the quote
 * text with a regex and got both the threshold and the met/not-documented
 * distinction wrong.
 *
 * This reports which published requirements an order does not document as met.
 * It does not estimate denial risk and must never be described as doing so.
 */

import { Requirement } from './routes';

export type Status = 'met' | 'unmet' | 'not_documented' | 'not_applicable';

/**
 * What the app knows about the order. Everything is optional so that "not
 * recorded" stays distinguishable from "recorded as absent" — the patient
 * genuinely does not know most of this, and saying so is the honest output.
 */
export type OrderFacts = {
  conservativeTherapyWeeks?: number;
  priorRadiographs?: 'nondiagnostic' | 'diagnostic';
  inPersonEvaluationThisEpisode?: boolean;
  reevaluationAfterTreatment?: boolean;
  mechanicalSymptoms?: boolean;
  meniscalExamFindings?: string[];
  positiveLigamentStressTests?: string[];
  radiculopathyObjectiveFindings?: boolean;
  redFlags?: string[];
  headacheConcerningFeature?: boolean;
};

const FIELDS: Record<string, keyof OrderFacts> = {
  in_person_evaluation_this_episode: 'inPersonEvaluationThisEpisode',
  reevaluation_after_treatment: 'reevaluationAfterTreatment',
  radiculopathy_objective_findings: 'radiculopathyObjectiveFindings',
  headache_concerning_feature: 'headacheConcerningFeature',
};

function flag(value: boolean | undefined): Status {
  if (value === undefined) return 'not_documented';
  return value ? 'met' : 'unmet';
}

function weeksAtLeast(facts: OrderFacts, threshold: number): Status {
  if (facts.conservativeTherapyWeeks === undefined) return 'not_documented';
  return facts.conservativeTherapyWeeks >= threshold ? 'met' : 'unmet';
}

export function evaluateCheck(check: any, facts: OrderFacts): Status {
  switch (check?.type) {
    case 'boolean':
      return flag(facts[FIELDS[check.field]] as boolean | undefined);

    case 'min_weeks':
      // Red flags waive the waiting period; they do not add a requirement.
      if (check.waived_by_red_flag && (facts.redFlags?.length ?? 0) > 0) {
        return 'not_applicable';
      }
      return weeksAtLeast(facts, check.weeks);

    case 'radiographs_nondiagnostic':
      if (facts.priorRadiographs === undefined) return 'not_documented';
      return facts.priorRadiographs === 'nondiagnostic' ? 'met' : 'unmet';

    case 'meniscal_pathway': {
      // Either scenario in the guideline satisfies this, so check both.
      const findings = facts.meniscalExamFindings?.length ?? 0;
      if (facts.mechanicalSymptoms && findings >= 2) return 'met';
      if (findings >= 1) return weeksAtLeast(facts, check.weeks);
      if (facts.mechanicalSymptoms === undefined && findings === 0) {
        return 'not_documented';
      }
      return 'unmet';
    }

    case 'ligament_pathway':
      if ((facts.positiveLigamentStressTests?.length ?? 0) > 0) return 'met';
      return weeksAtLeast(facts, check.weeks);

    case 'objective_findings_then_weeks': {
      const findings = flag(facts[FIELDS[check.field]] as boolean | undefined);
      if (findings !== 'met') return findings;
      return weeksAtLeast(facts, check.weeks);
    }

    default:
      // An unknown check type means Python grew a rule this app cannot apply.
      // Reporting it as undocumented is the safe direction: it never asserts a
      // requirement is failed on the strength of a rule we cannot evaluate.
      return 'not_documented';
  }
}

/**
 * Check types whose outcome depends on the number of treatment weeks.
 *
 * The coverage screen asks for a fact only when a requirement actually reads
 * it. Asking for weeks of treatment ahead of a head CT for headache would be
 * noise: no headache criterion consumes it.
 */
const WEEK_CHECKS = new Set([
  'min_weeks',
  'meniscal_pathway',
  'ligament_pathway',
  'objective_findings_then_weeks',
]);

export function usesTreatmentWeeks(check: any): boolean {
  return WEEK_CHECKS.has(check?.type);
}

export function readsField(check: any, field: string): boolean {
  return check?.type === 'boolean' && check?.field === field;
}

export type Finding = { requirement: Requirement; status: Status };

/**
 * Requirements that apply to this payer, CPT and indication, with their status.
 *
 * Matching on indication matters: a knee MRI ordered for a suspected meniscal
 * tear must not be shown the ligament-tear pathway as though it had failed it.
 */
export function checkOrder(
  requirements: Requirement[],
  payerLabel: string,
  cpt: string,
  indication: string,
  facts: OrderFacts,
): Finding[] {
  const payer = payerLabel.trim().toLowerCase();
  return requirements
    .filter(
      (requirement) =>
        requirement.cpt_codes.includes(cpt) &&
        requirement.indication === indication &&
        payer.startsWith(requirement.payer.trim().toLowerCase().split(' ')[0]),
    )
    .map((requirement) => ({
      requirement,
      status: evaluateCheck(requirement.check, facts),
    }));
}

/** Only what the ordering office would need to act on. */
export function unmetFindings(findings: Finding[]): Finding[] {
  return findings.filter(
    (finding) => finding.status === 'unmet' || finding.status === 'not_documented',
  );
}

/**
 * Names who acts on this, not just what state it's in. A patient reading
 * "documented as not met" has no way to act on that; a patient reading
 * "your doctor's office" knows exactly who the next call is to.
 */
export function statusLabel(status: Status): string {
  return status === 'unmet'
    ? "Your doctor's office documented this as not met"
    : "Your doctor's office hasn't documented this yet";
}
