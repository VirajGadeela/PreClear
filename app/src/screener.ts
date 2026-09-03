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
 * `source` is the honesty flag, and it is the reason this is a reducer rather
 * than a plain setter.
 *
 * A results-first screen shows a ranking before the member has entered
 * anything. That is the whole point of it, and it is also the one guarantee the
 * old step flow gave up: the step bar locked forward steps precisely so a route
 * could never rank before the coverage questions were answered. Nothing on
 * screen may imply an untouched ranking is the member's own, so the screen has
 * to know which it is looking at — and the only way that stays true is if the
 * distinction is made where the state changes, not remembered at each call
 * site.
 *
 * Hence three actions rather than one setter. A machine correction is not a
 * member's answer, and neither is opening a worked example.
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
export type QuerySource = 'example' | 'mine';

export type QueryState = ScreenerQuery & { source: QuerySource };

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
    case 'refine':
      return { ...state, ...action.patch, source: 'mine' };
    case 'normalize':
      return { ...state, ...action.patch };
    case 'example':
      return { ...fromScenario(action.scenario), source: 'example' };
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
