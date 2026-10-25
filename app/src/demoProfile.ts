/**
 * The demo account: one synthetic member, used by "I have an account".
 *
 * Synthetic, per hard rule 1. Nobody's real scans or plan are here. It exists
 * so the video can show the returning-member screens (estimates, past scans,
 * plan), and it is introduced in the video as a demo account.
 *
 * Nothing in it is typed in as a dollar figure. Each past scan names a real
 * hospital and code, and its amount is computed from that hospital's published
 * price for this plan, so the history is consistent with the engine: the
 * insurance payments that counted add up to the deductible the Plan screen
 * shows as met, and the cash payments add nothing to it.
 *
 * Kept in this one file so the repo is plain about which data is sample data.
 */

import { data } from './appData';
import { PlanBenefits, estimatePayment } from './costing';
import { Answers } from './flow';
import { representativeRate } from './routes';

export const DEMO_NAME = 'Jordan Rivera';
export const DEMO_INITIALS = 'JR';

const PLAN = {
  payer: 'anthem',
  product: 'ppo',
  planText: 'Blue Access PPO with COPPS',
  deductibleTotal: 3000,
  coinsurancePct: 20,
  oopTotal: 7000,
};

export const DEMO_PLAN_LABEL = 'Anthem Blue Access PPO with COPPS';

type PastSpec = {
  year: string;
  date: string;
  cpt: string;
  facilityKey: string;
  paidBy: 'insurance' | 'cash';
};

const PAST: PastSpec[] = [
  { year: '2026', date: 'Mar 12', cpt: '70450', facilityKey: 'iu-health-indianapolis', paidBy: 'cash' },
  { year: '2026', date: 'Jan 28', cpt: '72148', facilityKey: 'franciscan-indianapolis', paidBy: 'insurance' },
  { year: '2025', date: 'Aug 3', cpt: '73221', facilityKey: 'eskenazi', paidBy: 'insurance' },
  { year: '2025', date: 'Feb 19', cpt: '73721', facilityKey: 'iu-health-indianapolis', paidBy: 'cash' },
];

export type PastScan = {
  year: string;
  date: string;
  name: string;
  facilityName: string;
  paidBy: 'insurance' | 'cash';
  amount: number;
  counted: number;
};

function startOfYear(): PlanBenefits {
  return {
    deductibleRemaining: PLAN.deductibleTotal,
    coinsuranceRate: PLAN.coinsurancePct / 100,
    oopMaxRemaining: PLAN.oopTotal,
    copay: 0,
  };
}

/**
 * Each year's scans, paid in date order against that year's fresh deductible.
 * Computed once at load; the bundle does not change while the app runs.
 */
function buildHistory(): PastScan[] {
  const scans: PastScan[] = [];
  for (const year of ['2026', '2025']) {
    let benefits = startOfYear();
    const inYear = PAST.filter((spec) => spec.year === year).reverse();
    const priced: PastScan[] = [];
    for (const spec of inYear) {
      const procedure = data.procedures.find((item) => item.cpt === spec.cpt);
      const facility = procedure?.payers[PLAN.payer]?.find(
        (item) => item.facility_key === spec.facilityKey,
      );
      if (!procedure || !facility) continue;
      const price =
        spec.paidBy === 'cash'
          ? facility.cash_price
          : representativeRate(facility, PLAN.planText)?.rate ?? null;
      if (price === null) continue;
      const paid = estimatePayment(price, benefits, spec.paidBy === 'insurance');
      benefits = paid.benefitsAfter;
      priced.push({
        year,
        date: spec.date,
        name: procedure.label,
        facilityName: facility.facility_name,
        paidBy: spec.paidBy,
        amount: paid.patientPays,
        counted: paid.appliedToDeductible,
      });
    }
    scans.push(...priced.reverse());
  }
  return scans;
}

export const DEMO_HISTORY = buildHistory();

const thisYear = DEMO_HISTORY.filter((scan) => scan.year === '2026');
export const DEMO_SPENT_THIS_YEAR = thisYear.reduce((sum, scan) => sum + scan.amount, 0);
export const DEMO_MET = thisYear.reduce((sum, scan) => sum + scan.counted, 0);

/** The demo member's plan, as answers, so a new estimate starts from it. */
export const DEMO_PLAN_ANSWERS: Answers = {
  payer: PLAN.payer,
  product: PLAN.product,
  planText: PLAN.planText,
  deductibleTotal: PLAN.deductibleTotal,
  deductibleMet: Math.round(DEMO_MET * 100) / 100,
  coinsurancePct: PLAN.coinsurancePct,
  oopTotal: PLAN.oopTotal,
};

/** The estimate waiting on the demo account's Estimates screen. */
export const DEMO_UPCOMING: Answers = {
  ...DEMO_PLAN_ANSWERS,
  modality: 'MRI',
  part: 'Knee',
  orderedFacility: 'franciscan-indianapolis',
  indication: 'meniscal_tear',
  treatmentWeeks: 2,
  care: 'major',
};
