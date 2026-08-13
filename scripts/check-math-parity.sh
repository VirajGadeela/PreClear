#!/usr/bin/env bash
#
# The deductible math exists twice: pipeline/costing/oop.py is the source of
# truth, and app/src/costing.ts is a port so the slider can recompute locally.
# Two implementations of the same arithmetic will drift, so this compares them
# on the cases that matter — including the out-of-pocket cap and the point where
# the cash-versus-insured ranking flips.
#
# Run from the repo root:  ./scripts/check-math-parity.sh
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

CASES='[[992.51,2000,0.2,6000,true,0],
        [574.27,2000,0.2,6000,false,0],
        [992.51,2000,0.2,6000,true,8000],
        [574.27,2000,0.2,6000,false,8000],
        [1000,5000,0.2,300,true,0],
        [1000,400,0.2,6000,true,2500],
        [360.22,0,0.2,6000,true,1200]]'

cd "$ROOT/app"
npx tsc src/costing.ts --ignoreConfig --outDir "$WORK" \
  --module commonjs --target es2020 --skipLibCheck >/dev/null 2>&1

cat > "$WORK/run.js" <<EOF
const { estimateYear } = require('$WORK/costing.js');
const cases = $CASES;
console.log(JSON.stringify(cases.map(([amt, ded, co, oop, counts, other]) => {
  const r = estimateYear(amt, {
    deductibleRemaining: ded, coinsuranceRate: co,
    oopMaxRemaining: oop, copay: 0,
  }, counts, other);
  return [+r.scan.patientPays.toFixed(2), +r.totalThisYear.toFixed(2),
          +r.deductibleCreditEarned.toFixed(2)];
})));
EOF
node "$WORK/run.js" > "$WORK/ts.json"

cd "$ROOT"
CASES="$CASES" TS_RESULT="$WORK/ts.json" python3 - <<'PY'
import json, os, sys
from pipeline.costing.oop import PlanBenefits, estimate_year

cases = json.loads(os.environ["CASES"])
ts = json.load(open(os.environ["TS_RESULT"]))

failures = 0
for case, actual in zip(cases, ts):
    amount, deductible, coinsurance, oop_max, counts, other = case
    result = estimate_year(
        amount, PlanBenefits(deductible, coinsurance, oop_max), counts, other
    )
    expected = [
        round(result.scan.patient_pays, 2),
        round(result.total_this_year, 2),
        round(result.deductible_credit_earned, 2),
    ]
    if expected != actual:
        failures += 1
        print(f"MISMATCH {case}\n  python {expected}\n  ts     {actual}")

if failures:
    print(f"\n{failures} case(s) diverged between Python and TypeScript.")
    sys.exit(1)
print(f"Python and TypeScript agree on all {len(cases)} cases.")
PY
