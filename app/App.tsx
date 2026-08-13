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
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Purchases from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

import raw from './assets/preclear-data.json';
import { Money } from './src/Money';
import { AccessStatus, ENTITLEMENT_ID } from './src/purchases';
import { Slider } from './src/Slider';
import { PlanBenefits, money } from './src/costing';
import { OrderFacts, checkOrder, statusLabel, unmetFindings } from './src/requirements';
import {
  FacilityBundle,
  Requirement,
  Route,
  buildRoutes,
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
  disclosure: string;
  procedures: Procedure[];
  requirements: Requirement[];
};

const data = raw as unknown as Bundle;

const revenueCatApiKey = process.env.EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY;

const PAYER_LABELS: Record<string, string> = {
  anthem: 'Anthem Blue Cross Blue Shield',
  unitedhealthcare: 'UnitedHealthcare',
  aetna: 'Aetna',
  cigna: 'Cigna',
};

const STEPS = ['Scan', 'Coverage', 'Routes'] as const;

export default function App() {
  const [step, setStep] = useState(0);
  const [cpt, setCpt] = useState('73721');
  const [indication, setIndication] = useState('meniscal_tear');
  const [payer, setPayer] = useState('anthem');
  const [deductible, setDeductible] = useState(2000);
  const [coinsurance, setCoinsurance] = useState(0.2);
  const [expectedOtherSpend, setExpectedOtherSpend] = useState(0);
  const [treatmentWeeks, setTreatmentWeeks] = useState(2);
  const [access, setAccess] = useState<AccessStatus>('checking');

  // Re-checks the entitlement without re-configuring the SDK, so this is safe
  // to call again as a retry from the "unavailable" state.
  const refreshAccess = useCallback(async () => {
    try {
      const info = await Purchases.getCustomerInfo();
      setAccess(info.entitlements.active[ENTITLEMENT_ID] ? 'entitled' : 'locked');
    } catch {
      setAccess('unavailable');
    }
  }, []);

  useEffect(() => {
    if (!revenueCatApiKey) {
      setAccess('unavailable');
      return;
    }
    Purchases.configure({ apiKey: revenueCatApiKey });
    refreshAccess();
  }, [refreshAccess]);

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

  const facts: OrderFacts = useMemo(
    () => ({ conservativeTherapyWeeks: treatmentWeeks }),
    [treatmentWeeks],
  );

  const findings = useMemo(
    () =>
      unmetFindings(
        checkOrder(
          data.requirements,
          PAYER_LABELS[payer] ?? '',
          cpt,
          indication,
          facts,
        ),
      ),
    [payer, cpt, indication, facts],
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
          unmetRequirements: findings.map((finding) => finding.requirement),
          // Surfaced when the deductible is unlikely to be met, which is when
          // the missing credit costs the patient least.
          cashIsAppropriate: expectedOtherSpend < deductible,
        }),
      ),
    [facilities, benefits, expectedOtherSpend, deductible, findings],
  );

  const unlock = useCallback(async () => {
    try {
      // No explicit offering: this loads whichever offering is marked
      // "Current" in the RevenueCat dashboard.
      const result = await RevenueCatUI.presentPaywall({ displayCloseButton: true });
      // Any resolved result means the paywall was reachable, so this also
      // recovers out of 'unavailable' on a successful retry. Cancelling or an
      // in-paywall purchase error both leave the entitlement unchanged.
      setAccess(
        result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED
          ? 'entitled'
          : 'locked',
      );
    } catch {
      // The paywall itself could not be presented — offline, or nothing
      // configured in the dashboard yet. Distinct from "declined to buy."
      setAccess('unavailable');
    }
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <StepBar current={step} onJump={setStep} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <ScanStep
            procedure={procedure}
            cpt={cpt}
            indication={indication}
            payer={payer}
            onCpt={setCpt}
            onIndication={setIndication}
            onPayer={setPayer}
            onNext={() => setStep(1)}
          />
        )}

        {step === 1 && (
          <CoverageStep
            deductible={deductible}
            coinsurance={coinsurance}
            expectedOtherSpend={expectedOtherSpend}
            treatmentWeeks={treatmentWeeks}
            showTreatment={data.requirements.some(
              (requirement) =>
                requirement.cpt_codes.includes(cpt) &&
                requirement.indication === indication,
            )}
            onDeductible={setDeductible}
            onCoinsurance={setCoinsurance}
            onExpectedOtherSpend={setExpectedOtherSpend}
            onTreatmentWeeks={setTreatmentWeeks}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <RoutesStep
            routes={routes}
            findings={findings}
            access={access}
            onUnlock={unlock}
          />
        )}

        <Text style={styles.disclosure}>{data.disclosure}</Text>
      </ScrollView>
    </SafeAreaView>
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
        return (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: index > current }}
            accessibilityLabel={
              done ? `${label}, completed, tap to change` : label
            }
            disabled={index > current}
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
              style={[
                styles.stepLabel,
                active && styles.stepLabelActive,
                index > current && styles.stepLabelPending,
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
  onCpt,
  onIndication,
  onPayer,
  onNext,
}: {
  procedure: Procedure;
  cpt: string;
  indication: string;
  payer: string;
  onCpt: (value: string) => void;
  onIndication: (value: string) => void;
  onPayer: (value: string) => void;
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
  onDeductible,
  onCoinsurance,
  onExpectedOtherSpend,
  onTreatmentWeeks,
  onNext,
}: {
  deductible: number;
  coinsurance: number;
  expectedOtherSpend: number;
  treatmentWeeks: number;
  showTreatment: boolean;
  onDeductible: (value: number) => void;
  onCoinsurance: (value: number) => void;
  onExpectedOtherSpend: (value: number) => void;
  onTreatmentWeeks: (value: number) => void;
  onNext: () => void;
}) {
  return (
    <View>
      <Text style={styles.h1}>Your coverage</Text>

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
          helpText="Zero assumes no further care this year — an assumption, not a neutral default."
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
            helpText="Checked against requirements your insurer publishes."
          />
        )}
      </View>

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
  access,
  onUnlock,
}: {
  routes: Route[];
  findings: { requirement: Requirement; status: string }[];
  access: AccessStatus;
  onUnlock: () => void;
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

  // 'checking' renders exactly like 'locked' so there is no loading flash.
  const visible = access === 'entitled' ? routes : routes.slice(0, 1);
  const hidden = routes.length - visible.length;

  return (
    <View>
      <Headline routes={routes} />
      {visible.map((route, index) => (
        <RouteCard
          key={route.kind}
          route={route}
          rank={index + 1}
          recommended={index === 0}
          expanded={open === route.kind}
          findings={findings}
          onToggle={() => setOpen(open === route.kind ? null : route.kind)}
        />
      ))}

      {hidden > 0 && <AccessCard status={access} hidden={hidden} onPress={onUnlock} />}
    </View>
  );
}

/**
 * The upsell touchpoint, in its three possible readings.
 *
 * 'locked' and 'unavailable' share one visual — same card, same position — on
 * purpose. A stressed reader in a waiting room should never see something
 * that looks broken; a configuration or network failure gets calm, honest
 * copy and a retry, not an error screen.
 */
function AccessCard({
  status,
  hidden,
  onPress,
}: {
  status: AccessStatus;
  hidden: number;
  onPress: () => void;
}) {
  const unavailable = status === 'unavailable';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.lock}>
      <Text style={styles.lockTitle}>
        {unavailable
          ? 'Full comparison unavailable right now'
          : `${hidden} more ${hidden === 1 ? 'option' : 'options'}`}
      </Text>
      <Text style={styles.lockBody}>
        {unavailable
          ? 'Your top route is still shown above.'
          : 'The full site-of-service comparison, and the checklist for your doctor’s office where it applies.'}
      </Text>
      <Text style={styles.lockCta}>{unavailable ? 'Try again' : 'Unlock →'}</Text>
    </Pressable>
  );
}

function RouteCard({
  route,
  rank,
  recommended,
  expanded,
  findings,
  onToggle,
}: {
  route: Route;
  rank: number;
  recommended: boolean;
  expanded: boolean;
  findings: { requirement: Requirement; status: string }[];
  onToggle: () => void;
}) {
  const statusFor = (key: string) =>
    findings.find((finding) => finding.requirement.key === key)?.status ?? 'unmet';

  return (
    <View style={[styles.card, recommended && styles.cardRecommended]}>
      {recommended && <Text style={styles.badge}>RECOMMENDED</Text>}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${route.label} at ${route.facilityName}. Tap for the breakdown.`}
        onPress={onToggle}
      >
        <View style={styles.cardTop}>
          <Text style={[styles.rank, recommended && styles.rankRecommended]}>
            {rank}
          </Text>
          <View style={styles.cardHead}>
            <Text style={styles.routeLabel}>{route.label}</Text>
            <Text style={styles.facility} numberOfLines={2}>
              {route.facilityName}
            </Text>
          </View>
        </View>

        <View style={styles.amountRow}>
          <Money
            value={route.estimate.totalThisYear}
            size="large"
            tone={recommended ? 'accent' : 'ink'}
          />
          <Text style={styles.amountCaption}>total this year</Text>
        </View>

        <View style={styles.whyRow}>
          <Text style={styles.why} numberOfLines={expanded ? undefined : 2}>
            {route.estimate.scan.countsTowardDeductible
              ? 'Counts toward your deductible.'
              : 'Earns no deductible credit.'}{' '}
            {route.unmetRequirements.length > 0
              ? `${route.unmetRequirements.length} requirement${
                  route.unmetRequirements.length === 1 ? '' : 's'
                } not documented.`
              : ''}
          </Text>
          <Text style={styles.chevron}>{expanded ? 'Hide' : 'Details'}</Text>
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.details}>
          <Row label="This scan" value={<Money value={route.estimate.scan.patientPays} />} />
          <Row
            label="Deductible credit"
            value={<Money value={route.estimate.deductibleCreditEarned} />}
          />
          <Row
            label="Other care after this"
            value={<Money value={route.estimate.expectedOtherCareCost} />}
          />
          {route.facilityAddress ? (
            <Text style={styles.address}>{route.facilityAddress}</Text>
          ) : null}
          {route.alsoAt.length > 0 && (
            <Text style={styles.address}>
              Same published price at {route.alsoAt.join(', ')}
            </Text>
          )}
          <Text style={styles.reasoning}>{route.reasoning}</Text>

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
              <Text style={styles.requirementSummary}>{requirement.summary}</Text>
              <Text style={styles.requirementQuote}>“{requirement.quote}”</Text>
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
                <Text style={styles.hedge}>
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
  scroll: { paddingHorizontal: space.lg, paddingBottom: space.xl * 2 },

  stepBar: {
    flexDirection: 'row',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
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

  h1: { ...type.hero, color: color.ink, marginTop: space.lg, marginBottom: space.md },
  h2: { ...type.title, color: color.ink, marginTop: space.xl, marginBottom: space.md },
  body: { ...type.body, color: color.inkMuted, marginBottom: space.md },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
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
  badge: {
    ...type.caption,
    fontWeight: '700',
    letterSpacing: 1,
    color: color.accent,
    marginBottom: space.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  rank: {
    ...type.label,
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: 'center',
    lineHeight: 24,
    color: color.surface,
    backgroundColor: color.slate,
    overflow: 'hidden',
  },
  rankRecommended: { backgroundColor: color.accent },
  cardHead: { flex: 1 },
  routeLabel: { ...type.caption, fontWeight: '700', color: color.inkMuted },
  facility: { ...type.body, fontWeight: '700', color: color.ink, marginTop: 2 },

  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginTop: space.md },
  amountCaption: { ...type.caption, color: color.inkMuted },

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
  address: { ...type.caption, color: color.inkMuted, marginTop: space.xs },
  reasoning: { ...type.caption, color: color.inkMuted, marginTop: space.sm },
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
  requirementSummary: { ...type.caption, color: color.ink, marginTop: space.xs },
  requirementQuote: { ...type.caption, color: color.inkMuted, fontStyle: 'italic', marginTop: space.xs },
  citation: { ...type.caption, color: color.inkMuted, marginTop: space.xs },
  link: { ...type.caption, fontWeight: '700', color: color.accent, marginTop: space.xs },
  hedge: { ...type.caption, color: color.inkMuted, marginTop: space.xs },

  lock: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.line,
    padding: space.md + 2,
  },
  lockTitle: { ...type.body, fontWeight: '700', color: color.ink },
  lockBody: { ...type.caption, color: color.inkMuted, marginTop: space.xs },
  lockCta: { ...type.label, color: color.accent, marginTop: space.sm },

  disclosure: {
    ...type.caption,
    color: color.inkMuted,
    borderTopWidth: 1,
    borderTopColor: color.line,
    marginTop: space.xl,
    paddingTop: space.md,
  },
});
