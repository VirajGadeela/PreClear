/**
 * RevenueCat, in one place.
 *
 * App.tsx should never touch the SDK directly. Everything the app needs —
 * configure, read the entitlement, show the paywall, restore — goes through
 * here, so there is exactly one definition of "is this member unlocked".
 *
 * The reason this file is larger than a thin wrapper is `diagnose()`. A
 * purchase flow has two failure modes that look identical from inside the app:
 * the code is wrong, or the RevenueCat dashboard and App Store Connect are not
 * finished. The SDK reports both as an empty offering or an opaque error.
 * `diagnose()` separates them and names the specific console step that is
 * missing, because that is the difference between a five-minute fix and an
 * afternoon.
 *
 * Compliance note (CLAUDE.md, hard rule 2): RevenueCat is a purchase SDK and is
 * the only third-party SDK in this app. Nothing here calls its attribution or
 * subscriber-attribute APIs, and no usage data is collected. Do not add them.
 */

import Purchases, {
  LOG_LEVEL,
  PACKAGE_TYPE,
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
} from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import type { PlanOption } from './plan';

/**
 * Must match the entitlement identifier in the RevenueCat dashboard exactly.
 * A mismatch here is silent: purchases succeed, `entitlements.active` stays
 * empty, and the app never unlocks.
 *
 * Deliberately named for who it covers, not for what it currently unlocks. It
 * gates the full route comparison today and is intended to gate household
 * claims monitoring later, with the comparison becoming free. An entitlement
 * identifier is expensive to change once products exist in App Store Connect
 * and RevenueCat, so it must survive that shift without being renamed.
 */
export const ENTITLEMENT = 'preclear_household';

const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY;

/** Set once configure() succeeds, so the other calls can fail fast and clearly. */
let configured = false;

export type ConfigureResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Configure the SDK. Safe to call more than once.
 *
 * Returns rather than throws, because a missing key is a normal state during
 * development and the app is expected to keep working without it — just locked.
 */
export function configure(): ConfigureResult {
  if (configured) return { ok: true };

  if (!apiKey) {
    return {
      ok: false,
      message:
        'RevenueCat key is missing. Add EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY to app/.env and restart the bundler.',
    };
  }

  // Debug logs in development only. They print the entitlement and offering the
  // SDK actually resolved, which is the fastest way to catch an identifier typo.
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  Purchases.configure({ apiKey });
  configured = true;
  return { ok: true };
}

export function isConfigured(): boolean {
  return configured;
}

/**
 * Whether this build is talking to RevenueCat's Test Store.
 *
 * Test Store keys carry a `test_` prefix, which is the only signal available
 * before any call is made. It changes what the setup advice in `diagnose()`
 * should say, and it is worth surfacing: a purchase made against the Test Store
 * is real to the SDK and to the entitlement, but no money moves.
 *
 * The SDK deliberately refuses to run a release build configured with one, so
 * this can never be true in a shipped app.
 */
export function usingTestStore(): boolean {
  return Boolean(apiKey?.startsWith('test_'));
}

/** The single definition of "unlocked". */
export function isEntitled(info: CustomerInfo): boolean {
  return Boolean(info.entitlements.active[ENTITLEMENT]);
}

/** Current entitlement state, straight from the SDK cache. */
export async function refreshEntitlement(): Promise<boolean> {
  if (!configured) return false;
  const info = await Purchases.getCustomerInfo();
  return isEntitled(info);
}

/**
 * Subscribe to entitlement changes.
 *
 * Needed because a purchase is not the only way the entitlement can change —
 * a renewal, an expiry, a restore on another device, or a sandbox subscription
 * lapsing (they run on accelerated clocks) all arrive through this listener and
 * not through the paywall's return value.
 *
 * Returns an unsubscribe function for useEffect cleanup.
 */
export function onEntitlementChange(
  handler: (entitled: boolean) => void,
): () => void {
  if (!configured) return () => {};

  const listener = (info: CustomerInfo) => handler(isEntitled(info));
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}

export type PurchaseOutcome = {
  entitled: boolean;
  /** User-facing note, or null when there is nothing worth saying. */
  message: string | null;
};

/**
 * Show RevenueCat's own templated paywall and report what came back.
 *
 * A cancel is not an error and must not surface as one — the member looked at
 * the price and said no, which is a normal outcome.
 *
 * No longer on the app's purchase path: the household page renders the real
 * packages itself and buys the selected one through `purchasePlan`, so nothing
 * calls this. Kept because it is the fastest way to check a dashboard-side
 * paywall configuration without touching this app's layout, but it is dead code
 * until something calls it — delete it if that stops being worth the room.
 */
export async function presentPaywall(): Promise<PurchaseOutcome> {
  const ready = configure();
  if (!ready.ok) return { entitled: false, message: ready.message };

  try {
    const result = await RevenueCatUI.presentPaywall({ displayCloseButton: true });

    switch (result) {
      case PAYWALL_RESULT.PURCHASED:
      case PAYWALL_RESULT.RESTORED:
        return { entitled: await refreshEntitlement(), message: null };

      case PAYWALL_RESULT.CANCELLED:
      case PAYWALL_RESULT.NOT_PRESENTED:
        return { entitled: await refreshEntitlement(), message: null };

      case PAYWALL_RESULT.ERROR:
      default:
        // The SDK does not say why here, so ask the dashboard what is missing.
        return { entitled: false, message: await diagnose() };
    }
  } catch (error) {
    return { entitled: false, message: describeError(error) };
  }
}

/**
 * Restore previous purchases.
 *
 * Required by App Store review for any non-consumable or subscription, and the
 * only way a member who reinstalls gets their entitlement back.
 */
export async function restore(): Promise<PurchaseOutcome> {
  const ready = configure();
  if (!ready.ok) return { entitled: false, message: ready.message };

  try {
    const info = await Purchases.restorePurchases();
    const entitled = isEntitled(info);
    return {
      entitled,
      message: entitled ? null : 'No previous purchase found for this Apple ID.',
    };
  } catch (error) {
    return { entitled: false, message: describeError(error) };
  }
}

/**
 * How each package type is described to the member.
 *
 * Only the terms this product actually sells are mapped. Anything else — a
 * lifetime package, a six-month one, a custom identifier — returns null and is
 * dropped rather than guessed at, because a package the copy cannot describe
 * correctly is worse on screen than one that is absent.
 */
function describePackage(pkg: PurchasesPackage): { term: string; cadence: string } | null {
  switch (pkg.packageType) {
    case PACKAGE_TYPE.ANNUAL:
      return { term: 'Yearly', cadence: 'per year' };
    case PACKAGE_TYPE.MONTHLY:
      return { term: 'Monthly', cadence: 'per month' };
    default:
      return null;
  }
}

/**
 * A derived figure in the product's own currency, or null if it cannot be made.
 *
 * Only ever used for the "works out at X a month" footnote. The headline price
 * is always the store's `priceString` and is never computed here — the store
 * knows the member's currency, locale and tax treatment, and this app does not.
 */
function formatDerived(amount: number, currencyCode: string): string | null {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
    }).format(amount);
  } catch {
    // Intl or the currency code is unavailable. The footnote is a nicety; the
    // price above it is not, and that one came from the store already.
    return null;
  }
}

/** Yearly above monthly, matching how the demo placeholders are ordered. */
function rank(term: string): number {
  return term === 'Yearly' ? 0 : 1;
}

/**
 * The current offering's packages, as the household page renders them.
 *
 * Returns null rather than throwing whenever the store cannot answer — no key,
 * no offering, no packages, or a network failure. The caller treats null as
 * "show the demo placeholders and say so", which keeps the app usable and
 * honest on a machine that has never been near a RevenueCat dashboard.
 *
 * The saving badge is computed from the two real prices rather than hardcoded.
 * A badge claiming a discount the store does not actually give is a false
 * statement about money, and hardcoding one guarantees it goes stale the first
 * time either price changes.
 */
export async function loadPlans(): Promise<PlanOption[] | null> {
  if (!configured) return null;

  let offerings: PurchasesOfferings;
  try {
    offerings = await Purchases.getOfferings();
  } catch {
    return null;
  }

  const current = offerings.current;
  if (!current || current.availablePackages.length === 0) return null;

  const described = current.availablePackages
    .map((pkg) => ({ pkg, label: describePackage(pkg) }))
    .filter((entry): entry is { pkg: PurchasesPackage; label: { term: string; cadence: string } } =>
      entry.label !== null,
    );
  if (described.length === 0) return null;

  const monthly = described.find(
    (entry) => entry.pkg.packageType === PACKAGE_TYPE.MONTHLY,
  )?.pkg;

  const plans = described.map(({ pkg, label }) => {
    const plan: PlanOption = {
      id: pkg.identifier,
      term: label.term,
      price: pkg.product.priceString,
      cadence: label.cadence,
    };

    if (pkg.packageType === PACKAGE_TYPE.ANNUAL) {
      const perMonth = formatDerived(pkg.product.price / 12, pkg.product.currencyCode);
      if (perMonth) plan.footnote = `Works out at ${perMonth} a month.`;

      if (monthly && monthly.product.price > 0) {
        const saving = 1 - pkg.product.price / (monthly.product.price * 12);
        // Only when it rounds to something worth saying. A "Save 0%" badge on a
        // yearly plan priced at twelve times the monthly one is noise.
        if (saving >= 0.01) plan.badge = `Save ${Math.round(saving * 100)}%`;
      }
    } else {
      plan.footnote = 'Cancel any time.';
    }

    return plan;
  });

  return plans.sort((a, b) => rank(a.term) - rank(b.term));
}

/**
 * Buy one specific package.
 *
 * This exists rather than only `presentPaywall()` because the household page
 * already shows the terms and prices and the member has already chosen one.
 * Handing them to a second screen to choose again is a worse flow, and it made
 * the selection on the first screen decorative — it was collected and then
 * thrown away.
 *
 * A cancelled purchase is a normal outcome and returns no message. The SDK
 * reports it as a thrown error with `userCancelled` set, which is why it is
 * caught here and not treated as a failure.
 */
export async function purchasePlan(id: string): Promise<PurchaseOutcome> {
  const ready = configure();
  if (!ready.ok) return { entitled: false, message: ready.message };

  try {
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages.find(
      (candidate) => candidate.identifier === id,
    );
    // The offering changed under us between rendering and tapping. Rare, and
    // diagnose() is more useful here than "package not found".
    if (!pkg) return { entitled: false, message: await diagnose() };

    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { entitled: isEntitled(customerInfo), message: null };
  } catch (error) {
    if (wasCancelled(error)) {
      return { entitled: await refreshEntitlement(), message: null };
    }
    return { entitled: false, message: describeError(error) };
  }
}

function wasCancelled(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'userCancelled' in error &&
      (error as { userCancelled?: boolean }).userCancelled,
  );
}

/**
 * Work out which setup step is missing and say so in plain words.
 *
 * The order matters: each check is a precondition for the next, so the first
 * one that fails is the one worth reporting.
 */
export async function diagnose(): Promise<string> {
  if (!apiKey) {
    return 'No RevenueCat key. Add EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY to app/.env and restart the bundler.';
  }
  if (!configured) {
    return 'RevenueCat is not configured. configure() has not run or it failed.';
  }

  let offerings: PurchasesOfferings;
  try {
    offerings = await Purchases.getOfferings();
  } catch (error) {
    return `Could not reach RevenueCat: ${describeError(error)}`;
  }

  if (!offerings.current) {
    const count = Object.keys(offerings.all).length;
    return count === 0
      ? 'No offerings exist in RevenueCat. Create one under Product catalog → Offerings.'
      : 'No offering is marked Current in RevenueCat. Open Product catalog → Offerings and set one as Current.';
  }

  if (offerings.current.availablePackages.length === 0) {
    return usingTestStore()
      ? 'The current offering has no available packages. On a Test Store this means the ' +
        'products exist in the Product catalog but are not attached to the offering — open ' +
        'the offering and add a package for each one.'
      : 'The current offering has no available packages. Usually this means the product ' +
        'exists in RevenueCat but StoreKit returned nothing — check the product ID matches ' +
        'App Store Connect exactly, and that the product has a price and is Ready to Submit.';
  }

  return (
    `Offering "${offerings.current.identifier}" has ` +
    `${offerings.current.availablePackages.length} package(s). If the purchase still fails, ` +
    'the entitlement identifier is the likely mismatch — it must be exactly ' +
    `"${ENTITLEMENT}" and must be attached to the product.`
  );
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}
