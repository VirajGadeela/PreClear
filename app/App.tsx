/**
 * Preclear — which route to an elective scan costs the least this year.
 *
 * Compliance rules this screen is bound by (CLAUDE.md, "Hard rules"):
 *   - every dollar figure carries the word "estimate" in the string itself,
 *     which is why all of them go through money()
 *   - no analytics or ad SDKs, and none are imported here
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
import RevenueCatUI from 'react-native-purchases-ui';

import data from './assets/preclear-data.json';
import { PlanBenefits, money } from './src/costing';
import {
  FacilityBundle,
  Requirement,
  Route,
  buildRoutes,
  explainRanking,
  rankRoutes,
} from './src/routes';
import { Slider } from './src/Slider';

const revenueCatApiKey = process.env.EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY;
const ENTITLEMENT = 'full_comparison';

const PAYER_LABELS: Record<string, string> = {
  anthem: 'Anthem Blue Cross Blue Shield',
  unitedhealthcare: 'UnitedHealthcare',
  aetna: 'Aetna',
  cigna: 'Cigna',
};

type Step = 'procedure' | 'coverage' | 'results';

export default function App() {
  const [step, setStep] = useState<Step>('procedure');
  const [cpt, setCpt] = useState<string>('73721');
  const [payer, setPayer] = useState<string>('anthem');
  const [deductible, setDeductible] = useState(2000);
  const [expectedOtherSpend, setExpectedOtherSpend] = useState(0);
  const [coinsurance, setCoinsurance] = useState(0.2);
  const [treatmentWeeks, setTreatmentWeeks] = useState(2);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [purchaseNote, setPurchaseNote] = useState<string | null>(null);

  useEffect(() => {
    if (!revenueCatApiKey) {
      setPurchaseNote('RevenueCat key is missing from app/.env.');
      return;
    }
    Purchases.configure({ apiKey: revenueCatApiKey });
    Purchases.getCustomerInfo()
      .then((info) => {
        setIsSubscribed(Boolean(info.entitlements.active[ENTITLEMENT]));
      })
      .catch(() => {
        // Not fatal: the free route still renders without entitlement state.
        setIsSubscribed(false);
      });
  }, []);

  const procedure = useMemo(
    () => data.procedures.find((item) => item.cpt === cpt) ?? data.procedures[0],
    [cpt],
  );

  const facilities = useMemo(() => {
    const byPayer = procedure.payers as Record<string, FacilityBundle[]>;
    return byPayer[payer] ?? [];
  }, [procedure, payer]);

  // Requirements this order does not document as met. Only the conservative
  // treatment duration is user-entered here; the rest stay undocumented, which
  // is reported as "not documented" rather than "not met".
  const unmetRequirements = useMemo<Requirement[]>(() => {
    const payerLabel = PAYER_LABELS[payer] ?? '';
    return (data.requirements as Requirement[]).filter((requirement) => {
      if (!requirement.cpt_codes.includes(cpt)) return false;
      if (!payerLabel.toLowerCase().startsWith(requirement.payer.toLowerCase().split(' ')[0])) {
        return false;
      }
      const weeksNeeded = /(\d+)[- ]week/.exec(requirement.quote);
      if (!weeksNeeded) return true;
      return treatmentWeeks < Number(weeksNeeded[1]);
    });
  }, [cpt, payer, treatmentWeeks]);

  const benefits: PlanBenefits = useMemo(
    () => ({
      deductibleRemaining: deductible,
      coinsuranceRate: coinsurance,
      oopMaxRemaining: 6000,
      copay: 0,
    }),
    [deductible, coinsurance],
  );

  const routes = useMemo(() => {
    const built = buildRoutes({
      facilities,
      benefits,
      expectedOtherAllowedSpend: expectedOtherSpend,
      unmetRequirements,
      // The cash route is surfaced when the deductible is unlikely to be met,
      // which is when its lack of credit costs the patient least.
      cashIsAppropriate: expectedOtherSpend < deductible,
    });
    return rankRoutes(built);
  }, [facilities, benefits, expectedOtherSpend, deductible, unmetRequirements]);

  const openPaywall = useCallback(async () => {
    try {
      const result = await RevenueCatUI.presentPaywall({ displayCloseButton: true });
      const info = await Purchases.getCustomerInfo();
      const active = Boolean(info.entitlements.active[ENTITLEMENT]);
      setIsSubscribed(active);
      setPurchaseNote(active ? null : `Paywall closed: ${result}`);
    } catch (error) {
      setPurchaseNote(
        `Could not open paywall: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.eyebrow}>PRECLEAR · {data.metro.toUpperCase()}</Text>

        {step === 'procedure' && (
          <ProcedureStep
            cpt={cpt}
            payer={payer}
            onSelectCpt={setCpt}
            onSelectPayer={setPayer}
            onContinue={() => setStep('coverage')}
          />
        )}

        {step === 'coverage' && (
          <CoverageStep
            deductible={deductible}
            expectedOtherSpend={expectedOtherSpend}
            coinsurance={coinsurance}
            treatmentWeeks={treatmentWeeks}
            onDeductible={setDeductible}
            onExpectedOtherSpend={setExpectedOtherSpend}
            onCoinsurance={setCoinsurance}
            onTreatmentWeeks={setTreatmentWeeks}
            onBack={() => setStep('procedure')}
            onContinue={() => setStep('results')}
          />
        )}

        {step === 'results' && (
          <ResultsStep
            routes={routes}
            facilityCount={facilities.length}
            isSubscribed={isSubscribed}
            purchaseNote={purchaseNote}
            onUnlock={openPaywall}
            onBack={() => setStep('coverage')}
          />
        )}

        <Text style={styles.disclosure}>{data.disclosure}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProcedureStep({
  cpt,
  payer,
  onSelectCpt,
  onSelectPayer,
  onContinue,
}: {
  cpt: string;
  payer: string;
  onSelectCpt: (value: string) => void;
  onSelectPayer: (value: string) => void;
  onContinue: () => void;
}) {
  return (
    <View>
      <Text style={styles.title}>What scan was ordered?</Text>
      {data.procedures.map((procedure) => (
        <Choice
          key={procedure.cpt}
          selected={procedure.cpt === cpt}
          title={procedure.label}
          subtitle={`${procedure.detail} · CPT ${procedure.cpt}`}
          onPress={() => onSelectCpt(procedure.cpt)}
        />
      ))}

      <Text style={[styles.title, styles.titleSpaced]}>Who is your insurer?</Text>
      {Object.keys(PAYER_LABELS).map((key) => (
        <Choice
          key={key}
          selected={key === payer}
          title={PAYER_LABELS[key]}
          onPress={() => onSelectPayer(key)}
        />
      ))}

      <PrimaryButton label="Continue" onPress={onContinue} />
    </View>
  );
}

function CoverageStep({
  deductible,
  expectedOtherSpend,
  coinsurance,
  treatmentWeeks,
  onDeductible,
  onExpectedOtherSpend,
  onCoinsurance,
  onTreatmentWeeks,
  onBack,
  onContinue,
}: {
  deductible: number;
  expectedOtherSpend: number;
  coinsurance: number;
  treatmentWeeks: number;
  onDeductible: (value: number) => void;
  onExpectedOtherSpend: (value: number) => void;
  onCoinsurance: (value: number) => void;
  onTreatmentWeeks: (value: number) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <View>
      <Text style={styles.title}>Your coverage</Text>
      <Text style={styles.body}>
        These come from your plan documents. Nothing you enter is stored or sent
        anywhere.
      </Text>

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
        helpText="This is the input that decides whether paying cash costs you more. Leaving it at zero assumes no further care this year — that is an assumption, not a neutral default."
      />
      <Slider
        label="Weeks of treatment already documented"
        value={treatmentWeeks}
        minimum={0}
        maximum={12}
        step={1}
        onChange={onTreatmentWeeks}
        format={(value) => `${value} ${value === 1 ? 'week' : 'weeks'}`}
        helpText="Used only to check the order against requirements your payer publishes."
      />

      <PrimaryButton label="See routes" onPress={onContinue} />
      <SecondaryButton label="Back" onPress={onBack} />
    </View>
  );
}

function ResultsStep({
  routes,
  facilityCount,
  isSubscribed,
  purchaseNote,
  onUnlock,
  onBack,
}: {
  routes: Route[];
  facilityCount: number;
  isSubscribed: boolean;
  purchaseNote: string | null;
  onUnlock: () => void;
  onBack: () => void;
}) {
  if (routes.length === 0) {
    return (
      <View>
        <Text style={styles.title}>No routes to compare</Text>
        <Text style={styles.body}>
          No facility in this metro publishes a usable price for this insurer and
          scan. That is a gap in the published data, not a sign that no options
          exist.
        </Text>
        <SecondaryButton label="Back" onPress={onBack} />
      </View>
    );
  }

  // The best route is always free; the rest of the comparison is the paid part.
  const visible = isSubscribed ? routes : routes.slice(0, 1);
  const hidden = routes.length - visible.length;

  return (
    <View>
      <Text style={styles.title}>Your routes</Text>
      <Text style={styles.body}>
        Compared across {facilityCount} {facilityCount === 1 ? 'facility' : 'facilities'} that
        publish a price for your insurer.
      </Text>

      {visible.map((route, index) => (
        <RouteCard key={route.kind} route={route} rank={index + 1} />
      ))}

      {hidden > 0 && (
        <View style={styles.lockCard}>
          <Text style={styles.lockTitle}>
            {hidden} more {hidden === 1 ? 'route' : 'routes'} in this comparison
          </Text>
          <Text style={styles.body}>
            Includes the full site-of-service comparison and, where it applies,
            the requirement checklist for your ordering physician.
          </Text>
          <PrimaryButton label="Unlock full comparison" onPress={onUnlock} />
        </View>
      )}

      {isSubscribed && (
        <Text style={styles.ranking}>{explainRanking(routes)}</Text>
      )}
      {purchaseNote ? <Text style={styles.note}>{purchaseNote}</Text> : null}
      <SecondaryButton label="Change my details" onPress={onBack} />
    </View>
  );
}

function RouteCard({ route, rank }: { route: Route; rank: number }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.rank}>{rank}</Text>
        <Text style={styles.cardLabel}>{route.label}</Text>
      </View>
      <Text style={styles.facility}>{route.facilityName}</Text>
      {route.facilityAddress ? (
        <Text style={styles.address}>{route.facilityAddress}</Text>
      ) : null}

      <View style={styles.figureRow}>
        <View style={styles.figure}>
          <Text style={styles.figureLabel}>This scan</Text>
          <Text style={styles.figureValue}>
            {money(route.estimate.scan.patientPays)}
          </Text>
        </View>
        <View style={styles.figure}>
          <Text style={styles.figureLabel}>Total this year</Text>
          <Text style={styles.figureValue}>
            {money(route.estimate.totalThisYear)}
          </Text>
        </View>
      </View>

      <Text style={styles.credit}>
        {route.estimate.scan.countsTowardDeductible
          ? `Counts toward your deductible — credit of ${money(
              route.estimate.deductibleCreditEarned,
            )}`
          : 'Earns no deductible credit'}
      </Text>
      <Text style={styles.reasoning}>{route.reasoning}</Text>

      {route.warnings.map((warning) => (
        <Text key={warning} style={styles.warning}>
          {warning}
        </Text>
      ))}

      {route.unmetRequirements.length > 0 && (
        <View style={styles.checklist}>
          <Text style={styles.checklistTitle}>
            Requirements this order does not document as met
          </Text>
          {route.unmetRequirements.map((requirement) => (
            <View key={requirement.key} style={styles.requirement}>
              <Text style={styles.requirementSummary}>{requirement.summary}</Text>
              <Text style={styles.requirementQuote}>“{requirement.quote}”</Text>
              <Text style={styles.citation}>
                {requirement.payer} · {requirement.section_id} · {requirement.version} ·
                effective {requirement.effective_date}
              </Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => Linking.openURL(requirement.source_url)}
              >
                <Text style={styles.link}>Read the source document</Text>
              </Pressable>
              {requirement.alternative_pathway && (
                <Text style={styles.hedge}>
                  This is one of several alternative criteria; another listed
                  criterion may apply instead.
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Choice({
  selected,
  title,
  subtitle,
  onPress,
}: {
  selected: boolean;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <Text style={[styles.choiceTitle, selected && styles.choiceTitleSelected]}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.choiceSubtitle}>{subtitle}</Text> : null}
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

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.secondary}>
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f7f4' },
  scroll: { padding: 22, paddingBottom: 48 },
  eyebrow: {
    color: '#37624f',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 18,
  },
  title: { color: '#13231c', fontSize: 26, fontWeight: '700', marginBottom: 10 },
  titleSpaced: { marginTop: 28 },
  body: { color: '#516158', fontSize: 15, lineHeight: 22, marginBottom: 18 },
  choice: {
    backgroundColor: '#ffffff',
    borderColor: '#dce5e0',
    borderRadius: 14,
    borderWidth: 2,
    marginBottom: 10,
    padding: 16,
  },
  choiceSelected: { borderColor: '#1e6047', backgroundColor: '#eef5f1' },
  choiceTitle: { color: '#13231c', fontSize: 16, fontWeight: '600' },
  choiceTitleSelected: { color: '#144534' },
  choiceSubtitle: { color: '#6b7a72', fontSize: 13, marginTop: 4 },
  button: {
    alignItems: 'center',
    backgroundColor: '#1e6047',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 52,
    paddingHorizontal: 24,
  },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: '#ffffff', fontSize: 17, fontWeight: '700' },
  secondary: { alignItems: 'center', marginTop: 14, minHeight: 44, justifyContent: 'center' },
  secondaryText: { color: '#37624f', fontSize: 15, fontWeight: '600' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 14,
    padding: 18,
  },
  cardHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: 8 },
  rank: {
    backgroundColor: '#1e6047',
    borderRadius: 11,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    height: 22,
    lineHeight: 22,
    marginRight: 10,
    textAlign: 'center',
    width: 22,
  },
  cardLabel: { color: '#37624f', fontSize: 13, fontWeight: '700', flexShrink: 1 },
  facility: { color: '#13231c', fontSize: 18, fontWeight: '700' },
  address: { color: '#6b7a72', fontSize: 13, marginTop: 2 },
  figureRow: { flexDirection: 'row', marginTop: 14 },
  figure: { flex: 1 },
  figureLabel: { color: '#6b7a72', fontSize: 12, fontWeight: '600' },
  figureValue: { color: '#13231c', fontSize: 17, fontWeight: '700', marginTop: 2 },
  credit: { color: '#37624f', fontSize: 13, fontWeight: '600', marginTop: 12 },
  reasoning: { color: '#516158', fontSize: 14, lineHeight: 20, marginTop: 8 },
  warning: {
    backgroundColor: '#fdf3e6',
    borderRadius: 8,
    color: '#7a5320',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
    padding: 10,
  },
  checklist: { borderTopColor: '#e5ece8', borderTopWidth: 1, marginTop: 14, paddingTop: 14 },
  checklistTitle: { color: '#13231c', fontSize: 14, fontWeight: '700', marginBottom: 10 },
  requirement: { marginBottom: 14 },
  requirementSummary: { color: '#13231c', fontSize: 14, lineHeight: 20 },
  requirementQuote: {
    color: '#516158',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 19,
    marginTop: 6,
  },
  citation: { color: '#6b7a72', fontSize: 12, lineHeight: 17, marginTop: 6 },
  link: { color: '#1e6047', fontSize: 13, fontWeight: '600', marginTop: 4 },
  hedge: { color: '#6b7a72', fontSize: 12, lineHeight: 17, marginTop: 6 },
  lockCard: {
    backgroundColor: '#eef5f1',
    borderRadius: 16,
    marginBottom: 14,
    padding: 18,
  },
  lockTitle: { color: '#13231c', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  ranking: { color: '#516158', fontSize: 14, lineHeight: 21, marginTop: 6 },
  note: { color: '#7a5320', fontSize: 13, marginTop: 12 },
  disclosure: {
    borderTopColor: '#dce5e0',
    borderTopWidth: 1,
    color: '#6b7a72',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 30,
    paddingTop: 16,
  },
});
