#!/usr/bin/env bash
#
# The requirement checks exist twice, for the same reason the deductible math
# does: pipeline/policies/rules.py::evaluate_check is the source of truth, and
# app/src/requirements.ts mirrors it so the mobile screen can evaluate a rule
# without a round trip.
#
# check-math-parity.sh guards the arithmetic. Nothing guarded this, and the
# failure mode here is quieter than a wrong number: an unmapped field or an
# unknown check type both fall through to "not documented", so a rule the app
# cannot evaluate looks exactly like a rule the order does not satisfy. The app
# would show a citable checklist item that the engine never asserted.
#
# Every requirement in REQUIREMENTS is evaluated against every fact case below,
# in both languages, and the statuses must match exactly.
#
# Run from the repo root:  ./scripts/check-requirements-parity.sh
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

# Fact cases in the Python field names. The TypeScript shim maps them to its
# camelCase equivalents, which is itself part of what this checks — a missing
# entry in that map is exactly the silent bug described above.
#
# Between them these must exercise every check type and every field any check
# reads. A new check type with no case here passes vacuously.
CASES='[
  {},
  {"conservative_therapy_weeks": 0},
  {"conservative_therapy_weeks": 2},
  {"conservative_therapy_weeks": 4},
  {"conservative_therapy_weeks": 6},
  {"prior_radiographs": "nondiagnostic"},
  {"prior_radiographs": "diagnostic"},
  {"mechanical_symptoms": true,
   "meniscal_exam_findings": ["joint_line_tenderness", "reduced_range_of_motion"]},
  {"mechanical_symptoms": false,
   "meniscal_exam_findings": ["joint_line_tenderness"],
   "conservative_therapy_weeks": 6},
  {"mechanical_symptoms": false,
   "meniscal_exam_findings": ["joint_line_tenderness"],
   "conservative_therapy_weeks": 1},
  {"positive_ligament_stress_tests": ["lachman"]},
  {"radiculopathy_objective_findings": true, "conservative_therapy_weeks": 6},
  {"radiculopathy_objective_findings": true, "conservative_therapy_weeks": 1},
  {"radiculopathy_objective_findings": false},
  {"in_person_evaluation_this_episode": true},
  {"in_person_evaluation_this_episode": false},
  {"reevaluation_after_treatment": true},
  {"reevaluation_after_treatment": false},
  {"red_flags": ["fracture"], "conservative_therapy_weeks": 0},
  {"headache_concerning_feature": true},
  {"headache_concerning_feature": false}
]'

# The app evaluates the checks as they travel in the exported bundle, so read
# them from there rather than re-declaring them.
BUNDLE="$ROOT/app/assets/preclear-data.json"

cd "$ROOT/app"
npx tsc src/requirements.ts --ignoreConfig --outDir "$WORK" \
  --module commonjs --target es2020 --skipLibCheck >/dev/null 2>&1

cat > "$WORK/run.js" <<EOF
const { evaluateCheck } = require('$WORK/requirements.js');
const bundle = require('$BUNDLE');
const cases = $CASES;

// Python field name -> OrderFacts key. Kept here rather than imported so a
// drifted mapping inside requirements.ts shows up as a mismatch.
const MAP = {
  conservative_therapy_weeks: 'conservativeTherapyWeeks',
  prior_radiographs: 'priorRadiographs',
  in_person_evaluation_this_episode: 'inPersonEvaluationThisEpisode',
  reevaluation_after_treatment: 'reevaluationAfterTreatment',
  mechanical_symptoms: 'mechanicalSymptoms',
  meniscal_exam_findings: 'meniscalExamFindings',
  positive_ligament_stress_tests: 'positiveLigamentStressTests',
  radiculopathy_objective_findings: 'radiculopathyObjectiveFindings',
  red_flags: 'redFlags',
  headache_concerning_feature: 'headacheConcerningFeature',
};

const out = [];
for (const requirement of bundle.requirements) {
  for (const raw of cases) {
    const facts = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!MAP[key]) throw new Error('unmapped fact field: ' + key);
      facts[MAP[key]] = value;
    }
    out.push([requirement.key, evaluateCheck(requirement.check, facts)]);
  }
}
console.log(JSON.stringify(out));
EOF
node "$WORK/run.js" > "$WORK/ts.json"

cd "$ROOT"
CASES="$CASES" TS_RESULT="$WORK/ts.json" python3 - <<'PY'
import json, os, sys
from pipeline.policies.rules import REQUIREMENTS, ImagingOrder, evaluate_check

cases = json.loads(os.environ["CASES"])
ts = json.load(open(os.environ["TS_RESULT"]))

expected = []
for requirement in REQUIREMENTS:
    for case in cases:
        facts = dict(case)
        for key in ("meniscal_exam_findings", "positive_ligament_stress_tests",
                    "red_flags"):
            if key in facts:
                facts[key] = tuple(facts[key])
        order = ImagingOrder(
            cpt=requirement.cpt_codes[0],
            payer=requirement.citation.payer,
            indication=requirement.indication,
            **facts,
        )
        expected.append([requirement.key, evaluate_check(requirement.check, order).value])

if len(expected) != len(ts):
    print(f"case count differs: python {len(expected)}, ts {len(ts)}")
    sys.exit(1)

failures = 0
for (key, py_status), (ts_key, ts_status) in zip(expected, ts):
    if key != ts_key or py_status != ts_status:
        failures += 1
        print(f"MISMATCH {key}\n  python {py_status}\n  ts     {ts_status}")

if failures:
    print(f"\n{failures} of {len(expected)} evaluations diverged.")
    sys.exit(1)
print(
    f"Python and TypeScript agree on all {len(expected)} evaluations "
    f"({len(REQUIREMENTS)} requirements x {len(cases)} fact cases)."
)
PY
