/**
 * Everything the screener is asking, in one object.
 *
 * These were ten separate `useState`s threaded as ten setters through two
 * screens. Collapsing them is not tidying: `useDeferredValue` needs a single
 * stable identity to defer, and ten independent values cannot give it one. The
 * ranked list reads a deferred copy of this object while the control the member
 * is dragging reads the live one, which is what lets results sit on the same
 * screen as the filters without the thumb stuttering.
 *
 * `answered` is the honesty flag, and it is the reason this is a reducer rather
 * than a plain setter.
 *
 * The app used to open on a ranking built from an example scenario, labelled as
 * one. It read as confusing rather than as helpful: four dollar figures for a
 * patient who is not you, on the screen whose entire job is to tell you what
 * *you* should do. The label was doing more work than a label can.
 *
 * So no ranking exists until the member has answered all three groups. The
 * three flags are set here, where the state changes, rather than inferred at a
 * call site — an inferred version drifts the first time a default happens to
 * equal an answer.
 *
 * Two actions rather than one setter, for the same reason: a correction the app
 * makes on the member's behalf is not an answer.
 *
 * There was a third, `example`, which loaded a worked scenario and opened a
 * ranking for a patient who is not you. It went in two steps — first as the
 * screen's default, then as an option in the filter panel — and both times for
 * the same reason: on the screen whose job is to say what *you* should do,
 * somebody else's numbers read as confusing however they are labelled.
 */

export type ScreenerQuery = {
  cpt: string;
  indication: string;
  payer: string;
  /**
   * The plan type, or undefined for "not sure" — which keeps the full published
   * range rather than guessing one. The plan, not the payer, sets the price:
   * one Anthem facility publishes five different rates for the same knee MRI.
   */
  product: string | undefined;
  /**
   * What is printed on the card. Free text because that is what
   * `matchesMemberPlan` was built for, and it pins an exact rate where the
   * product chips can only narrow to a type. Typed, never photographed, and
   * never stored — hard rules 1 and 3.
   */
  planText: string;
  /**
   * Where the scan is actually scheduled, as a `facility_key`, or undefined for
   * "not sure yet".
   *
   * The engine has always accepted this and the app never sent it, so
   * `buildRoutes` fell back to the median-priced facility in the metro and
   * called it "your order as written". Route 2 is defined against route 1, so
   * the whole site-of-service saving was measured from a building nobody named
   * — and once the rows started leading with an instruction, the screen was
   * asserting a place outright. Undefined is honest and the copy says so;
   * inventing one was not.
   */
  orderedFacility: string | undefined;
  deductible: number;
  coinsurance: number;
  /**
   * What is left of the out-of-pocket maximum this year.
   *
   * Asked for rather than assumed. It was hardcoded to 6000 in `App.tsx` while
   * the deductible slider ran to 10000, which made every position above $6,000
   * an impossible plan — you cannot owe more deductible than your whole ceiling
   * — and the visible symptom was every insured route reporting the same total,
   * because they all hit the cap. It is also the figure that decides the answer
   * outright whenever heavy care is expected, which is too much weight for a
   * number nobody entered.
   */
  oopMax: number;
  expectedOtherSpend: number;
  treatmentWeeks: number;
  /**
   * Left undefined until the patient says otherwise, so an unanswered question
   * reports as "not documented" rather than as a failed criterion.
   */
  headacheFeature: boolean | undefined;
};

/** Whose numbers are on screen. Only ever the member's, or nobody's. */
export type QuerySource = 'empty' | 'mine';

/**
 * Which of the filter groups the member has actually answered.
 *
 * All three have to be true before a ranking appears, and that is the whole
 * mechanism replacing the example. Two would be faster — scan and coverage
 * decide which rates exist — but the year figures are the ones that decide
 * *which route wins*, and showing a ranking driven by a deductible nobody
 * entered is the thing being removed, not a smaller version of it.
 */
export type Answered = { scan: boolean; coverage: boolean; year: boolean };

export type QueryState = ScreenerQuery & {
  source: QuerySource;
  answered: Answered;
};

/** Which group a field belongs to. Drives `answered` from a patch. */
const GROUP_OF: Record<keyof ScreenerQuery, keyof Answered> = {
  cpt: 'scan',
  indication: 'scan',
  orderedFacility: 'scan',
  treatmentWeeks: 'scan',
  headacheFeature: 'scan',
  payer: 'coverage',
  product: 'coverage',
  planText: 'coverage',
  deductible: 'year',
  coinsurance: 'year',
  oopMax: 'year',
  expectedOtherSpend: 'year',
};

export const NOTHING_ANSWERED: Answered = {
  scan: false,
  coverage: false,
  year: false,
};

export const ALL_ANSWERED: Answered = { scan: true, coverage: true, year: true };

export function isComplete(answered: Answered): boolean {
  return answered.scan && answered.coverage && answered.year;
}

export type QueryAction =
  /** A member moved a control. This is the only action that earns 'mine'. */
  | { type: 'refine'; patch: Partial<ScreenerQuery> }
  /**
   * A correction this app made to keep the query internally consistent —
   * an indication that does not exist for the newly chosen procedure, a plan
   * type the newly chosen payer does not publish. The member did not answer
   * anything, so `source` must not move. Getting this wrong would let the
   * screen claim an untouched example as the member's own the first time they
   * changed procedure.
   */
  | { type: 'normalize'; patch: Partial<ScreenerQuery> };

export function queryReducer(state: QueryState, action: QueryAction): QueryState {
  switch (action.type) {
    case 'refine': {
      // Any field in a group marks that group answered. Touching one control
      // in "Your year" counts for all three sliders in it: the member has seen
      // the group, and the other two are visible beside the one they moved.
      const answered = { ...state.answered };
      for (const key of Object.keys(action.patch) as (keyof ScreenerQuery)[]) {
        answered[GROUP_OF[key]] = true;
      }
      return { ...state, ...action.patch, source: 'mine', answered };
    }
    case 'normalize':
      return { ...state, ...action.patch };
  }
}

/**
 * Where every control starts.
 *
 * These are starting *positions*, not answers, and the difference is the whole
 * design: `answered` is all false until the member touches each group, nothing
 * ranks until it is complete, and no chip draws selected in a group they have
 * not answered. A slider still has to put its thumb somewhere, so it puts it
 * somewhere plausible rather than at zero — an untouched control at its floor
 * is harder to use and no more honest.
 *
 * This used to be `fromScenario(DEMO_SCENARIOS[0])`. The scenarios are gone
 * entirely; these values are ordinary and belong to nobody.
 */
export const INITIAL_QUERY: ScreenerQuery = {
  cpt: '73721',
  indication: 'meniscal_tear',
  payer: 'anthem',
  product: undefined,
  planText: '',
  orderedFacility: undefined,
  // A mid-range remaining deductible, its ceiling above it as every real plan's
  // is, and 20% coinsurance — the most common commercial split.
  deductible: 2000,
  coinsurance: 0.2,
  oopMax: 6000,
  expectedOtherSpend: 0,
  treatmentWeeks: 0,
  headacheFeature: undefined,
};

/**
 * The typed plan name is more specific than the plan type, so it wins when
 * present.
 */
export function memberPlanOf(query: ScreenerQuery): string | undefined {
  return query.planText.trim() || (query.product ? query.product.toUpperCase() : undefined);
}
