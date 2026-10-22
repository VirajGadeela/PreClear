# UI restart brief

**Start a new session with:** "Read UI-RESTART.md, then CLAUDE.md, then
DESIGN.md. We're rebuilding the UI on the `ui-restart` branch."

## The job

Replace Preclear's screens and visual design. Keep the product, the data and
the engine. Decided by Viraj on 2026-10-22: the idea is right, the UI reads as
cheap and AI-generated, and incremental polish passes have not moved it.

- **Demo video recorded:** Oct 25. **Deadline:** Oct 26, 12:00 PM ET.
- The video's first 10 seconds must carry the idea: the cheapest way to get
  your MRI or CT *this year*, counting what actually hits your deductible.
- The last known-good state of the old UI is commit `c7d2e23` on
  `congressional-app-challenge`. Anything can be recovered from there.

## Why it reads as cheap (observations, not a direction)

From screenshots of the current build on 2026-10-18. The direction itself is
Viraj's call.

- Every screen is one column of stacked text blocks at similar weight. The
  number that matters rarely dominates, and route 2's reasoning runs to eight
  lines.
- The cover is a white rounded card, gold figures, a gold button and a stat
  list: a pattern that looks templated.
- Three typefaces (Instrument Serif headings, Manrope figures, system body).
- The recommended route is a gold-on-cream band, which reads as a highlighter.
- The core idea, the ranking flipping across the year, is only ever shown as
  text. A chart was tried once and reverted; it is in git history, so check
  why before trying again.

## Keep: engine and data (do not change behaviour)

These hold the product's logic and have no UI in them. Restyle what they
render, never what they compute.

| File | What it gives the UI |
|---|---|
| `app/src/costing.ts` | `estimatePayment`, `estimateYear`, `money()`. Port of `pipeline/costing/oop.py`, guarded by `scripts/check-math-parity.sh` |
| `app/src/requirements.ts` | `checkOrder`, `unmetFindings`, `statusLabel`, `usesTreatmentWeeks`, `readsField`. Guarded by `scripts/check-requirements-parity.sh` |
| `app/src/yearPlan.ts`, `yearPlanData.ts` | `evaluateYearPlan`, `optimizeYearPlan`. Guarded by `scripts/check-year-plan-parity.sh` |
| `app/src/routes.ts` | `buildRoutes`, `rankRoutes`, `cashIsWorthOffering`, `explainRanking`, `describeRecommendation`, `availableProducts`, `planMatchSummary`, `matchesMemberPlan` |
| `app/src/screener.ts` | `queryReducer`, `INITIAL_QUERY`, `isComplete`, `memberPlanOf`: the query state and its "answered" flags |
| `app/src/appData.ts` + `app/assets/preclear-data.json` | the bundle: metro, procedures, facilities, rates, requirements |
| `app/src/share.ts` | `summarize`, `shareText`, `yearPlanText` |

`App.tsx` (710 lines) shows how all of these are called today. Read it for
the wiring, then write a new one; do not try to restyle it in place.

## Keep the rule, restyle freely

- **`Money.tsx`.** The only way a dollar figure renders, because hard rule 5
  puts "estimate" *inside* the string and the accessibility label. Change how it
  looks; never add a second path that prints a bare number.
- **`Slider.tsx`.** PanResponder over plain Views, because a native slider
  costs a dev-client rebuild. Keep the mechanism and its dedupe of unchanged
  values; restyle it.
- **`routeCopy.ts`, `marketing.ts`.** Viraj's copy. Layout around it is free;
  changing the words needs his approval first.

## Replace freely

`App.tsx`, everything in `app/src/screens/` and `app/src/components/`,
`app/src/styles/`, `ThemeProvider.tsx`, and `theme.ts` (see Checks) and
`DESIGN.md` for the new direction.

## Non-negotiables

From CLAUDE.md's hard rules and its hard-won mechanics:

1. Every dollar figure says "estimate" in the string. Never "guaranteed",
   "approved", "you will pay", or "Good Faith Estimate".
2. **Hue never encodes rank.** No red/green for expensive/cheap: the product's
   finding is that the cheaper payment today can be the worse one.
3. Never describe route 3 as denial prediction. It checks an order against a
   payer's published criteria and reports what is not documented.
4. Never suggest a different scan or procedure.
5. The deductible-credit clause stays visible on every route row. It is the
   thesis, not fine print.
6. Nothing ranks until scan, coverage and year are all answered
   (`isComplete`). No example ranking.
7. The cash route appears only when `cashIsWorthOffering` says so.
8. Don't overstate the data. 11 facilities are 9 distinct price lists (IU
   Health's three are identical), and Community Health Network and Ascension
   St. Vincent Indianapolis publish no usable prices.
9. No analytics SDKs and no new native modules (each costs a dev-client
   rebuild). Google fonts through `@expo-google-fonts/*` are fine: no rebuild.
10. 44pt tap targets, text that survives Dynamic Type at accessibility sizes,
    and `flex: 1` on any ScrollView inside a flex column.

## What the screens must show

1. **The idea in 10 seconds.** The real Franciscan Health Carmel case: with no
   other care, cash wins by $36.17; with $8,000 more care, in-network wins by
   $452.18. It is computed from the bundle today; keep it computed.
2. **Scan:** procedure, indication, where it is booked ("Not sure yet" is a
   real answer), and the treatment-weeks or headache fact only when a check
   reads it.
3. **Coverage:** payer, plan type (only types `availableProducts` returns,
   plus "Not sure"), optional plan name with `planMatchSummary` feedback.
4. **Year:** deductible left, coinsurance, out-of-pocket left (never below the
   deductible), expected other care.
5. **Results:** the verdict, then ranked routes, each with its instruction,
   its amount, the deductible-credit clause and its reason. Details open the
   requirement checklist with citations. "No requirement recorded" and "all
   met" must read differently.
6. **Sources:** where the numbers come from, the FAQ, and the one-metro scope.
7. **Household year plan:** optional. Viraj decides whether it survives.

## Checks after every change

From the repo root, Node 22 on PATH
(`export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"`):

```bash
(cd app && npx tsc --noEmit)
/opt/anaconda3/bin/python -m pytest -q pipeline/tests
./scripts/check-math-parity.sh
./scripts/check-requirements-parity.sh
./scripts/check-year-plan-parity.sh
python3 scripts/check-contrast.py
python3 scripts/check-copy-budget.py
(cd app && npx expo export --platform ios)
```

Two of these read UI files, so the restart has to update them:

- **`check-contrast.py`** parses the `light` and `dark` palettes out of
  `theme.ts` and checks named token pairs. New tokens mean new pairs in the
  script. Keep the measured ratio next to every hex.
- **`check-copy-budget.py`** budgets visible words per screen file by name.
  Point it at the new screen files; raising a cap is allowed, in a diff, with
  the reason.

## Running it

- Web: `cd app && npx expo start --web --port 8081`, viewed at 390px wide.
- iOS: the **iPhone 16** simulator has a current dev client. With the server
  running:
  `xcrun simctl openurl 9233D2AE-D8C9-44C1-B979-538F792EB268 "exp+preclear://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"`.
  No rebuild needed unless a native module is added.

## The agents

`/ui-pass` and the `ui-iterate` loop polish a *fixed* design: they are told
never to change existing DESIGN.md tokens. They are the wrong tool until the
new direction has landed. `compliance-reviewer` is useful throughout. Five
corrections to the agent files are waiting in `.claude/ui-loop/pending-fixes/`;
apply them from the repo root with `cp -R .claude/ui-loop/pending-fixes/. .claude/`.

## Plan

| Day | Work |
|---|---|
| Oct 22 | Viraj picks a direction: two or three apps he thinks look premium. Turn it into a new `theme.ts` and `DESIGN.md`. |
| Oct 23 | Cover and the three input groups on the new design. |
| Oct 24 | Results, details, Sources. Dynamic Type and checks. |
| Oct 25 | Record the video. |

## Open decisions for Viraj

1. The visual direction, and the reference apps behind it.
2. Whether the Household tab and the dark theme survive the restart. Dropping
   either saves time.
3. Copy flagged on 2026-10-18 and not yet decided:
   - The cash row says "Cheapest to pay on the day" beside a year total that
     is higher than the row above it; the day price is never shown.
   - The cover's "11 Indianapolis hospitals, real published prices".
   - No note explains why Community and St. Vincent Indianapolis are missing
     from the facility list.
   - The cover's "With $8,000 more care" carries no "estimate" label (an input,
     not a projected cost; hard rule 5's scope is unresolved).
   - The year step shows no "See my routes" button until a value is touched.
