#!/usr/bin/env bash
#
# The worked examples on the landing screen open straight onto a result, and
# the comments in app/src/demo.ts quote what that result is: which headline
# appears, and the figures in it.
#
# Those outcomes are produced by the routing engine over the shipped rate
# bundle. Neither is pinned by the scenario — re-export the data, change a
# ranking rule, or adjust a threshold, and a scenario can quietly start showing
# something other than the thing it was chosen to show. The demo that opens a
# submission video is exactly the wrong place to find that out.
#
# So this asserts the property each scenario exists to demonstrate, not the
# exact dollar figures. Prices move when the bundle is regenerated and that is
# normal; a cash-trap scenario that stops demonstrating the cash trap is not.
#
# Run from the repo root:  ./scripts/check-demo-scenarios.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Expo SDK 57 needs Node 22.13+; prefer a modern Homebrew node if the one on
# PATH is older.
for candidate in /opt/homebrew/opt/node@26/bin /opt/homebrew/opt/node@24/bin /opt/homebrew/opt/node@22/bin; do
  if [ -x "$candidate/node" ]; then
    PATH="$candidate:$PATH"
    break
  fi
done
export PATH

cd "$ROOT/app"
npx tsc src/routes.ts src/costing.ts src/requirements.ts src/share.ts src/demo.ts \
  --ignoreConfig --outDir "$WORK" \
  --module commonjs --target es2020 --skipLibCheck >/dev/null 2>&1

cat > "$WORK/run.js" <<'EOF'
const { buildRoutes, rankRoutes } = require('./routes.js');
const { summarize } = require('./share.js');
const { checkOrder, unmetFindings } = require('./requirements.js');
const { DEMO_SCENARIOS } = require('./demo.js');
const data = require(process.env.BUNDLE);

const PAYER_LABELS = {
  anthem: 'Anthem Blue Cross and Blue Shield',
  unitedhealthcare: 'UnitedHealthcare',
  aetna: 'Aetna',
  cigna: 'Cigna Healthcare',
};

// What each scenario is on the landing screen to show. Keyed by id, so adding
// a scenario without deciding what it demonstrates fails loudly below.
const EXPECTED = {
  'cash-trap':  { summary: 'cash_costs_more' },
  // The headline here is whatever the prices happen to say — the point of this
  // scenario is the unmet requirement underneath it, and pinning the headline
  // as well would make it fail for a reason it does not care about. What it
  // must not do is lead with a cash finding, which would bury the order check
  // under a different story.
  'order-gap':  { notCashSummary: true, minUnmet: 1, noCashRoute: true },
  'site-swap':  { summary: 'spread', noCashRoute: true },
};

let failures = 0;
const fail = (id, message) => { console.error(`  FAIL ${id}: ${message}`); failures++; };

for (const scenario of DEMO_SCENARIOS) {
  const expected = EXPECTED[scenario.id];
  if (!expected) { fail(scenario.id, 'no expectation recorded in this script'); continue; }

  const procedure = data.procedures.find((p) => p.cpt === scenario.cpt);
  if (!procedure) { fail(scenario.id, `CPT ${scenario.cpt} is not in the bundle`); continue; }

  // The indication has to exist, or the requirement check silently matches
  // nothing and the scenario looks fine while checking zero rules.
  if (!procedure.indications.some((i) => i.key === scenario.indication)) {
    fail(scenario.id, `indication "${scenario.indication}" is not offered for ${scenario.cpt}`);
    continue;
  }

  const facilities = procedure.payers[scenario.payer] ?? [];
  if (facilities.length === 0) { fail(scenario.id, `no facilities for payer ${scenario.payer}`); continue; }

  const facts = {
    conservativeTherapyWeeks: scenario.treatmentWeeks,
    headacheConcerningFeature: scenario.headacheFeature,
  };
  const applicable = checkOrder(
    data.requirements, PAYER_LABELS[scenario.payer], scenario.cpt, scenario.indication, facts);
  const findings = unmetFindings(applicable);

  const routes = rankRoutes(buildRoutes({
    facilities,
    benefits: {
      deductibleRemaining: scenario.deductible,
      coinsuranceRate: scenario.coinsurance,
      oopMaxRemaining: 6000,
      copay: 0,
    },
    expectedOtherAllowedSpend: scenario.expectedOtherSpend,
    memberPlan: undefined,
    unmetRequirements: findings.map((f) => f.requirement),
    cashIsAppropriate: scenario.expectedOtherSpend < scenario.deductible,
  }));

  if (routes.length === 0) { fail(scenario.id, 'produces no routes at all'); continue; }

  // Every scenario must land on a real result, not the empty state.
  const summary = summarize(routes);
  const kind = summary ? summary.kind : null;
  if (expected.summary !== undefined && kind !== expected.summary) {
    fail(scenario.id, `headline is "${kind}", expected "${expected.summary}"`);
  }
  if (expected.notCashSummary && kind && kind.startsWith('cash_')) {
    fail(scenario.id, `headline is "${kind}", which buries the order check`);
  }
  if (expected.minUnmet !== undefined && findings.length < expected.minUnmet) {
    fail(scenario.id, `${findings.length} unmet requirement(s), expected at least ${expected.minUnmet}`);
  }
  if (expected.noCashRoute && routes.some((r) => r.kind === 'cash_non_contracted')) {
    fail(scenario.id, 'a cash route appears, which this scenario is meant to withhold');
  }

  // Sliders only stop on these steps. A scenario off-step shows a number the
  // member cannot reproduce, and their first drag would change the answer.
  if (scenario.deductible % 250 !== 0) fail(scenario.id, `deductible ${scenario.deductible} is off the 250 step`);
  if (scenario.expectedOtherSpend % 500 !== 0) fail(scenario.id, `other spend ${scenario.expectedOtherSpend} is off the 500 step`);
  if (Math.round(scenario.coinsurance * 100) % 5 !== 0) fail(scenario.id, `coinsurance ${scenario.coinsurance} is off the 0.05 step`);

  if (!failures) {
    const detail = summary && summary.kind === 'cash_costs_more'
      ? `cash saves $${summary.todayGap.toFixed(2)} today, costs $${summary.yearGap.toFixed(2)} more this year`
      : summary && summary.kind === 'spread'
      ? `$${summary.spread.toFixed(2)} between best and worst`
      : `${findings.length} unmet requirement(s)`;
    console.log(`  ok   ${scenario.id}: ${routes.length} routes, ${detail}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} demo scenario check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${DEMO_SCENARIOS.length} demo scenarios still show what they claim to.`);
EOF

BUNDLE="$ROOT/app/assets/preclear-data.json" node "$WORK/run.js"
