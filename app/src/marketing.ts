/**
 * Copy that explains the product rather than reporting a result.
 *
 * Everything else in this app renders a number the engine computed or a
 * sentence a payer published. This file is the exception: it is the app talking
 * about itself, which is exactly the writing most likely to overclaim. It lives
 * as typed data rather than as JSX for the same reason `plan.ts` does — so the
 * strings can be read, reviewed and changed without opening a screen, and so
 * two screens cannot describe the same product differently.
 *
 * ---
 *
 * DRAFT. These strings are Rohan's to write and the ones below are a
 * placeholder scaffold, not finished copy. They were drafted only from things
 * the repository can already prove — every claim here is checkable against the
 * pipeline, the hard rules in CLAUDE.md, or the Sources screen — so that
 * replacing them is an editing job rather than a fact-checking one.
 *
 * Four hard rules bind anything written here, and the FAQ is where each is
 * easiest to break:
 *
 *   - **Never denial prediction.** This app checks an order against published,
 *     deterministic criteria and reports which are not documented as met. "Will
 *     my claim be denied" is the question a reader arrives with and the one
 *     sentence that must not be answered with a yes, a no, or a probability.
 *   - **Every dollar figure carries "estimate"** inside the string. The
 *     simplest way to honour that here is to state no dollar figure at all, and
 *     none of the copy below does.
 *   - **Never suggest a different scan or treatment.** Outputs are financial
 *     and administrative. An FAQ answer that drifts toward "you may not need an
 *     MRI" is medical advice.
 *   - **Never the words "HIPAA compliant."** The privacy answer below says what
 *     the app actually does — nothing leaves the device — which is a stronger
 *     claim and a checkable one.
 */

export type HowItWorksStep = {
  /** Rendered in the step dot. Kept as data so the list cannot renumber wrong. */
  n: number;
  title: string;
  body: string;
};

/**
 * Three steps, matching the three things the screener actually asks for.
 *
 * Not four, and not a funnel. The screener opens on an answer, so this is a
 * description of what the controls above the ranking are for, not a sequence
 * anybody has to walk. Written in that order because that is the order the
 * filter strip presents them.
 */
export const HOW_IT_WORKS: HowItWorksStep[] = [
  {
    n: 1,
    title: 'Name the scan and the plan',
    body: 'No member ID, no card photo. Neither changes the answer.',
  },
  {
    n: 2,
    title: 'Say what the rest of your year looks like',
    body: 'The other care you expect is the number that decides this.',
  },
  {
    n: 3,
    title: 'Read four routes, ranked by the year',
    body: 'Not by the price on the day. The cheapest today is sometimes last.',
  },
];

export type FaqEntry = { q: string; a: string };

/**
 * Lives at the bottom of the Sources tab, not on a tab of its own.
 *
 * A reader who wants a claim checked is already on Sources — that screen quotes
 * every payer criterion verbatim and links the file each price came out of. The
 * questions below are the ones that survive after reading it, so they belong
 * underneath rather than somewhere a sceptic has to go find.
 */
export const FAQ: FaqEntry[] = [
  {
    q: 'Will my claim be denied?',
    a:
      'This app will never tell you. It reports which published criteria your order does not document as met — a gap in the paperwork, not a coverage decision. Only your insurer makes that one.',
  },
  {
    q: 'Why can paying cash be the more expensive choice?',
    a:
      'It earns no deductible credit. If you reach your deductible later anyway, that money did nothing to get you there and you pay the deductible in full on top of it.',
  },
  {
    q: 'Where do the prices come from?',
    a:
      'Files hospitals and insurers are federally required to publish. Every rate traces to one, named above with its plan and code.',
  },
  {
    q: 'Is this what I will actually pay?',
    a:
      'No. Every figure is an estimate from published rates and the numbers you entered. Your plan is the only authority on your benefits.',
  },
  {
    q: 'What do you do with what I enter?',
    a:
      'Nothing. It stays on this device, is not saved between sessions, and there is no analytics SDK here to send it anywhere. That is why there is no sign-in.',
  },
  {
    q: 'Why ask for my plan type instead of my member ID?',
    a:
      'A member ID identifies you and would only serve an eligibility lookup this app does not do. Plan type is the fact that changes the price, and it identifies nobody.',
  },
];
