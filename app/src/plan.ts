/**
 * What the household plan is, in one place.
 *
 * Both the offer card on the Routes step and the paywall itself read from here,
 * so the two can never describe different products. Every line in
 * `PLAN_INCLUDES` names something an engine in this repo actually does — the
 * first three come from `src/yearPlan.ts`, the rest from `src/claims.ts`. If a
 * claim is made here, the code performs it. Adding a line without adding the
 * capability is how a benefit list turns into marketing.
 *
 * The list opened with "Every bill and explanation of benefits for everyone in
 * the household, all year" until 2026-09-06. That named no check: it promised
 * an intake path this app does not have, since the claims review reads a
 * bundled synthetic fixture rather than anything of the member's. It is the
 * exact failure the paragraph above warns about, and it survived here for
 * three weeks under the rule that forbids it.
 */

export const PLAN_NAME = 'Preclear Household';

export const PLAN_INCLUDES = [
  'Several scans planned together, against one shared household deductible.',
  'Which of them to run through insurance and which to pay cash for.',
  'A plan you can send to the people scheduling the scans.',
  'Charges above what the in-network contract allows.',
  'Amounts that do not reconcile with their own deductible and coinsurance lines.',
  'The same service billed twice.',
  'A deductible applied past what the plan says it is.',
  'Charges that continue past the out-of-pocket maximum.',
  'Denials, with the appeal route and who to ask about the deadline.',
  'The scan comparison stays free, and stays here whenever a new order comes up.',
];

/**
 * One purchasable term, however it was sourced.
 *
 * Named for what it is rather than where it came from, because the household
 * page now renders two kinds: real packages read from a RevenueCat offering
 * (see `loadPlans` in `src/purchases.ts`) and the placeholders below, used only
 * when no key is configured. The screen renders both identically on purpose —
 * if the two shapes diverged, the demo would stop being a rehearsal of the
 * real thing.
 */
export type PlanOption = {
  /**
   * The RevenueCat package identifier for a real plan, so the term the member
   * selected is the one that gets purchased. Arbitrary for the demo plans.
   */
  id: string;
  /** What the member is choosing, e.g. "Monthly". */
  term: string;
  /**
   * The headline figure, already formatted. Not a medical cost — see below.
   * For a real plan this is the store's own localised string, never a number
   * this app formatted itself.
   */
  price: string;
  /** The unit the price is charged in, e.g. "per month". */
  cadence: string;
  /** Optional second line, e.g. what it works out to per month. */
  footnote?: string;
  /** Optional badge, e.g. "Save 27%". */
  badge?: string;
};

/**
 * Demo prices.
 *
 * Placeholders, used only when no RevenueCat key is configured or the offering
 * cannot be read. When the store answers, `loadPlans()` returns the real
 * localised prices and this list is not rendered — the household page says
 * which of the two it is showing, because a placeholder price presented as a
 * real one is the kind of thing that has to be impossible rather than unlikely.
 *
 * Deliberately not rendered through <Money>. Hard rule 5 puts the word
 * "estimate" inside every dollar figure because every dollar figure in this app
 * is a projected medical cost. A subscription price is not an estimate — it is
 * the exact amount charged — and labelling it as one would be false in the
 * opposite direction from the rule's intent.
 */
export const DEMO_PLANS: PlanOption[] = [
  {
    id: 'annual',
    term: 'Yearly',
    price: '$69.99',
    cadence: 'per year',
    footnote: 'Works out at $5.83 a month.',
    badge: 'Save 27%',
  },
  {
    id: 'monthly',
    term: 'Monthly',
    price: '$7.99',
    cadence: 'per month',
    footnote: 'Cancel any time.',
  },
];
