/**
 * One call from a finished set of answers to everything the result screens
 * read: the ranked routes, the requirement findings, and the counts the
 * calculating screen reports.
 *
 * This is wiring, not math. It is the routing pass `App.tsx` ran before the UI
 * was replaced, moved here so every screen reads one snapshot: the routes, the
 * findings and the label describing them can never come from different
 * answers.
 */

import { data, PAYER_LABELS, Procedure } from './appData';
import { PlanBenefits } from './costing';
import { Answers, toQuery } from './flow';
import { Finding, OrderFacts, checkOrder, unmetFindings } from './requirements';
import {
  FacilityBundle,
  Route,
  buildRoutes,
  cashIsWorthOffering,
  rankRoutes,
} from './routes';
import { ScreenerQuery, memberPlanOf } from './screener';

export type Estimate = {
  query: ScreenerQuery;
  procedure: Procedure;
  payerLabel: string;
  facilities: FacilityBundle[];
  /** Distinct published price lists compared. IU Health's identical files count once. */
  priceLists: number;
  benefits: PlanBenefits;
  /**
   * Every rule that applies to this insurer, scan and reason, met or not.
   * Kept apart from `unmet` because "every recorded requirement is met" and
   * "no requirement is recorded for this insurer and scan" both produce zero
   * unmet findings and mean entirely different things.
   */
  applicable: Finding[];
  unmet: Finding[];
  routes: Route[];
  cashOffered: boolean;
};

function distinctPriceLists(facilities: FacilityBundle[]): number {
  const seen = new Set<string>();
  for (const facility of facilities) {
    if (facility.plans.length === 0) continue;
    seen.add(JSON.stringify([facility.plans, facility.cash_price]));
  }
  return seen.size;
}

export function computeEstimate(answers: Answers): Estimate | null {
  const query = toQuery(answers);
  if (!query) return null;
  const procedure = data.procedures.find((item) => item.cpt === query.cpt);
  if (!procedure) return null;

  const facilities = procedure.payers[query.payer] ?? [];
  const payerLabel = PAYER_LABELS[query.payer] ?? '';

  const facts: OrderFacts = {
    // Straight from the answer, not from the query's numeric default, so a
    // weeks question nobody touched reads as "not entered" rather than as
    // zero weeks of treatment.
    conservativeTherapyWeeks: answers.treatmentWeeks,
    headacheConcerningFeature: query.headacheFeature,
  };
  const applicable = checkOrder(
    data.requirements,
    payerLabel,
    query.cpt,
    query.indication,
    facts,
  );
  const unmet = unmetFindings(applicable);

  const benefits: PlanBenefits = {
    deductibleRemaining: query.deductible,
    coinsuranceRate: query.coinsurance,
    oopMaxRemaining: query.oopMax,
    copay: 0,
  };

  // Surfaced only when the deductible is unlikely to be met, which is when the
  // missing credit costs least. The result screens ask the same function why
  // the route is absent, so the two cannot disagree.
  const cashOffered = cashIsWorthOffering(query.expectedOtherSpend, query.deductible);

  const routes = rankRoutes(
    buildRoutes({
      facilities,
      benefits,
      expectedOtherAllowedSpend: query.expectedOtherSpend,
      memberPlan: memberPlanOf(query),
      orderedFacilityKey: query.orderedFacility,
      unmetRequirements: unmet.map((finding) => finding.requirement),
      cashIsAppropriate: cashOffered,
    }),
  );

  return {
    query,
    procedure,
    payerLabel,
    facilities,
    priceLists: distinctPriceLists(facilities),
    benefits,
    applicable,
    unmet,
    routes,
    cashOffered,
  };
}

/** The best route of the other payment kind, for "less than paying cash". */
export function counterpart(routes: Route[]): Route | undefined {
  const best = routes[0];
  if (!best) return undefined;
  const bestIsCash = !best.estimate.scan.countsTowardDeductible;
  return routes.find(
    (route) => route !== best && route.estimate.scan.countsTowardDeductible === bestIsCash,
  );
}

export const isCash = (route: Route) => !route.estimate.scan.countsTowardDeductible;
