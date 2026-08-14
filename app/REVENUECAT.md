# RevenueCat setup

Everything in the repo is done. What's left needs a RevenueCat account and
Xcode, so it has to be you.

## What the repo already does

- [`src/purchases.ts`](src/purchases.ts) — the only file that touches the SDK.
  Configure, read the entitlement, present the paywall, restore, and
  `diagnose()`, which names the specific dashboard step that's missing when a
  purchase fails.
- [`App.tsx`](App.tsx) — reads the entitlement at launch, subscribes to changes,
  gates routes 2–4 behind it, and offers a restore path.
- [`storekit/Preclear.storekit`](storekit/Preclear.storekit) — a local StoreKit
  configuration defining one non-consumable, `com.viraj.preclear.full_comparison`.
- [`.env`](.env) — gitignored, waiting for the key.

Identifiers that must match exactly, everywhere:

| Thing | Value |
|---|---|
| Bundle ID | `com.viraj.preclear` |
| Entitlement | `full_comparison` |
| Product ID | `com.viraj.preclear.full_comparison` |

The entitlement string is the one that fails silently. If it doesn't match, the
purchase succeeds, `entitlements.active` stays empty, and the app never unlocks.

## Which path to take

**Use the StoreKit configuration file.** It runs entirely on the simulator and
needs no Apple Developer Program membership and no App Store Connect products.
Shipaton's Next Gen category accepts sandbox purchases, so this is enough for
the demo.

Real App Store Connect sandbox is only worth it if you decide to ship publicly.
It needs the $99/yr membership, products created and approved in App Store
Connect, and a sandbox tester Apple ID.

## Steps you have to do

### 1. RevenueCat dashboard

1. Create an account and a project called **Preclear**.
2. **Project Settings → Apps → + New** → *App Store*. Set bundle ID
   `com.viraj.preclear`. App Store Connect credentials are **not** required for
   StoreKit-config testing — skip that section.
3. Copy the **public** SDK key (it starts `appl_`) into [`.env`](.env):
   ```
   EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY=appl_xxxxxxxxxxxx
   ```
   Restart the bundler afterward — Expo reads `.env` at startup only.
   Use the *public* key. The secret key must never enter this repo.
4. **Product catalog → Products → + New**. Store: App Store.
   Product ID: `com.viraj.preclear.full_comparison`. Type: non-consumable.
5. **Product catalog → Entitlements → + New**. Identifier: `full_comparison`.
   Attach the product from step 4.
6. **Product catalog → Offerings → + New**. Identifier `default`. Add a package,
   type **Lifetime**, attach the product. Then mark this offering **Current** —
   `presentPaywall()` loads the current offering and shows nothing without it.
7. **Offerings → default → Paywall → Create**. Any template is fine. Without a
   paywall attached, `presentPaywall()` returns `ERROR`.

### 2. The StoreKit test certificate

RevenueCat's backend can't validate a locally-signed StoreKit receipt until it
has your Xcode certificate. This applies to **all** product types, not just
subscriptions.

1. Open `app/storekit/Preclear.storekit` in Xcode.
2. Menu bar → **Editor → Save Public Certificate**. Save it anywhere.
3. RevenueCat → **Project Settings → Apps → Preclear** → expand
   **StoreKit testing framework** → upload the certificate. You should see
   *"Certificate added"*.

The separate *Subscription Offer Key* (.p8) is only for promotional offers on
subscriptions. Our product is a non-consumable, so skip it.

### 3. Xcode

The StoreKit file has to be part of the project before the scheme can see it.

1. `open ios/Preclear.xcworkspace`
2. Drag `app/storekit/Preclear.storekit` into the Project Navigator. Check
   **Copy items if needed** and tick the **Preclear** target.
3. **Product → Scheme → Edit Scheme → Run → Options**.
4. Set **StoreKit Configuration** to `Preclear.storekit`. Close.

### 4. Run it — from Xcode, not the terminal

This is the part that catches people:

> **`npx expo run:ios` will not work for purchase testing.** It shells out to
> `xcodebuild`, and a StoreKit configuration set in a scheme is ignored by
> command-line builds. The purchase will fail with no useful error.

So:

```bash
cd app && npx expo start --dev-client     # terminal 1, leave running
```

Then press **▶︎ Run** in Xcode (⌘R) with the iPhone 17 Pro simulator selected.

### 5. Verify

1. Walk to step 3 (**Routes**). Only the top route is visible.
2. Tap **Unlock →**. The paywall appears.
3. Buy. The simulator shows a StoreKit sheet with no real payment.
4. All four routes appear, and the restore link disappears.
5. RevenueCat dashboard → **Customer History** shows the transaction. This is
   the screen worth filming for the demo, since it proves the SDK is live.

Then check restore works: delete the app from the simulator, run again, go to
step 3, tap **Restore purchase**. It should unlock without paying.

## When it fails

The app tells you what's wrong instead of showing a generic error. On a failed
purchase, `diagnose()` in [`src/purchases.ts`](src/purchases.ts) checks each
precondition in order and reports the first one that isn't met — no offerings,
no *Current* offering, an offering with no packages, or a likely entitlement
mismatch. That message appears under the routes.

`Purchases.setLogLevel(LOG_LEVEL.DEBUG)` is on in dev builds, so the Xcode
console prints which offering and entitlement the SDK actually resolved. That is
usually faster than reading the dashboard.

Two failure modes worth knowing:

- **"Receipt not valid"** almost always means step 2 was skipped or the
  certificate was regenerated. Xcode regenerates it whenever the `.storekit`
  file's key is reset — re-upload it.
- **Everything works but nothing unlocks** means the entitlement identifier
  doesn't match `full_comparison`, or the product isn't attached to it.

## After a prebuild

`npx expo prebuild --clean` regenerates `ios/`, which destroys both the file
reference and the scheme setting. The `.storekit` file itself survives because it
lives in `app/storekit/`, outside the generated directory — but **step 3 has to
be redone**. Nothing else in this document does.
