#!/usr/bin/env bash
#
# The household year plan exists twice, for the same reason the deductible
# math, the requirement checks and the claims checks do:
# pipeline/costing/yearplan.py is the source of truth and app/src/yearPlan.ts is
# a port so the household screen can re-optimise as a slider moves.
#
# This is the fourth of these scripts. Drift here tells a household to pay cash
# for scans they should be running through insurance, or the reverse — the exact
# mistake the whole product exists to correct, made at family scale.
#
# The recommended plan's total, how many procedures it pays cash for, the
# per-procedure cash/insured decisions, both naive corners and the saving are
# all compared exactly.
#
# Run from the repo root:  ./scripts/check-year-plan-parity.sh
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

# Each case is [procedures, deductible, coinsurance, oop_max, other_spend].
# A procedure is [id, cpt, member, insured_allowed, insured_facility,
# cash_price, cash_facility]; a null cash price means cash is not an option.
#
# The two crossover cases are the product's claim and are real published
# UnitedHealthcare rates for the three CPTs in the bundle: at $1,000 of other
# care the household should pay cash for all three, and at $2,000 it should
# insure all three. If those two rows ever disagree between the engines, the
# demo is wrong, not just the arithmetic.
CASES='[
  [[], 2000, 0.2, 9000, 1500],

  [[["p1","73721","Adult 1",925.0,"Franciscan Indianapolis",367.93,"IU Health University"]],
   2000, 0.2, 9000, 0],

  [[["p1","73721","Adult 1",925.0,"Franciscan Indianapolis",367.93,"IU Health University"],
    ["p2","72148","Adult 2",807.0,"Franciscan Indianapolis",367.93,"IU Health University"],
    ["p3","70450","Child 1",493.2,"Franciscan Indianapolis",252.39,"IU Health University"]],
   2000, 0.2, 9000, 1000],

  [[["p1","73721","Adult 1",925.0,"Franciscan Indianapolis",367.93,"IU Health University"],
    ["p2","72148","Adult 2",807.0,"Franciscan Indianapolis",367.93,"IU Health University"],
    ["p3","70450","Child 1",493.2,"Franciscan Indianapolis",252.39,"IU Health University"]],
   2000, 0.2, 9000, 2000],

  [[["p1","73721","Adult 1",925.0,"Franciscan Indianapolis",367.93,"IU Health University"],
    ["p2","72148","Adult 2",807.0,"Franciscan Indianapolis",null,null]],
   1000, 0.2, 4000, 500],

  [[["p1","73721","Adult 1",925.0,"Franciscan Indianapolis",367.93,"IU Health University"],
    ["p2","72148","Adult 2",807.0,"Franciscan Indianapolis",367.93,"IU Health University"]],
   300, 0.2, 300, 0],

  [[["p1","73721","Adult 1",925.0,"Franciscan Indianapolis",367.93,"IU Health University"],
    ["p2","72148","Adult 2",807.0,"Franciscan Indianapolis",367.93,"IU Health University"],
    ["p3","70450","Child 1",493.2,"Franciscan Indianapolis",252.39,"IU Health University"]],
   0, 0.5, 9000, 0],

  [[["p1","73721","Adult 1",925.0,"Franciscan Indianapolis",367.93,"IU Health University"],
    ["p2","72148","Adult 2",807.0,"Franciscan Indianapolis",367.93,"IU Health University"],
    ["p3","70450","Child 1",493.2,"Franciscan Indianapolis",252.39,"IU Health University"]],
   4000, 0.3, 9000, 3000]
]'

cd "$ROOT/app"
npx tsc src/yearPlan.ts src/costing.ts --ignoreConfig --outDir "$WORK" \
  --module commonjs --target es2020 --skipLibCheck >/dev/null 2>&1

cat > "$WORK/run.js" <<EOF
const { optimizeYearPlan } = require('$WORK/yearPlan.js');
const cases = $CASES;
console.log(JSON.stringify(cases.map(([rows, ded, co, oop, other]) => {
  const procedures = rows.map(([id, cpt, member, allowed, facility, cash, cashFacility]) => ({
    id, cpt, member,
    insuredAllowed: allowed, insuredFacility: facility,
    cashPrice: cash, cashFacility,
  }));
  const c = optimizeYearPlan(procedures, {
    deductibleRemaining: ded, coinsuranceRate: co,
    oopMaxRemaining: oop, copay: 0,
  }, other);
  return {
    total: c.best.totalThisYear,
    cash_count: c.best.cashCount,
    decisions: c.best.decisions.map((d) => [d.procedure.id, d.payCash, d.facility, d.cashPaid]),
    procedures_cost: c.best.proceduresCost,
    other_care_cost: c.best.otherCareCost,
    deductible_after: c.best.deductibleRemainingAfter,
    all_cash: c.allCash.totalThisYear,
    all_insured: c.allInsured.totalThisYear,
    saving: c.saving,
  };
})));
EOF
node "$WORK/run.js" > "$WORK/ts.json"

cd "$ROOT"
CASES="$CASES" TS_RESULT="$WORK/ts.json" python3 - <<'PY'
import json, os, sys
from pipeline.costing.oop import PlanBenefits
from pipeline.costing.yearplan import PlannedProcedure, optimize_year_plan

cases = json.loads(os.environ["CASES"])
with open(os.environ["TS_RESULT"], encoding="utf-8") as handle:
    ts = json.load(handle)

failures = 0
for case, actual in zip(cases, ts):
    rows, deductible, coinsurance, oop_max, other = case
    procedures = [PlannedProcedure(*row) for row in rows]
    comparison = optimize_year_plan(
        procedures, PlanBenefits(deductible, coinsurance, oop_max), other
    )
    best = comparison.best
    expected = {
        "total": best.total_this_year,
        "cash_count": best.cash_count,
        "decisions": [
            [d.procedure.id, d.pay_cash, d.facility, d.cash_paid]
            for d in best.decisions
        ],
        "procedures_cost": best.procedures_cost,
        "other_care_cost": best.other_care_cost,
        "deductible_after": best.deductible_remaining_after,
        "all_cash": comparison.all_cash.total_this_year,
        "all_insured": comparison.all_insured.total_this_year,
        "saving": comparison.saving,
    }
    if expected != actual:
        failures += 1
        print(f"MISMATCH with {len(rows)} procedure(s), other={other}")
        for key in expected:
            if expected[key] != actual.get(key):
                print(f"  {key}:\n    python {expected[key]}\n    ts     {actual.get(key)}")

if failures:
    print(f"\n{failures} case(s) diverged between Python and TypeScript.")
    sys.exit(1)
print(f"Python and TypeScript agree on all {len(cases)} year-plan cases.")
PY
