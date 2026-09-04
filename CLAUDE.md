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

**UnitedHealthcare coverage closed, 2026-08-22.** The earlier note here said no
UHC document applicable to Indiana had been found. That was a search failure,
not an absence. UHC publishes a national **Commercial and Exchange Plans:
Cardiovascular and Radiology Imaging Guidelines** (V5.0.2025, effective
2025-11-18) with no state restriction, covering all three target codes. The
"For Ohio Only" document that dominates search results is a separate
state-specific publication — do not treat its existence as evidence that the
national one does not exist.

Requirement coverage is now **21 rules filling 11 of 12 (payer x CPT) cells**.
The remaining gap is **Aetna + head CT, and it is real**: Aetna's Clinical
Policy Bulletin index was read end to end on 2026-08-22 and contains no bulletin
setting medical-necessity criteria for brain or head CT. The closest are CPB
0462 (migraine management) and CPB 0707 (invasive headache procedures), neither
of which governs CPT 70450. An Aetna member ordering a head CT reaches route 3
and correctly finds nothing recorded.

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

### Payer document mechanics (verified 2026-08-22)

- **A "For Ohio Only" document is not proof there is no national one.** UHC
  publishes both; the state file simply ranks higher. Search the payer's own
  provider site for the Commercial/Exchange guideline before recording a gap.
- **eviCore splits by body region the same way Carelon does.** Knee criteria are
  in *Musculoskeletal Imaging Guidelines*, not a knee document; headache is in
  *Head Imaging Guidelines* under HD-11.0. Same trap, different delegate.
- **eviCore and UHC number their sections identically** — both call lumbar
  `SP.LB.0005.1.A`. Seeing the same identifier under two payers in
  `rules.py` is expected, not a copy-paste bug.
- **Version dates matter and can be future-dated.** On 2026-08-22 the Cigna head
  guideline had V1.0.2026 in force and V2.0.2026 already published for
  2026-09-01. Both were read; HD.HA.0011.0.C is word-for-word identical, so the
  criterion survives the version change. Check rather than assume.
- **Aetna 403s any non-browser client**, including WebFetch. `curl` with a normal
  UA string works. Their CPB index at `/cpb/medical/data/cpb_num.html` is the
  reliable way to prove a bulletin does *not* exist.
- **eviCore and UHC guidelines are PDFs that defeat naive extraction.** Their
  text streams are CID-encoded, so a hand-rolled zlib/regex extractor returns
  ICC profile bytes. `pdftotext -layout` (Homebrew `poppler`) reads all of them;
  the UHC file is 16 MB and 8 million characters, so grep for the section code
  rather than reading forward.
- **Requirements the app cannot evaluate must still be honest.** eviCore and UHC
  both allow "2 of 4 exam criteria" instead of 6 weeks of conservative
  treatment, and the app collects no exam findings. Those rules carry
  `alternative_pathway=True` and a `note` naming the alternative, so the
  checklist hedges rather than asserting the order failed.

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
- **Nothing on this machine can tap the simulator.** `simctl` has no gesture
  command, `idb` and `cliclick` are not installed, and `osascript` is refused
  assistive access. Screens are therefore verified by temporarily changing a
  `useState` initial value, screenshotting, and reverting — not by driving the
  UI. Two traps in that method: Fast Refresh *preserves* existing state, so
  changing an initial value does nothing to a running screen (terminate and
  relaunch the app), and `contentOffset` on a `ScrollView` only applies on
  mount, so scrolling a screen to its lower half needs the same relaunch.
- **Prices come from RevenueCat, not from this repo** (wired 2026-09-02).
  `loadPlans()` in `app/src/purchases.ts` reads the current offering and maps
  each package to a `PlanOption`, using the store's own localised `priceString`.
  The household page renders those and `purchasePlan(id)` buys the package the
  member actually selected. Three things this fixed:
  - The earlier flow called `RevenueCatUI.presentPaywall()`, so the member chose
    a term on the household page and was then asked to choose again on
    RevenueCat's sheet. The first selection was collected and discarded.
  - `DEMO_PLANS` in `app/src/plan.ts` hardcoded `$69.99`, `$7.99` and a
    `Save 27%` badge. The badge is now computed from the two real prices, so it
    cannot claim a discount the store does not give.
  - Hardcoded strings are wrong in every currency but one. `priceString` is the
    store's, and this app never formats a headline price itself.

  `presentPaywall()` is still exported and is now unused — kept as a way to test
  a dashboard paywall config, and marked in its docstring as dead until called.
- **Three states, not two, and the screen says which.** `storeReady` (a key
  configured) and `storePlans !== null` (an offering actually read) are separate,
  because a configured SDK that cannot reach an offering is a different failure
  from one that was never configured. `livePricing` drives the on-screen strip;
  when it is false the demo placeholders show and say so, and the CTA unlocks
  locally. The entitlement stays two flags — `storeEntitled` and `demoEntitled`
  — because merging them would make a demo unlock indistinguishable from a
  purchase.
- **Use a RevenueCat Test Store for development and for filming.** Key prefix
  `test_`, set in `app/.env`. No App Store Connect, no Paid Applications
  agreement, no sandbox tester accounts, and Next Gen requires no store release
  at all. Needs `react-native-purchases` 9.5.4+; this repo is on 10.7.0. Test
  subscriptions renew about every 5 minutes and auto-renew 5 times before
  cancelling, which is useful for filming a renewal and misleading if left
  running. The SDK refuses to run a *release* build configured with a test key,
  so it cannot leak to production.
- **`EXPO_PUBLIC_` variables are inlined at build time.** Editing `app/.env`
  does nothing to a running bundler — restart with `npx expo start -c`. A key
  that "isn't working" is usually a warm cache.
- Subscription prices deliberately do **not** render through `<Money>`: hard
  rule 5 exists because every dollar figure in this app is a projected medical
  cost, and a subscription price is the exact amount charged, so labelling it
  "estimate" would be false.
- **`__DEV__` gates a visible Free/Household switch** at the bottom of the
  screen. Both tiers have to be checkable without a store account, and a hidden
  gesture is how one of them quietly stops being checked.
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
- **The design tokens are measured, not chosen.** A UX audit on 2026-08-14 found
  four WCAG failures, and the worst of them was on the word hard rule 5 exists
  to display: `<Money>` set "estimate" at `opacity: 0.72`, which measured
  **2.77:1** on the recommended route's card against the 4.5:1 that size needs.
  The most legally load-bearing word in the app was its least legible text.
  Two tokens were added rather than changing any existing hue — `accentDeep`
  (renamed `accentText` when dark mode landed) `#A04A24` for accent text under 18px (5.2:1 on `accentSoft`) and `border`
  `#8C8779` for control outlines, because `line` measures **1.2:1** and an
  unselected chip is white on near-white canvas (1.1:1), so its border was the
  only cue that a control existed and it was invisible. Re-measure before
  changing a hex; the ratios are in the comments in `app/src/theme.ts`.
- **`space` is a strict 8px grid** (4/8/16/24/32). The previous scale ran
  4/8/14/20/28 and the code reached the gaps by writing `space.md + 2` in seven
  places — that arithmetic appearing anywhere is the signal the scale no longer
  fits the layout. There is also now exactly **one type scale**; `Money.tsx`
  used to carry a private second one, and between them they defined ten font
  sizes with no ratio.
- **44pt targets cost vertical space, and the scan step pays it.** Raising chips
  from 36pt to `TAP_TARGET` made every step taller, which pushes that step's
  primary button further out of reach — the exact failure that already happened
  once. `h2` dropped from `xl` to `lg` to buy the budget back. Check that button
  after any change that grows a control.
- **On a touch device the pressed state is the focus state.** There is no hover
  and no keyboard ring to fall back on, so every `Pressable` carries a `pressed`
  style. Six of nine had none.
- **The sliders stayed; the lag was never the slider.** A slider reports a
  value on every touch-move, and each report re-ran `buildRoutes` and
  `rankRoutes` across every facility — a full routing pass per frame, on a step
  that renders no route. Two fixes, both cheap: `routes` is now gated on
  `step === 2`, and `Slider` drops a report whose stepped value has not changed
  (a full-width drag fires ~300 move events across 41 distinct values). Presets
  were tried as a replacement and rejected on preference; that version is in git
  history if the drag ever needs to go away entirely.
- **One `ScrollView` renders every step, so it keeps its offset across a step
  change.** Scroll down on the scan step to reach "Next", tap it, and the
  coverage step opened halfway down with its heading cut off. A `scrollTo({y:0})`
  keyed on `step` fixes it. Nothing looks broken when this happens, which is why
  it survived several passes.
- **Chip rows fit one line two different ways, and which one depends on whether
  the words can be shortened.** Payer names can: `PAYER_CHIP_LABELS` shows the
  brand's short form and `accessibilityLabel` keeps the full name, because a
  shortened brand cannot be misread. Indications cannot — cutting "Suspected"
  from "Suspected meniscal tear" turns the reason a scan was ordered into a
  diagnosis nobody has made — so those use `Chip`'s `fill` variant, equal
  full-width rows — one option per line, all the same width, which reads as a
  list instead of as chips of three ragged lengths. Equal *columns* were tried
  first and are a trap: React Native breaks mid-word rather than overflowing, so
  a three-across row rendered "degenerativ / e spine".
- **A 32px bold heading needs more than a 1.125 line height.** `display` shipped
  at 32/36 and React Native clipped the ascenders of the first line rather than
  growing the box — "Your coverage" rendered with its tops cut off by the step
  bar. 40 fixes it and matches the 1.25 ratio the other headings use. The bug
  hides on multi-line headings, so check a one-line one.
- **Text clipping has a second cause: Dynamic Type.** The same `display` role
  that needed 40/32 also breaks mid-word at iOS's accessibility text sizes,
  because one word grows wider than the 327pt content column and React Native
  breaks inside the word rather than overflowing — "Preclea / r / Househ / old",
  the same failure as the chips above. Two other things went with it at
  `accessibility-extra-large` on an iPhone SE: the `TopBar` wordmark ran off the
  right edge, and the "Save 27%" badge, in a row that could no longer fit it,
  was squeezed to a sliver and set one letter per line — "S / a / v / e".
  `textScale` in `theme.ts` caps the roles whose failure is an unbreakable word
  wider than the screen, and its `stackAbove` threshold reflows the plan row
  into a column above 1.6x. The reflow is the fix that matters: capping the
  text inside a row that is still too narrow only gets you smaller text set one
  letter per line. Nothing carrying meaning is capped below WCAG 1.4.4's 200%.
  Reproduce with `xcrun simctl ui booted content_size accessibility-extra-large`
  — and re-check the default size afterwards, because a Dynamic Type fix that
  moves the 1.0x rendering is a regression, not a fix.
- **Palette is deliberately not red/green, and since 2026-08-25 it is blue and
  off-white.** Green-means-cheap would assert the opposite of the product's
  finding, so ranking is carried by position, number size, and one accent
  reserved for the recommended route and used nowhere else. That accent is
  `#215A8C`, a muted steel/cobalt. The first two passes avoided blue and white
  on the reasoning that together they read as a clinical portal rather than as
  something on the patient's side; the third pass overrode that deliberately,
  at explicit request, and answered the original objection by avoiding the two
  failure modes it was really about — a bright generic "SaaS blue", and a stark
  clinical white (the canvas is `#F4F6F8`, off-white with a faint cool tint).
  Tokens, with the measured WCAG ratio beside every hex, in `app/src/theme.ts`.
  That file is the source of truth if it and this paragraph ever disagree
  again: they did between 2026-08-25 and 2026-09-01, when this said `#B2542A`
  and the code had already moved on.
- **There are two palettes now, and only colour differs between them** (added
  2026-09-03). `space`, `radius`, `stroke`, `type`, `TAP_TARGET`, `size` and
  `textScale` are invariant, so `themed()` in `app/src/styles/themed.ts` builds
  every stylesheet twice at module load and `useStyles` picks one with a context
  read. A theme switch allocates nothing, which matters because route rows
  re-rank under a dragged slider.
  - **The toggle is session-only and does not follow the system.** Persisting it
    needs AsyncStorage — a native module, so a dev-client rebuild — to remember
    one boolean. Following the system is already dead: `ios/Preclear/Info.plist`
    pins `UIUserInterfaceStyle: Light`, so `Appearance.getColorScheme()` returns
    `'light'` on this build whatever the device is set to. The seed reads it
    anyway, so the day that plist changes this starts behaving correctly with no
    code change.
  - **A class component cannot read the theme.** `ErrorBoundary` has to be a
    class, so its fallback UI was split into a function component. `contextType`
    would also work and reads worse.
  - **`scripts/check-contrast.py` is the guard, and it is the fourth of these.**
    It parses both palettes out of `theme.ts` rather than keeping its own copy —
    a checker holding a copy of the values it checks passes forever — and
    asserts 46 pairs. It also asserts `line` from *below*: it must stay under
    1.5:1 in both schemes, because a legible `line` is a second `border` and
    collapses a distinction the stroke weights are built on.
  - **Several ratios in the comments had drifted before anything checked them.**
    Small amounts — 17.6 written for what measures 17.3 — but a documented ratio
    nobody verifies is worse than none, because it gets quoted in review.
  - **`slateInk` is a naming fix, not a bug fix, and the difference matters.**
    Four sites used `surface` to mean "text on a slate fill". That pairing does
    not fail in dark: `surface` and `slate` invert together, so the label lands
    at 10.16:1. Nothing in the code said they had to invert together, though, so
    lightening `surface` to lift cards further off the canvas would have walked
    a button's label toward its own fill with no name and no test to catch it.
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

### UI overhaul mechanics (2026-09-01 to 2026-09-03)

Four staged rewrites, after the reference `zenithscreener.com/screener`. The
plan lives at `~/.claude/plans/ok-so-weve-been-reactive-engelbart.md`.

- **The wizard was inverted, not tidied.** The value was four screens deep, and
  every earlier fix — demo scenarios that skipped the flow, a landing proof
  panel, a chart that got reverted — was a workaround for that shape. The app
  now opens on a ranking with the questions collapsed above it. Every one of
  those workarounds was cheaper than this and none of them worked.
- **`showRoutes = step === 2` was never the performance fix and deleting it is
  safe.** `Slider.emit` drops a report whose stepped value has not changed
  (`app/src/Slider.tsx`), so a full-width drag emits ~41 changes rather than
  ~300 touch-move events. That dedupe was the fix. The workload is at most 10
  facilities and 456 rate rows. Results-first requires the gate gone.
- **`useDeferredValue` needs one stable object to defer**, which is why the
  screener query is a `useReducer` and not nine `useState`s. The thumb tracks
  the finger at high priority and the ranking settles a frame behind.
- **`source: 'example' | 'mine'` is the honesty flag and it needs three
  actions, not two.** `refine` marks the query as the member's; `example` opens
  a worked case; **`normalize` exists because neither of those covers a
  correction the app makes on the member's behalf** — switching procedure
  invalidates the indication, and without a third action that housekeeping
  relabelled an untouched example as somebody's own figures.
- **Tab navigation gave up a guarantee, deliberately.** `StepBar` locked forward
  steps, so a ranking could never appear before the coverage questions were
  answered. That is gone, and the "An example, not your numbers" line in the
  filter strip is now the only thing carrying it. Three tabs, not four: the
  reference has a History tab and nothing here is stored, which is a hard rule
  printed on screen.
- **Back is one rule with two consumers.** `back` in `App.tsx` is computed once
  and drives both the visible `BackLink` and the hardware handler. They were two
  implementations of one rule while no button existed, and the moment one
  appeared they became a pair that can disagree — a back button going somewhere
  the gesture does not teaches a wrong model of the app. There is still no
  history stack: any tab returns to the screener, the screener to the cover, the
  cover yields to the OS.
- **`TopBar` renders on every screen including the cover.** The cover was
  chrome-free while the bar only held navigation, and that stopped being right
  when it also held the theme toggle: a control missing from the first screen is
  one a member has to discover twice. Left slot holds the back link or the
  wordmark, never both — three items do not fit a 375pt bar at accessibility
  text sizes.
- **`expo-dev-client`'s floating Tools button sits exactly on the theme
  toggle.** Dev builds only, which is the build the submission video is filmed
  on. `EXDevMenuShowFloatingActionButton: false` under `ios.infoPlist` in
  `app.json` turns it off. `ios/` is gitignored and regenerated by prebuild, so
  `app.json` is the durable half; patch the generated plist too if you do not
  want to re-prebuild.
- **The screener headline is structurally expensive and has been cut twice.**
  First from title/hero to body/large, then from five stacked blocks to
  baseline-aligned phrase-and-figure rows. The second cut returned ~70pt, which
  is what put route 2 on screen. Above `textScale.stackAbove` the pair reflows
  to a column, the same instrument `HouseholdStep` uses on its plan row.
- **`marketing.ts` holds the copy that explains the product**, as typed data,
  following `plan.ts`. Everything else in the app renders an engine number or a
  payer's own sentence; this is the app talking about itself, which is the
  writing most likely to overclaim. **The strings currently in it are drafts.**
- **The FAQ is on Sources, not its own tab.** A reader who wants a claim checked
  is already there, and an answer beside the document it rests on beats the same
  answer one tap away. Its first entry is "will my claim be denied", which must
  never be answered with a yes, a no, or a probability.
- **The proof panel sits above the how-it-works block**, departing from the
  reference. It is one real published case where the ranking inverts, and a
  reader who leaves after four seconds should have seen that rather than an
  explanation of the controls.

### The subtraction pass (2026-09-03), and why it was needed twice

- **"Too cluttered" was said twice, three weeks apart, the second time after a
  pass that fixed it.** Nothing went wrong in between: every stage added text
  that was individually correct — the honesty tag, the tied-total explanation,
  how-it-works, an FAQ — and nothing was removed to pay for it. A screen does
  not become cluttered in one commit; it becomes cluttered in eleven, each of
  which looked reasonable. **Trimming without changing that mechanism buys about
  three weeks.**
- **`scripts/check-copy-budget.py` is the mechanism change**, and the thing that
  makes it mean anything is that it counts what is visible *before any tap* — it
  drops the body of every `<Disclosure>`. A plain word count would have scored
  the entire pass at roughly nothing. Caps live in the script; raising one is
  allowed and has to happen in a diff.
- **`Disclosure` is the app's one collapse**, and its summary line is what makes
  a collapse free rather than costly. A closed row reading "Coverage — Aetna ·
  PPO" *is* the answer. A row with no summary has to be opened to be understood,
  which is worse than not collapsing at all.
- **The filter panel groups by what the answer is about, and that moved two
  controls.** Weeks of treatment and the headache question read like coverage
  questions and are not — they describe what the *order* documents, they exist
  only because of the chosen indication, and they feed the requirement check
  rather than the cost math. They live under Scan.
- **`money()` is why a summary cannot carry three figures.** Hard rule 5 puts
  "(estimate)" inside every dollar string, so "Your year" would read "$6,250.00
  (estimate) deductible left · 20% · $8,000.00 (estimate) other care" and
  truncate. One figure, a percentage, and a worded flag for expected other care.
  There is a real open question there — the deductible is a number the member
  typed about their own plan, not a projected cost — but narrowing a hard rule
  is not a formatting decision and it was left alone.
- **The deductible-credit clause stays on every route row**, and this was caught
  on review after the first version of the plan moved it behind a tap. It is not
  compliance text, it is the thesis: cash earning no deductible credit is the
  only reason the ranking is ever counterintuitive. A density pass that reaches
  it has gone too far. What paid for keeping it was the `Recommended · ` prefix,
  which said what rank 1, the accent fill and the accent border already say.
- **A word count understates this kind of work by a lot.** File-level copy fell
  20%, but the visible change is structural: the filter panel went from eight
  headings and ~40 controls to four lines, Sources from 21 open citation blocks
  and 845 words of payer text to about a dozen tappable lines, the cover from
  eight blocks to four. Measure screens, not files.

### Naming the situation, and the end of the example ranking (2026-09-03)

The complaint that mattered most this session: *"i still have no idea whether i
have a not publishable document, cheaper to pay out of pocket or in network bc
im close to my deductible."* Those are the three situations the product exists
to tell apart, and the app named none of them.

- **A route row leads with an instruction now, not a category.** `ROUTE_LABELS`
  gives "Same coverage, cheaper facility", which describes a kind of route;
  `app/src/routeCopy.ts` gives "Ask for this scan at Franciscan Indianapolis",
  which tells a member what to do and names their situation by doing it. The
  reason follows in `type.body` at `ink` — it was `type.caption` at `inkMuted`,
  which made the reasoning the least readable text on the row. That is the same
  mistake `<Money>` made with the word "estimate", already on record here once.
- **`routeCopy.ts` is presentation and has no parity script, deliberately.**
  Every value in it is read off a `Route` the engine already produced; nothing
  is recomputed, so there is no second implementation to drift. If something in
  there ever starts *deciding* rather than describing, it belongs in `routes.ts`
  and it needs a parity test.
- **The example ranking is gone.** It opened the app on a result for a patient
  who is not you, carrying a label doing more work than a label can. Nothing
  ranks until `answered.scan && answered.coverage && answered.year`, tracked in
  the reducer where the state changes rather than inferred at a call site — an
  inferred version drifts the first time a default happens to equal an answer.
  `QuerySource` gained `'empty'`.
- **Two groups would have been faster and were rejected.** Scan and coverage
  decide which rates exist, but the year figures decide *which route wins*, and
  a ranking driven by a deductible nobody entered is the thing being removed,
  not a smaller version of it.
- **A chip in an unanswered group must draw unselected.** The fields still hold
  seeded values, so without this the Scan group rendered "Not set yet" directly
  above a checked "Knee MRI" chip — the screen contradicting itself in adjacent
  lines. Sliders are the honest exception: a thumb has to be somewhere and no
  position means "unanswered", which is why the group summary is the thing that
  must never lie.
- **The filter panel now opens expanded, on the Scan group.** A collapsed strip
  above an empty screen gives a member nothing to do; the point of removing the
  example was to be clearer, not emptier.
- **The budget script did its job on its first real test.** `ScreenerScreen` hit
  140/140 exactly while this landed. The cap was raised to 175 on purpose and
  the reason is in the diff, which is the whole design. `routeCopy.ts` was added
  to the budget at the same time — budgeting a screen but not the module feeding
  it prose would leave the obvious hiding place unwatched.

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
├── LICENSE                # MIT. Required by the rules — see below
├── .gitignore
├── .env.example
├── pipeline/              # Python: data ingestion + rules
│   ├── mrf/               # Transparency in Coverage parsing
│   ├── policies/          # payer requirement rule objects
│   ├── costing/           # the deductible-aware engine
│   └── tests/
├── app/                   # mobile app + RevenueCat SDK
│   └── .env.example       # the app reads app/.env, not the root one
└── data/
    └── samples/           # synthetic fixtures only — safe to commit
```

Never commit anything under `data/` except `data/samples/`. MRF files are gigabytes.

**`LICENSE` is a submission requirement, not housekeeping.** The Next Gen rules
ask for a public repository with a *visible* license file, so it is checked
rather than assumed: MIT, at the repository root, tracked in git, and linked
from the README. Verify with `git ls-files LICENSE` — a file that exists on
disk but was never added proves nothing to a judge reading GitHub.

**There are two `.env.example` files and that is deliberate.** Expo treats
`app/` as its project root and reads `app/.env`; the root one serves the
pipeline. Putting the RevenueCat key only in the root file is why it can look
configured and still be missing.

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
