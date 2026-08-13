/**
 * RevenueCat identifiers and the entitlement-check state machine.
 *
 * This is the one place in the app that names the entitlement, created in the
 * RevenueCat dashboard, not in code. A rename only touches this file.
 *
 * There is no matching OFFERING_ID here: `RevenueCatUI.presentPaywall()` only
 * accepts a resolved PurchasesOffering object, not a string identifier, and
 * resolving one just to hand it back would be a network round trip for no
 * benefit. The paywall call omits `offering` and loads whichever offering is
 * marked "Current" in the dashboard instead — see the setup checklist for the
 * offering identifier to create there.
 */

export const ENTITLEMENT_ID = 'full_comparison';

/**
 * What the app knows about access to the full route comparison.
 *
 * 'locked' and 'unavailable' render as the same card shape — an offer to
 * unlock — but they are not the same fact, and collapsing them was a real
 * bug: a network failure or a missing dashboard offering used to render
 * identically to "hasn't subscribed yet," which hides a configuration
 * problem behind UI that looks like the ordinary free tier.
 *
 *   checking    — the first getCustomerInfo() call hasn't resolved yet.
 *                 Rendered the same as 'locked' so there is no loading flash.
 *   entitled    — the entitlement is active.
 *   locked      — the SDK responded; the entitlement is not active. This is
 *                 the expected state for most visitors and must not look
 *                 like an error.
 *   unavailable — the SDK could not be reached, or nothing is configured yet
 *                 (missing API key, offline, no offering set up in the
 *                 dashboard). Still calm, still not an error — just a
 *                 different reason the same card is showing.
 */
export type AccessStatus = 'checking' | 'entitled' | 'locked' | 'unavailable';
