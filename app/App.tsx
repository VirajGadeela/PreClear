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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { PrimaryButton } from './src/components/PrimaryButton';
import { StepBar } from './src/components/StepBar';
import { TopBar } from './src/components/TopBar';
import { PlanBenefits } from './src/costing';
import { DEMO_SCENARIOS, DemoScenario } from './src/demo';
import { shareText } from './src/share';
import {
  configure as configurePurchases,
  onEntitlementChange,
  presentPaywall,
  refreshEntitlement,
  restore as restorePurchases,
} from './src/purchases';
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
import { CoverageStep } from './src/screens/CoverageStep';
import { HouseholdStep } from './src/screens/HouseholdStep';
import { LandingStep } from './src/screens/LandingStep';
import { MethodStep } from './src/screens/MethodStep';
import { RoutesStep } from './src/screens/RoutesStep';
import { ScanStep } from './src/screens/ScanStep';
import { color, space, stroke } from './src/theme';

/** Stable empty array, so the gated `routes` memo returns the same reference. */
const EMPTY_ROUTES: Route[] = [];

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
    'InstrumentSerif-Regular': InstrumentSerif_400Regular,
    'Manrope-SemiBold': Manrope_600SemiBold,
    'Manrope-Bold': Manrope_700Bold,
    'Manrope-ExtraBold': Manrope_800ExtraBold,
  });

  const [step, setStep] = useState(-1);
  const [cpt, setCpt] = useState('73721');
  const [indication, setIndication] = useState('meniscal_tear');
  const [payer, setPayer] = useState('anthem');
  // The plan, not the payer, sets the price — one Anthem facility publishes
  // five different rates for the same knee MRI. Undefined means "not sure",
  // which keeps the full published range rather than guessing one.
  const [product, setProduct] = useState<string | undefined>(undefined);
  // What is printed on the card. Free text because that is what
  // matchesMemberPlan was built for, and it pins an exact rate where the
  // product chips can only narrow to a type. Typed, never photographed, and
  // never stored — hard rules 1 and 3.
  const [planText, setPlanText] = useState('');

  // The typed name is more specific than the type, so it wins when present.
  const memberPlan = planText.trim() || (product ? product.toUpperCase() : undefined);
  const [deductible, setDeductible] = useState(2000);
  const [coinsurance, setCoinsurance] = useState(0.2);
  const [expectedOtherSpend, setExpectedOtherSpend] = useState(0);
  const [treatmentWeeks, setTreatmentWeeks] = useState(2);

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

    return onEntitlementChange(setStoreEntitled);
  }, []);

  const procedure = useMemo(
    () => data.procedures.find((item) => item.cpt === cpt) ?? data.procedures[0],
    [cpt],
  );

  // Keep the indication valid when the procedure changes.
  useEffect(() => {
    const options = procedure.indications;
    if (options.length === 0) {
      setIndication('');
    } else if (!options.some((option) => option.key === indication)) {
      setIndication(options[0].key);
    }
  }, [procedure, indication]);

  const facilities = useMemo(
    () => procedure.payers[payer] ?? [],
    [procedure, payer],
  );

  const productOptions = useMemo(
    () => availableProducts(facilities),
    [facilities],
  );

  // Clear a product this payer does not publish here, so a stale selection from
  // a previous payer cannot silently stop matching anything.
  useEffect(() => {
    if (product && !productOptions.includes(product)) {
      setProduct(undefined);
    }
  }, [product, productOptions]);

  // Left undefined until the patient says otherwise, so an unanswered question
  // reports as "not documented" rather than as a failed criterion.
  const [headacheFeature, setHeadacheFeature] = useState<boolean | undefined>(
    undefined,
  );

  const facts: OrderFacts = useMemo(
    () => ({
      conservativeTherapyWeeks: treatmentWeeks,
      headacheConcerningFeature: headacheFeature,
    }),
    [treatmentWeeks, headacheFeature],
  );

  // Kept separate from the unmet subset below, because "every recorded
  // requirement is met" and "no requirement is recorded for this payer and
  // scan" both produce zero unmet findings and mean entirely different things.
  // Route 3 is absent either way, so without this the app cannot say which.
  const applicableFindings = useMemo(
    () =>
      checkOrder(
        data.requirements,
        PAYER_LABELS[payer] ?? '',
        cpt,
        indication,
        facts,
      ),
    [payer, cpt, indication, facts],
  );

  const findings = useMemo(
    () => unmetFindings(applicableFindings),
    [applicableFindings],
  );

  const benefits: PlanBenefits = useMemo(
    () => ({
      deductibleRemaining: deductible,
      coinsuranceRate: coinsurance,
      oopMaxRemaining: 6000,
      copay: 0,
    }),
    [deductible, coinsurance],
  );

  /**
   * Only computed on the step that shows it.
   *
   * This is what made the sliders feel slow. A slider reports a value on every
   * touch-move, and each report re-ran `buildRoutes` and `rankRoutes` across
   * every facility — a full routing pass per frame, on a step that renders no
   * route. Gating on the step removes all of it, and the ranking is still ready
   * the instant the member arrives, because arriving is itself a step change.
   *
   * `routes` is read only by `RoutesStep`, so nothing else can observe this.
   */
  const showRoutes = step === 2;
  const routes = useMemo(() => {
    if (!showRoutes) return EMPTY_ROUTES;
    return rankRoutes(
      buildRoutes({
        facilities,
        benefits,
        expectedOtherAllowedSpend: expectedOtherSpend,
        memberPlan,
        unmetRequirements: findings.map((finding) => finding.requirement),
        // Surfaced when the deductible is unlikely to be met, which is when
        // the missing credit costs the patient least.
        cashIsAppropriate: expectedOtherSpend < deductible,
      }),
    );
  }, [
    showRoutes,
    facilities,
    benefits,
    expectedOtherSpend,
    deductible,
    findings,
    memberPlan,
  ]);

  const planMatch = useMemo(
    () => planMatchSummary(facilities, planText),
    [facilities, planText],
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
  const applyScenario = useCallback((scenario: DemoScenario) => {
    setCpt(scenario.cpt);
    setIndication(scenario.indication);
    setPayer(scenario.payer);
    setProduct(undefined);
    setPlanText(scenario.planText);
    setDeductible(scenario.deductible);
    setCoinsurance(scenario.coinsurance);
    setExpectedOtherSpend(scenario.expectedOtherSpend);
    setTreatmentWeeks(scenario.treatmentWeeks);
    setHeadacheFeature(scenario.headacheFeature);
    setNote(null);
    setStep(2);
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
          procedureLabel: procedure.label,
          payerLabel: PAYER_LABELS[payer] ?? '',
          metro: data.metro,
        }),
      });
    } catch {
      setNote('Could not open the share sheet.');
    }
  }, [routes, procedure, payer]);

  const startPlan = useCallback(async () => {
    setNote(null);
    if (!storeReady) {
      setDemoEntitled(true);
      return;
    }
    const outcome = await presentPaywall();
    setStoreEntitled(outcome.entitled);
    setNote(outcome.message);
  }, [storeReady]);

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
  const primaryAction =
    step === 0
      ? { label: 'Next: your coverage', onPress: () => setStep(1) }
      : step === 1
        ? { label: 'See my routes', onPress: () => setStep(2) }
        : null;

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
      {step >= 0 && <StepBar current={step} onJump={setStep} />}
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
              storeReady={storeReady}
              onStart={startPlan}
              onRestore={restore}
            />
          )}

          {step === 0 && (
            <ScanStep
              procedure={procedure}
              cpt={cpt}
              indication={indication}
              payer={payer}
              product={product}
              productOptions={productOptions}
              planText={planText}
              planMatch={planMatch}
              onCpt={setCpt}
              onIndication={setIndication}
              onPayer={setPayer}
              onProduct={setProduct}
              onPlanText={setPlanText}
            />
          )}

          {step === 1 && (
            <CoverageStep
              deductible={deductible}
              coinsurance={coinsurance}
              expectedOtherSpend={expectedOtherSpend}
              treatmentWeeks={treatmentWeeks}
              showTreatment={applicableFindings.some((finding) =>
                usesTreatmentWeeks(finding.requirement.check),
              )}
              headacheFeature={headacheFeature}
              showHeadacheFeature={applicableFindings.some((finding) =>
                readsField(finding.requirement.check, 'headache_concerning_feature'),
              )}
              onDeductible={setDeductible}
              onCoinsurance={setCoinsurance}
              onExpectedOtherSpend={setExpectedOtherSpend}
              onTreatmentWeeks={setTreatmentWeeks}
              onHeadacheFeature={setHeadacheFeature}
            />
          )}

          {step === 2 && (
            <RoutesStep
              routes={routes}
              findings={findings}
              isSubscribed={isSubscribed}
              note={note}
              onRestore={restore}
              onOpenHousehold={() => setStep(HOUSEHOLD_STEP)}
              onShare={shareComparison}
              onMethod={() => setStep(METHOD_STEP)}
              requirementsChecked={applicableFindings.length}
              payerLabel={PAYER_LABELS[payer] ?? ''}
            />
          )}
        </ErrorBoundary>
      </ScrollView>

      {/* Inside the KeyboardAvoidingView, after the ScrollView — so on the scan
          step the bar rides above the keyboard while the plan name is being
          typed, instead of being covered by it. */}
      {primaryAction && (
        <View style={styles.actionBar}>
          <PrimaryButton
            label={primaryAction.label}
            onPress={primaryAction.onPress}
            compact
          />
        </View>
      )}
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
  actionBar: {
    borderTopWidth: stroke.hairline,
    borderTopColor: color.line,
    backgroundColor: color.canvas,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
});
