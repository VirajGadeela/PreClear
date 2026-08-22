/**
 * What the household plan is, in one place.
 *
 * Both the offer card on the Routes step and the paywall itself read from here,
 * so the two can never describe different products. Every line in
 * `PLAN_INCLUDES` names a check that exists in `src/claims.ts` — if a claim is
 * made here, the engine performs it. Adding a line without adding the check is
 * how a benefit list turns into marketing.
 */

export const PLAN_NAME = 'Preclear Household';

export const PLAN_INCLUDES = [
  'Every bill and explanation of benefits for everyone in the household, all year.',
  'Charges above what the in-network contract allows.',
  'Amounts that do not reconcile with their own deductible and coinsurance lines.',
  'The same service billed twice.',
  'A deductible applied past what the plan says it is.',
  'Charges that continue past the out-of-pocket maximum.',
  'Denials, with the appeal route and who to ask about the deadline.',
  'The scan comparison stays free, and stays here whenever a new order comes up.',
];

export type DemoPlan = {
  id: string;
  /** What the member is choosing, e.g. "Monthly". */
  term: string;
  /** The headline figure, already formatted. Not a medical cost — see below. */
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
 * These are placeholders for a store product that does not exist yet, and the
 * paywall says so on screen. When RevenueCat is wired up, the real localised
 * price comes from the store and this list stops being used.
 *
 * Deliberately not rendered through <Money>. Hard rule 5 puts the word
 * "estimate" inside every dollar figure because every dollar figure in this app
 * is a projected medical cost. A subscription price is not an estimate — it is
 * the exact amount charged — and labelling it as one would be false in the
 * opposite direction from the rule's intent.
 */
export const DEMO_PLANS: DemoPlan[] = [
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
