/**
 * Small formatting helpers for on-screen sentences. Presentation only.
 */

import { formatAmount } from './Money';

/**
 * A whole-dollar figure for a sentence, still carrying "(estimate)" (hard
 * rule 5). `money()` in `costing.ts` is the same rule with cents.
 */
export function dollars(amount: number): string {
  return `${formatAmount(amount)} (estimate)`;
}

function titleCase(text: string): string {
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (!letters || letters !== letters.toUpperCase()) return text;
  return text.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase()).replace(/\bIn\b/, 'IN');
}

/**
 * Each location's street address, as the hospital file gives it. Systems that
 * publish one price list for several hospitals put every address in one field,
 * pipe-separated, and some files shout. Restyled only, never shortened.
 */
export function addressLines(address: string): string[] {
  return address
    .split('|')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(titleCase);
}
