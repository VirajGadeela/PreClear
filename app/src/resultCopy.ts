/**
 * The walkthrough's result-screen wording, filled from a finished estimate.
 *
 * Presentation only, in the same sense as `routeCopy.ts`: every value is read
 * off routes the engine already ranked, and nothing here decides anything. If a
 * function here ever starts choosing between routes, it belongs in `routes.ts`
 * with a parity test.
 *
 * Every sentence carrying a figure builds it with `money()`, which writes
 * "(estimate)" into the string (hard rule 5). Two other rules bind the words:
 * the order check is never described as predicting a denial, and nothing here
 * suggests a different scan.
 */

import { money } from './costing';
import { formatAmount } from './Money';
import { counterpart, isCash } from './estimate';
import { CARE_SHORT, CareKey } from './flow';
import { Route } from './routes';

/**
 * A whole-dollar figure for a sentence, still carrying "(estimate)".
 *
 * `money()` shows cents, which is right where figures must add up exactly
 * (the math screen, the saving against another route) and noise in a sentence
 * about a $3,000 deductible. This is the same rule with the cents dropped.
 */
export function dollars(amount: number): string {
  return `${formatAmount(amount)} (estimate)`;
}

function titleCase(text: string): string {
  const letters = text.replace(/[^A-Za-z]/g, '');
  const shouted = letters.length > 0 && letters === letters.toUpperCase();
  if (!shouted) return text;
  return text.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase()).replace(/\bIn\b/, 'IN');
}

/**
 * Each location's street address, as the hospital file gives it.
 *
 * Systems that publish one price list for several hospitals put every address
 * in one field, pipe-separated, and some files shout. Restyled only: nothing is
 * dropped, because the address is how a member tells two campuses apart.
 */
export function addressLines(address: string): string[] {
  return address
    .split('|')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(titleCase);
}

/**
 * The city of the first location, or '' when the file gives no address.
 *
 * Files write the address three ways ("..., INDIANAPOLIS, IN 46237", "...
 * Carmel IN 46032", "..., Danville, IN 46122"). The word before the state and
 * ZIP is the city in all three, and every city in this metro is one word.
 */
export function cityOf(address: string): string {
  const first = address.split('|')[0] ?? '';
  const match = first.match(/([A-Za-z]+),?\s+IN\s+\d{5}/);
  if (!match) return '';
  const city = match[1];
  return city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
}

export function verb(route: Route): string {
  if (isCash(route)) return 'Pay cash';
  if (route.kind === 'in_network_order_corrected') return 'Fix the order, then use insurance';
  return 'Use insurance';
}

export function kindLabel(route: Route, booked: boolean): string {
  switch (route.kind) {
    case 'in_network_as_written':
      return booked ? 'INSURANCE · WHERE IT’S BOOKED' : 'INSURANCE · TYPICAL PRICE';
    case 'in_network_cheaper_site':
      return 'INSURANCE · CHEAPER HOSPITAL';
    case 'in_network_order_corrected':
      return 'INSURANCE · FIX THE ORDER FIRST';
    default:
      return 'CASH';
  }
}

/** The deductible-credit clause. It stays on every route row: it is the thesis, not fine print. */
export function creditClause(route: Route): string {
  return isCash(route) ? 'doesn’t count toward your deductible' : 'counts toward your deductible';
}

export function sayLine(route: Route): string {
  return isCash(route) ? 'Self-pay price, please' : 'In-network, using my insurance';
}

/** "$375.77 (estimate) less than paying cash, this year", against the best route of the other kind. */
export function saveLine(routes: Route[]): string | null {
  const best = routes[0];
  if (!best) return null;
  const total = best.estimate.totalThisYear;
  const other = counterpart(routes);
  if (other) {
    const diff = other.estimate.totalThisYear - total;
    const what = isCash(best) ? 'using insurance' : 'paying cash';
    if (diff > 0.005) return `${money(diff)} less than ${what}, this year`;
    return `The same as ${what}, this year`;
  }
  const runnerUp = routes.find((route) => route.estimate.totalThisYear - total > 0.005);
  if (runnerUp) {
    return `${money(runnerUp.estimate.totalThisYear - total)} less than ${runnerUp.facilityName}, this year`;
  }
  return null;
}

/** The "Why this route?" paragraph. Follows whichever route actually won. */
export function whyText(routes: Route[], care: CareKey, cashOffered: boolean): string {
  const best = routes[0];
  const short = CARE_SHORT[care];
  if (!best) return '';

  if (!cashOffered) {
    return `With ${short} ahead, you’re expected to reach your deductible this year, so paying cash would only add to what you pay. Every route here uses insurance.`;
  }

  const cash = routes.find(isCash);
  if (isCash(best)) {
    return care === 'none'
      ? 'With nothing else planned, you’re not expected to reach your deductible this year. The lower cash price wins.'
      : `Even with ${short}, you’re not expected to reach your deductible this year. The lower cash price wins.`;
  }

  const credit = money(best.estimate.deductibleCreditEarned);
  if (cash && cash.estimate.scan.patientPays < best.estimate.scan.patientPays) {
    return care === 'none'
      ? `Cash is cheaper today. Insurance adds ${credit} toward your deductible, and that still comes out ahead this year.`
      : `Cash is cheaper today. But insurance adds ${credit} toward your deductible, and with ${short} ahead, that pays off.`;
  }
  return `Insurance is cheaper today too, and it adds ${credit} toward your deductible.`;
}
