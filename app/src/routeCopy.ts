/**
 * What to do about each route, and why.
 *
 * `ROUTE_LABELS` in `routes.ts` names what a route *is* — "Same coverage,
 * cheaper facility". That is a category, and reading four categories tells a
 * member nothing about their own situation. The question they actually arrive
 * with is some version of "is my order missing paperwork, or should I pay cash,
 * or am I close enough to my deductible that insurance wins" — and a list of
 * four category names with four dollar figures answers none of it.
 *
 * So a row leads with an instruction. "Ask for this scan at Franciscan
 * Indianapolis" names the situation by naming the action, and the reason
 * underneath says why in the member's own terms rather than the engine's.
 *
 * ---
 *
 * This is presentation, not math. Every value here is read off a `Route` the
 * engine already produced — `kind`, `facilityName`, `unmetRequirements`, and the
 * estimate — and nothing is recomputed. That is why there is no parity script
 * beside this file while `costing`, `requirements` and `claims` all have one:
 * there is no second implementation to drift from. If a function here ever
 * starts *deciding* something rather than describing it, that has stopped being
 * true and it belongs in `routes.ts`.
 *
 * Two rules bind the strings, both from CLAUDE.md:
 *
 *   - **Route 3 is never denial prediction.** "Ask your doctor to document X
 *     first" is an administrative instruction about paperwork. It must never
 *     become "or this may be denied", which is a prediction this app does not
 *     make and cannot support.
 *   - **Never suggest a different procedure.** Every action below is about
 *     where the scan happens, how it is paid for, or what the order records.
 *     None of them touch what is being scanned.
 */

import { money } from './costing';
import { Route } from './routes';
import { publisher } from './components/Citation';

export type RouteCopy = {
  /** The instruction, used as the row's title. */
  action: string;
  /** Why it ranks where it does, in body text under the figure. */
  reason: string;
};

export type RouteContext = {
  /** The as-ordered rate, so a cheaper site can say what it saves. */
  baselineAllowed: number | null;
  /**
   * Where the member said the scan is booked, or null for "not sure yet".
   *
   * When it is null the baseline route is the median-priced facility in the
   * metro, which is a reasonable stand-in and is nobody's actual order. Every
   * string below that would otherwise name a place changes rather than
   * asserting one — the app knowing where your scan is booked and the app
   * guessing are different claims, and only one of them is true.
   */
  orderedFacilityName: string | null;
};

export function routeCopy(route: Route, context: RouteContext): RouteCopy {
  const { baselineAllowed, orderedFacilityName } = context;
  const credit = route.estimate.scan.countsTowardDeductible;

  switch (route.kind) {
    case 'in_network_cheaper_site': {
      // The saving on the scan itself, which is the fact that makes this route
      // exist. Not the year total — two in-network routes can share a year
      // total under an out-of-pocket cap and still differ here by hundreds.
      const saving =
        baselineAllowed !== null ? baselineAllowed - route.allowedAmount : null;
      const amount = saving !== null && saving > 1 ? money(saving) : null;

      if (!orderedFacilityName) {
        return {
          action: `Cheapest in-network option: ${route.facilityName}`,
          reason: `The lowest published rate we hold for this scan and insurer.${
            amount ? ` It is ${amount} under the middle of that range.` : ''
          } Say where your scan is booked and this compares against it instead.`,
        };
      }
      return {
        action: `Ask for this scan at ${route.facilityName}`,
        reason: `Same coverage as your order at ${orderedFacilityName}.${
          amount ? ` It charges ${amount} less for the scan itself,` : ' It charges less,'
        } and every dollar still counts toward your deductible.`,
      };
    }

    case 'in_network_as_written':
      if (!orderedFacilityName) {
        return {
          action: 'A typical price for this scan',
          reason: `The middle of the published rates we hold. Not necessarily where your scan is booked. Say where and this becomes your own order.`,
        };
      }
      return {
        action: `Go ahead as ordered, at ${orderedFacilityName}`,
        reason:
          'Your order exactly as written. It counts toward your deductible, and nothing needs to change.',
      };

    case 'in_network_order_corrected': {
      const first = route.unmetRequirements[0];
      const count = route.unmetRequirements.length;
      // Names the delegate, not the payer. Anthem's imaging criteria are
      // Carelon's and Cigna's are eviCore's, and an office that calls the wrong
      // organisation gets nowhere.
      const who = first ? publisher(first) : 'your insurer';
      return {
        action:
          count === 1
            ? 'Ask your doctor to document one more thing first'
            : `Ask your doctor to document ${count} more things first`,
        // Leads with the price, because the list is ranked by price and this
        // route does not change it. Ranked second or third with the same total
        // as going ahead as ordered, it reads as a cheaper option that is not
        // cheaper until something says why it is here at all.
        reason: first
          ? `Same price as going ahead as ordered. It is here because ${who} publishes a criterion your order does not record yet: ${first.summary}`
          : 'Same price as going ahead as ordered. It is here because your order is missing a published criterion. Paperwork, not coverage.',
      };
    }

    case 'cash_non_contracted':
      return {
        action: `Pay cash at ${route.facilityName}`,
        reason:
          'Cheapest to pay on the day. It earns no deductible credit, so later care this year starts from scratch.',
      };

    default:
      return {
        action: route.label,
        reason: credit
          ? 'Counts toward your deductible.'
          : 'Earns no deductible credit.',
      };
  }
}

/**
 * The one-line verdict above the ranking: which situation the member is in.
 *
 * `summarize()` in `share.ts` already says whether cash or insurance wins, and
 * that stays the headline figure. This says the same thing as an instruction,
 * because "cash costs $62.18 more this year" is a fact and "staying in-network
 * is your cheaper route" is an answer, and a member asked for the second.
 */
export function verdict(routes: Route[]): string | null {
  if (routes.length === 0) return null;
  const top = routes[0];

  if (top.kind === 'cash_non_contracted') {
    return 'Paying cash is your cheapest route this year.';
  }
  if (routes.some((route) => route.kind === 'cash_non_contracted')) {
    return 'Staying in-network is your cheapest route this year.';
  }
  return 'These are your options, cheapest first.';
}
