/**
 * Worked examples that open straight onto the result.
 *
 * Two unrelated problems share one cause: the finding this product exists to
 * show is four screens deep. A judge watching a two-minute video, and a
 * developer checking a layout, both have to answer the same questions about a
 * scan they do not have before anything worth looking at appears.
 *
 * So these are not fixtures and not test data — they are a way into the app
 * that lands on the Routes step with every answer already given.
 *
 * Three rules govern what may be added here.
 *
 * Every value is reachable on the sliders that render it. `expectedOtherSpend`
 * steps by 500 on the coverage step, `deductible` by 250 and `coinsurance` by
 * 0.05, so a scenario using $625 of other care would show a number the member
 * could never reproduce by dragging — and the first drag would jump somewhere
 * else and change the answer. Every figure below sits on its slider's step.
 *
 * Nothing here is invented. These are real Indianapolis facilities at their
 * published rates, checked against real payer requirements; the scenario only
 * chooses the patient's benefit position, which is user-reported anyway. A
 * demo built on invented prices would make the whole comparison unfalsifiable,
 * which is the opposite of the point.
 *
 * The outcomes quoted in each comment were computed by running the shipped
 * engine over the shipped data bundle, not estimated by hand. They will drift
 * if either changes, which `scripts/check-demo-scenarios.sh` is there to catch.
 *
 * Synthetic throughout — hard rule 1. No real patient exists in this file.
 */

export type DemoScenario = {
  id: string;
  /** The button. Names what the member sees, not our route taxonomy. */
  title: string;
  /** One line on what this example demonstrates. */
  teaser: string;

  cpt: string;
  indication: string;
  payer: string;
  planText: string;

  deductible: number;
  coinsurance: number;
  /** Must be at least `deductible` — see `PlanBenefits` for why. */
  oopMax: number;
  expectedOtherSpend: number;
  treatmentWeeks: number;
  headacheFeature?: boolean;
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    // Verified: cash is $160.82 cheaper on the day and $62.18 more expensive
    // across the year. This is the whole thesis of the product in one screen,
    // which is why it is first.
    //
    // The year penalty read $367.93 until 2026-09-03, and that figure was an
    // artefact. The app hardcoded a $6,000 out-of-pocket ceiling against this
    // scenario's $6,250 deductible — an impossible plan — which capped the
    // insured route early and inflated the gap almost sixfold. The thesis
    // survives at the corrected figure; the drama does not, and it should not,
    // because it was not real. Do not tune these numbers to get it back.
    //
    // Note the structural limit while reading it: the cash route is only
    // offered when expected other care is *below* the deductible, which is
    // exactly the position where the missing credit costs least. A large year
    // penalty and a visible cash route pull against each other by design.
    //
    // A high-deductible plan barely touched, with real care still to come: the
    // exact position where a cash discount is most tempting and most costly.
    id: 'cash-trap',
    title: 'The cash discount that costs more',
    teaser:
      'A high-deductible plan with knee surgery ahead. The cash price is lower and the year is dearer.',
    cpt: '73721',
    indication: 'meniscal_tear',
    payer: 'aetna',
    planText: '',
    deductible: 6250,
    coinsurance: 0.2,
    // Above the deductible, as every real plan's is. It was effectively 6000
    // for every scenario — below this one's deductible — which capped all four
    // routes at the same total and made the comparison look broken.
    oopMax: 9000,
    expectedOtherSpend: 6000,
    // Past Aetna's three-week threshold, so no requirement is unmet and the
    // headline is about the money alone. Mixing an order problem into this one
    // would blur the finding it exists to show.
    treatmentWeeks: 6,
  },
  {
    // Verified: one unmet requirement, and an `unmet` rather than a
    // `not_documented` — Carelon's six-week conservative management rule,
    // quotable and linkable to the published guideline.
    //
    // Other care is set at or above the deductible so the cash route is
    // correctly withheld, leaving the order check as the only story on screen.
    id: 'order-gap',
    title: 'An order that misses a published rule',
    teaser:
      'Two weeks of treatment against a payer guideline that asks for six. The checklist cites the document.',
    cpt: '72148',
    indication: 'low_back_pain',
    payer: 'anthem',
    planText: '',
    deductible: 2000,
    coinsurance: 0.2,
    oopMax: 6000,
    expectedOtherSpend: 3000,
    treatmentWeeks: 2,
  },
  {
    // Verified: $367.40 between IU Health University Hospital and Franciscan
    // Health Orthopedic Hospital - Carmel, for the same scan on the same plan.
    // Both are real facilities publishing real rates.
    id: 'site-swap',
    title: 'Same scan, same coverage, different building',
    teaser:
      'Two Indianapolis hospitals, one insurer, one CPT code — and a few hundred dollars between them.',
    cpt: '73721',
    indication: 'meniscal_tear',
    payer: 'unitedhealthcare',
    planText: '',
    deductible: 3500,
    coinsurance: 0.2,
    oopMax: 8000,
    expectedOtherSpend: 3500,
    treatmentWeeks: 6,
  },
];
