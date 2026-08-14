# Preclear

## What this is

A mobile app that tells patients, before an elective MRI or CT, which route to that scan costs them the least **this year** — accounting for the fact that cash payments don't count toward the deductible.

Built for RevenueCat Shipaton 2026, **Next Gen category** (student track: judged on a demo video + this open-source repo, no App Store publication required). Deadline: **September 30, 2026**.

## Market

**Metro:** Indianapolis, IN
**Primary payer:** Anthem Blue Cross Blue Shield of Indiana (Elevance)
**Backup payer:** UnitedHealthcare
**Target CPTs:** 73721 (knee MRI, no contrast), 70450 (head CT, no contrast)

**Anthem MRF entry point:** https://www.anthem.com/machine-readable-file/search/

Known Anthem quirks: Table of Contents is properly formatted but enormous
(repeats plans/networks hundreds of thousands of times). Many URLs differ only
by query parameters and point to the same file — strip params and dedupe to
root files, or you'll get 10k+ files instead of ~1k.

MRFs give NPIs, not facility names. Need NPPES NPI Registry to translate.

**Correction, verified 2026-08-11:** UHC rate files *do* carry facility names —
each `tin` object has a `business_name` inline. NPPES is still required, but for
**geography, not naming**: a TIN has no address, and filtering ~86k providers
down to the Indianapolis metro is only possible via NPI → address lookup.

### UnitedHealthcare MRF mechanics (verified 2026-08-11)

Discovery is easy; the files are big. All confirmed against the 2026-08-01 drop.

- Public listing API, no auth: `transparency-in-coverage.uhc.com/api/v1/uhc/blobs/`
  → 20 MB JSON, **86,472 files**. Per-employer index files are 2–4 KB of plain
  JSON. Download endpoints 302 to a signed URL valid through 2030.
- **Rate files are national per-plan, not per-metro.** Choosing one metro does
  not shrink the download. Median in-network file is **14.8 GB gzipped**;
  `Choice-EPO_561` is 8.9 GB. Compression runs 20–40×, so a single file is
  hundreds of GB of JSON. Never lands on disk.
- Files under ~1 GB are direct-contract carve-outs — MS-DRG only, or
  professional-only. They cannot produce a facility price comparison.
- **`billing_class` is the one that matters, and it is where UHC falls short.**
  `professional` is the radiologist's read. `institutional` is the
  facility/technical fee, and that is where site-of-service variance lives.
  Expected OOP must sum both or every estimate is low by the read.

  Full pass over `Choice-EPO_561` (190 GB decompressed, 11.4 min): CPT 73721,
  70450 and 72148 returned **532,725 price rows, 100% `professional`, zero
  `institutional`.** Nothing was dropped — no inline `provider_groups` warning
  fired. The file does contain institutional rates for MS-DRG, ICD, RC and some
  CPTs, so this is specific to these outpatient imaging codes, not a parser bug.

  Professional-only medians from that run: 73721 $183, 72148 $174, 70450 $90.
  These are radiologist reads, **not facility prices**, and cannot drive a
  site-of-service comparison.

Layout facts the parser depends on:

- `provider_references` always precedes `in_network`, so the group map can be
  built in the same forward pass.
- Every `in_network` record opens with `{"negotiation_arrangement"` and carries
  `billing_code` within ~200 bytes — so records are located with `bytes.find`
  and only matches are handed to the JSON parser.
- `negotiated_rates[].provider_references` holds integer group IDs.
- **These files are concatenated multi-member gzip.** A plain
  `zlib.decompressobj` silently stops at the first member boundary — 187 bytes
  in — and returns the rest as `unused_data`. `gzip -dc` hides this, so shell
  probes succeed while Python truncates. See `pipeline/mrf/stream.py`.

### Hospital price transparency mechanics (verified 2026-08-11)

This is the source for the facility component and the cash price. See
`pipeline/hospital/`.

- **Discovery is solved.** CMS requires a `cms-hpt.txt` file at the hospital's
  web root giving location name, source page, and a direct MRF URL. No scraping.
  Franciscan, Eskenazi, Hendricks, Ascension, Riverview all serve it. Two
  systems block plain HTTP clients — `iuhealth.org` resolves but refuses
  connections, `ecommunity.com` returns an Akamai 403 — so those need a browser.
- **Sizes span three orders of magnitude**, and not in the direction you'd
  guess: Hendricks is 7 MB, Eskenazi 24 MB, Ascension St Vincent **3.4 GB**,
  Community Hospital East **7.8 GB uncompressed**. Stream these too.
- **Format traps**, all three hit in practice:
  1. The header is not row 0 — one or two metadata rows sit above it. Find the
     row naming `description`.
  2. `code|1` is almost always the hospital's internal CDM number, not the CPT.
     The CPT lives in `code|2` or later. Search every numbered slot.
  3. Both CMS layouts exist. "Tall" has `payer_name`/`plan_name` columns; "wide"
     encodes the payer in the column name as
     `standard_charge|<payer>|<plan>|negotiated_dollar`.
- **Always check `code|N|type`, never substring-match a code.** Ascension St
  Vincent Indianapolis contains 1,165 lines matching "70450" — every one is a
  substring of CDM `702570450`, a catheter. That hospital publishes CDM and
  revenue codes almost exclusively and has no usable CPT imaging prices at all.
  File quality varies enormously between hospitals in the same metro.
- **Known data-quality artifacts** to filter, not trust: UnitedHealthcare's
  negotiated rate at Franciscan reads $2,761–2,817 against a $2,486 gross
  charge, and Ascension Carmel shows a $49 Anthem rate. Both come from
  percent-of-charge methodologies and carve-out rows.

**The core Preclear case appears in real data.** Franciscan Health
Indianapolis, CPT 73721 (knee MRI, no contrast): Anthem Blue Access PPO with
COPPS negotiated **$992.51**, discounted cash **$574.27**. Cash is $418 cheaper
and earns zero deductible credit. That is the whole thesis, in one real row.

Read that row carefully, because it is easy to misuse. $992.51 also appears in
the same file under `BLUE CROSS ILLINOIS`, `BLUE CROSS OUT OF STATE` and
`UNICARE` — out-of-state plans that must not be quoted to an Indiana member.
And $992.51 is only the Blue Access PPO rate: the same hospital publishes
$360.22 for Anthem HMO/PPO, where cash is the *worse* deal. The comparison is
only true for the member's specific plan.

### Anthem MRF mechanics (verified 2026-08-11)

Materially harder than UHC, which is why UHC went first.

- Index: `antm-pt-prod-dataz-nogbd-nophi-us-east1.s3.amazonaws.com/anthem/2026-08-01_anthem_index.json.gz`
  — **8.7 GB gzipped for the table of contents alone.**
- Bucket listing is denied, so the exact key must be known. Prior months 403;
  they prune.

## Current status

**Gate 1: passed**, via hospital price transparency files rather than the payer
MRF. 5,380 price rows across 10 named Indianapolis-metro facilities, with
negotiated *and* cash prices for CPT 73721 and 70450.

Honest count: 11 facilities, but **9 distinct price lists** — IU Health's
Indianapolis, North and West files are three EINs at three real addresses
publishing identical prices. Do not present them as three price observations.

**The metro is not fully covered, and this is a product hole, not a to-do.**
Two large Indianapolis systems publish no usable CPT-level imaging prices:

- **Community Health Network** (East, North, South, Stones Crossing Imaging) —
  one code slot, types CDM/LOCAL/MS-DRG only, zero CPT codes in a 150,000-row
  sample. Not proven across the whole file because their host is too slow to
  scan it; the 2.8 GB file did not finish a byte scan in 10 minutes and the
  7.8 GB file times out during extraction.
- **Ascension St. Vincent Hospital Indianapolis** — CDM and revenue codes
  almost exclusively.

A patient whose nearest option is one of these gets no comparison for that
facility. CLAUDE.md's warning about partial payer coverage applies just as
sharply to partial *facility* coverage. Both are recorded in
`pipeline/hospital/facilities.py::EXCLUDED` with reasons, so a future run does
not spend 16.6 GB rediscovering them.

The payer MRF still failed for the facility half of the problem, which is what
sent the work to hospital files:

- `pipeline/mrf/` streams and extracts end-to-end at ~290 MB/s of decompressed
  JSON, nothing on disk. Validated on two real UHC files.
- Choice-EPO covers Indianapolis: 941,964 provider rows, 123,880 distinct TINs,
  with Eskenazi Medical Group, Orthopaedics Indianapolis, Hendricks County
  Hospital, Franciscan and Ascension St Vincent all present. Many matches are
  out-of-state (Bronson Methodist in MI, Nebraska Methodist, Park Nicollet in
  MN), so **NPPES geo-filtering is mandatory, not optional.**
- But every imaging rate came back `professional`. No facility technical fee, so
  no site-of-service comparison, so Gate 1's "10 real facility prices" is unmet.

**Consequence for data sources.** The split is cleaner than originally assumed:

| Need | Right source |
|---|---|
| Professional rates, network membership | Payer TiC MRF |
| Facility technical fee, cash price | **Hospital price transparency files** |

Hospital files are per-facility and megabytes, not hundreds of GB — ten
Indianapolis hospitals is ten small files. They also carry cash/gross prices,
which route 4 needs anyway. This is likely the better primary source for the
facility component rather than a fallback.

**Gate 2: passed.** 11 requirements across 3 payers in `pipeline/policies/`, each
carrying document title, section ID, version, effective date and source URL.
The bar was 5 rules across 3 payers.

**Requirement coverage, corrected 2026-08-13.** Rule count was never the real
measure — coverage across (payer × CPT) was, and it was far thinner than the
headline number suggested. Anthem, the primary payer for this metro, carried
knee rules only, so an Anthem member ordering a lumbar MRI or a head CT reached
route 3 and found nothing. CPT 70450 had no indications at all in the app, so
route 3 could not fire for head CT under any payer. Anthem now covers all three
target codes via Carelon's spine and brain guidelines.

**UnitedHealthcare still has zero requirements** while carrying facility prices
in the app — the exact silent failure this file warns about under "How expansion
actually works". The app now says so on the results screen rather than omitting
route 3 without explanation, but the honest fix is a UHC Indiana document, which
is still not located.

### Payer requirement mechanics (verified 2026-08-11)

- **The payer usually does not write the rules.** Advanced imaging review is
  delegated, and the governing document is published by the delegate: Anthem →
  **Carelon** (formerly AIM), Cigna and UnitedHealthcare → **eviCore**. Aetna
  self-publishes Clinical Policy Bulletins. Always cite the delegate's document
  and record which payer adopted it.
- **UnitedHealthcare publishes state-specific radiology guidelines.** The adult
  spine guideline that surfaces most readily is marked "For Ohio Only" and does
  not apply in Indiana. Aetna was used as the third payer instead; a UHC
  Indiana-specific document still needs to be located.
- Carelon publishes as web pages, eviCore as PDFs, Aetna as HTML. Aetna returns
  403 to non-browser user agents — a normal UA string is enough.
- **Criteria are alternatives, not a conjunction.** Payers list them as "any of
  the following", so a failed pathway means "this pathway is not documented as
  met", never "this order does not qualify". `Requirement.alternative_pathway`
  records which ones behave that way and the checklist output hedges them.
- Distinguish "not documented" from "documented as not met". They call for
  different action from the ordering office, so `Status` keeps them separate.
- Red flag indications (eviCore `SP.GG.0001.2.A`) **waive the waiting period**,
  they do not add a requirement.

### Carelon document mechanics (verified 2026-08-13)

- **Carelon splits imaging by body region across separate documents**, and the
  split is not where you would guess. Headache criteria are in *Imaging of the
  Brain*, not *Imaging of the Head and Neck* — the head-and-neck document covers
  sinusitis, trauma, hearing loss and similar and has no headache section at
  all. Looking in the obviously-named document returns nothing and reads like
  the criteria do not exist.
- **Version dates are the URL.** Carelon publishes each revision at its own
  path, e.g. `/imaging-of-the-spine-2025-11-15/`, and keeps archived and
  future-dated revisions live at the same time. On 2026-08-13 the spine
  guideline had a `2026-09-19` revision already published but not yet effective.
  Cite the one in force on the date of use, not the newest one on the site.
- Brain and spine both sit on the same `2025-11-15` cycle as extremities, so
  one review date covers all three Anthem documents. Brain additionally carries
  an `updated 2026-01-01`.
- **Carelon's lumbar threshold agrees with eviCore's**: both require 6 weeks of
  conservative management for uncomplicated low back pain. Independent
  corroboration across two delegates, not a copy — worth knowing before assuming
  a discrepancy is a extraction bug.

The demo's citable failing requirement is real: a lumbar MRI order with 2 weeks
of treatment documented fails eviCore `SP.LB.0005.1.A`, which requires "Failure
of a 6-week trial of provider-directed treatment", v1.0.2026, effective
2026-02-03.

**Routing engine: working end to end on real data** (Sep 1 milestone, early).
`pipeline/costing/` does the math, `pipeline/route.py` is the CLI. 76 tests green.

The thesis is demonstrated on real published Indianapolis prices. Anthem member,
CPT 73721, Franciscan Health Carmel, $2,000 deductible remaining:

| Other care expected this year | Cash $574.27 | In-network $610.44 | Winner |
|---|---|---|---|
| $0 | $574.27 | $610.44 | cash, by $36.17 |
| $8,000 | $3,774.27 | $3,322.09 | **in-network, by $452.18** |

Same scan, same patient, same prices — the ranking flips, because the cash
payment earns no deductible credit. That is the product in one table.

### Costing and routing mechanics (verified 2026-08-11)

- **`expected_other_allowed_spend` is the hinge and it is an explicit input.**
  Setting it to 0 is not neutral, it is the assumption that no further care
  happens this year. Ranking on the scan price alone reproduces exactly the
  mistake this project exists to correct.
- **Payer strings must be normalized before anything is compared.** One file
  carries 46 values. `MANAGED CARE` and `COMMERCIAL` are the two most common and
  name no payer at all; `BLUE CROSS ILLINOIS` sits next to `BLUE CROSS` at
  different rates. See `pipeline/payers.py` — buckets, out-of-state Blue plans
  and government lines are all excluded, for different reasons.
- **Never represent a facility by its cheapest row.** Doing so picked a $49 knee
  MRI against a $2,486 gross charge — a carve-out artifact. Facilities are
  represented by the *median plausible* rate, and plausibility is judged against
  that hospital's own gross charge (under 5% is a carve-out), not a flat floor.
- **The payer does not determine the price; the plan does.** Franciscan
  publishes five different Anthem rates for CPT 73721 — $360.22 (HMO/PPO),
  $610.44 (employee), $784.08, $888.30, $992.51 (Blue Access PPO). `--plan`
  matches the member's card against published plan strings; `--plan-contains`
  pins one directly. See `pipeline/plans.py`.

### Plan-string mechanics (verified 2026-08-12)

Reading plan strings fixed three ways the engine was confidently wrong.

- **Line of business hides in the plan name, not the payer name.** Ascension St.
  Vincent Carmel files `ANTHEM CONNECT MEDICAID REPLACEMENT` and
  `ANTHEM MEDICARE REPLACEMENT` under an Anthem payer string. Judging by payer
  alone offered a commercial member a **$49.04 knee MRI they can never be
  charged**. A plan string may only ever move a row *out* of commercial, never
  into it.
- **Service-line carve-outs masquerade as cheap rates.** Every remaining
  commercial Anthem row at Ascension St. Vincent Carmel is a `VEIN` fee
  schedule. The $311.13 that earlier ranked as the metro's cheapest in-network
  knee MRI was a vein-treatment rate. After filtering, that facility has **zero**
  usable Anthem rows for this code.
- **`Elevance Health` is Anthem.** IU Health — the largest system in the metro —
  files every Anthem rate under the parent company name. Missing that alias
  dropped the entire system from the comparison; adding it took eligible
  facilities from 4 to 7 and brought in IU Health's $925 rate against
  Franciscan's $360.22.

Matching rules: product type must agree, so an HMO member is never quoted a PPO
fee schedule. Genuine ambiguity is preserved rather than resolved —
`ANTHEM BLUE ACCESS PPO WITH COPPS` ($992.51) and `ANTHEM BLUE ACCESS PPO-CID`
($360.22) are the same product name at different rates, and no string matching
can separate them. A facility with no confident match keeps its full range
rather than disappearing, because "we cannot tell which applies to you" is a
usable answer and "this facility has no price" is a false one.
- The cash route is gated, per CLAUDE.md: surfaced when the patient is uninsured
  or expected spend falls short of the deductible, not offered by default.
- A "cheaper site" that costs the same is noise, so route 2 requires a real
  saving before it is offered.

**Consumer flow: working** (Sep 8 milestone, early). `app/` is Expo SDK 57 with
the RevenueCat SDK. Procedure and insurer, then sliders for deductible
remaining, coinsurance, expected other care and documented treatment weeks, then
four ranked routes that recompute live. Paywall gates everything past the top
route.

### App mechanics (verified 2026-08-12)

- **Expo SDK 57 needs Node 22.13+.** Node 18 fails `create-expo-app` with
  `ReferenceError: File is not defined`. The working toolchain is Homebrew's
  keg-only `node@22` (22.23.2), at `/opt/homebrew/opt/node@22/bin` — keg-only
  means it is not symlinked into PATH, so `~/.zprofile` must prepend it, and a
  terminal opened before that edit still has the wrong node. An earlier note
  here recorded
  `node@26`; **corrected 2026-08-13, that path has never existed on this
  machine.** The default `node` is 18.16.1 from the nodejs.org pkg installer at
  `/usr/local/bin`, and it is the one that fails.
- **Read `app/AGENTS.md` before touching app code** — it points at the exact
  versioned docs, and SDK 57 moved a lot.
- **Adding a native module costs a rebuild.** `@react-native-community/slider`
  and `@expo/ui` both ship native code, so the deductible slider is PanResponder
  over plain Views instead. Core-only React Native keeps the existing dev client
  valid. Prefer this whenever a JS implementation is reasonable.
- **The deductible math now exists twice.** `pipeline/costing/oop.py` is the
  source of truth; `app/src/costing.ts` is a port so the slider recomputes
  without a round trip. Two implementations of the same arithmetic drift, so
  `scripts/check-math-parity.sh` compares them on the cases that matter — the
  out-of-pocket cap and the ranking flip included. Run it after touching either.
- `pipeline/export_app_data.py` generates `app/assets/preclear-data.json` using
  the routing engine's own eligibility rules, so the app cannot surface a rate
  the engine would refuse.
- Verification that works without a simulator: `npx tsc --noEmit` and
  `npx expo export --platform ios`. The export catches import and resolution
  errors the type checker does not.
- **A `ScrollView` in a flex column needs `flex: 1` on the ScrollView itself**,
  not just on the parent. Without it the ScrollView takes its height from its
  content instead of from the space left over, overflows the screen and never
  scrolls — so the primary button at the bottom of a step becomes unreachable
  and the flow dead-ends. This was latent from the start and invisible while
  every step happened to fit on one screen; adding two plan controls to the scan
  step exposed it. Symptom reads as "the button disappeared", cause is layout,
  not rendering.
- **`KeyboardAvoidingView` is core React Native**, so the plan-name field can
  push the primary button clear of the keyboard without a native module. Use
  `behavior="padding"` on iOS only.
- **Palette is deliberately not blue/white and deliberately not red/green.**
  Green-means-cheap would assert the opposite of the product's finding, so
  ranking is carried by position, number size, and one accent (`#B2542A`)
  reserved for the recommended route and used nowhere else. Tokens in
  `app/src/theme.ts`.
- **`<Money>` is the only way a dollar figure renders.** Hard rule 5 says the
  word "estimate" lives inside the string, so it is a component rather than a
  formatter — there is no call path that emits a bare number, and the
  accessibility label carries the word too.
- **Requirement checks are declarative, not code.** `Requirement.check` in
  `pipeline/policies/rules.py` holds the thresholds and `evaluate_check` is the
  one implementation; `app/src/requirements.ts` mirrors it case for case. The
  first mobile version scraped week counts out of the quote text with a regex
  and got both the threshold and the met/not-documented distinction wrong.
- **That mirror is guarded by `scripts/check-requirements-parity.sh`**, which
  evaluates every requirement against every fact case in both languages. It was
  added 2026-08-13; before that only the costing port had a parity check. This
  drift is quieter than a wrong number: an unmapped field and an unknown check
  type *both* fall through to `not_documented`, so a rule the app cannot
  evaluate looks identical to one the order does not satisfy, and the app shows
  a citable checklist item the engine never asserted. Run it after touching
  either side. A new check type needs a new fact case or it passes vacuously.
- **Ask for a fact only when a check reads it.** The coverage screen derives its
  inputs from the applicable checks (`usesTreatmentWeeks`, `readsField`) rather
  than from "any requirement matches". Before that, a head CT for headache
  showed a weeks-of-treatment slider no headache criterion consumes, while the
  fact that actually decides the rule had no control at all.
- **Zero unmet findings is ambiguous and the app must say which kind.** "Every
  recorded requirement is met" and "no requirement is recorded for this payer
  and scan" both hide route 3. `pipeline/policies/check.py` distinguished them
  from the start; the app did not, so a UHC member saw a comparison with no
  order check and no indication that one was missing.
- **`export_app_data.py --metadata-only`** rewrites indications and requirements
  in an existing bundle and leaves prices alone. Rule edits otherwise require
  the gigabyte price files to be present, which they usually are not.
- **Card capture is deliberately not built.** It needs `expo-camera` (a native
  rebuild) and creates the one compliance risk with no upside for the demo —
  hard rule 3 requires discarding the image immediately. Plan type is chosen
  from a list instead.
- **Member ID is deliberately not collected either, for the same reason.** Its
  only use is an eligibility lookup, and CLAUDE.md defers eligibility to beta —
  so the field would be a direct identifier, collected and unused, against hard
  rule 1. The fact on the card that actually changes the answer is the plan, and
  it identifies nobody.
- **Ask for plan *type*, not plan name.** `buildRoutes` and `representativeRate`
  accepted `memberPlan` from the start but the app never passed it, so every
  member saw the median across all of that payer's plans — $888.30 at Franciscan
  Carmel where a PPO member owes $992.51 and an HMO member $784.08. The fix is
  not a plan-name picker: Anthem files 21 distinct strings for one CPT, they
  differ by campus and contract suffix, and cleaning them collapses 21 to 19
  with an empty label. Product type (PPO/HMO/POS/EPO) is the one plan fact a
  member can read off a card and answer correctly, `matchesMemberPlan` already
  gates on it, and passing the bare string `"PPO"` matches by both product and
  token overlap. `availableProducts()` offers only types that payer actually
  publishes — offering an absent type is worse than offering none, because
  nothing matches and the app silently ignores the answer it just asked for.
  "Not sure" is a real answer that keeps the full published range.
- **The plan name is typed, not photographed.** A free-text field feeds
  `matchesMemberPlan` directly — the same path `--plan` uses — and pins one rate
  where the type chips only narrow to a group: "Franciscan Employee" returns
  $610.44 against the $888.30 median. Token overlap tolerates a misspelling
  ("Blue Acess PPO" still resolves), and `planMatchSummary()` reports how many
  facilities matched so a name that matches nothing says so rather than being
  silently ignored.
- **Card capture needs two native modules, not one.** `expo-camera` produces an
  image; Expo ships no OCR, so reading it needs ML Kit or Apple Vision as well.
  The only way to avoid the second module is sending the card image to a cloud
  OCR service, which would transmit a patient's insurance card off-device — do
  not do that. Both paths end at the same place, a plan name matched against
  published strings, so typing reaches the answer directly. Revisit after
  Shipaton; the cost is a rebuild and a new dev client, and the gain is a
  first-run moment that must be filmed with a synthetic card anyway.

Gate definitions, for the record:

- **Gate 1 — MRF usability.** Open one target payer's Transparency in Coverage file, extract negotiated rates for CPT 73721 (knee MRI) and 70450 (head CT) at 10 real facilities in the target metro. These files are gigabytes and frequently malformed — stream-parse, don't load. *Pass = 10 real facility prices in a spreadsheet.*
- **Gate 2 — Policy extraction.** Pull 3 payer medical policy documents for knee MRI and lumbar spine MRI. Extract 5 requirement rules into structured form. *Pass = 5 clean, citable rules.*

If Gate 1 fails, the input layer needs a different data source before writing more code. Don't build past a failed gate.

## Scope

Three categories. Don't confuse a deadline constraint with a product rule.

### Shipaton-only constraints (temporary — time, not principle)

- **One metro.** A metro is the area a patient would realistically drive within for a scan — city plus suburbs. Needs ~15+ imaging facilities for price comparison to be meaningful.
- **Five payers max**, ideally one done properly for the demo. Each payer means a new MRF format to parse and a new set of policy documents.
- **Deductible remaining is user-reported via slider.** No eligibility API.
- **No claims monitoring engine** unless routing is genuinely finished by Sept 15.
- Depth on one payer beats five half-working. This is the success bar.

Also out of scope for Shipaton: provider-facing features, employer/B2B features, voice-agent cash-price collection.

### Permanent rule — which procedures qualify

The forever rule is not "MRI and CT." It's the criteria. A procedure qualifies only if it is:

1. Non-emergency and schedulable — there must be time to route
2. Subject to meaningful price variance across facilities — otherwise there's nothing to recommend
3. Governed by deterministic, documented prior-auth logic — otherwise requirements-checking doesn't work

MRI and CT are the highest-scoring procedures against these criteria, which is why they're first. Ultrasound and mammography score nearly as well and are the natural next additions. Each new procedure type requires fresh requirements-extraction work — this is not free and should never be described as "already built."

### Permanent hard limit — never expand here

**Never emergency, never inpatient, never anything requiring immediate clinical judgment.** Comparison-shopping logic does not apply when someone needs care now, and the liability profile changes completely. This one is forever.

### How expansion actually works

The unit of expansion is **(metro × payer) pairs**, not metros. A user in Indianapolis with Anthem needs Anthem-Indianapolis specifically — coverage in five other cities does nothing for them. Saturate one metro across all major payers before adding a second city.

Partial payer coverage in a metro means the product silently fails for anyone holding a plan you skipped. That's worse than not serving the market at all.

## How it works

User enters procedure, indication and plan → app returns four ranked routes,
each with reasoning shown:

1. **In-network, order as written** (baseline)
2. **In-network, cheaper site of service** — same coverage, same deductible credit, lower cost because negotiated rates vary by facility
3. **In-network, order corrected first** — the order fails a specific published payer requirement; output is a checklist for the ordering physician
4. **Cash at a non-contracted facility** — surfaced only when the patient is uninsured, on a high-deductible plan unlikely to be met, or the study is non-covered

Card capture was considered and dropped — see App mechanics. Anything in this
file describing a card photo is stale; the plan is chosen from a list.

**Critical:** this does NOT predict denial probability. It checks orders against payers' own published, deterministic criteria and reports which are unmet. Never describe it as denial prediction in code comments, docs, or UI.

## The core calculation

This is the novel part. Everything else is commoditizing.

```
Expected_OOP(route) = f(
    negotiated_rate or cash_price,
    deductible_remaining,
    coinsurance_pct,
    oop_max_remaining,
    counts_toward_deductible   # true for insurance routes, false for cash
)
```

A cheaper cash payment can be the *worse* financial decision for someone likely to hit their deductible this year, because it earns no deductible credit. No existing consumer tool does this math.

For Shipaton, `deductible_remaining` is **user-reported via a slider.** No eligibility API. That's a beta-phase problem.

## Data sources

| Data | Source | Notes |
|---|---|---|
| Negotiated rates by facility/payer/CPT | Payer Transparency in Coverage machine-readable files | Free, federally mandated. Gigabytes. Stream-parse. |
| Hospital cash/gross prices | Hospital price transparency files | Free, federally mandated |
| Payer requirements per CPT | Published payer medical policy documents | Manual review → structured rule objects |
| Facility network participation | Derived from presence in a payer's own rate file | Free byproduct |

Cash prices from freestanding centers (voice-agent phone calls) are **phase 2, not Shipaton.**

## Business model (decided 2026-08-13)

Two consumer tiers now, one B2B layer much later.

**Free — the one-time check.** Procedure in, four ranked routes out, with real
numbers. This is the hook and the demo, and it is what the app does today.

**Paid, ~$6–10/month, billed per household — ongoing claims monitoring.** The
app keeps reading the bills and EOBs that arrive for everyone in the household
all year, flagging billing errors, appealable denials and overcharges. The
one-time comparison becomes a feature inside it. This is what makes it a
subscription rather than a one-and-done tool: imaging happens every few years,
claims arrive constantly.

**B2B, later, explicitly not part of the initial build.** Free listing for
imaging centres so nobody can pay to rank higher, plus a paid analytics or
pricing-visibility product they choose to buy. Facilities paying for placement
would be a referral payment, which is anti-kickback territory — criminal
liability, and it needs a healthcare attorney before any facility pays a dollar.

### Consequences already in the repo

- **The entitlement is `preclear_household`, not `full_comparison`.** Named for
  who it covers rather than what it unlocks, because it gates the comparison
  today and is meant to gate monitoring later once the comparison goes free.
  Renaming an entitlement after products exist in App Store Connect and
  RevenueCat is painful, so it had to survive that shift.
- **The product is an auto-renewable monthly subscription**, family shareable,
  in the `Preclear Household` group — not the non-consumable it started as.
- **The paywall is inverted, and monitoring is real.** All four routes are
  free; `pipeline/claims/` reviews a household's EOBs behind the entitlement.
  The claims are synthetic fixtures in `data/samples/household_eobs.json`, so
  the tier demonstrates honestly without touching PHI.

### Claims review mechanics (built 2026-08-13)

- **`pipeline/claims/eob.py` is the source of truth, `app/src/claims.ts` mirrors
  it, and `scripts/check-claims-parity.sh` guards the pair.** That is now three
  duplicated engines with three parity scripts — costing, requirements, claims.
  Drift here is the worst of the three: a wrong finding tells a member they are
  owed money they are not, and sends them to argue with their insurer on a false
  premise.
- **Every finding is arithmetic that fails against the EOB's own numbers, or a
  fact the document states about itself.** Nothing predicts whether an appeal
  succeeds. The denial finding is deliberately unpriced — attaching a number
  would imply a predicted recovery.
- **Two checks routinely catch the same claim.** An in-network balance bill
  almost always fails the components check too. Both `total_at_stake` and the
  app's card grouping count a claim **once, at its largest finding**. Summing
  them told a member they were owed $726.58 where one claim can return $384.09,
  and overstating that is exactly the dishonesty this product exists to correct.
  The bug appeared twice — first in the arithmetic, then reintroduced by the
  layout listing one claim as two cards.
- `export_app_data.py` copies the EOB fixture into `app/assets/`, so
  `data/samples/` stays the single source and the app cannot drift from what the
  parity script tests.

### Claims data acquisition (verified 2026-08-13)

The paid tier does not require scraping payer portals, and this matters — it is
the same thesis as the rest of the product.

- Under the CMS Interoperability rules, payers must expose **claims and
  encounter data including EOBs through a FHIR Patient Access API**, which a
  member authorises a third-party app to read via **SMART on FHIR / OAuth 2.0**.
  Free, federally mandated, and almost unused by consumer software.
- The data standard is the **CARIN for Blue Button** implementation guide.
- **The gate is attestation, not technology.** Payers must run an attestation
  process for third-party developers before releasing data, so registration is
  the long pole — weeks, not hours. Start Anthem and UHC early.
- CMS-9115-F established this; CMS-0057-F expands it, with required APIs
  operational by 2027-01-01.
- Medicare-only alternative: CMS Blue Button 2.0.

### The compliance fork this creates

Claims monitoring means holding **real EOBs for real households**, which is a
categorically different product from what exists now. Everything built so far
avoids PHI entirely: inputs are user-reported, nothing is stored, no image is
captured. Hard rule 1 below is scoped to the Shipaton build, but going past it
means a backend that stores PHI, breach obligations and a BAA posture. Choose it
deliberately; do not drift into it.

## Hard rules — never violate

These are compliance red lines. Flag immediately if any code or copy would break one.

1. **No real patient data, ever.** Synthetic insurance cards and test patients only. Not in code, commits, logs, error trackers, screenshots, or the demo video.
2. **No analytics or ad SDKs.** No Meta pixel, Google Ads, Firebase Analytics, Amplitude, TikTok — nothing that transmits usage data. This is the single most damaging mistake possible in a health app.
3. **Discard the insurance card image immediately after parsing.** Never persist it.
4. **Never write "HIPAA compliant"** anywhere — app copy, README, comments, docs.
5. **Every dollar figure is labeled "estimate"** in the UI string itself, not as a footnote. Never "guaranteed," "approved," "you will pay," or "Good Faith Estimate."
6. **Never suggest a different clinical procedure or imaging modality.** Outputs are financial and administrative only. Suggesting ultrasound instead of MRI is medical advice.
7. **No secrets in the repo.** `.env` gitignored, `.env.example` with key names only.
8. **Encryption in transit and at rest** from the first commit.

## Repo structure

```
preclear/
├── CLAUDE.md
├── README.md              # judges read this first — keep it current
├── .gitignore
├── .env.example
├── pipeline/              # Python: data ingestion + rules
│   ├── mrf/               # Transparency in Coverage parsing
│   ├── policies/          # payer requirement rule objects
│   ├── costing/           # the deductible-aware engine
│   └── tests/
├── app/                   # mobile app + RevenueCat SDK
└── data/
    └── samples/           # synthetic fixtures only — safe to commit
```

Never commit anything under `data/` except `data/samples/`. MRF files are gigabytes.

## Timeline

| By | Milestone |
|---|---|
| Aug 18 | Both gates passed. Repo scaffolded, RevenueCat SDK installed. |
| Sep 1 | Routing engine end-to-end: MRF ingestion → cost math → 4 ranked routes. One payer, real data. |
| Sep 8 | Consumer flow: card capture, procedure input, deductible slider, results. Paywall wired, sandbox purchases verified. |
| Sep 15 | Decision point: routing genuinely done? → optionally add thin claims monitoring. Not done? → polish routing. |
| Sep 25 | Feature freeze. README, code cleanup, license. |
| Sep 30 | Video + Devpost submission, 11:45pm PT. |

Commit daily, even small progress. Judges see commit history — a repo with four commits on Sept 29 reads badly.

## Definition of done for the demo

- One real payer's MRI/CT negotiated rates for real, named facilities in the target metro
- At least one order failing a specific, real, **citable** payer requirement
- Deductible-aware cost comparison rendering end-to-end for a sample patient
- RevenueCat SDK powering at least one purchase (sandbox is fine for Next Gen)
- Public repo with a strong README, and a demo video ≤2 minutes

## How to work with me on this

- **Explain in plain English before writing code.** I want to understand each step, not just have it executed.
- **Be concise. No padding, no preamble.**
- **Flag problems precisely and let me decide.** Don't silently fix or refactor things I didn't ask about.
- **Never rewrite my prose** — README text, UI copy, docs. Formatting help and content changes are different things; ask before changing content.
- **Push back when I'm wrong.** I'd rather be corrected than agreed with.
- Prefer boring, readable code over clever code. This gets read by judges.
