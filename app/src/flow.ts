/**
 * The walkthrough's answers, and the routes they produce.
 *
 * This mirrors the Claude Design walkthrough's own state (scan, body part,
 * ZIP, radius, carrier, deductible met, coinsurance, out-of-pocket maximum,
 * planned care) and its starting values, with every price replaced by the
 * published one. The one starting value that differs is the deductible met:
 * the walkthrough's $400 is replaced by what the demo account's real past
 * scans put toward it, so the Past tab and the Plan tab agree.
 *
 * Routes are the walkthrough's: every hospital within the radius, paid with
 * insurance and paid in cash, ranked by what the year costs. Each one is
 * priced by the engine (`representativeRate` for the in-network rate,
 * `estimateYear` for the year, `rankRoutes` for the order), so nothing here is
 * new math. The walkthrough has no plan step, so a hospital's in-network price
 * is the median of the plausible rates it publishes for that insurer, which is
 * what the engine does when the plan is not known.
 */

import { data, PAYER_LABELS, Procedure } from './appData';
import { PlanBenefits, estimateYear } from './costing';
import { DEMO_MET } from './demoProfile';
import { ZipCheck, checkZip, distanceTo } from './geo';
import { Route, rankRoutes, representativeRate, warningsFor } from './routes';

export type Modality = 'MRI' | 'CT';
export type Part = 'Knee' | 'Lower back' | 'Brain' | 'Shoulder' | 'Abdomen';
export type Carrier = 'Blue Cross' | 'Aetna' | 'Cigna' | 'UnitedHealthcare';
export type Care = 'none' | 'some' | 'major';

export const PARTS: Part[] = ['Knee', 'Lower back', 'Brain', 'Shoulder', 'Abdomen'];
export const CARRIERS: Carrier[] = ['Blue Cross', 'Aetna', 'Cigna', 'UnitedHealthcare'];
export const RADII = [5, 15, 30] as const;

/** Blue Cross in Indiana is Anthem; out-of-state Blue plans are excluded from the prices. */
export const CARRIER_PAYER: Record<Carrier, string> = {
  'Blue Cross': 'anthem',
  Aetna: 'aetna',
  Cigna: 'cigna',
  UnitedHealthcare: 'unitedhealthcare',
};

/**
 * Every cell of the picker is a real code with published prices. CT of the
 * brain is the bundle's head CT (70450, "CT, head or brain").
 */
export const CPT: Record<Modality, Record<Part, string>> = {
  MRI: { Knee: '73721', 'Lower back': '72148', Brain: '70551', Shoulder: '73221', Abdomen: '74181' },
  CT: { Knee: '73700', 'Lower back': '72131', Brain: '70450', Shoulder: '73200', Abdomen: '74150' },
};

/** Planned care as total bills. The engine runs them through the plan. */
export const CARE_BILLS: Record<Care, number> = { none: 0, some: 1500, major: 8000 };
export const CARE_SHORT: Record<Care, string> = {
  none: 'no other care',
  some: 'follow-ups',
  major: 'planned surgery',
};

export type State = {
  scan: Modality;
  part: Part;
  zip: string;
  radius: (typeof RADII)[number];
  carrier: Carrier;
  deductible: number;
  met: number;
  coins: number;
  oop: number;
  care: Care;
};

export const DEFAULTS: State = {
  scan: 'MRI',
  part: 'Knee',
  zip: '46220',
  radius: 15,
  carrier: 'Blue Cross',
  deductible: 3000,
  met: Math.round(DEMO_MET),
  coins: 20,
  oop: 6000,
  care: 'major',
};

export type Option = Route & { distance: number };

export type Estimate = {
  cpt: string;
  procedure: Procedure;
  scanName: string;
  zip: ZipCheck;
  payerLabel: string;
  benefits: PlanBenefits;
  laterCare: number;
  /** Every route, cheapest year first. */
  routes: Option[];
  best: Option | undefined;
  /** The best route of the other kind: cash if the best uses insurance, and the reverse. */
  other: Option | undefined;
  bestInsurance: Option | undefined;
  bestCash: Option | undefined;
};

export const isCash = (route: Route) => !route.estimate.scan.countsTowardDeductible;

export function compute(state: State): Estimate {
  const cpt = CPT[state.scan][state.part];
  const procedure = data.procedures.find((item) => item.cpt === cpt) as Procedure;
  const payer = CARRIER_PAYER[state.carrier];
  const zip = checkZip(state.zip);
  const centre = zip.status === 'in' ? zip.centre : null;

  const met = Math.min(state.met, state.deductible);
  const benefits: PlanBenefits = {
    deductibleRemaining: Math.max(0, state.deductible - met),
    coinsuranceRate: state.coins / 100,
    // Room left under the yearly maximum, assuming the deductible met is all
    // that has been paid so far. Never below the deductible left.
    oopMaxRemaining: Math.max(state.oop, state.deductible) - met,
    copay: 0,
  };
  const laterCare = CARE_BILLS[state.care];

  const options: Option[] = [];
  for (const facility of procedure.payers[payer] ?? []) {
    const distance = centre ? distanceTo(centre, facility.facility_key) : null;
    if (distance === null || distance > state.radius) continue;
    const base = {
      facilityName: facility.facility_name,
      alsoAt: facility.also_at ?? [],
      facilityAddress: facility.facility_address,
      unmetRequirements: [],
      distance,
    };
    const rate = representativeRate(facility);
    if (rate) {
      options.push({
        ...base,
        kind: `in_network:${facility.facility_key}`,
        label: 'Insurance',
        allowedAmount: rate.rate,
        estimate: estimateYear(rate.rate, benefits, true, laterCare),
        warnings: warningsFor(rate.rate, facility.gross_charge),
      });
    }
    if (facility.cash_price !== null) {
      options.push({
        ...base,
        kind: `cash:${facility.facility_key}`,
        label: 'Cash',
        allowedAmount: facility.cash_price,
        estimate: estimateYear(facility.cash_price, benefits, false, laterCare),
        warnings: [],
      });
    }
  }

  const routes = rankRoutes(options) as Option[];
  const best = routes[0];
  return {
    cpt,
    procedure,
    scanName: `${state.part} ${state.scan}`,
    zip,
    payerLabel: PAYER_LABELS[payer] ?? state.carrier,
    benefits,
    laterCare,
    routes,
    best,
    other: best ? routes.find((route) => isCash(route) !== isCash(best)) : undefined,
    bestInsurance: routes.find((route) => !isCash(route)),
    bestCash: routes.find(isCash),
  };
}
