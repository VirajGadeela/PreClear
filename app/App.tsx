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
 */

import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import household from './assets/household-eobs.json';
import raw from './assets/preclear-data.json';
import { DemoPaywall } from './src/DemoPaywall';
import { Money } from './src/Money';
import { Slider } from './src/Slider';
import {
  Eob,
  HouseholdPlan,
  review,
  totalAtStake,
} from './src/claims';
import { PlanBenefits, money } from './src/costing';
import { PLAN_INCLUDES, PLAN_NAME } from './src/plan';
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
  statusLabel,
  unmetFindings,
  usesTreatmentWeeks,
} from './src/requirements';
import {
  FacilityBundle,
  Requirement,
  Route,
  availableProducts,
  buildRoutes,
  planMatchSummary,
  rankRoutes,
} from './src/routes';
import { color, radius, space, type } from './src/theme';

type Indication = { key: string; label: string };
type Procedure = {
  cpt: string;
  label: string;
  detail: string;
  indications: Indication[];
  payers: Record<string, FacilityBundle[]>;
};
type Bundle = {
  metro: string;
  procedures: Procedure[];
  requirements: Requirement[];
};

const data = raw as unknown as Bundle;

const PAYER_LABELS: Record<string, string> = {
  anthem: 'Anthem Blue Cross Blue Shield',
  unitedhealthcare: 'UnitedHealthcare',
  aetna: 'Aetna',
  cigna: 'Cigna',
};

const STEPS = ['Scan', 'Coverage', 'Routes', 'Household'] as const;

/**
 * The paid step. Always reachable, whether or not it is unlocked — a member has
 * to be able to see what the plan is before being asked to pay for it, and a
 * subscriber has to be able to get back to their claims without walking the
 * whole scan flow again.
 */
const HOUSEHOLD_STEP = STEPS.length - 1;

export default function App() {
  const [step, setStep] = useState(0);
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
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const isSubscribed = storeEntitled || demoEntitled;

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

  const routes = useMemo(
    () =>
      rankRoutes(
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
      ),
    [facilities, benefits, expectedOtherSpend, deductible, findings, memberPlan],
  );

  const planMatch = useMemo(
    () => planMatchSummary(facilities, planText),
    [facilities, planText],
  );

  /**
   * One entry point for "show me the plan", wherever it is tapped from.
   *
   * Which paywall appears is decided here and nowhere else: the real
   * RevenueCat sheet when a key is configured, the demo sheet otherwise. When
   * the store side is finished, this condition starts choosing the other branch
   * on its own and no caller changes.
   */
  const unlock = useCallback(async () => {
    setNote(null);
    if (!storeReady) {
      setPaywallOpen(true);
      return;
    }
    const outcome = await presentPaywall();
    setStoreEntitled(outcome.entitled);
    setNote(outcome.message);
    if (outcome.entitled) setStep(HOUSEHOLD_STEP);
  }, [storeReady]);

  /** The demo sheet's button. Unlocks nothing outside this device. */
  const startDemo = useCallback(() => {
    setDemoEntitled(true);
    setPaywallOpen(false);
    setNote(null);
    setStep(HOUSEHOLD_STEP);
  }, []);

  const restore = useCallback(async () => {
    setNote(null);
    if (!storeReady) {
      setPaywallOpen(false);
      setNote(
        'Restore needs a live store account. This build has none, so there is nothing to restore.',
      );
      return;
    }
    const outcome = await restorePurchases();
    setStoreEntitled(outcome.entitled);
    setNote(outcome.message);
  }, [storeReady]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <TopBar
        subscribed={isSubscribed}
        onPress={() => (isSubscribed ? setStep(HOUSEHOLD_STEP) : unlock())}
      />
      <StepBar current={step} onJump={setStep} />
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
            onNext={() => setStep(1)}
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
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <RoutesStep
            routes={routes}
            findings={findings}
            isSubscribed={isSubscribed}
            note={note}
            onUnlock={unlock}
            onRestore={restore}
            onOpenHousehold={() => setStep(HOUSEHOLD_STEP)}
            requirementsChecked={applicableFindings.length}
            payerLabel={PAYER_LABELS[payer] ?? ''}
          />
        )}

        {step === HOUSEHOLD_STEP && (
          <HouseholdStep
            isSubscribed={isSubscribed}
            demo={demoEntitled}
            note={note}
            onUnlock={unlock}
            onRestore={restore}
          />
        )}
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

      <DemoPaywall
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onStart={startDemo}
        onRestore={restore}
      />
    </SafeAreaView>
  );
}

/**
 * Always-visible plan status.
 *
 * The household plan used to be reachable only by scrolling to the bottom of
 * the results, which meant it did not exist until the member had already
 * finished the free thing. This sits above every step: it names the tier, and
 * tapping it either opens the plan or jumps a subscriber to their claims.
 */
function TopBar({
  subscribed,
  onPress,
}: {
  subscribed: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.topBar}>
      <Text style={styles.brand}>Preclear</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          subscribed
            ? `${PLAN_NAME} active. Open your household claims.`
            : `See ${PLAN_NAME}, the paid plan.`
        }
        onPress={onPress}
        style={({ pressed }) => [
          styles.tierPill,
          subscribed && styles.tierPillActive,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={[styles.tierText, subscribed && styles.tierTextActive]}>
          {subscribed ? 'Household plan' : 'See household plan'}
        </Text>
      </Pressable>
    </View>
  );
}

/** Free/Pro switch for testing. `__DEV__` only — see the call site. */
function DevTierSwitch({
  subscribed,
  onFree,
  onPro,
}: {
  subscribed: boolean;
  onFree: () => void;
  onPro: () => void;
}) {
  return (
    <View style={styles.devBar}>
      <Text style={styles.devLabel}>Testing</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: !subscribed }}
        onPress={onFree}
        style={[styles.devChip, !subscribed && styles.devChipOn]}
      >
        <Text style={[styles.devChipText, !subscribed && styles.devChipTextOn]}>
          Free
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: subscribed }}
        onPress={onPro}
        style={[styles.devChip, subscribed && styles.devChipOn]}
      >
        <Text style={[styles.devChipText, subscribed && styles.devChipTextOn]}>
          Household
        </Text>
      </Pressable>
    </View>
  );
}

function StepBar({
  current,
  onJump,
}: {
  current: number;
  onJump: (step: number) => void;
}) {
  return (
    <View style={styles.stepBar}>
      {STEPS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        // The scan flow stays sequential — a route ranking before the coverage
        // questions would be answering with defaults the member never saw. The
        // household step is exempt: it is not a later part of this flow, it is a
        // different part of the app.
        const locked = index > current && index !== HOUSEHOLD_STEP;
        return (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: locked }}
            accessibilityLabel={
              done ? `${label}, completed, tap to change` : label
            }
            disabled={locked}
            onPress={() => onJump(index)}
            style={styles.stepItem}
          >
            <View
              style={[
                styles.stepDot,
                active && styles.stepDotActive,
                done && styles.stepDotDone,
              ]}
            >
              <Text style={[styles.stepNumber, active && styles.stepNumberActive]}>
                {index + 1}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              style={[
                styles.stepLabel,
                active && styles.stepLabelActive,
                locked && styles.stepLabelPending,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ScanStep({
  procedure,
  cpt,
  indication,
  payer,
  product,
  productOptions,
  planText,
  planMatch,
  onCpt,
  onIndication,
  onPayer,
  onProduct,
  onPlanText,
  onNext,
}: {
  procedure: Procedure;
  cpt: string;
  indication: string;
  payer: string;
  product: string | undefined;
  productOptions: string[];
  planText: string;
  planMatch: { matched: number; total: number } | null;
  onCpt: (value: string) => void;
  onIndication: (value: string) => void;
  onPayer: (value: string) => void;
  onProduct: (value: string | undefined) => void;
  onPlanText: (value: string) => void;
  onNext: () => void;
}) {
  return (
    <View>
      <Text style={styles.h1}>What scan was ordered?</Text>
      <View style={styles.chipWrap}>
        {data.procedures.map((item) => (
          <Chip
            key={item.cpt}
            selected={item.cpt === cpt}
            label={item.label}
            onPress={() => onCpt(item.cpt)}
          />
        ))}
      </View>
      <Text style={styles.caption}>{procedure.detail} · CPT {procedure.cpt}</Text>

      {procedure.indications.length > 0 && (
        <>
          <Text style={styles.h2}>Why was it ordered?</Text>
          <View style={styles.chipWrap}>
            {procedure.indications.map((option) => (
              <Chip
                key={option.key}
                selected={option.key === indication}
                label={option.label}
                onPress={() => onIndication(option.key)}
              />
            ))}
          </View>
        </>
      )}

      <Text style={styles.h2}>Your insurer</Text>
      <View style={styles.chipWrap}>
        {Object.keys(PAYER_LABELS).map((key) => (
          <Chip
            key={key}
            selected={key === payer}
            label={key === 'anthem' ? 'Anthem BCBS' : PAYER_LABELS[key]}
            onPress={() => onPayer(key)}
          />
        ))}
      </View>

      {/* The plan sets the price, not the payer. Product type is asked for
          because it is the one plan fact a member can read off their card and
          answer correctly — the published plan strings differ by campus and
          contract suffix and match nothing a patient would recognise. */}
      {productOptions.length > 1 && (
        <>
          <Text style={styles.h2}>Your plan type</Text>
          <View style={styles.chipWrap}>
            {productOptions.map((option) => (
              <Chip
                key={option}
                selected={option === product}
                label={option.toUpperCase()}
                onPress={() => onProduct(option === product ? undefined : option)}
              />
            ))}
            <Chip
              label="Not sure"
              selected={product === undefined}
              onPress={() => onProduct(undefined)}
            />
          </View>
          <Text style={styles.caption}>
            It is on your insurance card. Not sure keeps every rate your insurer
            publishes here, which is a wider range.
          </Text>
        </>
      )}

      {/* The plan name pins one rate where the type above can only narrow to a
          group. Typed rather than photographed: reading the card needs a camera
          and an OCR module, and the image is the one object in this product
          that hard rule 3 has to govern. Nothing here is stored. */}
      <Text style={styles.h2}>Plan name on your card</Text>
      <TextInput
        value={planText}
        onChangeText={onPlanText}
        placeholder="e.g. Blue Access PPO"
        placeholderTextColor={color.inkMuted}
        autoCorrect={false}
        autoCapitalize="words"
        accessibilityLabel="Plan name as printed on your insurance card, optional"
        style={styles.input}
      />
      {planMatch ? (
        <Text style={planMatch.matched === 0 ? styles.inputWarn : styles.caption}>
          {planMatch.matched === 0
            ? 'No published plan matches that name, so every rate is still being shown. Check the spelling, or leave it blank.'
            : `Matches published plans at ${planMatch.matched} of ${planMatch.total} facilities.`}
        </Text>
      ) : (
        <Text style={styles.caption}>
          Optional. More exact than the plan type — it pins the single rate your
          plan is charged rather than a range.
        </Text>
      )}

      <PrimaryButton label="Next: your coverage" onPress={onNext} />
    </View>
  );
}

function CoverageStep({
  deductible,
  coinsurance,
  expectedOtherSpend,
  treatmentWeeks,
  showTreatment,
  headacheFeature,
  showHeadacheFeature,
  onDeductible,
  onCoinsurance,
  onExpectedOtherSpend,
  onTreatmentWeeks,
  onHeadacheFeature,
  onNext,
}: {
  deductible: number;
  coinsurance: number;
  expectedOtherSpend: number;
  treatmentWeeks: number;
  showTreatment: boolean;
  headacheFeature: boolean | undefined;
  showHeadacheFeature: boolean;
  onDeductible: (value: number) => void;
  onCoinsurance: (value: number) => void;
  onExpectedOtherSpend: (value: number) => void;
  onTreatmentWeeks: (value: number) => void;
  onHeadacheFeature: (value: boolean | undefined) => void;
  onNext: () => void;
}) {
  return (
    <View>
      <Text style={styles.h1}>Your coverage</Text>
      <Text style={styles.caption}>From your plan documents. Nothing is stored.</Text>

      <View style={styles.sliderBlock}>
        <Slider
          label="Deductible remaining"
          value={deductible}
          minimum={0}
          maximum={10000}
          step={250}
          onChange={onDeductible}
          format={money}
        />
        <Slider
          label="Coinsurance after deductible"
          value={coinsurance}
          minimum={0}
          maximum={0.5}
          step={0.05}
          onChange={onCoinsurance}
          format={(value) => `${Math.round(value * 100)}%`}
        />
        <Slider
          label="Other care you expect this year"
          value={expectedOtherSpend}
          minimum={0}
          maximum={20000}
          step={500}
          onChange={onExpectedOtherSpend}
          format={money}
        />
        {showTreatment && (
          <Slider
            label="Weeks of treatment so far"
            value={treatmentWeeks}
            minimum={0}
            maximum={12}
            step={1}
            onChange={onTreatmentWeeks}
            format={(value) => `${value} ${value === 1 ? 'week' : 'weeks'}`}
          />
        )}
      </View>

      {/* Three states, not two. Neither chip selected means the order does not
          record this, which is the common case and reads as "not documented"
          rather than as a criterion the order failed. Tapping a selected chip
          clears it back to unanswered. */}
      {showHeadacheFeature && (
        <View style={styles.featureBlock}>
          <Text style={styles.rowLabel}>
            Does the order document a concerning headache feature?
          </Text>
          <Text style={styles.caption}>
            For example sudden severe onset, a change in pattern, a new headache
            after age 50, or an abnormal neurological exam. Your insurer
            publishes the full list.
          </Text>
          <View style={styles.chipWrap}>
            <Chip
              label="Yes"
              selected={headacheFeature === true}
              onPress={() =>
                onHeadacheFeature(headacheFeature === true ? undefined : true)
              }
            />
            <Chip
              label="No"
              selected={headacheFeature === false}
              onPress={() =>
                onHeadacheFeature(headacheFeature === false ? undefined : false)
              }
            />
          </View>
        </View>
      )}

      <PrimaryButton label="See my routes" onPress={onNext} />
    </View>
  );
}

/**
 * The finding, in one sentence, computed for this patient.
 *
 * This is the whole product and it has to land before anyone reads a card. It
 * deliberately names both numbers when they disagree, because the disagreement
 * is the point.
 */
function Headline({ routes }: { routes: Route[] }) {
  const cash = routes.find((route) => route.kind === 'cash_non_contracted');
  const insured = routes.find((route) => route.kind !== 'cash_non_contracted');

  if (cash && insured) {
    const todayGap = insured.estimate.scan.patientPays - cash.estimate.scan.patientPays;
    const yearGap = cash.estimate.totalThisYear - insured.estimate.totalThisYear;

    if (todayGap > 0.01 && yearGap > 0.01) {
      return (
        <View style={styles.hero}>
          <Text style={styles.heroLead}>Paying cash saves</Text>
          <Money value={todayGap} size="hero" tone="accent" />
          <Text style={styles.heroLead}>today, and costs</Text>
          <Money value={yearGap} size="hero" tone="accent" />
          <Text style={styles.heroLead}>more by the end of this year.</Text>
          <Text style={styles.heroWhy}>
            Cash earns no deductible credit, so your later care starts from
            scratch.
          </Text>
        </View>
      );
    }
    if (todayGap > 0.01) {
      return (
        <View style={styles.hero}>
          <Text style={styles.heroLead}>Paying cash saves</Text>
          <Money value={todayGap} size="hero" tone="accent" />
          <Text style={styles.heroLead}>today and stays cheaper this year.</Text>
          <Text style={styles.heroWhy}>
            You are not expected to reach your deductible, so the missing credit
            costs you little.
          </Text>
        </View>
      );
    }
  }

  const spread =
    routes.length > 1
      ? routes[routes.length - 1].estimate.totalThisYear -
        routes[0].estimate.totalThisYear
      : 0;
  if (spread > 0.01) {
    return (
      <View style={styles.hero}>
        <Text style={styles.heroLead}>Same scan, same coverage.</Text>
        <Money value={spread} size="hero" tone="accent" />
        <Text style={styles.heroLead}>separates your best and worst option.</Text>
      </View>
    );
  }
  return null;
}

function RoutesStep({
  routes,
  findings,
  isSubscribed,
  note,
  onUnlock,
  onRestore,
  onOpenHousehold,
  requirementsChecked,
  payerLabel,
}: {
  routes: Route[];
  findings: { requirement: Requirement; status: string }[];
  isSubscribed: boolean;
  note: string | null;
  onUnlock: () => void;
  onRestore: () => void;
  onOpenHousehold: () => void;
  requirementsChecked: number;
  payerLabel: string;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (routes.length === 0) {
    return (
      <View>
        <Text style={styles.h1}>No routes to compare</Text>
        <Text style={styles.body}>
          No facility here publishes a usable price for this insurer and scan.
          That is a gap in the published data, not a sign that no options exist.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <Headline routes={routes} />
      {/* Every route is free. The comparison is the hook, and a scan happens
          every few years — what recurs is claims, which is what the household
          plan below watches. */}
      {routes.map((route, index) => (
        <RouteCard
          key={route.kind}
          route={route}
          recommended={index === 0}
          expanded={open === route.kind}
          findings={findings}
          onToggle={() => setOpen(open === route.kind ? null : route.kind)}
        />
      ))}

      {/* The results screen advertises the plan; it does not contain it. The
          review itself lives on its own step, so a subscriber is not made to
          re-answer the scan questions to reach the thing they pay for. */}
      <PlanOffer
        subscribed={isSubscribed}
        onUnlock={onUnlock}
        onOpenHousehold={onOpenHousehold}
      />

      {/* Route 3 is missing whenever nothing is unmet, but "nothing is unmet"
          and "nothing is recorded" are different answers and the patient cannot
          tell them apart. Saying so is the honest output — CLAUDE.md treats a
          silent gap as worse than an admitted one. */}
      {requirementsChecked === 0 && (
        <View style={styles.coverageGap}>
          <Text style={styles.coverageGapText}>
            No published requirements are recorded for {payerLabel} for this
            scan, so no order check was run. That is a gap in this app's rule
            set, not a sign that the order has none.
          </Text>
        </View>
      )}

      {/* App Store review requires a restore path, and it is the only way a
          member who reinstalls gets their entitlement back. */}
      {!isSubscribed && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Restore a previous purchase"
          onPress={onRestore}
          style={styles.restore}
        >
          <Text style={styles.restoreText}>Restore purchase</Text>
        </Pressable>
      )}

      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

function RouteCard({
  route,
  recommended,
  expanded,
  findings,
  onToggle,
}: {
  route: Route;
  recommended: boolean;
  expanded: boolean;
  findings: { requirement: Requirement; status: string }[];
  onToggle: () => void;
}) {
  const statusFor = (key: string) =>
    findings.find((finding) => finding.requirement.key === key)?.status ?? 'unmet';

  return (
    <View style={[styles.card, recommended && styles.cardRecommended]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${route.label} at ${route.facilityName}. Tap for the breakdown.`}
        onPress={onToggle}
      >
        <Text style={styles.routeLabel}>{route.label}</Text>

        <Money
          value={route.estimate.totalThisYear}
          size="large"
          tone={recommended ? 'accent' : 'ink'}
        />

        <View style={styles.whyRow}>
          <Text style={styles.why} numberOfLines={expanded ? undefined : 2}>
            {route.estimate.scan.countsTowardDeductible
              ? 'Counts toward your deductible.'
              : 'Earns no deductible credit.'}
          </Text>
          <Text style={styles.chevron}>{expanded ? 'Hide' : 'Details'}</Text>
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.details}>
          <Row label="Facility" value={<Text style={styles.rowValue}>{route.facilityName}</Text>} />
          <Row label="This scan" value={<Money value={route.estimate.scan.patientPays} />} />
          <Row
            label="Deductible credit"
            value={<Money value={route.estimate.deductibleCreditEarned} />}
          />
          <Row
            label="Other care after this"
            value={<Money value={route.estimate.expectedOtherCareCost} />}
          />
          <Row
            label="Requirements not documented"
            value={
              <Text style={styles.rowValue}>{route.unmetRequirements.length}</Text>
            }
          />

          {route.warnings.map((warning) => (
            <Text key={warning} style={styles.warning}>
              {warning}
            </Text>
          ))}

          {route.unmetRequirements.map((requirement) => (
            <View key={requirement.key} style={styles.requirement}>
              <Text style={styles.requirementStatus}>
                {statusLabel(statusFor(requirement.key) as any)}
              </Text>
              <Text style={styles.detailSummary}>{requirement.summary}</Text>
              <Text style={styles.citation}>
                {requirement.payer} · {requirement.section_id} · {requirement.version}
              </Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => Linking.openURL(requirement.source_url)}
              >
                <Text style={styles.link}>Source document</Text>
              </Pressable>
              {requirement.alternative_pathway && (
                <Text style={styles.detailHedge}>
                  One of several alternative criteria; another may apply instead.
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * What the household plan actually does, before anyone is asked to buy it.
 *
 * Tapping straight through to the purchase sheet asked for money before saying
 * what it was for, so this expands in place first. The lines come from
 * `src/plan.ts`, and each one names a check that exists in `src/claims.ts` — if
 * a claim is made here, the engine performs it.
 *
 * No price appears on this card. Pricing belongs on the paywall, where the term
 * being bought is on screen next to it.
 */
function PlanOffer({
  subscribed,
  onUnlock,
  onOpenHousehold,
}: {
  subscribed: boolean;
  onUnlock: () => void;
  onOpenHousehold: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (subscribed) {
    return (
      <View style={[styles.lock, styles.lockActive]}>
        <Text style={styles.lockTitle}>{PLAN_NAME} is active</Text>
        <Text style={styles.lockBody}>
          Your household's claims are being checked against their own numbers.
        </Text>
        <PrimaryButton label="Open household review" onPress={onOpenHousehold} />
      </View>
    );
  }

  return (
    <View style={styles.lock}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
      >
        <Text style={styles.lockTitle}>Watch the whole household</Text>
        <Text style={styles.lockBody}>
          Every bill and explanation of benefits that arrives, checked against
          its own numbers all year.
        </Text>
        <Text style={styles.lockCta}>{open ? 'Hide' : "What's included"}</Text>
      </Pressable>

      {open && (
        <View style={styles.planDetail}>
          {PLAN_INCLUDES.map((line) => (
            <View key={line} style={styles.planRow}>
              <Text style={styles.planBullet}>·</Text>
              <Text style={styles.planLine}>{line}</Text>
            </View>
          ))}
          <Text style={styles.planCaveat}>
            Findings are discrepancies these documents show against themselves.
            They are not predictions about what your insurer will decide.
          </Text>
          <PrimaryButton label="See plans and pricing" onPress={onUnlock} />
        </View>
      )}
    </View>
  );
}

/**
 * The paid step, in both states.
 *
 * Unlocked, it is the household review. Locked, it is the same page with the
 * plan described in full and a way to buy it — not an empty screen and not a
 * teaser. Someone deciding whether to pay should be able to read everything the
 * plan does without paying first.
 */
function HouseholdStep({
  isSubscribed,
  demo,
  note,
  onUnlock,
  onRestore,
}: {
  isSubscribed: boolean;
  demo: boolean;
  note: string | null;
  onUnlock: () => void;
  onRestore: () => void;
}) {
  if (isSubscribed) {
    return (
      <View>
        <Text style={styles.h1}>Your household</Text>
        {/* A demo unlock must never be mistaken for a purchase. */}
        {demo && (
          <View style={styles.coverageGap}>
            <Text style={styles.coverageGapText}>
              Unlocked in demo mode. No purchase was made and nothing was
              charged.
            </Text>
          </View>
        )}
        <HouseholdReview />
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.h1}>{PLAN_NAME}</Text>
      <Text style={styles.body}>
        A scan happens every few years. Bills arrive all year, for everyone on
        the plan. This is the part that keeps working after the comparison is
        done.
      </Text>

      <View style={styles.planDetailPlain}>
        {PLAN_INCLUDES.map((line) => (
          <View key={line} style={styles.planRow}>
            <Text style={styles.planBullet}>·</Text>
            <Text style={styles.planLine}>{line}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.planCaveat}>
        Findings are discrepancies these documents show against themselves. They
        are not predictions about what your insurer will decide, and the amounts
        are what is in dispute rather than what will be refunded.
      </Text>

      <PrimaryButton label="See plans and pricing" onPress={onUnlock} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Restore a previous purchase"
        onPress={onRestore}
        style={styles.restore}
      >
        <Text style={styles.restoreText}>Restore purchase</Text>
      </Pressable>

      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

/**
 * The subscription tier: the household's claims, checked against themselves.
 *
 * Findings are discrepancies the documents demonstrate — arithmetic that does
 * not reconcile, a service billed twice, a denial that carries appeal rights.
 * None of them predicts what the payer will do, and the total is what is at
 * stake rather than what will be recovered.
 *
 * The claims are synthetic fixtures. Nothing real is read, stored or sent.
 */
function HouseholdReview() {
  const findings = useMemo(
    () => review(household.eobs as Eob[], household.plan as HouseholdPlan),
    [],
  );
  const atStake = useMemo(() => totalAtStake(findings), [findings]);

  // Grouped by claim, because two checks routinely catch the same claim from
  // different directions — a balance bill almost always fails the components
  // check too. Listed separately they read as two separate recoveries, and a
  // member would add them up. The card shows the amount once, at the largest
  // finding, which is the same rule totalAtStake uses.
  const byClaim = useMemo(() => {
    const groups: { claimId: string; member: string; amount: number | null; reasons: string[]; actions: string[] }[] = [];
    for (const finding of findings) {
      const existing = groups.find((group) => group.claimId === finding.claim_id);
      if (existing) {
        existing.amount =
          finding.amount === null
            ? existing.amount
            : Math.max(existing.amount ?? 0, finding.amount);
        existing.reasons.push(finding.summary);
        if (!existing.actions.includes(finding.action)) {
          existing.actions.push(finding.action);
        }
      } else {
        groups.push({
          claimId: finding.claim_id,
          member: finding.member,
          amount: finding.amount,
          reasons: [finding.summary],
          actions: [finding.action],
        });
      }
    }
    return groups;
  }, [findings]);

  return (
    <View style={styles.household}>
      {/* No heading of its own — the step it sits on already carries one. */}
      <Text style={styles.caption}>
        {household.eobs.length} claims reviewed · {byClaim.length}{' '}
        {byClaim.length === 1 ? 'claim to question' : 'claims to question'}
      </Text>
      {atStake > 0 && <Money value={atStake} size="large" tone="accent" />}

      {byClaim.map((group) => (
        <View key={group.claimId} style={styles.finding}>
          <Text style={styles.findingHead}>
            {group.member} · {group.claimId}
            {group.amount !== null ? ` · ${money(group.amount)}` : ''}
          </Text>
          {group.reasons.map((reason) => (
            <Text key={reason} style={styles.detailSummary}>
              {reason}
            </Text>
          ))}
          {group.actions.map((action) => (
            <Text key={action} style={styles.citation}>
              {action}
            </Text>
          ))}
        </View>
      ))}

      <Text style={styles.caption}>
        Sample claims, shown so the review can be seen working. Amounts are
        estimates of what is in dispute, not of what will be refunded.
      </Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {value}
    </View>
  );
}

function Chip({
  selected,
  label,
  onPress,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.canvas },
  scrollView: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    gap: space.md,
  },
  brand: { ...type.title, color: color.ink },
  tierPill: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.accent,
    paddingHorizontal: space.md,
    minHeight: 36,
    justifyContent: 'center',
  },
  tierPillActive: { backgroundColor: color.accent },
  tierText: { ...type.label, color: color.accent },
  tierTextActive: { color: color.accentInk },

  // Sits outside the ScrollView, so it is reachable from every step without
  // scrolling. Development builds only.
  devBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.line,
    backgroundColor: color.surface,
  },
  devLabel: { ...type.caption, color: color.inkMuted, marginRight: space.xs },
  devChip: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
  },
  devChipOn: { backgroundColor: color.slate, borderColor: color.slate },
  devChipText: { ...type.caption, color: color.inkMuted },
  devChipTextOn: { color: color.surface, fontWeight: '700' },

  scroll: { paddingHorizontal: space.lg, paddingBottom: space.xl * 2 },

  stepBar: {
    flexDirection: 'row',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    // Four steps now, so the generous gap no longer fits across a phone.
    gap: space.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    flexShrink: 1,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.line,
  },
  stepDotActive: { backgroundColor: color.accent },
  stepDotDone: { backgroundColor: color.slate },
  stepNumber: { ...type.caption, fontWeight: '700', color: color.inkMuted },
  stepNumberActive: { color: color.accentInk },
  stepLabel: { ...type.label, color: color.inkMuted },
  stepLabelActive: { color: color.ink },
  stepLabelPending: { opacity: 0.45 },

  h1: { ...type.hero, color: color.ink, marginTop: space.lg, marginBottom: space.sm },
  h2: { ...type.title, color: color.ink, marginTop: space.xl, marginBottom: space.md },
  body: { ...type.body, color: color.inkMuted, marginBottom: space.md },
  caption: { ...type.caption, color: color.inkMuted, marginBottom: space.md },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  featureBlock: { marginTop: space.lg, gap: space.sm },

  input: {
    ...type.body,
    color: color.ink,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.line,
    paddingHorizontal: space.md,
    minHeight: 48,
    marginBottom: space.sm,
  },
  // Brown, matching the data-quality flags. A name that matches nothing is a
  // limit of the published data, not an error the patient made.
  inputWarn: { ...type.caption, color: color.flag },
  chip: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.line,
    backgroundColor: color.surface,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
  },
  chipSelected: { borderColor: color.slate, backgroundColor: color.slate },
  chipText: { ...type.label, color: color.ink },
  chipTextSelected: { color: color.surface },

  sliderBlock: { marginTop: space.lg },

  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.slate,
    borderRadius: radius.md,
    marginTop: space.xl,
    minHeight: 52,
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { ...type.body, fontWeight: '700', color: color.surface },

  hero: { marginTop: space.lg, marginBottom: space.lg },
  heroLead: { ...type.title, color: color.ink, marginVertical: 2 },
  heroWhy: { ...type.body, color: color.inkMuted, marginTop: space.md },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.line,
    padding: space.md + 2,
    marginBottom: space.md,
  },
  cardRecommended: { borderColor: color.accent, backgroundColor: color.accentSoft },
  routeLabel: { ...type.caption, fontWeight: '700', color: color.inkMuted },

  whyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
    marginTop: space.sm,
  },
  why: { ...type.caption, color: color.inkMuted, flex: 1 },
  chevron: { ...type.label, color: color.slate },

  details: { borderTopWidth: 1, borderTopColor: color.line, marginTop: space.md, paddingTop: space.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  rowLabel: { ...type.caption, color: color.inkMuted },
  rowValue: { ...type.caption, color: color.ink, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  warning: {
    ...type.caption,
    color: color.flag,
    backgroundColor: color.flagBg,
    borderRadius: radius.sm,
    padding: space.sm,
    marginTop: space.sm,
  },

  requirement: { borderTopWidth: 1, borderTopColor: color.line, marginTop: space.md, paddingTop: space.md },
  requirementStatus: { ...type.caption, fontWeight: '700', color: color.flag },
  detailSummary: { ...type.caption, color: color.ink, marginTop: space.xs },
  citation: { ...type.caption, color: color.inkMuted, marginTop: space.xs },
  link: { ...type.caption, fontWeight: '700', color: color.accent, marginTop: space.xs },
  detailHedge: { ...type.caption, color: color.inkMuted, marginTop: space.xs },

  household: { marginTop: space.md, gap: space.sm },
  finding: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    padding: space.md,
  },
  findingHead: { ...type.label, color: color.ink },

  lock: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.line,
    padding: space.md + 2,
  },
  lockActive: {
    borderStyle: 'solid',
    borderColor: color.accent,
    backgroundColor: color.accentSoft,
  },
  lockTitle: { ...type.body, fontWeight: '700', color: color.ink },
  lockBody: { ...type.caption, color: color.inkMuted, marginTop: space.xs },
  lockCta: { ...type.label, color: color.accent, marginTop: space.sm },
  planDetail: {
    borderTopWidth: 1,
    borderTopColor: color.line,
    marginTop: space.md,
    paddingTop: space.md,
    gap: space.sm,
  },
  planDetailPlain: { marginTop: space.md, gap: space.sm },
  planRow: { flexDirection: 'row', gap: space.sm },
  planBullet: { ...type.caption, color: color.accent, fontWeight: '700' },
  planLine: { ...type.caption, color: color.ink, flex: 1 },
  planCaveat: { ...type.caption, color: color.inkMuted, marginTop: space.xs },

  // Uses the data-quality flag colour, not an alarm colour. A missing rule is
  // a limit of the data, the same class of thing as a suspect rate.
  coverageGap: {
    backgroundColor: color.flagBg,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
  },
  coverageGapText: { ...type.caption, color: color.flag },

  // Deliberately quiet. Restore is a recovery path, not an offer, so it must
  // not compete with the unlock card above it.
  restore: {
    alignItems: 'center',
    marginTop: space.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  restoreText: { ...type.caption, color: color.inkMuted },

  note: { ...type.caption, color: color.flag, marginTop: space.md },
});
