/**
 * What the walkthrough asks, and how the answers become an engine query.
 *
 * Every answer starts empty. A field is `undefined` until the member answers
 * it, and `null` where "Not sure" is itself an answer (plan type, where the
 * scan is booked). Nothing ranks until every step is answered, which is the
 * same rule `screener.ts` enforces with its `answered` flags: a ranking driven
 * by a deductible nobody entered is the thing the old example screen was
 * removed for.
 *
 * The walkthrough asks for the deductible and the out-of-pocket maximum as
 * yearly totals, with the amount met so far, because that is how an insurer's
 * app shows them. The engine wants what is *left*, so `toQuery` subtracts. The
 * out-of-pocket room left assumes the only spending so far is the deductible
 * met, which holds until the deductible is fully met; the math screen says so.
 */

import { data, Procedure } from './appData';
import { availableProducts, FacilityBundle } from './routes';
import { ScreenerQuery } from './screener';

export type Modality = 'MRI' | 'CT';
export type Part = 'Knee' | 'Lower back' | 'Brain' | 'Shoulder' | 'Abdomen';

export const MODALITIES: { key: Modality; sub: string }[] = [
  { key: 'MRI', sub: 'Magnetic resonance' },
  { key: 'CT', sub: 'Computed tomography' },
];

export const PARTS: Part[] = ['Knee', 'Lower back', 'Brain', 'Shoulder', 'Abdomen'];

/**
 * The picker's ten cells, each a real code with prices in the bundle.
 *
 * CT of the brain is the existing head CT (70450, "CT, head or brain"). Knee
 * and shoulder CT are the lower- and upper-extremity codes, which is what a
 * hospital bills for them; each procedure's `detail` line says so on screen.
 */
export const CPT: Record<Modality, Record<Part, string>> = {
  MRI: { Knee: '73721', 'Lower back': '72148', Brain: '70551', Shoulder: '73221', Abdomen: '74181' },
  CT: { Knee: '73700', 'Lower back': '72131', Brain: '70450', Shoulder: '73200', Abdomen: '74150' },
};

export type CareKey = 'none' | 'some' | 'major' | 'custom';

/** Total bills, not what the member pays: the engine runs them through the plan. */
export const CARE_AMOUNTS: Record<Exclude<CareKey, 'custom'>, number> = {
  none: 0,
  some: 1500,
  major: 8000,
};

export const CARE_SHORT: Record<CareKey, string> = {
  none: 'no other care',
  some: 'follow-up care',
  major: 'planned surgery',
  custom: 'other planned care',
};

export type HeadacheAnswer = 'yes' | 'no' | 'unsure';

export type Answers = {
  modality?: Modality;
  part?: Part;
  payer?: string;
  /** Plan type, `null` for "Not sure". */
  product?: string | null;
  planText: string;
  /** A facility key, `null` for "Not sure yet". */
  orderedFacility?: string | null;
  indication?: string;
  /** `undefined` until entered, so an untouched stepper reads as not documented. */
  treatmentWeeks?: number;
  headache?: HeadacheAnswer;
  deductibleTotal?: number;
  deductibleMet?: number;
  coinsurancePct?: number;
  oopTotal?: number;
  care?: CareKey;
  careAmount?: number;
};

export const EMPTY_ANSWERS: Answers = { planText: '' };

export function cptOf(answers: Answers): string | undefined {
  if (!answers.modality || !answers.part) return undefined;
  return CPT[answers.modality][answers.part];
}

export function procedureOf(answers: Answers): Procedure | undefined {
  const cpt = cptOf(answers);
  return cpt ? data.procedures.find((item) => item.cpt === cpt) : undefined;
}

/** "Knee MRI", or the bundle's label for the code ("Head CT"). */
export function scanName(answers: Answers): string {
  return procedureOf(answers)?.label ?? 'scan';
}

export function facilitiesFor(answers: Answers): FacilityBundle[] {
  const procedure = procedureOf(answers);
  if (!procedure || !answers.payer) return [];
  return procedure.payers[answers.payer] ?? [];
}

/**
 * Hospitals a member can say the scan is booked at.
 *
 * Only those with an in-network rate for this insurer. A cash-only hospital
 * has nothing for `buildRoutes` to price as "your order", so picking one used
 * to fall back to the median hospital and call that the member's order.
 */
export function bookableFacilities(answers: Answers): FacilityBundle[] {
  return facilitiesFor(answers).filter((facility) => facility.plans.length > 0);
}

export function productsFor(answers: Answers): string[] {
  return availableProducts(facilitiesFor(answers));
}

export function careAmountOf(answers: Answers): number | undefined {
  if (!answers.care) return undefined;
  if (answers.care === 'custom') return answers.careAmount;
  return CARE_AMOUNTS[answers.care];
}

/** Whether any published rule exists for this insurer and scan. */
export function hasRules(answers: Answers, payerLabel: string): boolean {
  const cpt = cptOf(answers);
  if (!cpt || !payerLabel) return false;
  const payer = payerLabel.trim().toLowerCase();
  return data.requirements.some(
    (requirement) =>
      requirement.cpt_codes.includes(cpt) &&
      payer.startsWith(requirement.payer.trim().toLowerCase().split(' ')[0]),
  );
}

/**
 * Drop answers that stopped making sense after an earlier one changed.
 *
 * The hospital list and the plan types both change with the scan and the
 * insurer, so a hospital chosen for an Anthem knee MRI may publish nothing for
 * a Cigna head CT. A stale key would silently stop matching and the baseline
 * would fall back to the median with no sign on screen.
 */
export function normalize(answers: Answers): Answers {
  const next = { ...answers };
  const procedure = procedureOf(next);
  if (procedure && next.indication && !procedure.indications.some((i) => i.key === next.indication)) {
    next.indication = undefined;
    next.treatmentWeeks = undefined;
    next.headache = undefined;
  }
  if (next.orderedFacility && !bookableFacilities(next).some((f) => f.facility_key === next.orderedFacility)) {
    next.orderedFacility = undefined;
  }
  if (next.product && !productsFor(next).includes(next.product)) {
    next.product = undefined;
  }
  return next;
}

/** The engine query, or null while anything is unanswered. */
export function toQuery(answers: Answers): ScreenerQuery | null {
  const cpt = cptOf(answers);
  const care = careAmountOf(answers);
  if (
    !cpt ||
    !answers.payer ||
    answers.product === undefined ||
    answers.orderedFacility === undefined ||
    answers.deductibleTotal === undefined ||
    answers.deductibleMet === undefined ||
    answers.coinsurancePct === undefined ||
    answers.oopTotal === undefined ||
    care === undefined
  ) {
    return null;
  }
  const met = Math.min(answers.deductibleMet, answers.deductibleTotal);
  return {
    cpt,
    indication: answers.indication ?? '',
    payer: answers.payer,
    product: answers.product ?? undefined,
    planText: answers.planText,
    orderedFacility: answers.orderedFacility ?? undefined,
    deductible: Math.max(0, answers.deductibleTotal - met),
    coinsurance: answers.coinsurancePct / 100,
    oopMax: Math.max(0, Math.max(answers.oopTotal, answers.deductibleTotal) - met),
    expectedOtherSpend: care,
    treatmentWeeks: answers.treatmentWeeks ?? 0,
    headacheFeature:
      answers.headache === 'yes' ? true : answers.headache === 'no' ? false : undefined,
  };
}
