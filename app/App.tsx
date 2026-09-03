/**
 * Preclear — which route to an elective scan costs the least this year.
 *
 * Compliance rules this screen is bound by (CLAUDE.md, "Hard rules"):
 *   - every dollar figure renders through <Money>, which puts "estimate" inside
 *     the string itself. There is no other way to render a figure here
 *   - no analytics or ad SDKs, and none are imported
 *   - no real patient data; benefit inputs are user-reported and never stored
 *   - requirement findings quote the payer and describe documentation. This is
 *     not denial prediction and must never be described as such
 *   - nothing here suggests a different procedure or imaging modality
 *
 * This file is orchestration only — state, effects, and which step renders.
 * Each screen's markup and styles live under `src/screens/`, shared controls
 * under `src/components/`, and cross-screen styles in `src/styles/shared.ts`.
 */

import {
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { StatusBar } from 'expo-status-bar';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { data, PAYER_LABELS, STEPS } from './src/appData';
import { DevTierSwitch } from './src/components/DevTierSwitch';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { TopBar } from './src/components/TopBar';
import { PlanBenefits } from './src/costing';
import { DEMO_SCENARIOS, DemoScenario } from './src/demo';
import { shareText } from './src/share';
import {
  ScreenerQuery,
  fromScenario,
  memberPlanOf,
  queryReducer,
} from './src/screener';
import { ScreenerScreen } from './src/screens/ScreenerScreen';
import {
  configure as configurePurchases,
  loadPlans,
  onEntitlementChange,
  purchasePlan,
  refreshEntitlement,
  restore as restorePurchases,
} from './src/purchases';
import { DEMO_PLANS, type PlanOption } from './src/plan';
import {
  OrderFacts,
  checkOrder,
  readsField,
  unmetFindings,
  usesTreatmentWeeks,
} from './src/requirements';
import {
  availableProducts,
  buildRoutes,
  planMatchSummary,
  rankRoutes,
  Route,
} from './src/routes';
import { HouseholdStep } from './src/screens/HouseholdStep';
import { LandingStep } from './src/screens/LandingStep';
import { MethodStep } from './src/screens/MethodStep';
import { color, space, stroke } from './src/theme';

/**
 * The paid tier's own page, not a step in the scan flow.
 *
 * It used to be step 4 — reachable only after Scan/Coverage/Routes, or via a
 * pill in the top bar. Neither fit a member who wants the household plan and
 * nothing else: they were made to declare a scan they don't have, or hunt for
 * a button that didn't look like a destination. It's a sibling of the landing
 * screen instead, reached the same way (a tap from the homepage) and hidden
 * from the same chrome — negative, like `step === -1`, so it renders outside
 * the numbered flow and neither the step bar nor the top bar mistake it for
 * part of the sequence.
 */
const HOUSEHOLD_STEP = -2;

/**
 * Where the numbers come from.
 *
 * A sibling of the landing screen for the same reason the household plan is
 * one: a destination rather than a stage of the scan flow. Someone who wants
 * to know what this app reads should not have to declare a scan to find out.
 * Negative, so the step bar and top bar leave it out of the sequence.
 */
const METHOD_STEP = -3;

export default function App() {
  // Local weight files, not a variable font, so `type.ts`'s `fontFamily`
  // string names the exact weight it wants. Gating the whole app behind this
  // avoids a flash of the system font before Manrope arrives — the load is a
  // bundled local asset, not a network fetch, so this resolves in one frame
  // on every real launch.
  const [fontsLoaded] = useFonts({
    'Manrope-SemiBold': Manrope_600SemiBold,
    'Manrope-Bold': Manrope_700Bold,
    'Manrope-ExtraBold': Manrope_800ExtraBold,
  });

  const [step, setStep] = useState(-1);

  /**
   * Everything the screener asks, in one object — see `src/screener.ts` for
   * why it is a reducer and what `source` guards.
   *
   * Seeded from the first worked example rather than from blank defaults,
   * because a results-first screen has to open on a result. `source` starts at
   * 'example' and only a member moving a control changes it.
   */
  const [query, dispatch] = useReducer(queryReducer, undefined, () => ({
    ...fromScenario(DEMO_SCENARIOS[0]),
    source: 'example' as const,
  }));

  /**
   * What the ranked list reads.
   *
   * The controls read `query` and answer the finger immediately; the routing
   * pass reads this and settles a frame or two behind in an interruptible
   * render. This is what lets the filters and the results share one screen.
   *
   * The gate this replaces (`showRoutes = step === 2`) was introduced to stop
   * a routing pass running on every slider report. That diagnosis was wrong:
   * `Slider.emit` already drops a report whose stepped value has not changed,
   * so a full-width deductible drag emits ~41 changes rather than ~300, and
   * one pass is at most ten facilities of arithmetic. The gate was cutting work
   * that was already cheap, and results-first cannot keep it.
   */
  const deferredQuery = useDeferredValue(query);

  const refine = useCallback(
    (patch: Partial<ScreenerQuery>) => dispatch({ type: 'refine', patch }),
    [],
  );

  // Which route is expanded, and whether the filter strip is open. Held here
  // rather than inside the screen so neither is lost on a trip to another
  // destination and back.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openRouteKind, setOpenRouteKind] = useState<string | null>(null);

  // Two independent sources of "unlocked", kept apart on purpose.
  //
  // `storeEntitled` is the real one: RevenueCat's answer, and the only one that
  // will exist once a store product does. `demoEntitled` is this build's stand-in
  // — no product exists yet, so the paid tier is unlocked by a demo sheet that
  // says so on screen. Merging them into one flag would make it impossible to
  // tell a genuine entitlement from the demo, which is exactly the distinction
  // that has to stay visible while the store side is unfinished.
  const [storeEntitled, setStoreEntitled] = useState(false);
  const [demoEntitled, setDemoEntitled] = useState(false);
  const [storeReady, setStoreReady] = useState(false);
  // The store's real packages, or null until they arrive — and permanently null
  // when there is no key, no current offering, or the network is down. Kept
  // separate from `storeReady` because a configured SDK that cannot read an
  // offering is a different state from one that was never configured, and only
  // the first is worth a diagnostic.
  const [storePlans, setStorePlans] = useState<PlanOption[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const isSubscribed = storeEntitled || demoEntitled;

  /**
   * Send each step back to the top.
   *
   * One ScrollView renders every step, so it keeps its offset when the step
   * changes: scroll down on the scan step to reach "Next", tap it, and the
   * coverage step opens halfway down with its heading cut off. Nothing looks
   * broken, which is what makes it easy to miss.
   */
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  useEffect(() => {
    const ready = configurePurchases();
    if (!ready.ok) {
      // Not an error worth showing a patient. Without a key the demo paywall is
      // the paywall, and it explains itself; the console note is for whoever is
      // building, and `note` stays clear for purchase outcomes.
      setStoreReady(false);
      return;
    }
    setStoreReady(true);

    // Read the entitlement once at launch, then keep listening. A renewal, an
    // expiry, or a restore performed elsewhere arrives through the listener
    // rather than through any call this screen makes.
    refreshEntitlement()
      .then(setStoreEntitled)
      .catch(() => setStoreEntitled(false));

    // Prices come from the store, not from this repo. `loadPlans` resolves to
    // null rather than throwing whenever the offering cannot be read, so the
    // household page falls back to the labelled placeholders instead of showing
    // an error to a patient who cannot act on it.
    loadPlans()
      .then(setStorePlans)
      .catch(() => setStorePlans(null));

    return onEntitlementChange(setStoreEntitled);
  }, []);

  // Live, because these render the controls the member is touching.
  const procedure = useMemo(
    () => data.procedures.find((item) => item.cpt === query.cpt) ?? data.procedures[0],
    [query.cpt],
  );

  const facilities = useMemo(
    () => procedure.payers[query.payer] ?? [],
    [procedure, query.payer],
  );

  const productOptions = useMemo(
    () => availableProducts(facilities),
    [facilities],
  );

  // Keep the indication valid when the procedure changes. A correction, not an
  // answer — hence `normalize`, which leaves `source` alone. Dispatching
  // `refine` here would let simply changing procedure relabel an untouched
  // example as the member's own figures.
  useEffect(() => {
    const options = procedure.indications;
    if (options.length === 0) {
      if (query.indication !== '') dispatch({ type: 'normalize', patch: { indication: '' } });
    } else if (!options.some((option) => option.key === query.indication)) {
      dispatch({ type: 'normalize', patch: { indication: options[0].key } });
    }
  }, [procedure, query.indication]);

  // Clear a plan type this payer does not publish, so a stale selection cannot
  // silently stop matching anything. Also a correction, not an answer.
  useEffect(() => {
    if (query.product && !productOptions.includes(query.product)) {
      dispatch({ type: 'normalize', patch: { product: undefined } });
    }
  }, [query.product, productOptions]);

  /**
   * The ranking, and the requirement check it depends on, from one deferred
   * query.
   *
   * Derived together inside a single memo rather than as four chained ones, so
   * the routes, the findings and the label describing them can never come from
   * different snapshots of the query while the deferred value is catching up.
   */
  const result = useMemo(() => {
    const q = deferredQuery;
    const proc = data.procedures.find((item) => item.cpt === q.cpt) ?? data.procedures[0];
    const facs = proc.payers[q.payer] ?? [];

    const facts: OrderFacts = {
      conservativeTherapyWeeks: q.treatmentWeeks,
      headacheConcerningFeature: q.headacheFeature,
    };

    // Kept apart from the unmet subset because "every recorded requirement is
    // met" and "no requirement is recorded for this payer and scan" both
    // produce zero unmet findings and mean entirely different things.
    const applicable = checkOrder(
      data.requirements,
      PAYER_LABELS[q.payer] ?? '',
      q.cpt,
      q.indication,
      facts,
    );
    const unmet = unmetFindings(applicable);

    const benefits: PlanBenefits = {
      deductibleRemaining: q.deductible,
      coinsuranceRate: q.coinsurance,
      oopMaxRemaining: 6000,
      copay: 0,
    };

    const routes = rankRoutes(
      buildRoutes({
        facilities: facs,
        benefits,
        expectedOtherAllowedSpend: q.expectedOtherSpend,
        memberPlan: memberPlanOf(q),
        unmetRequirements: unmet.map((finding) => finding.requirement),
        // Surfaced when the deductible is unlikely to be met, which is when the
        // missing credit costs the patient least.
        cashIsAppropriate: q.expectedOtherSpend < q.deductible,
      }),
    );

    return {
      routes,
      findings: unmet,
      applicable,
      procedureLabel: proc.label,
      payerLabel: PAYER_LABELS[q.payer] ?? '',
    };
  }, [deferredQuery]);

  const { routes, findings, applicable: applicableFindings } = result;

  const planMatch = useMemo(
    () => planMatchSummary(facilities, query.planText),
    [facilities, query.planText],
  );

  /**
   * One entry point for "become subscribed", wherever it is tapped from.
   *
   * The household step page shows the plans and pricing itself now, so this
   * only has to decide what happens when a plan is chosen: unlock locally in
   * demo mode, or hand off to the real RevenueCat paywall when a key is
   * configured. That handoff still opens the platform's own purchase screen —
   * no in-app page can substitute for the App Store's purchase sheet — but it
   * is the one remaining place this app shows a second screen for it.
   */
  /**
   * Open a worked example directly on its result.
   *
   * Every answer the scan and coverage steps collect is set at once and the
   * flow jumps to Routes. Nothing is faked on the way: the scenario supplies
   * the inputs a member would have typed, and the ranking is computed by the
   * shipped engine over the shipped rates exactly as for a real answer. See
   * src/demo.ts for why that matters.
   *
   * `headacheFeature` is set explicitly rather than left alone, so returning
   * home and choosing a second example cannot inherit an answer from the
   * first — the head CT question would otherwise stay answered from a previous
   * run and quietly change what the requirement check reports.
   */
  /**
   * Open a worked example.
   *
   * One dispatch rather than ten setters, and it deliberately does not mark the
   * query as the member's own — an example is still an example after it is
   * opened. `fromScenario` sets every field including the ones the scenario
   * does not mention, so an answer cannot survive from a previous example.
   */
  const applyScenario = useCallback((scenario: DemoScenario) => {
    dispatch({ type: 'example', scenario });
    setNote(null);
    setOpenRouteKind(null);
    setStep(0);
  }, []);

  /**
   * Hand the comparison to the system share sheet.
   *
   * `Share` is core React Native, so this costs no native module and no
   * rebuild — CLAUDE.md prefers a JS implementation wherever one is reasonable.
   *
   * A dismissed sheet is not an error and says nothing; a genuine failure says
   * so once rather than throwing into the render tree.
   */
  const shareComparison = useCallback(async () => {
    if (routes.length === 0) return;
    try {
      await Share.share({
        message: shareText({
          routes,
          // From the same snapshot the routes came from, so a share taken while
          // the deferred value is settling cannot label one query's ranking
          // with another query's scan.
          procedureLabel: result.procedureLabel,
          payerLabel: result.payerLabel,
          metro: data.metro,
        }),
      });
    } catch {
      setNote('Could not open the share sheet.');
    }
  }, [routes, result]);

  const startPlan = useCallback(
    async (planId: string) => {
      setNote(null);
      // No key, or a key whose offering could not be read. Either way there is
      // no real package to buy, so the demo unlock stands in — and the strip on
      // the household page says so on screen.
      if (!storeReady || !storePlans) {
        setDemoEntitled(true);
        return;
      }
      const outcome = await purchasePlan(planId);
      setStoreEntitled(outcome.entitled);
      setNote(outcome.message);
    },
    [storeReady, storePlans],
  );

  /**
   * One step back, and from the first step, home.
   *
   * Deliberately a single step rather than a jump straight to the landing
   * screen: a member on Routes who wants to change their deductible expects
   * back to reach Coverage, and losing their answers because "back" meant
   * "start over" is the kind of thing that makes people retype everything.
   * Home is still always reachable — it is simply the end of the chain, and
   * from the household page, which is a sibling of home rather than part of
   * the flow, it is one tap.
   */
  const backTarget =
    step === HOUSEHOLD_STEP || step === METHOD_STEP || step <= 0 ? -1 : step - 1;
  const backLabel = backTarget === -1 ? 'Home' : STEPS[backTarget];
  const goBack = useCallback(() => setStep(backTarget), [backTarget]);

  // The Android system back gesture should do what the on-screen control does.
  // No-op on iOS, and BackHandler is core React Native, so this costs no
  // rebuild. Returning false on the landing screen lets the OS close the app.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === -1) return false;
      setStep(backTarget);
      return true;
    });
    return () => subscription.remove();
  }, [step, backTarget]);

  /**
   * The two wizard steps' forward action, pinned rather than scrolled to.
   *
   * Measured on an iPhone SE: the coverage step's button sat two full screens
   * below the fold, behind three sliders. CLAUDE.md has recorded this failure
   * twice already ("the primary button at the bottom of a step becomes
   * unreachable and the flow dead-ends") and both previous fixes were to buy
   * vertical budget back — which only holds until the next control is added.
   * Taking the button out of the scroll entirely is the fix that does not
   * regress the next time a step grows.
   *
   * Only steps 0 and 1. The landing and household screens are destinations
   * whose buttons are their content, and the routes step is terminal.
   */
  const restore = useCallback(async () => {
    setNote(null);
    if (!storeReady) {
      setNote(
        'Restore needs a live store account. This build has none, so there is nothing to restore.',
      );
      return;
    }
    const outcome = await restorePurchases();
    setStoreEntitled(outcome.entitled);
    setNote(outcome.message);
  }, [storeReady]);

  // After every hook above, never before — conditionally skipping hooks on a
  // later render is the one thing that breaks React's hook order guarantee.
  if (!fontsLoaded) {
    return <View style={styles.safe} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      {step !== -1 && <TopBar backLabel={backLabel} onBack={goBack} />}
      {/* The plan-name field sits above the primary button, so without this the
          keyboard covers the way forward. Core React Native, no native module —
          see App mechanics in CLAUDE.md. */}
      <KeyboardAvoidingView
        style={styles.scrollView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      {/* flex: 1 is load-bearing. Without it the ScrollView sizes to its
          content rather than to the space left by the step bar, so it overflows
          the screen and never scrolls — the primary button simply becomes
          unreachable. It only looked fine while every step fitted on one
          screen. */}
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // Bounce even when content nearly fits. The scan step overflows by only
        // ~170pt, and without this a short drag springs back with no movement,
        // which reads as "this screen does not scroll" rather than "you are at
        // the end of it".
        alwaysBounceVertical
        showsVerticalScrollIndicator
      >
        {/* `key={step}` remounts the boundary on every step change, so a
            caught error from a previous step can never linger and mask the
            next screen's own render. */}
        <ErrorBoundary key={step} onReset={() => setStep(-1)}>
          {step === -1 && (
            <LandingStep
              onNext={() => setStep(0)}
              onHousehold={() => setStep(HOUSEHOLD_STEP)}
              onScenario={applyScenario}
              onMethod={() => setStep(METHOD_STEP)}
            />
          )}

          {step === METHOD_STEP && <MethodStep />}

          {step === HOUSEHOLD_STEP && (
            <HouseholdStep
              isSubscribed={isSubscribed}
              demo={demoEntitled}
              note={note}
              livePricing={storePlans !== null}
              plans={storePlans ?? DEMO_PLANS}
              onStart={startPlan}
              onRestore={restore}
            />
          )}

          {step === 0 && (
            <ScreenerScreen
              routes={routes}
              findings={findings}
              query={query}
              source={query.source}
              procedure={procedure}
              productOptions={productOptions}
              planMatch={planMatch}
              showTreatment={applicableFindings.some((finding) =>
                usesTreatmentWeeks(finding.requirement.check),
              )}
              showHeadacheFeature={applicableFindings.some((finding) =>
                readsField(finding.requirement.check, 'headache_concerning_feature'),
              )}
              filtersOpen={filtersOpen}
              openRouteKind={openRouteKind}
              requirementsChecked={applicableFindings.length}
              payerLabel={result.payerLabel}
              note={note}
              onToggleFilters={() => setFiltersOpen((open) => !open)}
              onOpenRoute={setOpenRouteKind}
              onRefine={refine}
              onExample={applyScenario}
              onShare={shareComparison}
              onMethod={() => setStep(METHOD_STEP)}
            />
          )}

        </ErrorBoundary>
      </ScrollView>

      </KeyboardAvoidingView>

      {/* Development only. Two flows have to be verifiable without a store
          account, and hunting for a hidden gesture to switch between them is how
          one of them stops being checked. Stripped from a release build by the
          same constant that strips the SDK's debug logging. */}
      {__DEV__ && (
        <DevTierSwitch
          subscribed={isSubscribed}
          onFree={() => {
            setDemoEntitled(false);
            setNote(null);
          }}
          onPro={() => {
            setDemoEntitled(true);
            setNote(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.canvas },
  scrollView: { flex: 1 },
  scroll: { paddingHorizontal: space.lg, paddingBottom: space.xl * 2 },

  // Sits on the canvas, separated from the scrolling content by a hairline —
  // the same divider weight used everywhere something merely divides. The
  // button keeps its slate tone: accent stays reserved for the recommended
  // route and the one landing CTA.
  // Unused since the screener answers on arrival and there is no step to
  // advance to. Kept because the pinned bar is the fix for a failure CLAUDE.md
  // has recorded twice — a primary button below the fold behind three sliders —
  // and the next screen needing one should not have to rediscover it. The
  // collapsed filter strip is the obvious next occupant if the ranked list ever
  // grows long enough to scroll it out of reach.
  actionBar: {
    borderTopWidth: stroke.hairline,
    borderTopColor: color.line,
    backgroundColor: color.canvas,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
});
