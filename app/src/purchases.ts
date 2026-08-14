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
  type CustomerInfo,
  type PurchasesOfferings,
} from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

/**
 * Must match the entitlement identifier in the RevenueCat dashboard exactly.
 * A mismatch here is silent: purchases succeed, `entitlements.active` stays
 * empty, and the app never unlocks.
 */
export const ENTITLEMENT = 'full_comparison';

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
 * Show the RevenueCat paywall and report what came back.
 *
 * A cancel is not an error and must not surface as one — the member looked at
 * the price and said no, which is a normal outcome.
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
    return (
      'The current offering has no available packages. Usually this means the product ' +
      'exists in RevenueCat but StoreKit returned nothing — check the product ID matches ' +
      'App Store Connect exactly, and that the product has a price and is Ready to Submit.'
    );
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
