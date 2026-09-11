/**
 * Turn a member's answers into the two prices the year plan needs.
 *
 * `yearPlan.ts` is deliberately free of the bundle — it takes numbers and does
 * arithmetic, so the parity script can compile it standalone. This is the thin
 * layer between the two, and it invents no pricing of its own: every number
 * comes back through `representativeRate` and the same plausibility filtering
 * `buildRoutes` uses, so the year plan can never surface a rate the single-scan
 * comparison would refuse.
 */

import { data } from './appData';
import { representativeRate, warningsFor, type FacilityBundle } from './routes';
import type { PlannedProcedure } from './yearPlan';

/**
 * The cheapest in-network price, and the cheapest cash price, for one scan.
 *
 * Cheapest in-network is not a heuristic here: the year total is nondecreasing
 * in the summed insured allowed amount, so the smallest one is provably the
 * right choice and there is nothing to search. It is the same facility route 2
 * offers on the single-scan screen, arrived at the same way.
 *
 * Facilities whose representative rate still carries a warning are set aside
 * first. `representativeRate` already prefers a facility's plausible rows, so a
 * warned rate means every row it published looks like a carve-out or a
 * percent-of-charge artifact. On the single-scan screen such a facility can
 * still appear, because the card shows the warning beside it; here the number
 * would feed an optimiser with nowhere to put the caveat, and a $49 knee MRI
 * would win every time. If setting them aside leaves nothing, the full set
 * comes back — "we are not confident in this price" beats "this scan has no
 * price", which is the same call `representativeRate` makes internally.
 *
 * Returns null when the payer publishes nothing for this scan at all.
 */
export function resolvePlannedProcedure({
  id,
  cpt,
  member,
  payer,
  memberPlan,
}: {
  id: string;
  cpt: string;
  member: string;
  payer: string;
  memberPlan?: string;
}): PlannedProcedure | null {
  const procedure = data.procedures.find((item) => item.cpt === cpt);
  const facilities: FacilityBundle[] = procedure?.payers[payer] ?? [];
  if (facilities.length === 0) return null;

  const priced = facilities
    .map((facility) => ({ facility, rate: representativeRate(facility, memberPlan) }))
    .filter(
      (entry): entry is { facility: FacilityBundle; rate: NonNullable<typeof entry.rate> } =>
        entry.rate !== null,
    );
  if (priced.length === 0) return null;

  const confident = priced.filter(
    (entry) => warningsFor(entry.rate.rate, entry.facility.gross_charge).length === 0,
  );
  const pool = confident.length > 0 ? confident : priced;
  const cheapest = [...pool].sort((a, b) => a.rate.rate - b.rate.rate)[0];

  // The same reduction `buildRoutes` uses for route 4.
  const withCash = facilities.filter((facility) => facility.cash_price !== null);
  const cheapestCash =
    withCash.length > 0
      ? withCash.reduce((best, facility) =>
          (facility.cash_price as number) < (best.cash_price as number) ? facility : best,
        )
      : null;

  return {
    id,
    cpt,
    member,
    insuredAllowed: cheapest.rate.rate,
    insuredFacility: cheapest.facility.facility_name,
    cashPrice: cheapestCash?.cash_price ?? null,
    cashFacility: cheapestCash?.facility_name ?? null,
  };
}

/** What a planned scan is called on screen. Never sent to the engine. */
export function procedureLabel(cpt: string): string {
  return data.procedures.find((item) => item.cpt === cpt)?.label ?? cpt;
}

/**
 * Who a scan is for.
 *
 * Household roles, never names — CLAUDE.md hard rule 1, and the same
 * convention `data/samples/household_eobs.json` uses for the claims review.
 * There is no free-text field anywhere in this feature for the same reason
 * there is no member ID on the coverage screen: a name identifies somebody and
 * changes no answer.
 */
export const HOUSEHOLD_MEMBERS = ['Adult 1', 'Adult 2', 'Child 1', 'Child 2'];
