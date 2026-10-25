/**
 * Preclear: the cheapest way to get your MRI or CT this year, counting what
 * actually hits your deductible.
 *
 * This file is orchestration only: the answers, which screen is showing, and
 * the way back. Screens live in `src/screens/`, the engine call in
 * `src/estimate.ts`, and the answer model in `src/flow.ts`. The flow follows
 * the Claude Design walkthrough (design/Preclear UI redesign/Preclear
 * Walkthrough.dc.html), with its sample prices replaced by the engine.
 *
 * Compliance rules every screen is bound by (CLAUDE.md, "Hard rules"):
 *   - every dollar figure renders through <Money>, `money()` or `dollars()`, which put
 *     "estimate" inside the string itself
 *   - no analytics or ad SDKs, and none are imported
 *   - no real patient data. Answers are typed by the member and never leave
 *     the phone; the demo account is synthetic (`src/demoProfile.ts`)
 *   - the order check reports which published criteria an order does not
 *     record. It is not denial prediction and is never described as such
 *   - nothing suggests a different procedure or imaging modality
 */

import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  Geist_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/geist';
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { PAYER_LABELS } from './src/appData';
import {
  DEMO_HISTORY,
  DEMO_INITIALS,
  DEMO_PLAN_ANSWERS,
  DEMO_PLAN_LABEL,
  DEMO_UPCOMING,
} from './src/demoProfile';
import { computeEstimate } from './src/estimate';
import { Answers, EMPTY_ANSWERS, careAmountOf, hasRules, normalize, procedureOf } from './src/flow';
import { AllRoutes } from './src/screens/AllRoutes';
import { AmountStep } from './src/screens/AmountStep';
import { Answer } from './src/screens/Answer';
import { Calculating } from './src/screens/Calculating';
import { CareStep } from './src/screens/CareStep';
import { Checklist } from './src/screens/Checklist';
import { BookedStep, InsuranceStep, PlanStep } from './src/screens/CoverageSteps';
import { Facility } from './src/screens/Facility';
import { Home, SavedCard } from './src/screens/Home';
import { OrderStep } from './src/screens/OrderStep';
import { PlanScreen } from './src/screens/PlanScreen';
import { ReviewStep, ReviewTarget } from './src/screens/ReviewStep';
import { ScanStep } from './src/screens/ScanStep';
import { Sources } from './src/screens/Sources';
import { Terms } from './src/screens/Terms';
import { TheMath } from './src/screens/TheMath';
import { Welcome } from './src/screens/Welcome';
import { Why } from './src/screens/Why';
import { dollars } from './src/resultCopy';
import { color } from './src/theme';
import { ErrorBoundary } from './src/ui';

type Step = 'scan' | 'ins' | 'plan' | 'booked' | 'order' | 'ded' | 'met' | 'coins' | 'oop' | 'care' | 'careAmt';
type ScreenKey =
  | 'welcome' | 'terms' | Step | 'review' | 'calc' | 'answer' | 'routes' | 'why'
  | 'math' | 'facility' | 'checklist' | 'sources' | 'home' | 'planInfo';

/** The plan half of the answers: what a returning member does not re-enter. */
const PLAN_FIELDS: (keyof Answers)[] = [
  'payer', 'product', 'planText', 'deductibleTotal', 'deductibleMet', 'coinsurancePct', 'oopTotal',
];

function planOf(answers: Answers): Answers {
  const plan: Answers = { planText: '' };
  for (const key of PLAN_FIELDS) (plan as any)[key] = answers[key];
  return plan;
}

function answered(step: Step, a: Answers): boolean {
  switch (step) {
    case 'scan': return Boolean(a.modality && a.part);
    case 'ins': return Boolean(a.payer);
    case 'plan': return a.product !== undefined;
    case 'booked': return a.orderedFacility !== undefined;
    case 'order': return a.indication !== undefined;
    case 'ded': return a.deductibleTotal !== undefined;
    case 'met': return a.deductibleMet !== undefined && a.deductibleMet <= (a.deductibleTotal ?? 0);
    case 'coins': return a.coinsurancePct !== undefined;
    case 'oop': return a.oopTotal !== undefined && a.oopTotal >= (a.deductibleTotal ?? 0);
    case 'care': return a.care !== undefined;
    case 'careAmt': return a.careAmount !== undefined;
  }
}

const same = (a: Answers, b: Answers) => JSON.stringify(a) === JSON.stringify(b);

export default function App() {
  const [fontsLoaded] = useFonts({
    'Geist-Regular': Geist_400Regular,
    'Geist-Medium': Geist_500Medium,
    'Geist-SemiBold': Geist_600SemiBold,
    'Geist-Bold': Geist_700Bold,
    'Geist-ExtraBold': Geist_800ExtraBold,
    'GeistMono-Medium': GeistMono_500Medium,
  });

  const [screen, setScreen] = useState<ScreenKey>('welcome');
  const [stack, setStack] = useState<ScreenKey[]>([]);
  const [fromReview, setFromReview] = useState(false);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [agreed, setAgreed] = useState(false);
  const [demo, setDemo] = useState(false);
  const [demoPlan, setDemoPlan] = useState<Answers>(DEMO_PLAN_ANSWERS);
  /** Estimates saved this session. Held in memory only: nothing is written to the phone. */
  const [saved, setSaved] = useState<{ id: string; answers: Answers }[]>([]);
  const [homeView, setHomeView] = useState<'upcoming' | 'past'>('upcoming');
  const [routeKind, setRouteKind] = useState<string | null>(null);
  /** Where the amount-met keypad returns to, when it was opened from the Plan screen. */
  const [metFromPlan, setMetFromPlan] = useState(false);

  const estimate = useMemo(() => computeEstimate(answers), [answers]);

  const payerLabel = PAYER_LABELS[answers.payer ?? ''] ?? '';
  const showOrder = (procedureOf(answers)?.indications.length ?? 0) > 0 && hasRules(answers, payerLabel);
  const steps: Step[] = [
    'scan', 'ins', 'plan', 'booked',
    ...(showOrder ? (['order'] as Step[]) : []),
    'ded', 'met', 'coins', 'oop', 'care',
    ...(answers.care === 'custom' ? (['careAmt'] as Step[]) : []),
  ];
  const progressOf = (step: Step | 'review') => ({
    index: step === 'review' ? steps.length : steps.indexOf(step),
    total: steps.length + 1,
  });

  const change = useCallback((patch: Partial<Answers>) => {
    setAnswers((current) => normalize({ ...current, ...patch }));
  }, []);

  const go = (target: ScreenKey) => {
    if (target !== screen) setStack([...stack, screen]);
    setScreen(target);
  };

  /** Back one screen. The calculating screen is never a place to go back to. */
  const back = () => {
    const rest = [...stack];
    let target = rest.pop();
    while (target === 'calc') target = rest.pop();
    setStack(rest);
    setScreen(target ?? 'welcome');
  };

  /** Into a tab root: the home tabs keep no history. */
  const root = (target: ScreenKey) => {
    setStack([]);
    setScreen(target);
  };

  const next = (from: Step) => {
    if (fromReview) {
      const pending = steps.find((step) => !answered(step, answers));
      if (pending && pending !== from) return go(pending);
      if (!pending) {
        setFromReview(false);
        return go('review');
      }
    }
    const i = steps.indexOf(from);
    go(i + 1 < steps.length ? steps[i + 1] : 'review');
  };

  const isSaved = saved.some((entry) => same(entry.answers, answers));
  const toggleSave = () => {
    setSaved((current) =>
      isSaved
        ? current.filter((entry) => !same(entry.answers, answers))
        : [...current, { id: `${Date.now()}`, answers }],
    );
  };

  const cards: SavedCard[] = useMemo(() => {
    const list: { id: string; label: string; answers: Answers }[] = [];
    if (demo) list.push({ id: 'demo', label: 'Upcoming', answers: { ...DEMO_UPCOMING, ...demoPlan } });
    saved.forEach((entry) => list.push({ id: entry.id, label: 'Saved', answers: entry.answers }));
    if (!demo && !saved.some((entry) => same(entry.answers, answers)) && estimate) {
      list.push({ id: 'current', label: 'Not saved', answers });
    }
    return list
      .map((entry) => {
        const result = computeEstimate(entry.answers);
        return result ? { ...entry, estimate: result } : null;
      })
      .filter((card): card is SavedCard => card !== null);
  }, [demo, demoPlan, saved, answers, estimate]);

  const startNew = () => {
    setAnswers(demo ? { ...demoPlan, planText: demoPlan.planText } : planOf(answers));
    setFromReview(false);
    setStack(['home']);
    setScreen('scan');
  };

  const onTab = (tab: 'home' | 'plan' | 'new') => {
    if (tab === 'new') return startNew();
    root(tab === 'home' ? 'home' : 'planInfo');
  };

  const reset = () => {
    setAnswers(EMPTY_ANSWERS);
    setAgreed(false);
    setDemo(false);
    setSaved([]);
    setStack([]);
    setScreen('welcome');
  };

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: color.accent }} />;

  const stepProps = (step: Step) => ({
    answers,
    onChange: change,
    onBack: back,
    onNext: () => next(step),
    progress: progressOf(step),
  });

  const route = estimate?.routes.find((item) => item.kind === routeKind) ?? estimate?.routes[0];
  const care = answers.care ?? 'none';
  const careAmount = careAmountOf(answers) ?? 0;
  const booked = Boolean(answers.orderedFacility);

  // The member's own plan figures, or the demo account's, for the home tabs.
  const plan = demo ? demoPlan : answers;
  const planLabel = demo
    ? DEMO_PLAN_LABEL
    : plan.payer
      ? [PAYER_LABELS[plan.payer], plan.product ? plan.product.toUpperCase() : null, plan.planText.trim() || null]
          .filter(Boolean)
          .join(' · ')
      : 'Not entered';

  const body = (() => {
    switch (screen) {
      case 'welcome':
        return (
          <Welcome
            onStart={() => {
              setDemo(false);
              go('terms');
            }}
            onAccount={() => {
              setDemo(true);
              setHomeView('upcoming');
              root('home');
            }}
          />
        );
      case 'terms':
        return <Terms agreed={agreed} onToggle={() => setAgreed((value) => !value)} onBack={back} onNext={() => go('scan')} />;
      case 'scan':
        return <ScanStep {...stepProps('scan')} />;
      case 'ins':
        return <InsuranceStep {...stepProps('ins')} />;
      case 'plan':
        return <PlanStep {...stepProps('plan')} />;
      case 'booked':
        return <BookedStep {...stepProps('booked')} />;
      case 'order':
        return <OrderStep {...stepProps('order')} />;
      case 'ded':
        return (
          <AmountStep
            label="Your deductible"
            unit="$"
            value={answers.deductibleTotal}
            placeholder={3000}
            max={50000}
            help="The yearly amount on your plan, before insurance starts sharing costs."
            onChange={(deductibleTotal) => change({ deductibleTotal })}
            onBack={back}
            onNext={() => next('ded')}
            progress={progressOf('ded')}
          />
        );
      case 'met': {
        const editingDemo = metFromPlan && demo;
        const total = (editingDemo ? demoPlan.deductibleTotal : answers.deductibleTotal) ?? 0;
        const value = editingDemo ? demoPlan.deductibleMet : answers.deductibleMet;
        const pct = total > 0 && value !== undefined ? Math.min(100, (value / total) * 100) : 0;
        return (
          <AmountStep
            label="Deductible met so far"
            unit="$"
            value={value}
            placeholder={Math.min(400, total)}
            max={total}
            help={`Of your ${dollars(total)} deductible this year.`}
            below={
              <View style={{ width: 180, height: 6, borderRadius: 3, backgroundColor: color.trackStrong, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${pct}%`, backgroundColor: color.accent }} />
              </View>
            }
            onChange={(deductibleMet) =>
              editingDemo ? setDemoPlan((current) => ({ ...current, deductibleMet })) : change({ deductibleMet })
            }
            onBack={() => {
              setMetFromPlan(false);
              back();
            }}
            onNext={() => {
              if (metFromPlan) {
                setMetFromPlan(false);
                return back();
              }
              next('met');
            }}
            progress={metFromPlan ? undefined : progressOf('met')}
            nextLabel={metFromPlan ? 'Save' : 'Continue'}
          />
        );
      }
      case 'coins':
        return (
          <AmountStep
            label="Your coinsurance"
            unit="%"
            value={answers.coinsurancePct}
            placeholder={20}
            max={100}
            help="Your share of costs after the deductible."
            onChange={(coinsurancePct) => change({ coinsurancePct })}
            onBack={back}
            onNext={() => next('coins')}
            progress={progressOf('coins')}
          />
        );
      case 'oop': {
        const total = answers.deductibleTotal ?? 0;
        const tooLow = answers.oopTotal !== undefined && answers.oopTotal < total;
        return (
          <AmountStep
            label="Out-of-pocket max"
            unit="$"
            value={answers.oopTotal}
            placeholder={Math.max(6000, total)}
            max={200000}
            help={`The most you’d pay this year. It can’t be less than your ${dollars(total)} deductible.`}
            error={tooLow ? `Must be at least ${dollars(total)}, your deductible.` : null}
            onChange={(oopTotal) => change({ oopTotal })}
            onBack={back}
            onNext={() => next('oop')}
            progress={progressOf('oop')}
          />
        );
      }
      case 'care':
        return <CareStep {...stepProps('care')} nextLabel={answers.care === 'custom' ? 'Continue' : 'Review answers'} />;
      case 'careAmt':
        return (
          <AmountStep
            label="Other care, in bills"
            unit="$"
            value={answers.careAmount}
            placeholder={2500}
            max={500000}
            help="The total of the bills you expect this year, before insurance pays its share."
            onChange={(careAmount) => change({ careAmount })}
            onBack={back}
            onNext={() => next('careAmt')}
            progress={progressOf('careAmt')}
            nextLabel="Review answers"
          />
        );
      case 'review':
        return (
          <ReviewStep
            answers={answers}
            showOrder={showOrder}
            onEdit={(step: ReviewTarget) => {
              setFromReview(true);
              go(step);
            }}
            onBack={back}
            onNext={() => estimate && go('calc')}
            progress={progressOf('review')}
          />
        );
      case 'calc':
        return estimate ? <Calculating estimate={estimate} care={care} onDone={() => setScreen('answer')} /> : null;
      case 'answer':
        return estimate ? (
          <Answer
            estimate={estimate}
            saved={isSaved}
            onToggleSave={toggleSave}
            onViewSaved={() => {
              setHomeView('upcoming');
              root('home');
            }}
            onClose={() => {
              setHomeView('upcoming');
              root('home');
            }}
            onRoutes={() => go('routes')}
            onWhy={() => go('why')}
            onChecklist={() => go('checklist')}
            onSources={() => go('sources')}
          />
        ) : null;
      case 'routes':
        return estimate ? (
          <AllRoutes
            estimate={estimate}
            care={care}
            booked={booked}
            onOpen={(picked) => {
              setRouteKind(picked.kind);
              go(picked.kind === 'in_network_order_corrected' ? 'checklist' : 'facility');
            }}
            onBack={back}
          />
        ) : null;
      case 'why':
        return estimate ? (
          <Why
            estimate={estimate}
            care={care}
            deductibleTotal={answers.deductibleTotal ?? 0}
            deductibleMet={answers.deductibleMet ?? 0}
            onMath={() => go('math')}
            onBack={back}
          />
        ) : null;
      case 'math':
        return estimate ? (
          <TheMath
            estimate={estimate}
            care={care}
            careAmount={careAmount}
            deductibleTotal={answers.deductibleTotal ?? 0}
            deductibleMet={answers.deductibleMet ?? 0}
            oopTotal={answers.oopTotal ?? 0}
            onSources={() => go('sources')}
            onBack={back}
          />
        ) : null;
      case 'facility':
        return route && estimate ? <Facility route={route} cpt={estimate.query.cpt} booked={booked} onBack={back} /> : null;
      case 'checklist':
        return estimate ? <Checklist estimate={estimate} onBack={back} /> : null;
      case 'sources':
        return <Sources onBack={back} />;
      case 'home':
        return (
          <Home
            initials={demo ? DEMO_INITIALS : 'You'}
            view={homeView}
            onView={setHomeView}
            cards={cards}
            deductibleMet={plan.deductibleMet ?? null}
            deductibleTotal={plan.deductibleTotal ?? null}
            history={demo ? DEMO_HISTORY : []}
            onOpen={(card) => {
              setAnswers(card.answers);
              go('answer');
            }}
            onTab={onTab}
          />
        );
      case 'planInfo':
        return (
          <PlanScreen
            planLabel={planLabel}
            deductibleTotal={plan.deductibleTotal ?? null}
            deductibleMet={plan.deductibleMet ?? null}
            coinsurancePct={plan.coinsurancePct ?? null}
            oopTotal={plan.oopTotal ?? null}
            onUpdateMet={() => {
              setMetFromPlan(true);
              go('met');
            }}
            onSources={() => go('sources')}
            onTab={onTab}
          />
        );
    }
  })();

  return (
    <ErrorBoundary key={screen} onReset={reset}>
      {body}
    </ErrorBoundary>
  );
}
