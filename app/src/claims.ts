/**
 * Claims review — the subscription tier.
 *
 * This mirrors `pipeline/claims/eob.py` check for check. The Python is the
 * source of truth and is the tested version; `scripts/check-claims-parity.sh`
 * runs both over the same fixtures and fails if they disagree.
 *
 * Every finding is either arithmetic that does not reconcile against the EOB's
 * own numbers, or a fact the document states about itself. Nothing here
 * predicts whether an appeal succeeds, scores a claim, or guesses at payer
 * behaviour. "These published numbers disagree" is the claim being made, and it
 * is the only one this file is allowed to make.
 *
 * No real patient data — CLAUDE.md hard rule 1. Members are household roles.
 */

const TOLERANCE = 0.01;

export type Eob = {
  claim_id: string;
  member: string;
  service_date: string;
  provider: string;
  code: string;
  description: string;
  billed: number;
  allowed: number;
  plan_paid: number;
  patient_responsibility: number;
  deductible_applied?: number;
  coinsurance?: number;
  copay?: number;
  network?: string;
  denial_code?: string;
  denial_reason?: string;
};

export type HouseholdPlan = { deductible: number; oop_max: number };

export type Finding = {
  kind: string;
  claim_id: string;
  member: string;
  summary: string;
  amount: number | null;
  action: string;
};

const money = (value: number) =>
  `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const round2 = (value: number) => Math.round(value * 100) / 100;
const over = (value: number, limit: number) => value - limit > TOLERANCE;

function balanceBilled(eob: Eob): Finding | null {
  if ((eob.network ?? 'in_network') !== 'in_network') return null;
  const ceiling = eob.allowed - eob.plan_paid;
  if (!over(eob.patient_responsibility, ceiling)) return null;
  return {
    kind: 'balance_billed_in_network',
    claim_id: eob.claim_id,
    member: eob.member,
    summary: `Billed ${money(eob.patient_responsibility)} where the in-network contract leaves ${money(Math.max(ceiling, 0))}.`,
    amount: round2(eob.patient_responsibility - ceiling),
    action:
      "Ask the provider's billing office to reprocess against the contracted rate on this EOB.",
  };
}

function componentsDoNotSum(eob: Eob): Finding | null {
  const parts =
    (eob.deductible_applied ?? 0) + (eob.coinsurance ?? 0) + (eob.copay ?? 0);
  if (Math.abs(parts - eob.patient_responsibility) <= TOLERANCE) return null;
  return {
    kind: 'components_do_not_sum',
    claim_id: eob.claim_id,
    member: eob.member,
    summary: `Deductible, coinsurance and copay total ${money(parts)}, but the amount owed reads ${money(eob.patient_responsibility)}.`,
    amount: round2(Math.abs(eob.patient_responsibility - parts)),
    action: 'Ask the plan which of the two figures on this EOB is correct.',
  };
}

function denialAppealRight(eob: Eob): Finding | null {
  if (!eob.denial_code) return null;
  return {
    kind: 'denial_with_appeal_right',
    claim_id: eob.claim_id,
    member: eob.member,
    summary:
      `Denied as ${eob.denial_code}` +
      (eob.denial_reason ? `. ${eob.denial_reason}.` : '.'),
    // Unpriced on purpose: a number here would imply a predicted recovery.
    amount: null,
    action:
      'This denial can be appealed to the plan, and then to an independent external reviewer. Ask the plan for the deadline.',
  };
}

const PER_CLAIM = [balanceBilled, componentsDoNotSum, denialAppealRight];

function duplicates(eobs: Eob[]): Finding[] {
  const seen = new Map<string, string>();
  const findings: Finding[] = [];
  for (const eob of eobs) {
    const key = [eob.member, eob.service_date, eob.provider, eob.code].join('|');
    const first = seen.get(key);
    if (first) {
      findings.push({
        kind: 'duplicate_claim',
        claim_id: eob.claim_id,
        member: eob.member,
        summary: `Same service as claim ${first}: ${eob.description} at ${eob.provider} on ${eob.service_date}.`,
        amount: round2(eob.patient_responsibility),
        action: 'Ask the plan to void the duplicate claim.',
      });
    } else {
      seen.set(key, eob.claim_id);
    }
  }
  return findings;
}

const byDate = (a: Eob, b: Eob) => (a.service_date < b.service_date ? -1 : 1);

function deductibleOverApplied(eobs: Eob[], plan: HouseholdPlan): Finding[] {
  if (plan.deductible <= 0) return [];
  let running = 0;
  for (const eob of [...eobs].sort(byDate)) {
    running += eob.deductible_applied ?? 0;
    if (over(running, plan.deductible)) {
      return [
        {
          kind: 'deductible_over_applied',
          claim_id: eob.claim_id,
          member: eob.member,
          summary: `${money(running)} applied to a ${money(plan.deductible)} deductible across the household this year.`,
          amount: round2(running - plan.deductible),
          action:
            'Ask the plan to reprocess claims after the deductible was met.',
        },
      ];
    }
  }
  return [];
}

function chargedPastOopMax(eobs: Eob[], plan: HouseholdPlan): Finding[] {
  if (plan.oop_max <= 0) return [];
  let running = 0;
  for (const eob of [...eobs].sort(byDate)) {
    running += eob.patient_responsibility;
    if (over(running, plan.oop_max)) {
      return [
        {
          kind: 'charged_past_oop_max',
          claim_id: eob.claim_id,
          member: eob.member,
          summary: `${money(running)} charged against a ${money(plan.oop_max)} out-of-pocket maximum.`,
          amount: round2(running - plan.oop_max),
          action:
            'Ask the plan to reprocess care received after the maximum was met.',
        },
      ];
    }
  }
  return [];
}

/** Every finding, ordered by what is recoverable. Unpriced findings sort last. */
export function review(eobs: Eob[], plan: HouseholdPlan): Finding[] {
  const findings: Finding[] = [];
  for (const eob of eobs) {
    for (const check of PER_CLAIM) {
      const finding = check(eob);
      if (finding) findings.push(finding);
    }
  }
  findings.push(...duplicates(eobs));
  findings.push(...deductibleOverApplied(eobs, plan));
  findings.push(...chargedPastOopMax(eobs, plan));

  return findings.sort((a, b) => {
    const aNull = a.amount === null ? 1 : 0;
    const bNull = b.amount === null ? 1 : 0;
    if (aNull !== bNull) return aNull - bNull;
    return (b.amount ?? 0) - (a.amount ?? 0);
  });
}

/**
 * Counts each claim once, at its largest finding.
 *
 * Two checks can catch the same discrepancy from different directions, and
 * summing both would tell a member they are owed twice what one claim can
 * return. One claim can only be overcharged by one amount.
 */
export function totalAtStake(findings: Finding[]): number {
  const largest = new Map<string, number>();
  for (const finding of findings) {
    if (finding.amount === null) continue;
    largest.set(
      finding.claim_id,
      Math.max(largest.get(finding.claim_id) ?? 0, finding.amount),
    );
  }
  let total = 0;
  largest.forEach((value) => {
    total += value;
  });
  return round2(total);
}
