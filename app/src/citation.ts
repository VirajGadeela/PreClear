/**
 * How a requirement's source is named and dated on screen.
 *
 * Moved out of the old `components/Citation.tsx` when the UI was replaced, so
 * `routeCopy.ts` and the checklist screen read the same rule.
 */

import { Requirement } from './routes';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * `2026-02-03` to `3 Feb 2026`.
 *
 * Split on the string rather than going through `Date`, which would read the
 * ISO date as UTC midnight and render the previous day for anyone west of
 * Greenwich. The effective date of a guideline is a fact about the document,
 * not an instant in the reader's timezone.
 */
export function formatEffective(iso: string): string {
  const [year, month, day] = iso.split('-');
  const name = MONTHS[Number(month) - 1];
  if (!name || !year || !day) return iso;
  return `${Number(day)} ${name} ${year}`;
}

/**
 * Who published the criteria, which is usually not the payer.
 *
 * Advanced imaging review is delegated (Anthem to Carelon, Cigna to eviCore),
 * and naming the delegate is part of what makes the citation checkable. Aetna
 * and UnitedHealthcare write their own, which the data marks with
 * "(self-published)" in `reviewed_by`.
 */
export function publisher(requirement: Requirement): string {
  if (requirement.reviewed_by.includes('self-published')) return requirement.payer;
  return requirement.reviewed_by;
}
