/**
 * Preclear: the cheapest way to get your MRI or CT this year, counting what
 * actually hits your deductible.
 *
 * The screens, their order and their wording are the Claude Design walkthrough
 * (design/Preclear UI redesign/Preclear Walkthrough.dc.html). Every number on
 * them comes from published hospital prices through the engine; see
 * `src/flow.ts`. This file holds the answers and which screen is showing, and
 * follows the walkthrough's own navigation rules.
 *
 * Compliance rules every screen is bound by (CLAUDE.md, "Hard rules"):
 *   - every dollar figure renders through <Money>, `money()` or `dollars()`,
 *     which put "estimate" inside the string itself
 *   - no analytics or ad SDKs, and none are imported
 *   - no real patient data. Answers never leave the phone, and the demo
 *     account's history is synthetic (`src/demoProfile.ts`)
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
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { DEFAULTS, Option, State, compute } from './src/flow';
import { dollars } from './src/resultCopy';
import { HomeScreen, PastScreen, PlanScreen } from './src/screens/Account';
import {
  AnswerScreen,
  FacilityScreen,
  MathScreen,
  RoutesScreen,
  SourcesScreen,
  WhyScreen,
} from './src/screens/Results';
import {
  CalcScreen,
  CareScreen,
  DeductibleBelow,
  InsuranceScreen,
  KeypadScreen,
  ReviewScreen,
  ScanScreen,
  SetupStep,
  Terms,
  ZipScreen,
  pressKey,
} from './src/screens/Setup';
import { Welcome } from './src/screens/Welcome';
import { color, type } from './src/theme';
import { ErrorBoundary, T } from './src/ui';

type ScreenKey =
  | 'welcome' | 'terms' | SetupStep | 'dedTotal' | 'review' | 'calc' | 'answer'
  | 'routes' | 'why' | 'math' | 'facility' | 'sources' | 'home' | 'past' | 'plan';

const SETUP: ScreenKey[] = ['scan', 'zip', 'ins', 'ded', 'coins', 'oop', 'care'];

export default function App() {
  const [fontsLoaded] = useFonts({
    'Geist-Regular': Geist_400Regular,
    'Geist-Medium': Geist_500Medium,
    'Geist-SemiBold': Geist_600SemiBold,
    'Geist-Bold': Geist_700Bold,
    'Geist-ExtraBold': Geist_800ExtraBold,
    'GeistMono-Medium': GeistMono_500Medium,
  });

  const [state, setState] = useState<State>(DEFAULTS);
  const [screen, setScreen] = useState<ScreenKey>('welcome');
  const [stack, setStack] = useState<ScreenKey[]>([]);
  const [fromReview, setFromReview] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selected, setSelected] = useState<Option | null>(null);
  /** The keypad figure is grey until the first key on each visit, as in the walkthrough. */
  const [fresh, setFresh] = useState(true);
  /** Where the deductible keypad returns to when opened from the Plan tab. */
  const [metFromPlan, setMetFromPlan] = useState(false);

  const estimate = useMemo(() => compute(state), [state]);
  const set = (patch: Partial<State>) => setState((current) => ({ ...current, ...patch }));

  /** The walkthrough's `go`: an edit started from the review returns to it. */
  const go = (target: ScreenKey) => {
    let next = target;
    if (fromReview && SETUP.includes(screen) && next !== screen && (SETUP.includes(next) || next === 'review' || next === 'calc')) {
      next = 'review';
    }
    if (next === 'review') setFromReview(false);
    if (next === 'calc') setSaved(false);
    if (next === 'ded' || next === 'coins' || next === 'oop' || next === 'dedTotal') setFresh(true);
    if (next !== screen) setStack([...stack, screen]);
    setScreen(next);
  };

  /** Back one screen, never into Calculating. */
  const back = () => {
    const rest = [...stack];
    let previous = rest.pop();
    while (previous === 'calc') previous = rest.pop();
    setStack(rest);
    setScreen(previous ?? 'welcome');
    if (previous === 'review') setFromReview(false);
  };

  const root = (target: ScreenKey) => {
    setStack([]);
    setScreen(target);
  };

  const onTab = (tab: 'home' | 'plan' | 'new') => {
    if (tab === 'new') return go('scan');
    root(tab);
  };

  const keypad = (key: 'met' | 'coins' | 'oop' | 'deductible', max: number) => (pressed: string) => {
    const next = pressKey(state[key], fresh, pressed, max);
    if (next === null) return;
    set({ [key]: next });
    setFresh(false);
  };

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: color.accent }} />;

  const D = state.deductible;
  const oopOk = state.oop >= D;

  const body = (() => {
    switch (screen) {
      case 'welcome':
        return <Welcome onStart={() => go('terms')} onAccount={() => go('home')} />;
      case 'terms':
        return <Terms agreed={agreed} onToggle={() => setAgreed(!agreed)} onBack={back} onNext={() => go('scan')} />;
      case 'scan':
        return <ScanScreen state={state} set={set} onBack={back} onNext={() => go('zip')} />;
      case 'zip':
        return <ZipScreen state={state} set={set} onBack={back} onNext={() => go('ins')} />;
      case 'ins':
        return <InsuranceScreen state={state} set={set} onBack={back} onNext={() => go('ded')} />;
      case 'ded':
        return (
          <KeypadScreen
            label="Deductible met so far"
            value={Math.min(state.met, D)}
            unit="$"
            fresh={fresh}
            onKey={keypad('met', D)}
            below={<DeductibleBelow state={state} onEditTotal={() => go('dedTotal')} />}
            filled={metFromPlan ? undefined : 4}
            onBack={() => {
              setMetFromPlan(false);
              back();
            }}
            onNext={() => {
              if (metFromPlan) {
                setMetFromPlan(false);
                return back();
              }
              go('coins');
            }}
          />
        );
      case 'dedTotal':
        return (
          <KeypadScreen
            label="Your yearly deductible"
            value={D}
            unit="$"
            fresh={fresh}
            onKey={keypad('deductible', 50000)}
            below={<T style={[type.bodyMedium, { color: color.inkMuted }]}>The amount on your plan before insurance shares costs.</T>}
            onBack={back}
            onNext={() => {
              if (state.met > state.deductible) set({ met: state.deductible });
              back();
            }}
          />
        );
      case 'coins':
        return (
          <KeypadScreen
            label="Your coinsurance"
            value={state.coins}
            unit="%"
            fresh={fresh}
            onKey={keypad('coins', 100)}
            below={<T style={[type.bodyMedium, { color: color.inkMuted, textAlign: 'center', maxWidth: 300 }]}>Your share of costs after the deductible.</T>}
            filled={4}
            onBack={back}
            onNext={() => go('oop')}
          />
        );
      case 'oop':
        return (
          <KeypadScreen
            label="Out-of-pocket max"
            value={state.oop}
            unit="$"
            fresh={fresh}
            onKey={keypad('oop', 999999)}
            below={
              <T style={[type.bodyMedium, { color: oopOk ? color.inkMuted : color.ink, textAlign: 'center', maxWidth: 300 }]}>
                {oopOk
                  ? `The most you’d pay this year. It can’t be less than your ${dollars(D)} deductible.`
                  : `Must be at least ${dollars(D)}, your deductible.`}
              </T>
            }
            canContinue={oopOk}
            filled={4}
            onBack={back}
            onNext={() => oopOk && go('care')}
          />
        );
      case 'care':
        return <CareScreen state={state} set={set} onBack={back} onNext={() => go('review')} />;
      case 'review':
        return (
          <ReviewScreen
            state={state}
            onEdit={(step) => {
              setFromReview(true);
              go(step);
            }}
            onBack={back}
            onNext={() => go('calc')}
          />
        );
      case 'calc':
        return <CalcScreen estimate={estimate} zip={state.zip} onDone={() => setScreen('answer')} />;
      case 'answer':
        return (
          <AnswerScreen
            estimate={estimate}
            state={state}
            saved={saved}
            onToggleSave={() => setSaved(!saved)}
            onViewSaved={() => go('home')}
            onClose={() => go('home')}
            onRoutes={() => go('routes')}
            onWhy={() => go('why')}
            onSources={() => go('sources')}
            onLocation={() => go('zip')}
          />
        );
      case 'routes':
        return (
          <RoutesScreen
            estimate={estimate}
            state={state}
            onOpen={(route) => {
              setSelected(route);
              go('facility');
            }}
            onBack={back}
          />
        );
      case 'why':
        return <WhyScreen estimate={estimate} state={state} onMath={() => go('math')} onBack={back} />;
      case 'math':
        return <MathScreen estimate={estimate} state={state} onSources={() => go('sources')} onBack={back} />;
      case 'facility': {
        const route = selected ?? estimate.best;
        return route ? <FacilityScreen route={route} cpt={estimate.cpt} onBack={back} /> : null;
      }
      case 'sources':
        return <SourcesScreen onBack={back} />;
      case 'home':
        return <HomeScreen estimate={estimate} state={state} onOpen={() => go('answer')} onPast={() => root('past')} onTab={onTab} />;
      case 'past':
        return <PastScreen onUpcoming={() => root('home')} onTab={onTab} />;
      case 'plan':
        return (
          <PlanScreen
            state={state}
            onUpdateMet={() => {
              setMetFromPlan(true);
              go('ded');
            }}
            onSources={() => go('sources')}
            onTab={onTab}
          />
        );
    }
  })();

  return (
    <ErrorBoundary key={screen} onReset={() => root('welcome')}>
      {body}
    </ErrorBoundary>
  );
}
