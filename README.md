# Preclear

Tells patients, before an elective MRI or CT, which route to that scan
costs them the least this year — accounting for the fact that cash
payments don't count toward the deductible.

## The problem
[3 sentences]

## How it works
1. Photo of insurance card + procedure
2. Checks the order against the payer's published requirements
3. Compares 4 routes on real negotiated rates
4. Adjusts for deductible remaining → one recommendation, reasoning shown

## Data sources
- Hospital price transparency files (federally mandated) — real rates
- Payer medical policy documents — real requirements

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

The deductible math is implemented in both Python and TypeScript. After
changing either, check they still agree:

```bash
./scripts/check-math-parity.sh
```

## Status
Built for Shipaton 2026. Indianapolis, IN; Anthem Blue Cross Blue Shield; MRI/CT.
Uses synthetic patient data only.
