/**
 * The demo account's scan history: the walkthrough's four past scans, priced.
 *
 * Synthetic, per hard rule 1. Nobody's real scans are here; the video
 * introduces this as a demo account. The scans, dates and payment methods are
 * the walkthrough's. The hospitals are real Indianapolis hospitals and every
 * amount is computed from that hospital's published price (Anthem, as "Blue
 * Cross", with no plan known, so the median published rate), so the history
 * agrees with the engine: what the 2026 insurance payment put toward the
 * deductible is what the app starts with as "deductible met".
 *
 * Kept in this one file so the repo is plain about which data is sample data.
 */

import { data } from './appData';
import { PlanBenefits, estimatePayment } from './costing';
import { representativeRate } from './routes';

export const DEMO_INITIALS = 'JR';

const PAYER = 'anthem';
const DEDUCTIBLE = 3000;

type PastSpec = {
  year: string;
  date: string;
  name: string;
  cpt: string;
  facilityKey: string;
  paidBy: 'insurance' | 'cash';
};

const PAST: PastSpec[] = [
  { year: '2026', date: 'Mar 12', name: 'Brain CT', cpt: '70450', facilityKey: 'iu-health-indianapolis', paidBy: 'cash' },
  { year: '2026', date: 'Jan 28', name: 'Lower back MRI', cpt: '72148', facilityKey: 'franciscan-carmel', paidBy: 'insurance' },
  { year: '2025', date: 'Aug 3', name: 'Abdomen CT', cpt: '74150', facilityKey: 'iu-health-north', paidBy: 'insurance' },
  { year: '2025', date: 'Feb 19', name: 'Knee MRI', cpt: '73721', facilityKey: 'iu-health-indianapolis', paidBy: 'cash' },
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

/** Each year's scans, paid oldest first against that year's fresh deductible. */
function buildHistory(): PastScan[] {
  const scans: PastScan[] = [];
  for (const year of ['2026', '2025']) {
    let benefits: PlanBenefits = {
      deductibleRemaining: DEDUCTIBLE,
      coinsuranceRate: 0.2,
      oopMaxRemaining: 6000,
      copay: 0,
    };
    const priced: PastScan[] = [];
    for (const spec of PAST.filter((item) => item.year === year).reverse()) {
      const facility = data.procedures
        .find((item) => item.cpt === spec.cpt)
        ?.payers[PAYER]?.find((item) => item.facility_key === spec.facilityKey);
      if (!facility) continue;
      const price = spec.paidBy === 'cash' ? facility.cash_price : representativeRate(facility)?.rate ?? null;
      if (price === null) continue;
      const paid = estimatePayment(price, benefits, spec.paidBy === 'insurance');
      benefits = paid.benefitsAfter;
      priced.push({
        year,
        date: spec.date,
        name: spec.name,
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
export const DEMO_SPENT = thisYear.reduce((sum, scan) => sum + scan.amount, 0);
export const DEMO_MET = thisYear.reduce((sum, scan) => sum + scan.counted, 0);
