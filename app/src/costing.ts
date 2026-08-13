/**
 * Deductible-aware cost math.
 *
 * This mirrors pipeline/costing/oop.py exactly. The Python is the source of
 * truth and is the version with tests against real published prices; this
 * exists so the slider can recompute as it moves rather than round-tripping to
 * a server. If you change one, change both.
 *
 * The asymmetry the whole product rests on: an insured payment buys down the
 * deductible, a cash payment does not. So the cheaper payment today can be the
 * more expensive decision for the year.
 */

export type PlanBenefits = {
  deductibleRemaining: number;
  coinsuranceRate: number;
  oopMaxRemaining: number;
  copay: number;
};

export type CostEstimate = {
  allowedAmount: number;
  patientPays: number;
  appliedToDeductible: number;
  coinsurancePaid: number;
  copayPaid: number;
  shieldedByOopMax: number;
  countsTowardDeductible: boolean;
  benefitsAfter: PlanBenefits;
};

export type YearEstimate = {
  scan: CostEstimate;
  expectedOtherCareCost: number;
  totalThisYear: number;
  deductibleCreditEarned: number;
};

export function estimatePayment(
  allowedAmount: number,
  benefits: PlanBenefits,
  countsTowardDeductible = true,
): CostEstimate {
  if (allowedAmount < 0) {
    throw new Error('allowedAmount cannot be negative');
  }

  // A cash payment at a non-contracted facility earns no credit: the patient
  // pays the full price and the benefit year is untouched.
  if (!countsTowardDeductible) {
    return {
      allowedAmount,
      patientPays: allowedAmount,
      appliedToDeductible: 0,
      coinsurancePaid: 0,
      copayPaid: 0,
      shieldedByOopMax: 0,
      countsTowardDeductible: false,
      benefitsAfter: benefits,
    };
  }

  const toDeductible = Math.min(allowedAmount, benefits.deductibleRemaining);
  const afterDeductible = allowedAmount - toDeductible;

  const copay = Math.min(benefits.copay, allowedAmount);
  const coinsurance = afterDeductible * benefits.coinsuranceRate;

  const uncapped = toDeductible + coinsurance + copay;
  const patientPays = Math.min(uncapped, benefits.oopMaxRemaining);
  const shielded = uncapped - patientPays;

  // The deductible only absorbs what the patient actually paid toward it.
  const creditedToDeductible = Math.min(toDeductible, patientPays);

  return {
    allowedAmount,
    patientPays,
    appliedToDeductible: creditedToDeductible,
    coinsurancePaid: coinsurance,
    copayPaid: copay,
    shieldedByOopMax: shielded,
    countsTowardDeductible: true,
    benefitsAfter: {
      ...benefits,
      deductibleRemaining: benefits.deductibleRemaining - creditedToDeductible,
      oopMaxRemaining: benefits.oopMaxRemaining - patientPays,
    },
  };
}

/**
 * The scan plus the other care expected this year.
 *
 * `expectedOtherAllowedSpend` is what decides whether a deductible credit is
 * worth anything. Setting it to 0 is not neutral — it is the assumption that no
 * further care happens this year.
 */
export function estimateYear(
  allowedAmount: number,
  benefits: PlanBenefits,
  countsTowardDeductible = true,
  expectedOtherAllowedSpend = 0,
): YearEstimate {
  if (expectedOtherAllowedSpend < 0) {
    throw new Error('expectedOtherAllowedSpend cannot be negative');
  }

  const scan = estimatePayment(allowedAmount, benefits, countsTowardDeductible);
  // Other care runs through insurance regardless of how the scan was paid for.
  const other = estimatePayment(
    expectedOtherAllowedSpend,
    scan.benefitsAfter,
    true,
  );

  return {
    scan,
    expectedOtherCareCost: other.patientPays,
    totalThisYear: scan.patientPays + other.patientPays,
    deductibleCreditEarned: scan.appliedToDeductible,
  };
}

/**
 * Format a figure for display, always marked as an estimate.
 *
 * CLAUDE.md requires the word "estimate" in the string itself, not as a
 * footnote, and forbids "guaranteed", "approved" and "you will pay". Every
 * dollar figure rendered anywhere in this app goes through this function.
 */
export function money(amount: number): string {
  const formatted = amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} (estimate)`;
}
