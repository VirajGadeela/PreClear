# Preclear

## What this is

A mobile app that tells patients, before an elective MRI or CT, which route to that scan costs them the least **this year** — accounting for the fact that cash payments don't count toward the deductible.

Built for RevenueCat Shipaton 2026, **Next Gen category** (student track: judged on a demo video + this open-source repo, no App Store publication required). Deadline: **September 30, 2026**.

## Current status

Nothing is built yet. Two validation gates must pass before any real code:

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

User photographs insurance card + enters procedure → app returns four ranked routes, each with reasoning shown:

1. **In-network, order as written** (baseline)
2. **In-network, cheaper site of service** — same coverage, same deductible credit, lower cost because negotiated rates vary by facility
3. **In-network, order corrected first** — the order fails a specific published payer requirement; output is a checklist for the ordering physician
4. **Cash at a non-contracted facility** — surfaced only when the patient is uninsured, on a high-deductible plan unlikely to be met, or the study is non-covered

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
