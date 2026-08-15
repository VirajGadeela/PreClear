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
  configuration defining one auto-renewable monthly subscription,
  `com.viraj.preclear.household.monthly`, family shareable.
- [`.env`](.env) — gitignored, waiting for the key.

Identifiers that must match exactly, everywhere:

| Thing | Value |
|---|---|
| Bundle ID | `com.viraj.preclear` |
| Entitlement | `preclear_household` |
| Product ID | `com.viraj.preclear.household.monthly` |
| Subscription group | `Preclear Household` |

Only the **monthly** product exists in the StoreKit file. The demo paywall in
`src/DemoPaywall.tsx` advertises a yearly option too, but that sheet disappears
the moment a real key is configured, so the two never appear together. If you
want yearly for real, it needs a second subscription in `Preclear.storekit`, a
second RevenueCat product, and a second package on the offering — decide that
before creating the offering, since adding one later means editing it again.

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
   `EXPO_PUBLIC_` values are inlined into the bundle, not read at runtime, so
   after editing `.env` you need a **full reload** of the app — shake gesture or
   `Cmd+R` in the simulator. Fast Refresh will not pick it up, and restarting
   Metro is not what fixes it.

   Use the *public* key, which is designed to ship in the client. The secret key
   must never enter this repo or an `EXPO_PUBLIC_` variable — anything with that
   prefix is readable in plain text in the compiled app.
4. **Product catalog → Products → + New**. Store: App Store.
   Product ID: `com.viraj.preclear.household.monthly`. Type: auto-renewable
   subscription, in a group named `Preclear Household`, billed monthly.
5. **Product catalog → Entitlements → + New**. Identifier: `preclear_household`.
   Attach the product from step 4.

   The entitlement is named for who it covers rather than what it unlocks. It
   gates the route comparison today and is meant to gate household claims
   monitoring later, once the comparison becomes free. Renaming an entitlement
   after products exist is painful, so it must survive that change.
6. **Product catalog → Offerings → + New**. Identifier `default`. Add a package,
   type **Monthly**, attach the product. Then mark this offering **Current** —
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

The separate *Subscription Offer Key* (.p8) is only needed for **promotional**
offers — a discounted or free trial price aimed at a specific existing customer.
A plain monthly subscription with no promotional offer does not need it, so skip
it until you add one.

### 3. Xcode project wiring — already done, but verify

Both edits are plain text, so they were made directly rather than through the
GUI:

- `ios/Preclear.xcodeproj/project.pbxproj` carries a file reference to
  `../storekit/Preclear.storekit`, in the root group. Deliberately **not** added
  to a build phase — the scheme is what reads it, and putting it in Resources
  would ship the file inside the app.
- `ios/Preclear.xcodeproj/xcshareddata/xcschemes/Preclear.xcscheme` carries
  `<StoreKitConfigurationFileReference identifier = "../../storekit/Preclear.storekit">`
  in its `LaunchAction`. The path is relative to the `.xcodeproj` bundle, not to
  `ios/`.

Confirm it took: **Product → Scheme → Edit Scheme → Run → Options**, and check
**StoreKit Configuration** reads `Preclear.storekit` rather than *None*. If it
says the file is missing, re-pick it from that menu — a wrong relative path is
the only thing that can go wrong here, and the picker fixes it in one click.

> **`ios/` is gitignored**, so this wiring lives only on this machine and is not
> in the repo. `npx expo prebuild --clean` regenerates the directory and wipes
> both edits. If that happens, redo them — or promote them to an Expo config
> plugin, which would be tracked and would re-apply on every prebuild.

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

The paywall no longer gates the route comparison — all four routes are free, and
the entitlement gates the household claims review instead. So:

1. Tap **See household plan** in the top bar, or step **4 · Household**.
2. Tap **See plans and pricing**.
3. The **RevenueCat** paywall appears — not the demo sheet. That swap is the
   first proof the key is live: `App.tsx` picks the real sheet the moment
   `configure()` succeeds. If you still see "Demo pricing", the key did not load,
   and the usual cause is that `EXPO_PUBLIC_` values are inlined at build time —
   reload the app fully (Cmd+R), don't just restart Metro.
4. Buy. The simulator shows a StoreKit sheet with no real payment.
5. Step 4 becomes the claims review, the top-bar pill fills in, and the
   "Unlocked in demo mode" banner is **absent** — that banner only appears for a
   demo unlock, so its absence is what distinguishes a real purchase.
6. RevenueCat dashboard → **Customer History** shows the transaction. This is
   the screen worth filming for the demo, since it proves the SDK is live.

Then check restore works: delete the app from the simulator, run again, open the
Household step, tap **Restore purchase**. It should unlock without paying.

The `__DEV__` Free/Household switch at the bottom of the screen forces
`demoEntitled` and is independent of the real entitlement, so leave it on
**Free** while testing a purchase or you cannot tell which one unlocked the tier.

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
  doesn't match `preclear_household`, or the product isn't attached to it.

## After a prebuild

`npx expo prebuild --clean` regenerates `ios/`, which destroys both the file
reference and the scheme setting. The `.storekit` file itself survives because it
lives in `app/storekit/`, outside the generated directory — but **step 3 has to
be redone**. Nothing else in this document does.

## What is still outstanding

Everything above that needs an account login. As of 2026-08-14, none of it is
done: `.env` holds an empty key, no RevenueCat project exists, and no StoreKit
certificate has been uploaded. Step 3 is the only one that is finished.

Until the key lands, the app is not broken — it presents the demo paywall
instead, which unlocks the tier locally and says on screen that it charges
nothing.
