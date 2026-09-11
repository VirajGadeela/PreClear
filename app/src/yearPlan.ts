/**
 * Choose how a household pays for several planned procedures in one year.
 *
 * This mirrors `pipeline/costing/yearplan.py` function for function. The Python
 * is the source of truth and is the tested version;
 * `scripts/check-year-plan-parity.sh` runs both over the same cases and fails
 * if they disagree. If you change one, change both.
 *
 * `costing.ts` answers "what does this one scan cost me this year". This
 * answers what a household actually asks: we know about three scans, which of
 * them do we run through insurance and which do we pay cash for? They share
 * one deductible, so the answer for any one depends on the others.
 *
 * Three things were established before this was written, and each removes a
 * feature somebody will otherwise try to add.
 *
 * **Order does not matter.** The year total is
 * `min(D, A) + c * max(0, A - D)` capped at `M`, where A is the *sum* of
 * everything billed through insurance. A sum has no order, so doing the
 * expensive scan first cannot save a cent. There is no sequencer here and
 * there should not be one; `test_total_is_order_independent` on the Python
 * side is the durable record of why.
 *
 * **The decision is cash-versus-insured, per procedure.** That is where the
 * money is, because a cash payment buys care without buying any deductible
 * progress. On real published UnitedHealthcare rates, a household with $2,000
 * of deductible left should pay cash for all three scans if it expects $1,000
 * of other care, and insure all three if it expects $2,000. Each scan
 * considered alone says "pay cash" in both cases.
 *
 * **The answer is nearly always a corner.** A sweep over deductible, other
 * care and coinsurance found a mixed plan optimal 11.8% of the time and never
 * winning by more than $5.79. The exhaustive search is insurance against being
 * wrong, not a source of clever answers, and what a member is told stays one
 * sentence: fund the deductible, or don't.
 *
 * Members are household roles — "Adult 1", "Child 2" — never names. Hard rule 1.
 *
 * Imports only `./costing`, deliberately: the parity script compiles this file
 * standalone with `tsc --ignoreConfig`, so a JSON or React import here would
 * take it out of the guard.
 */

import { PlanBenefits, estimatePayment } from './costing';

/**
 * 2**8 = 256 evaluations of ten lines of arithmetic, which is free. The cap
 * fails loudly on a pathological input rather than bounding a real household;
 * nobody plans nine imaging studies in a year.
 */
export const MAX_PROCEDURES = 8;

/**
 * One scan a household knows is coming, priced both ways.
 *
 * `insuredAllowed` is the cheapest plausible in-network rate, and cheapest is
 * provably right rather than merely reasonable: the year total is nondecreasing
 * in the summed insured allowed amount, so no facility search can beat picking
 * the smallest. See `representativeRate` in `./routes` for how one rate per
 * facility is chosen in the first place.
 *
 * `cashPrice` is null where no facility publishes one, and such a procedure can
 * only ever be run through insurance.
 */
export type PlannedProcedure = {
  id: string;
  cpt: string;
  member: string;
  insuredAllowed: number;
  insuredFacility: string;
  cashPrice: number | null;
  cashFacility: string | null;
};

/**
 * How one procedure is paid for, under one plan.
 *
 * There is deliberately no dollar figure for an insured procedure. The total is
 * order-independent but the *attribution* is not: whichever insured procedure
 * is evaluated first absorbs the deductible and looks expensive, and the next
 * looks cheap. Printing that split would invent a ranking between two scans
 * that the arithmetic does not support. A cash procedure carries its figure,
 * because a cash price is what it is regardless of what else the household does.
 */
export type ProcedureDecision = {
  procedure: PlannedProcedure;
  payCash: boolean;
  facility: string;
  cashPaid: number | null;
};

/** What one way of paying for the whole list costs. */
export type YearPlan = {
  decisions: ProcedureDecision[];
  proceduresCost: number;
  otherCareCost: number;
  totalThisYear: number;
  deductibleRemainingAfter: number;
  cashCount: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Cost one specific choice of cash-versus-insured across the list.
 *
 * The benefit position is threaded from each payment into the next, exactly as
 * `estimateYear` threads the scan into the rest of the year — this is that same
 * chain extended from two payments to N + 1.
 *
 * `expectedOtherAllowedSpend` is care *not* itemised in `procedures`. Counting
 * a planned scan there as well as here would charge it twice.
 */
export function evaluateYearPlan(
  procedures: PlannedProcedure[],
  payCash: boolean[],
  benefits: PlanBenefits,
  expectedOtherAllowedSpend = 0,
): YearPlan {
  if (procedures.length !== payCash.length) {
    throw new Error(
      `got ${procedures.length} procedures and ${payCash.length} decisions`,
    );
  }
  if (expectedOtherAllowedSpend < 0) {
    throw new Error('expectedOtherAllowedSpend cannot be negative');
  }

  const decisions: ProcedureDecision[] = [];
  let proceduresCost = 0;
  let position = benefits;

  procedures.forEach((procedure, index) => {
    const cash = payCash[index];
    let amount: number;
    let facility: string;

    if (cash) {
      if (procedure.cashPrice === null) {
        throw new Error(
          `${procedure.id} has no published cash price and cannot be paid cash`,
        );
      }
      amount = procedure.cashPrice;
      facility = procedure.cashFacility ?? procedure.insuredFacility;
    } else {
      amount = procedure.insuredAllowed;
      facility = procedure.insuredFacility;
    }

    const payment = estimatePayment(amount, position, !cash);
    proceduresCost += payment.patientPays;
    position = payment.benefitsAfter;
    decisions.push({
      procedure,
      payCash: cash,
      facility,
      cashPaid: cash ? round2(payment.patientPays) : null,
    });
  });

  // The rest of the year runs through insurance however the scans were paid
  // for. This is the payment a deductible credit is bought for.
  const other = estimatePayment(expectedOtherAllowedSpend, position, true);

  return {
    decisions,
    proceduresCost: round2(proceduresCost),
    otherCareCost: round2(other.patientPays),
    totalThisYear: round2(proceduresCost + other.patientPays),
    deductibleRemainingAfter: round2(other.benefitsAfter.deductibleRemaining),
    cashCount: decisions.filter((decision) => decision.payCash).length,
  };
}

/** The best plan, against the two a household would otherwise pick. */
export type YearPlanComparison = {
  best: YearPlan;
  allCash: YearPlan;
  allInsured: YearPlan;
  /** The costlier of the two obvious approaches — what `best` avoids. */
  alternative: YearPlan;
  /** What the recommended plan saves against that alternative. */
  saving: number;
};

/**
 * The cheapest way to pay for the list, found exhaustively.
 *
 * Every assignment of cash-or-insured is tried. That is 2**N with N capped at
 * `MAX_PROCEDURES`, so the search is exact and there is no heuristic to be
 * subtly wrong. Procedures with no published cash price are held to insurance
 * rather than dropped.
 *
 * Ties break on (total, how many are paid cash, then the bit pattern), so the
 * same input always returns the same plan. The Python mirrors this and a
 * nondeterministic tie would fail parity intermittently, which is the worst way
 * for it to fail.
 *
 * `cashIsWorthOffering` in `./routes` is deliberately not consulted. That gate
 * keeps the single-scan comparison from volunteering cash to somebody who will
 * clear their deductible anyway; here both corners are costed outright and
 * compared, which answers the same question with more information rather than
 * less. Do not "reconcile" the two.
 */
export function optimizeYearPlan(
  procedures: PlannedProcedure[],
  benefits: PlanBenefits,
  expectedOtherAllowedSpend = 0,
): YearPlanComparison {
  if (procedures.length > MAX_PROCEDURES) {
    throw new Error(
      `${procedures.length} procedures exceeds the ${MAX_PROCEDURES} this ` +
        'search is bounded to',
    );
  }

  const cashable = procedures.map((procedure) => procedure.cashPrice !== null);
  const allInsured = evaluateYearPlan(
    procedures,
    procedures.map(() => false),
    benefits,
    expectedOtherAllowedSpend,
  );
  // "All cash" means cash wherever it is published — a procedure nobody prices
  // for cash cannot be part of any plan, best or naive.
  const allCash = evaluateYearPlan(
    procedures,
    [...cashable],
    benefits,
    expectedOtherAllowedSpend,
  );

  // Masks enumerated in the same order Python's itertools.product gives:
  // the last procedure varies fastest.
  const total = 1 << procedures.length;
  let best: YearPlan | null = null;
  let bestKey: [number, number, number] | null = null;

  for (let index = 0; index < total; index += 1) {
    const mask = procedures.map(
      (_, position) =>
        Boolean((index >> (procedures.length - 1 - position)) & 1),
    );
    if (mask.some((cash, position) => cash && !cashable[position])) continue;

    const plan = evaluateYearPlan(
      procedures,
      mask,
      benefits,
      expectedOtherAllowedSpend,
    );
    const key: [number, number, number] = [
      plan.totalThisYear,
      plan.cashCount,
      index,
    ];
    if (
      bestKey === null ||
      key[0] < bestKey[0] ||
      (key[0] === bestKey[0] &&
        (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))
    ) {
      best = plan;
      bestKey = key;
    }
  }

  // Unreachable: index 0 is the all-insured mask, which is always permitted.
  if (best === null) throw new Error('no plan could be costed');

  const alternative =
    allCash.totalThisYear >= allInsured.totalThisYear ? allCash : allInsured;

  return {
    best,
    allCash,
    allInsured,
    alternative,
    saving: round2(alternative.totalThisYear - best.totalThisYear),
  };
}
