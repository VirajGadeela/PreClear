# Preclear

Tells patients, before an elective MRI or CT, which route to that scan
costs them the least this year — accounting for the fact that cash
payments don't count toward the deductible.

## The problem

A knee MRI in Indianapolis costs between $360 and $992 depending on which
facility you walk into and which plan is on your card, and hospitals publish
every one of those numbers. Patients almost never see them, so the choice gets
made by whoever happens to schedule the appointment. Worse, the cheapest sticker
price is often the wrong answer: paying cash can beat insurance on the day and
still cost more by December, because a cash payment earns no deductible credit.

## The core finding

One Anthem member, one knee MRI (CPT 73721), $2,000 deductible remaining, 20%
coinsurance, $6,000 out-of-pocket max remaining. The only thing that changes
between these two rows is how much *other* care the patient expects this year.

| Other care expected this year | Cash | In-network | Cheaper route |
|---|---|---|---|
| $0 | **$574.27** (estimate) | $610.44 (estimate) | cash, by $36.17 |
| $8,000 | $3,774.27 (estimate) | **$3,322.09** (estimate) | in-network, by $452.18 |

Same patient, same scan, same published prices — and the ranking inverts. The
$574.27 cash payment is genuinely cheaper on the day, but it buys no progress
toward the deductible, so every later claim that year starts from the same
place. Ranking routes on the scan price alone gets this backwards, which is
what every existing price-comparison tool does.

Both rows are real engine output, committed under
[`data/samples/`](data/samples/), computed from prices Franciscan Health
publishes.

## How it works

You pick the procedure, why it was ordered, your insurer and your plan type,
then set what you actually know: deductible remaining, coinsurance, and roughly
how much other care you expect this year. The app ranks four routes and shows
its reasoning for each:

1. **In-network, as ordered** — the baseline
2. **In-network, cheaper site of service** — same coverage and same deductible
   credit, lower cost, because negotiated rates vary by facility
3. **In-network, order corrected first** — the order misses a requirement the
   payer publishes; the output is a checklist for the ordering physician
4. **Cash at a non-contracted facility** — surfaced only when the patient is
   uninsured or expected spending falls well short of the deductible

Route 3 checks orders against payers' own published, deterministic criteria and
reports which ones are not documented. It does **not** predict denials, and it
never suggests a different procedure or imaging modality — outputs are financial
and administrative only.

**Plan details are asked for because the plan sets the price, not the payer.**
One Anthem facility publishes five different rates for the same knee MRI. Plan
type narrows to a group — PPO returns $992.51 where HMO returns $784.08 — and
typing the plan name printed on the card pins a single rate, so "Franciscan
Employee" returns $610.44. Both are optional; leaving them blank keeps every
published rate rather than guessing one, and a name that matches nothing says so
instead of being quietly ignored.

**The card is read by you, not by a camera.** There is no photo capture and no
member ID field. A card image would need a camera module plus an OCR module, and
it is the one object in this product that hard rule 3 has to govern; a member ID
is a direct identifier whose only use is an eligibility lookup this app does not
perform. The plan name is the part of the card that changes the answer, and
typing it stores nothing and identifies nobody.

## What's actually behind it

Real published data, not estimates from a model:

- **10 Indianapolis-metro facilities** with negotiated *and* cash prices for
  knee MRI, lumbar MRI and head CT, extracted from hospital price transparency
  files. Three of those are IU Health EINs publishing identical prices — real
  distinct addresses, but not three independent price observations.
- **11 requirement rules across 3 payers**, each carrying document title,
  section ID, version, effective date and source URL. The rules are usually
  written by a delegate rather than the payer: Anthem's are Carelon's, Cigna's
  are eviCore's.
- **The payer doesn't set the price; the plan does.** Franciscan Health
  Indianapolis publishes ten Anthem plan rows for the same knee MRI, carrying
  five distinct rates from $360.22 to $992.51. Matching the
  member's plan string is what makes a quote trustworthy, and where a plan
  genuinely can't be resolved the facility keeps its full range rather than
  disappearing.

### Known gaps

Two large Indianapolis systems — Community Health Network and Ascension St.
Vincent Indianapolis — publish charge-master and revenue codes almost
exclusively, with no CPT-level imaging prices. A patient whose nearest option is
one of those gets no comparison for that facility. This is a coverage hole in
the product, not a task that was skipped.

Requirement coverage is thinner than price coverage. Anthem covers all three
procedures; Cigna and Aetna cover lumbar MRI only; **UnitedHealthcare has no
requirement rules at all**, because the UHC radiology guideline that publishes
most readily is marked "For Ohio Only" and does not apply in Indiana. A UHC
member still gets real prices and a real cost comparison, but no order check —
and the app says so on the results screen rather than quietly showing one route
fewer.

## Running it

### Pipeline (Python 3.9+, no dependencies)

```bash
# Facility prices for the target CPTs, streamed from hospital files
python3 -m pipeline.hospital.extract_charges --codes 73721 70450

# Four ranked routes for a synthetic patient
python3 -m pipeline.route --cpt 73721 --payer anthem \
    --plan "Anthem Blue Access PPO" \
    --deductible-remaining 2000 --coinsurance 0.2 --oop-max 6000 \
    --expected-other-spend 8000 --indication meniscal_tear

python3 -m unittest discover -s pipeline/tests -t .
```

### App (Expo SDK 57 — needs Node 22.13+)

```bash
python3 -m pipeline.export_app_data      # refresh app/assets/preclear-data.json
cd app && npm install
cp ../.env.example .env                  # add your RevenueCat public SDK key
npx expo run:ios
```

The household plan is gated behind the `preclear_household` entitlement. Setting
that up — and testing it on the simulator without an App Store Connect product —
is described in [app/REVENUECAT.md](app/REVENUECAT.md).

The deductible math is implemented twice — `pipeline/costing/oop.py` is the
source of truth and `app/src/costing.ts` is a port, so the sliders recompute
without a round trip. Two copies of the same arithmetic drift, so after changing
either:

```bash
./scripts/check-math-parity.sh
```

The requirement checks and the claims checks are duplicated the same way, and
are guarded the same way:

```bash
./scripts/check-requirements-parity.sh
./scripts/check-claims-parity.sh
```

## Tiers

**Free — the one-time check.** All four routes, with reasoning. A scan happens
every few years, so this is the hook rather than the business.

**Paid — the household plan.** Every bill and explanation of benefits that
arrives for the household, checked against its own numbers all year: balance
bills above the in-network contract, amounts that do not reconcile against their
own deductible and coinsurance lines, the same service billed twice, denials and
the appeal rights attached to them. Claims arrive constantly; imaging does not.

Every finding is arithmetic that fails against the EOB's own figures, or a fact
the document states about itself. Nothing predicts whether an appeal will
succeed — the denial finding carries no dollar amount for exactly that reason.
The claims shipped in this repo are synthetic.

## Scope

Elective, schedulable imaging only. **Never emergency, never inpatient, never
anything needing immediate clinical judgment** — comparison shopping doesn't
apply when someone needs care now.

A procedure qualifies only if it is non-emergency and schedulable, shows
meaningful price variance across facilities, and is governed by documented,
deterministic prior-auth logic. MRI and CT score highest, which is why they came
first. Expansion happens in (metro × payer) pairs, not metros: coverage in five
other cities does nothing for an Indianapolis patient holding a plan that was
skipped.

## Status

Built for RevenueCat Shipaton 2026, Next Gen category. Indianapolis, IN;
Anthem Blue Cross Blue Shield primary. Every dollar figure is an estimate drawn
from files hospitals and payers publish, and is labeled as such wherever it is
shown. Patient data is synthetic throughout — no real patient data appears in
this repo, its history, or the demo.

MIT licensed. See [LICENSE](LICENSE).
