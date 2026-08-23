/**
 * Build and rank the four routes, mirroring pipeline/costing/routes.py.
 *
 * The bundled data has already had payer buckets, out-of-state plans,
 * government lines and service-line carve-outs removed by the exporter, so this
 * only has to handle plausibility against the hospital's own gross charge and
 * the choice of a representative rate per facility.
 */

import { PlanBenefits, YearEstimate, estimateYear, money } from './costing';

export type PlanRate = {
  plan_name: string;
  rate: number;
  product: string | null;
};

export type FacilityBundle = {
  facility_key: string;
  facility_name: string;
  // Other locations sharing this exact price list. Carried so the app can say
  // so rather than implying more independent price points than exist.
  also_at?: string[];
  facility_address: string;
  plans: PlanRate[];
  cash_price: number | null;
  gross_charge: number | null;
};

export type Requirement = {
  key: string;
  payer: string;
  reviewed_by: string;
  cpt_codes: string[];
  indication: string;
  summary: string;
  quote: string;
  // The declarative test, mirrored from pipeline/policies/rules.py. Thresholds
  // live here so they are never re-derived from the quote text.
  check: { type: string; [param: string]: unknown };
  document_title: string;
  section_id: string;
  version: string;
  effective_date: string;
  source_url: string;
  alternative_pathway: boolean;
};

// Named for what the patient gets, not for our internal route taxonomy —
// "In-network, order corrected first" describes our data model, not an
// outcome. The cash label is deliberately not parallel to the other three:
// it's the one route where the tradeoff (no deductible credit) belongs in the
// label itself, not just in the reasoning underneath it.
export const ROUTE_LABELS: Record<string, string> = {
  in_network_as_written: 'Same order, same facility',
  in_network_cheaper_site: 'Same coverage, cheaper facility',
  in_network_order_corrected: 'Same price, requires provider action',
  cash_non_contracted: 'Cash pay — no deductible credit',
};

export type Route = {
  kind: string;
  label: string;
  facilityName: string;
  alsoAt: string[];
  facilityAddress: string;
  allowedAmount: number;
  estimate: YearEstimate;
  unmetRequirements: Requirement[];
  warnings: string[];
};

/**
 * Rows the hospital files are known to publish badly.
 *
 * Judged against this hospital's own gross charge rather than a flat floor: a
 * $49 row against a $2,486 gross charge is a carve-out, but $49 could be
 * legitimate elsewhere.
 */
function warningsFor(rate: number, grossCharge: number | null): string[] {
  const warnings: string[] = [];
  if (grossCharge && rate > grossCharge) {
    warnings.push(
      'The published rate is above this hospital’s gross charge, which usually means a percent-of-charge row rather than a real price.',
    );
  }
  if (grossCharge && rate < 0.05 * grossCharge) {
    warnings.push(
      'The published rate is under 5% of this hospital’s gross charge, which is characteristic of a carve-out row.',
    );
  }
  return warnings;
}

/**
 * One rate per facility: the median plausible rate.
 *
 * Taking the cheapest systematically selects carve-out artifacts. The median is
 * robust to those and to plan variants. If every row is suspect the facility is
 * still represented, carrying its warnings, rather than vanishing.
 */
export function representativeRate(
  facility: FacilityBundle,
  memberPlan?: string,
): PlanRate | null {
  let candidates = facility.plans;
  if (candidates.length === 0) {
    return null;
  }

  if (memberPlan) {
    const matched = candidates.filter((plan) =>
      matchesMemberPlan(memberPlan, plan),
    );
    // No confident match keeps the full set: "we cannot tell which of these
    // applies to you" is usable, "this facility has no price" is false.
    if (matched.length > 0) {
      candidates = matched;
    }
  }

  const plausible = candidates.filter(
    (plan) => warningsFor(plan.rate, facility.gross_charge).length === 0,
  );
  const pool = plausible.length > 0 ? plausible : candidates;
  const sorted = [...pool].sort((a, b) => a.rate - b.rate);
  return sorted[Math.floor(sorted.length / 2)];
}

const STOPWORDS = new Set([
  'with', 'and', 'the', 'of', 'all', 'plan', 'plans', 'health', 'insurance',
  'ins', 'locations', 'location', 'outpatient', 'asc',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(
        (word) => word && !STOPWORDS.has(word) && !/^\d+$/.test(word) && word.length > 1,
      ),
  );
}

function productOf(text: string): string | null {
  const upper = text.toUpperCase();
  if (/\bPPO\b/.test(upper)) return 'ppo';
  if (/\bHMO\b/.test(upper)) return 'hmo';
  if (/\bPOS\b/.test(upper)) return 'pos';
  if (/\bEPO\b/.test(upper)) return 'epo';
  return null;
}

/** Product type must agree: an HMO member is never quoted a PPO schedule. */
export function matchesMemberPlan(memberPlan: string, plan: PlanRate): boolean {
  const memberProduct = productOf(memberPlan);
  const planProduct = plan.product ?? productOf(plan.plan_name);
  if (memberProduct && planProduct && memberProduct !== planProduct) {
    return false;
  }
  const memberTokens = tokenize(memberPlan);
  const planTokens = tokenize(plan.plan_name);
  if (memberTokens.size === 0 || planTokens.size === 0) return false;
  let overlap = 0;
  memberTokens.forEach((token) => {
    if (planTokens.has(token)) overlap += 1;
  });
  return overlap / memberTokens.size >= 0.5;
}

const PRODUCT_ORDER = ['ppo', 'hmo', 'pos', 'epo'];

/**
 * Product types this payer actually publishes here.
 *
 * Offering a type with no published plans is worse than offering nothing: the
 * member picks it, nothing matches, and `representativeRate` falls back to the
 * full range — so the app silently ignores an answer it just asked for.
 *
 * Product type rather than plan name is deliberate. The published strings do
 * not reduce to anything a member would recognise: Anthem alone files 21
 * variants for one CPT, differing by campus and contract suffix
 * ("BLUE ACCESS PPO WITH COPPS" against "BLUE ACCESS PPO-CID"), and CLAUDE.md
 * is explicit that no string matching separates those. Product type is the one
 * field a member can read off their card and answer correctly.
 */
export function availableProducts(facilities: FacilityBundle[]): string[] {
  const found = new Set<string>();
  for (const facility of facilities) {
    for (const plan of facility.plans) {
      const product = plan.product ?? productOf(plan.plan_name);
      if (product) found.add(product);
    }
  }
  return PRODUCT_ORDER.filter((product) => found.has(product));
}

/**
 * How many facilities a typed plan name confidently matches.
 *
 * Needed because a plan that matches nothing is not an error — every facility
 * keeps its full range, which is the right behaviour but is indistinguishable
 * on screen from a plan that matched. Without this the app would accept a
 * typo and quietly ignore it, which is the same silent-answer problem as
 * offering a product type the payer does not publish.
 *
 * Returns null when there is nothing to report on.
 */
export function planMatchSummary(
  facilities: FacilityBundle[],
  memberPlan?: string,
): { matched: number; total: number } | null {
  const query = memberPlan?.trim();
  if (!query) return null;
  const withPlans = facilities.filter((facility) => facility.plans.length > 0);
  if (withPlans.length === 0) return null;
  const matched = withPlans.filter((facility) =>
    facility.plans.some((plan) => matchesMemberPlan(query, plan)),
  ).length;
  return { matched, total: withPlans.length };
}

export type BuildOptions = {
  facilities: FacilityBundle[];
  benefits: PlanBenefits;
  expectedOtherAllowedSpend: number;
  orderedFacilityKey?: string;
  memberPlan?: string;
  unmetRequirements?: Requirement[];
  cashIsAppropriate: boolean;
};

export function buildRoutes(options: BuildOptions): Route[] {
  const {
    facilities,
    benefits,
    expectedOtherAllowedSpend,
    orderedFacilityKey,
    memberPlan,
    unmetRequirements = [],
    cashIsAppropriate,
  } = options;

  const routes: Route[] = [];
  const priced = facilities
    .map((facility) => ({ facility, rate: representativeRate(facility, memberPlan) }))
    .filter((entry): entry is { facility: FacilityBundle; rate: PlanRate } =>
      entry.rate !== null,
    );

  const year = (amount: number, counts: boolean) =>
    estimateYear(amount, benefits, counts, expectedOtherAllowedSpend);

  if (priced.length > 0) {
    const sorted = [...priced].sort((a, b) => a.rate.rate - b.rate.rate);
    let baseline =
      priced.find((entry) => entry.facility.facility_key === orderedFacilityKey) ??
      sorted[Math.floor(sorted.length / 2)];

    routes.push({
      kind: 'in_network_as_written',
      label: ROUTE_LABELS.in_network_as_written,
      facilityName: baseline.facility.facility_name,
      alsoAt: baseline.facility.also_at ?? [],
      facilityAddress: baseline.facility.facility_address,
      allowedAmount: baseline.rate.rate,
      estimate: year(baseline.rate.rate, true),
      unmetRequirements: [],
      warnings: warningsFor(baseline.rate.rate, baseline.facility.gross_charge),
    });

    const cheapest = sorted[0];
    const saving = baseline.rate.rate - cheapest.rate.rate;
    // A "cheaper site" that costs the same is noise, so require a real saving.
    if (cheapest.facility.facility_key !== baseline.facility.facility_key && saving > 1) {
      routes.push({
        kind: 'in_network_cheaper_site',
        label: ROUTE_LABELS.in_network_cheaper_site,
        facilityName: cheapest.facility.facility_name,
        alsoAt: cheapest.facility.also_at ?? [],
        facilityAddress: cheapest.facility.facility_address,
        allowedAmount: cheapest.rate.rate,
        estimate: year(cheapest.rate.rate, true),
        unmetRequirements: [],
        warnings: warningsFor(cheapest.rate.rate, cheapest.facility.gross_charge),
      });
    }

    if (unmetRequirements.length > 0) {
      routes.push({
        kind: 'in_network_order_corrected',
        label: ROUTE_LABELS.in_network_order_corrected,
        facilityName: baseline.facility.facility_name,
        alsoAt: baseline.facility.also_at ?? [],
        facilityAddress: baseline.facility.facility_address,
        allowedAmount: baseline.rate.rate,
        estimate: year(baseline.rate.rate, true),
        unmetRequirements,
        warnings: warningsFor(baseline.rate.rate, baseline.facility.gross_charge),
      });
    }
  }

  if (cashIsAppropriate) {
    const cashOptions = facilities.filter((facility) => facility.cash_price !== null);
    if (cashOptions.length > 0) {
      const cheapestCash = cashOptions.reduce((best, facility) =>
        (facility.cash_price as number) < (best.cash_price as number) ? facility : best,
      );
      routes.push({
        kind: 'cash_non_contracted',
        label: ROUTE_LABELS.cash_non_contracted,
        facilityName: cheapestCash.facility_name,
        alsoAt: cheapestCash.also_at ?? [],
        facilityAddress: cheapestCash.facility_address,
        allowedAmount: cheapestCash.cash_price as number,
        estimate: year(cheapestCash.cash_price as number, false),
        unmetRequirements: [],
        warnings: [],
      });
    }
  }

  return routes;
}

/**
 * Cheapest total for the year first.
 *
 * Ranking on the scan alone would favour cash whenever its sticker price is
 * lower, which is the mistake this product exists to correct.
 */
export function rankRoutes(routes: Route[]): Route[] {
  return [...routes].sort((a, b) => {
    const totalDelta =
      Math.round(a.estimate.totalThisYear * 100) -
      Math.round(b.estimate.totalThisYear * 100);
    if (totalDelta !== 0) return totalDelta;
    const creditDelta =
      (a.estimate.scan.countsTowardDeductible ? 0 : 1) -
      (b.estimate.scan.countsTowardDeductible ? 0 : 1);
    if (creditDelta !== 0) return creditDelta;
    return a.facilityName.localeCompare(b.facilityName);
  });
}

/**
 * The one sentence the recommended card needs: why THIS route, against the
 * specific alternative it beat.
 *
 * This exists because the headline used to make a claim ("cash saves $X
 * today, costs $Y more this year") that the card underneath never let a
 * reader verify — the card showed a total with no visible connection back to
 * either headline number. This ties the two together on the card itself, and
 * it renders for every visitor, not just entitled ones: it's the concrete
 * evidence that makes the paywall worth trusting, not something to gate.
 *
 * Only ever describes routes[0] against one counterpart — a cash route if the
 * recommendation is insured (or vice versa), falling back to the runner-up
 * when there's no cash data to compare against at all.
 */
export function describeRecommendation(routes: Route[]): string | null {
  if (routes.length < 2) return null;
  const recommended = routes[0];
  const recommendedIsCash = !recommended.estimate.scan.countsTowardDeductible;

  const cash = routes.find(
    (route) => route.kind === 'cash_non_contracted' && route !== recommended,
  );
  const bestInsured = routes.find(
    (route) => route.estimate.scan.countsTowardDeductible && route !== recommended,
  );
  const other = recommendedIsCash ? bestInsured : cash;

  if (!other) {
    // No cash/insured pair exists to tell the deductible story, so this falls
    // back to a plain same-coverage comparison against the runner-up.
    const runnerUp = routes[1];
    const yearDelta = runnerUp.estimate.totalThisYear - recommended.estimate.totalThisYear;
    if (yearDelta <= 0.01) return null;
    return `${money(yearDelta)} less than ${runnerUp.facilityName} this year, for the same coverage.`;
  }

  const todayDelta = recommended.estimate.scan.patientPays - other.estimate.scan.patientPays;
  const yearDelta = other.estimate.totalThisYear - recommended.estimate.totalThisYear;
  if (Math.abs(todayDelta) <= 0.01 && yearDelta <= 0.01) return null;

  if (!recommendedIsCash) {
    if (todayDelta > 0.01) {
      return `${money(todayDelta)} more than paying cash today — but it earns your deductible credit, which is what saves ${money(yearDelta)} by the end of the year.`;
    }
    return `Also cheaper than cash today, and it earns your deductible credit — ${money(yearDelta)} less than cash by the end of the year.`;
  }

  if (todayDelta < -0.01) {
    return `${money(-todayDelta)} less than billing insurance today, and still ${money(yearDelta)} ahead this year — you are not expected to reach your deductible, so the missing credit costs little.`;
  }
  return `${money(yearDelta)} less than billing insurance this year, even without a deductible credit.`;
}

export function explainRanking(routes: Route[]): string {
  const ranked = rankRoutes(routes);
  if (ranked.length === 0) {
    return 'No routes could be built from the available published prices.';
  }
  const best = ranked[0];
  const parts = [`Lowest estimated total for this year: ${best.facilityName}.`];
  for (const route of ranked.slice(1)) {
    const difference = route.estimate.totalThisYear - best.estimate.totalThisYear;
    if (Math.abs(difference) < 0.01) {
      parts.push(`${route.label} is an equivalent estimated total.`);
      continue;
    }
    let note = `${route.label} is ${money(difference)} more over the year`;
    if (
      !route.estimate.scan.countsTowardDeductible &&
      route.estimate.scan.patientPays < best.estimate.scan.patientPays
    ) {
      note +=
        ', even though the scan itself costs less, because paying cash earns no deductible credit';
    }
    parts.push(`${note}.`);
  }
  return parts.join(' ');
}
