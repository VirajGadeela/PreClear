/**
 * The finding, as text someone can paste somewhere.
 *
 * `summarize` is the single derivation of "what does this comparison actually
 * say". The Headline on the Routes step and the shared text both read it, so
 * the card a member sends cannot claim something different from the screen they
 * sent it from. It was briefly written twice; the deductible math in this repo
 * already demonstrates where that ends up, and there `scripts/check-math-parity.sh`
 * exists to catch the drift. Better not to create the second copy.
 *
 * Compliance, all of it load-bearing:
 *
 * Every dollar figure goes through `money()`, so the word "estimate" travels
 * with the number out of the app and into wherever it is pasted (hard rule 5).
 * A figure that is labelled on screen and bare in a screenshot would defeat the
 * rule at exactly the moment the number reaches someone who cannot see the
 * screen it came from.
 *
 * Nothing identifying is included — no plan name, no typed card text, no
 * deductible position. The scan, the insurer, the facilities and the arithmetic
 * are all that leave (hard rule 1). The insurer's name is a payer, not a
 * patient, and the facilities are public.
 *
 * No claim of coverage, approval or denial, and no clinical suggestion — the
 * text names documentation gaps against published criteria and stops there
 * (hard rules 5 and 6).
 */

import { money } from './costing';
import { Requirement, Route } from './routes';
import type { YearPlanComparison } from './yearPlan';

export type Summary =
  | { kind: 'cash_costs_more'; todayGap: number; yearGap: number }
  | { kind: 'cash_stays_cheaper'; todayGap: number }
  | { kind: 'spread'; spread: number }
  | null;

/**
 * What this set of routes is chiefly saying.
 *
 * Ordered by how surprising the answer is, not by size: the cash trap outranks
 * a facility spread even when the spread is the larger number, because the
 * spread is a saving a member can act on twice and the trap is a mistake they
 * can only make once.
 */
export function summarize(routes: Route[]): Summary {
  const cash = routes.find((route) => route.kind === 'cash_non_contracted');
  const insured = routes.find((route) => route.kind !== 'cash_non_contracted');

  if (cash && insured) {
    const todayGap =
      insured.estimate.scan.patientPays - cash.estimate.scan.patientPays;
    const yearGap = cash.estimate.totalThisYear - insured.estimate.totalThisYear;

    if (todayGap > 0.01 && yearGap > 0.01) {
      return { kind: 'cash_costs_more', todayGap, yearGap };
    }
    if (todayGap > 0.01) {
      return { kind: 'cash_stays_cheaper', todayGap };
    }
  }

  const spread =
    routes.length > 1
      ? routes[routes.length - 1].estimate.totalThisYear -
        routes[0].estimate.totalThisYear
      : 0;
  if (spread > 0.01) return { kind: 'spread', spread };

  return null;
}

/**
 * Build the text of a shared comparison.
 *
 * Pure, and separate from the act of sharing, so the wording can be checked
 * without a device and without opening a share sheet.
 */
export function shareText({
  routes,
  procedureLabel,
  payerLabel,
  metro,
}: {
  routes: Route[];
  procedureLabel: string;
  payerLabel: string;
  metro: string;
}): string {
  if (routes.length === 0) return '';

  const lines: string[] = [`${procedureLabel} · ${payerLabel} · ${metro}`, ''];

  const summary = summarize(routes);
  if (summary?.kind === 'cash_costs_more') {
    lines.push(
      `Paying cash saves ${money(summary.todayGap)} today,`,
      `and costs ${money(summary.yearGap)} more by the end of this year.`,
      'Cash earns no deductible credit, so later care starts from scratch.',
    );
  } else if (summary?.kind === 'cash_stays_cheaper') {
    lines.push(
      `Paying cash saves ${money(summary.todayGap)} today and stays cheaper this year.`,
    );
  } else if (summary?.kind === 'spread') {
    lines.push(
      `Same scan, same coverage. ${money(summary.spread)} between the best and worst option.`,
    );
  }

  lines.push('', 'Ranked by what the whole year costs:');
  routes.forEach((route, index) => {
    lines.push(
      `${index + 1}. ${route.label} (${route.facilityName}): ${money(
        route.estimate.totalThisYear,
      )}`,
    );
  });

  // Collected across every route, not read off the top one.
  //
  // An unmet requirement belongs to the *order*, not to a facility — the same
  // gap applies wherever the scan is done. But `buildRoutes` hangs the list on
  // the route that exists to fix it, so whenever a cheaper site outranks the
  // corrected-order route, `routes[0].unmetRequirements` is empty and the
  // checklist silently disappears. That is exactly the case the "order gap"
  // example is built to show, and it printed nothing.
  //
  // Deduped by key because the same requirement is attached to more than one
  // route, and a checklist that lists the same rule twice reads as two problems.
  const seen = new Set<string>();
  const unmet: Requirement[] = [];
  for (const route of routes) {
    for (const requirement of route.unmetRequirements) {
      if (seen.has(requirement.key)) continue;
      seen.add(requirement.key);
      unmet.push(requirement);
    }
  }

  if (unmet.length > 0) {
    lines.push('', 'Before this is ordered, the notes should document:');
    unmet.forEach((requirement) => {
      lines.push(`· ${requirement.summary}`);
      lines.push(
        `  ${requirement.payer}, ${requirement.document_title} (${requirement.version})`,
      );
    });
  }

  lines.push(
    '',
    'Estimates built from the price files payers and hospitals publish.',
    'Not a quote, and not a coverage decision.',
    'Made with Preclear.',
  );

  return lines.join('\n');
}

/**
 * The year plan, as text a household can send to itself or to an office.
 *
 * Same rules as `shareText`, all load-bearing: every figure goes through
 * `money()` so "estimate" travels with it out of the app (hard rule 5); no
 * plan name, no card text, no deductible position leaves (hard rule 1); no
 * claim of coverage, approval or denial, and no clinical suggestion (hard
 * rules 5 and 6). Household roles, not names.
 *
 * Per-procedure dollar figures appear only for the scans paid in cash. The
 * year total does not depend on the order the scans happen in, but splitting
 * it across the insured ones does, so that split is not written down. See
 * `yearPlan.ts`.
 *
 * Pure, and separate from the act of sharing, so the wording can be checked
 * without a device.
 */
export function yearPlanText({
  comparison,
  labelFor,
  payerLabel,
  metro,
}: {
  comparison: YearPlanComparison;
  /** CPT to display name, from the bundle. Kept out of this file's imports. */
  labelFor: (cpt: string) => string;
  payerLabel: string;
  metro: string;
}): string {
  const { best, alternative, allCash, saving } = comparison;
  if (best.decisions.length === 0) return '';

  const lines: string[] = [
    `Your year · ${payerLabel} · ${metro}`,
    '',
    `Together, these come to ${money(best.totalThisYear)}.`,
  ];

  if (saving > 0.01) {
    lines.push(
      `That is ${money(saving)} less than ${
        alternative === allCash
          ? 'paying cash for all of them'
          : 'running all of them through insurance'
      }.`,
    );
  }
  lines.push(
    'Only the insured payments count toward the deductible. Cash earns no',
    'credit, so later care starts from scratch.',
    '',
  );

  best.decisions.forEach((decision, index) => {
    const { procedure } = decision;
    lines.push(
      `${index + 1}. ${procedure.member} · ${labelFor(procedure.cpt)} (CPT ${
        procedure.cpt
      })`,
    );
    lines.push(
      decision.payCash && decision.cashPaid !== null
        ? `   Pay cash at ${decision.facility}: ${money(decision.cashPaid)}`
        : `   Run through insurance at ${decision.facility}`,
    );
  });

  lines.push(
    '',
    'Estimates built from the price files payers and hospitals publish.',
    'Not a quote, and not a coverage decision.',
    'Made with Preclear.',
  );

  return lines.join('\n');
}
