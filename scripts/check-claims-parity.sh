#!/usr/bin/env bash
#
# The claims checks exist twice, for the same reason the deductible math and the
# requirement checks do: pipeline/claims/eob.py is the source of truth and
# app/src/claims.ts is a port so the app can review a household without a round
# trip.
#
# Drift here is worse than in the other two. A wrong route estimate is a wrong
# number on a comparison screen; a wrong claims finding tells a member they are
# owed money they are not, or stays silent about money they are. Both send
# someone to argue with their insurer on a false premise.
#
# Every finding, its amount, and the household total are compared exactly.
#
# Run from the repo root:  ./scripts/check-claims-parity.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

for candidate in /opt/homebrew/opt/node@24/bin /opt/homebrew/opt/node@22/bin; do
  if [ -x "$candidate/node" ]; then
    PATH="$candidate:$PATH"
    break
  fi
done
export PATH

FIXTURE="$ROOT/data/samples/household_eobs.json"

cd "$ROOT/app"
npx tsc src/claims.ts --ignoreConfig --outDir "$WORK" \
  --module commonjs --target es2020 --skipLibCheck >/dev/null 2>&1

cat > "$WORK/run.js" <<EOF
const { review, totalAtStake } = require('$WORK/claims.js');
const raw = require('$FIXTURE');
const eobs = raw.eobs;
const findings = review(eobs, raw.plan);
console.log(JSON.stringify({
  total: totalAtStake(findings),
  findings: findings.map((f) => [f.kind, f.claim_id, f.amount, f.summary]),
}));
EOF
node "$WORK/run.js" > "$WORK/ts.json"

cd "$ROOT"
FIXTURE="$FIXTURE" TS_RESULT="$WORK/ts.json" python3 - <<'PY'
import json, os, sys
from pipeline.claims.eob import Eob, HouseholdPlan, review, total_at_stake

with open(os.environ["FIXTURE"], encoding="utf-8") as handle:
    raw = json.load(handle)

plan = HouseholdPlan(**raw["plan"])
eobs = [
    Eob(**{k: v for k, v in item.items() if not k.startswith("_")})
    for item in raw["eobs"]
]
findings = review(eobs, plan)
expected = {
    "total": total_at_stake(findings),
    "findings": [[f.kind, f.claim_id, f.amount, f.summary] for f in findings],
}
actual = json.load(open(os.environ["TS_RESULT"]))

failures = 0
if expected["total"] != actual["total"]:
    failures += 1
    print(f"TOTAL MISMATCH\n  python {expected['total']}\n  ts     {actual['total']}")

if len(expected["findings"]) != len(actual["findings"]):
    failures += 1
    print(
        f"COUNT MISMATCH: python {len(expected['findings'])}, "
        f"ts {len(actual['findings'])}"
    )
else:
    for want, got in zip(expected["findings"], actual["findings"]):
        if want != got:
            failures += 1
            print(f"MISMATCH\n  python {want}\n  ts     {got}")

if failures:
    print(f"\n{failures} difference(s) between Python and TypeScript.")
    sys.exit(1)
print(
    f"Python and TypeScript agree on all {len(expected['findings'])} findings "
    f"and on the ${expected['total']:,.2f} household total."
)
PY
