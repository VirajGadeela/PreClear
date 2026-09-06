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
  InstrumentSerif_400Regular,
} from '@expo-google-fonts/instrument-serif';
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
  View,
} from 'react-native';
import { data, PAYER_LABELS } from './src/appData';
import { DevTierSwitch } from './src/components/DevTierSwitch';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { TabBar, Tab } from './src/components/TabBar';
import { TopBar } from './src/components/TopBar';
import { PlanBenefits } from './src/costing';
import { shareText } from './src/share';
import {
  INITIAL_QUERY,
  NOTHING_ANSWERED,
  ScreenerQuery,
  isComplete,
  memberPlanOf,
  queryReducer,
} from './src/screener';
import { ScreenerScreen } from './src/screens/ScreenerScreen';
import { type FilterGroup } from './src/screens/ScreenerFilters';
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
import { AboutScreen } from './src/screens/AboutScreen';
import { MethodStep } from './src/screens/MethodStep';
import { space, stroke } from './src/theme';
import { ThemeProvider, useStyles, useTheme } from './src/ThemeProvider';
import { themed } from './src/styles/themed';

/**
 * Where the app opens, and the only screen outside the tabs.
 *
 * It is a cover rather than a tab because it is read once and then not again:
 * it says what the app is for, and every route out of it leads into the tabs.
 * A tab that a member never returns to is a tab spending permanent space on a
 * one-time job.
 *
 * Not persisted, because nothing in this app is. It therefore shows on every
 * launch, which is right for a product whose central claim is counterintuitive
 * and worth restating.
 */

/**
 * The provider has to sit outside anything that reads the theme, and `App` is
 * the outermost thing there is — so the exported component is a wrapper and the
 * app itself is one level in. Nothing else changed shape.
 */
export default function App() {
  return (
    <ThemeProvider>
      <Preclear />
    </ThemeProvider>
  );
}

function Preclear() {
  const styles = useStyles(sheets);
  const { scheme } = useTheme();

  // Local weight files, not a variable font, so `type.ts`'s `fontFamily`
  // string names the exact weight it wants. Gating the whole app behind this
  // avoids a flash of the system font before Manrope arrives — the load is a
  // bundled local asset, not a network fetch, so this resolves in one frame
  // on every real launch.
  const [fontsLoaded] = useFonts({
    'InstrumentSerif-Regular': InstrumentSerif_400Regular,
    'Manrope-SemiBold': Manrope_600SemiBold,
    'Manrope-Bold': Manrope_700Bold,
    'Manrope-ExtraBold': Manrope_800ExtraBold,
  });

  const [tab, setTab] = useState<Tab>('screener');
  const [showAbout, setShowAbout] = useState(true);

  /**
   * Everything the screener asks, in one object — see `src/screener.ts` for
   * why it is a reducer and what `answered` guards.
   *
   * The field values are seeded from the first worked example, but `answered`
   * is all-false, so nothing ranks until the member has been through the three
   * groups. Seeding the *values* rather than zeroing them keeps every control
   * showing a plausible position the moment it is opened — a slider at zero and
   * a payer at none would make the first tap harder, not more honest, since
   * nothing is displayed as an answer until it is one.
   */
  const [query, dispatch] = useReducer(queryReducer, undefined, () => ({
    ...INITIAL_QUERY,
    source: 'empty' as const,
    answered: NOTHING_ANSWERED,
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
  // Open, with the first group expanded, because the screener now opens on a
  // question rather than on an answer. A collapsed strip above an empty screen
  // gives a member nothing to do; the point of removing the example ranking was
  // to be clearer, not emptier.
  const [filtersOpen, setFiltersOpen] = useState(true);
  // Which of the filter panel's three groups is open, at most one. Hoisted here
  // rather than held in `ScreenerFilters` for the same reason `openRouteKind`
  // is: Screener -> Household -> Screener is a common trip now, and losing the
  // group you had open every time you take it is a new annoyance.
  //
  // Starts closed. It opened on `scan` so the tab would not be a collapsed
  // strip above an empty screen, and adding the facility chips made that group
  // taller than a phone: the prompt naming the three questions sat below the
  // fold, so a member arriving met a form and none of the direction written
  // for that exact moment. The prompt is above the panel now and carries the
  // screen on its own, which is what makes closed the better default rather
  // than merely the shorter one. Three named rows also read as three things to
  // do, where one open group reads as one long form.
  const [openGroup, setOpenGroup] = useState<FilterGroup | null>(null);
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
   * Send each destination back to the top.
   *
   * One ScrollView renders every destination, so it keeps its offset when the
   * tab changes: scroll to the bottom of Sources, switch to Compare, and the
   * screener opens halfway down with its heading cut off. Nothing looks broken,
   * which is what makes it easy to miss.
   *
   * The trade this accepts: iOS convention is to preserve a scroll position per
   * tab, and one shared ScrollView cannot. Matching the previous behaviour is
   * the smaller surprise, and `selectTab` supplies the other half of the
   * convention — tapping the tab you are already on returns you to the top.
   */
  const scrollRef = useRef<ScrollView>(null);
  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);
  useEffect(scrollToTop, [tab, showAbout, scrollToTop]);

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

  /**
   * The out-of-pocket ceiling can never sit below the deductible.
   *
   * It is an invariant of every real plan — the deductible is a component of
   * the out-of-pocket maximum, so owing $6,250 of deductible with a $6,000
   * ceiling left is not a plan anyone can hold. Both engines now reject it, so
   * without this a member dragging the deductible past the ceiling would throw
   * rather than get an answer.
   *
   * `normalize`, not `refine`: raising the ceiling to keep the pair coherent is
   * a correction this app makes on the member's behalf, and it must not count
   * as them having answered the group.
   */
  /**
   * Drop the scheduled facility when it is not one of the ones on offer.
   *
   * The list changes with both the procedure and the payer, so a facility
   * chosen under Anthem for a knee MRI may publish nothing for a head CT. A
   * stale key would silently stop matching and the baseline would fall back to
   * the median with no sign on screen — which is the bug this input exists to
   * fix, returning by a side door.
   */
  useEffect(() => {
    if (
      query.orderedFacility !== undefined &&
      !facilities.some((facility) => facility.facility_key === query.orderedFacility)
    ) {
      dispatch({ type: 'normalize', patch: { orderedFacility: undefined } });
    }
  }, [facilities, query.orderedFacility]);

  useEffect(() => {
    if (query.oopMax < query.deductible) {
      dispatch({ type: 'normalize', patch: { oopMax: query.deductible } });
    }
  }, [query.oopMax, query.deductible]);

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
      oopMaxRemaining: q.oopMax,
      copay: 0,
    };

    const routes = rankRoutes(
      buildRoutes({
        facilities: facs,
        benefits,
        expectedOtherAllowedSpend: q.expectedOtherSpend,
        memberPlan: memberPlanOf(q),
        // The engine has accepted this from the start and the app never sent
        // it, so the baseline silently became the median-priced facility.
        orderedFacilityKey: q.orderedFacility,
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
   * Choosing a destination, including the one already showing.
   *
   * A second tap on the active tab scrolls it to the top rather than doing
   * nothing — iOS convention, and the only way back to the top of a long
   * Sources list without a long drag.
   */
  const selectTab = useCallback(
    (next: Tab) => {
      if (next === tab) {
        scrollToTop();
        return;
      }
      setTab(next);
    },
    [tab, scrollToTop],
  );

  /**
   * Android's back gesture, given a contract that matches the tabs.
   *
   * Deliberately no history stack. Android's own guidance for bottom
   * navigation is that back returns to the start destination rather than
   * retracing which tabs were visited, and a retracing stack is exactly what
   * makes a hand-rolled tab bar feel wrong. So: from the cover, let the OS
   * close the app; from any tab that is not the screener, go to the screener;
   * from the screener, back out to the cover.
   *
   * No-op on iOS, and BackHandler is core React Native, so this costs no
   * rebuild.
   */
  /**
   * Where back goes from here — one definition, used by the visible control and
   * by the hardware gesture.
   *
   * They were two implementations of one rule for as long as there was no
   * visible control, and the moment a button appeared they became a pair that
   * can disagree. A back button that goes somewhere the back gesture does not
   * is worse than no back button, because it teaches a wrong model of the app.
   *
   * Still no history stack: this is a rule about *where you are*, not about how
   * you got there. Any tab returns to the screener; the screener returns to the
   * cover; the cover is the root and yields to the OS.
   */
  const back = useMemo(() => {
    if (showAbout) return null;
    if (tab !== 'screener') {
      return { label: 'Compare', run: () => setTab('screener') };
    }
    return { label: 'About', run: () => setShowAbout(true) };
  }, [showAbout, tab]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!back) return false;
      back.run();
      return true;
    });
    return () => subscription.remove();
  }, [back]);

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
      {/* The bar's glyphs, not its background: `light` means light text, which
          is what a dark canvas needs. Getting this backwards leaves the clock
          and battery invisible, and it is invisible in a screenshot too — the
          simulator's status bar is drawn by the OS. */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {/* On every screen, cover included. The cover used to render no chrome
          at all, on the reasoning that it carries its own way forward and needs
          no navigation — which was right about navigation and wrong about the
          bar, because the bar also holds the theme toggle. A control that
          disappears on the first screen a member sees is a control they have to
          discover twice. The wordmark earns its place on a cold open anyway. */}
      <TopBar backLabel={back?.label} onBack={back?.run} />
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
        {/* Remounted per destination, so a caught error from one can never
            linger and mask the next screen's own render. Keyed on the cover as
            well as the tab, because the cover is a destination too. */}
        <ErrorBoundary
          key={showAbout ? 'about' : tab}
          onReset={() => {
            setShowAbout(true);
            setTab('screener');
          }}
        >
          {showAbout ? (
            <AboutScreen onNext={() => setShowAbout(false)}
            />
          ) : (
            <>
              {tab === 'screener' && (
                <ScreenerScreen
                  routes={routes}
                  findings={findings}
                  query={query}
                  procedure={procedure}
                  facilities={facilities}
                  productOptions={productOptions}
                  planMatch={planMatch}
                  showTreatment={applicableFindings.some((finding) =>
                    usesTreatmentWeeks(finding.requirement.check),
                  )}
                  showHeadacheFeature={applicableFindings.some((finding) =>
                    readsField(finding.requirement.check, 'headache_concerning_feature'),
                  )}
                  answered={deferredQuery.answered}
                  filtersOpen={filtersOpen}
                  openGroup={openGroup}
                  openRouteKind={openRouteKind}
                  requirementsChecked={applicableFindings.length}
                  payerLabel={result.payerLabel}
                  note={note}
                  onToggleFilters={() => setFiltersOpen((open) => !open)}
                  onOpenGroup={setOpenGroup}
                  onOpenRoute={setOpenRouteKind}
                  onRefine={refine}
                  onShare={shareComparison}
                  onMethod={() => setTab('sources')}
                />
              )}

              {tab === 'sources' && <MethodStep />}

              {tab === 'household' && (
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
            </>
          )}
        </ErrorBoundary>
      </ScrollView>

      </KeyboardAvoidingView>

      {/* Outside the KeyboardAvoidingView on purpose: a tab bar that rides up
          on the keyboard is the wrong behaviour on iOS, where the keyboard is
          expected to cover it. Hidden on the cover, which is not a tab. */}
      {!showAbout && <TabBar current={tab} onSelect={selectTab} />}

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

const sheets = themed((c) => ({
  safe: { flex: 1, backgroundColor: c.canvas },
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
    borderTopColor: c.line,
    backgroundColor: c.canvas,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
}));
