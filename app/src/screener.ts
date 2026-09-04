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
 * Three actions rather than one setter, for the same reason. A correction the
 * app makes on the member's behalf is not an answer, and neither is loading a
 * worked example — that still opens a ranking, because the member asked for it
 * by name, but it is never their position.
 */

import { DemoScenario } from './demo';

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
  deductible: number;
  coinsurance: number;
  expectedOtherSpend: number;
  treatmentWeeks: number;
  /**
   * Left undefined until the patient says otherwise, so an unanswered question
   * reports as "not documented" rather than as a failed criterion.
   */
  headacheFeature: boolean | undefined;
};

/** Whose numbers are on screen. */
export type QuerySource = 'empty' | 'example' | 'mine';

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
  treatmentWeeks: 'scan',
  headacheFeature: 'scan',
  payer: 'coverage',
  product: 'coverage',
  planText: 'coverage',
  deductible: 'year',
  coinsurance: 'year',
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
  /** A worked example was opened. Still not the member's own position. */
  | { type: 'example'; scenario: DemoScenario }
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
    case 'example':
      // A worked example is complete by construction — it sets every field —
      // so it opens a ranking. It is still not the member's own position, and
      // `source` says so.
      return {
        ...fromScenario(action.scenario),
        source: 'example',
        answered: ALL_ANSWERED,
      };
  }
}

/**
 * A worked example as a query.
 *
 * Every field is set, including `headacheFeature`, rather than only the ones
 * the scenario mentions. Leaving one alone would let an answer survive from a
 * previous example — the head CT question would stay answered from an earlier
 * run and quietly change what the requirement check reports.
 */
export function fromScenario(scenario: DemoScenario): ScreenerQuery {
  return {
    cpt: scenario.cpt,
    indication: scenario.indication,
    payer: scenario.payer,
    product: undefined,
    planText: scenario.planText,
    deductible: scenario.deductible,
    coinsurance: scenario.coinsurance,
    expectedOtherSpend: scenario.expectedOtherSpend,
    treatmentWeeks: scenario.treatmentWeeks,
    headacheFeature: scenario.headacheFeature,
  };
}

/**
 * The typed plan name is more specific than the plan type, so it wins when
 * present.
 */
export function memberPlanOf(query: ScreenerQuery): string | undefined {
  return query.planText.trim() || (query.product ? query.product.toUpperCase() : undefined);
}
