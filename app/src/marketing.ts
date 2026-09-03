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
    body:
      'The procedure, your insurer, and the plan type printed on your card. No member ID, no card photo — none of that changes the answer.',
  },
  {
    n: 2,
    title: 'Say what the rest of your year looks like',
    body:
      'Deductible left, coinsurance, and the other care you expect. That last one is the number most tools ignore, and it is the one that decides this.',
  },
  {
    n: 3,
    title: 'Read four routes, ranked by the year',
    body:
      'Not by the price on the day. Each route shows the reasoning behind it, and the cheapest payment today is sometimes last.',
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
      'This app will never tell you. It reads criteria your insurer has already published and reports which ones your order does not document as met. That is a gap in the paperwork, not a coverage decision, and only your insurer makes the second one.',
  },
  {
    q: 'Why can paying cash be the more expensive choice?',
    a:
      'A cash payment earns no deductible credit. If you reach your deductible later in the year anyway, the money you paid in cash did nothing to get you there, and you pay the deductible in full on top of it.',
  },
  {
    q: 'Where do the prices come from?',
    a:
      'Files hospitals and insurers are federally required to publish. Every rate on the comparison traces to one of them, and the Sources tab above names the file, the plan and the code behind each.',
  },
  {
    q: 'Is this what I will actually pay?',
    a:
      'No. Every figure is an estimate built from published rates and the benefit numbers you entered. A hospital can bill differently, and your plan is the only authority on your own benefits.',
  },
  {
    q: 'What do you do with what I enter?',
    a:
      'Nothing. It stays on this device, it is not saved between sessions, and there is no analytics SDK in this app to send it anywhere. That is also why there is no account and no sign-in.',
  },
  {
    q: 'Why ask for my plan type instead of my member ID?',
    a:
      'A member ID identifies you and would only be useful for an eligibility lookup this app does not do. The plan type is the fact on your card that changes the price, and it identifies nobody.',
  },
];
