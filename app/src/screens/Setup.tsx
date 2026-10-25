/**
 * 01b to 07: the walkthrough's setup screens, as designed.
 *
 * Before you start, What scan?, Where are you?, Your insurance, the three
 * keypads (deductible met, coinsurance, out-of-pocket max), planned care,
 * Check your answers, and Calculating. Layout, wording and starting values are
 * the walkthrough's; only the numbers behind them are real.
 *
 * Where the walkthrough would have shown something untrue, the smallest
 * possible change was made, and each is noted where it happens.
 */

import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, TextInput, View } from 'react-native';

import { Money } from '../Money';
import {
  CARE_SHORT,
  CARRIERS,
  Care,
  Carrier,
  Estimate,
  Modality,
  PARTS,
  Part,
  RADII,
  State,
} from '../flow';
import { checkZip } from '../geo';
import { dollars } from '../resultCopy';
import { TAP_TARGET, color, figure, font, radius, space, textScale, type } from '../theme';
import { Button, ChoiceList, ChoiceRow, Heading, IconWell, Keypad, Radio, Screen, T, Tile } from '../ui';

type Nav = { onBack: () => void; onNext: () => void };
type Edit = { state: State; set: (patch: Partial<State>) => void };

/** The walkthrough's seven progress segments, filled as it fills them. */
const progress = (filled: number) => ({ index: filled - 1, total: 7 });

const sub = { color: color.inkMuted };

// 01b · Before you start ---------------------------------------------------

const POINTS: { icon: 'receipt-outline' | 'medkit-outline' | 'lock-closed-outline'; title: string; body: string }[] = [
  { icon: 'receipt-outline', title: 'It’s an estimate', body: 'Your real bill can differ. Confirm the price with the facility before you book.' },
  { icon: 'medkit-outline', title: 'Not medical advice', body: 'Ask your doctor which scan you need. Preclear only compares costs.' },
  { icon: 'lock-closed-outline', title: 'Your info stays private', body: 'We never sell your health or insurance details.' },
];

export function Terms({ agreed, onToggle, onBack, onNext }: Nav & { agreed: boolean; onToggle: () => void }) {
  return (
    <Screen onBack={onBack} footer={<Button label="Agree and continue" onPress={onNext} disabled={!agreed} />}>
      <Heading>Before you start</Heading>
      <T style={[type.body, sub, { marginTop: space.sm }]}>Three quick things to know.</T>
      <View style={{ backgroundColor: color.surface, borderRadius: radius.card, marginTop: space.xxl }}>
        {POINTS.map((point, i) => (
          <View key={point.title} style={{ flexDirection: 'row', gap: 14, paddingHorizontal: 18, paddingVertical: space.lg, borderTopWidth: i ? 1 : 0, borderTopColor: color.line }}>
            <IconWell name={point.icon} />
            <View style={{ flex: 1, gap: 3 }}>
              <T style={type.rowTitle}>{point.title}</T>
              <T style={[type.small, sub]}>{point.body}</T>
            </View>
          </View>
        ))}
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        onPress={onToggle}
        style={({ pressed }) => [{ flexDirection: 'row', gap: 14, alignItems: 'center', paddingTop: 22, paddingHorizontal: 4, minHeight: TAP_TARGET }, pressed && { opacity: 0.7 }]}
      >
        <View style={{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: agreed ? color.accent : color.surface, borderWidth: agreed ? 0 : 2, borderColor: color.border }}>
          {agreed ? <Ionicons name="checkmark" size={16} color={color.onAccent} /> : null}
        </View>
        {/* The walkthrough's sentence. Its two links pointed at nothing, so the
            names are set in the link colour but are not links. */}
        <T style={[type.bodyMedium, { flex: 1, color: '#333333' }]}>
          I agree to the <T style={{ color: color.accentDeep, fontFamily: font.semibold }}>Terms of Service</T> and{' '}
          <T style={{ color: color.accentDeep, fontFamily: font.semibold }}>Privacy Policy</T>.
        </T>
      </Pressable>
    </Screen>
  );
}

// 02 · What scan? -----------------------------------------------------------

export function ScanScreen({ state, set, onBack, onNext }: Edit & Nav) {
  const modalities: [Modality, string][] = [['MRI', 'Magnetic resonance'], ['CT', 'Computed tomography']];
  return (
    <Screen onBack={onBack} progress={progress(1)} footer={<Button label="Continue" onPress={onNext} />}>
      <Heading>What scan?</Heading>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: space.xxl }}>
        {modalities.map(([key, label]) => (
          <Tile key={key} selected={state.scan === key} onPress={() => set({ scan: key })} accessibilityLabel={`${key}, ${label}`} style={{ flex: 1, minHeight: 112, justifyContent: 'space-between' }}>
            <T style={figure(34, 'bold')} maxFontSizeMultiplier={textScale.figure}>{key}</T>
            <T style={[type.small, sub]}>{label}</T>
          </Tile>
        ))}
      </View>
      <View style={{ marginTop: space.xxl }}>
        <ChoiceList>
          {PARTS.map((part: Part, i) => (
            <ChoiceRow key={part} first={i === 0} large label={part} selected={state.part === part} onPress={() => set({ part })} />
          ))}
        </ChoiceList>
      </View>
    </Screen>
  );
}

// 03 · Where are you? -------------------------------------------------------

export function ZipScreen({ state, set, onBack, onNext }: Edit & Nav) {
  const check = checkZip(state.zip);
  const input = useRef<TextInput>(null);
  useEffect(() => {
    const focus = setTimeout(() => input.current?.focus(), 80);
    return () => clearTimeout(focus);
  }, []);
  const go = () => check.status === 'in' && onNext();
  const lineColor = check.status === 'in' ? color.accent : check.status === 'out' ? '#999999' : color.ink;

  return (
    <Screen
      onBack={onBack}
      progress={progress(2)}
      scroll={false}
      footer={<Button label="Continue" onPress={go} disabled={check.status !== 'in'} />}
    >
      <Heading>Where are you?</Heading>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <TextInput
          ref={input}
          value={state.zip}
          onChangeText={(text) => set({ zip: text.replace(/\D/g, '').slice(0, 5) })}
          onSubmitEditing={go}
          placeholder="ZIP"
          placeholderTextColor={color.placeholder}
          keyboardType="number-pad"
          returnKeyType="done"
          maxLength={5}
          accessibilityLabel="ZIP code"
          maxFontSizeMultiplier={1.1}
          style={[figure(88, 'bold'), { width: '100%', textAlign: 'center', color: color.ink, padding: 0, outlineStyle: 'none' } as object]}
          selectionColor={color.accent}
        />
        <View style={{ width: 230, height: 2, borderRadius: 1, backgroundColor: lineColor }} />
        <View style={{ height: 112, width: '100%', alignItems: 'center', paddingTop: 6 }} accessibilityLiveRegion="polite">
          {check.status === 'typing' ? <T style={[type.bodyMedium, { color: color.inkSubtle }]}>Type your 5-digit ZIP code</T> : null}
          {check.status === 'in' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent }} />
              <T style={[type.rowTitle, { color: '#333333' }]}>{check.city}, IN</T>
            </View>
          ) : null}
          {check.status === 'out' ? (
            // The walkthrough said "only in Indiana". The prices cover the
            // Indianapolis area, so that is what this says.
            <View style={{ width: '100%', backgroundColor: color.surface, borderRadius: 22, paddingHorizontal: 18, paddingVertical: space.lg, flexDirection: 'row', gap: 14 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color.accentTint, alignItems: 'center', justifyContent: 'center' }}>
                <T style={{ fontFamily: font.bold, fontSize: 15, color: color.accentDeep }}>i</T>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <T style={type.rowTitle}>We’re only in the Indianapolis area for now.</T>
                <T style={[type.small, sub]}>Preclear doesn’t cover {check.place} yet. Try an Indianapolis-area ZIP code.</T>
              </View>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ alignItems: 'center', gap: space.md, paddingBottom: space.md }}>
        <T style={[type.small, sub]}>Willing to drive</T>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {RADII.map((miles) => {
            const on = state.radius === miles;
            return (
              <Pressable
                key={miles}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => set({ radius: miles })}
                style={({ pressed }) => [{ minHeight: TAP_TARGET, paddingHorizontal: 20, borderRadius: 22, justifyContent: 'center', backgroundColor: on ? color.ink : color.surface }, pressed && { opacity: 0.7 }]}
              >
                <T style={[type.rowTitle, { fontSize: 16, color: on ? color.onAccent : color.ink }]}>{miles} mi</T>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}

// 04 · Your insurance -------------------------------------------------------

export function InsuranceScreen({ state, set, onBack, onNext }: Edit & Nav) {
  const [cardNote, setCardNote] = useState(false);
  return (
    <Screen onBack={onBack} progress={progress(3)} footer={<Button label="Continue" onPress={onNext} />}>
      <Heading>Your insurance</Heading>
      {/* The walkthrough's card row. Scanning would need the camera and on-device
          text recognition, so a tap says so instead of doing nothing. */}
      <Pressable
        accessibilityRole="button"
        onPress={() => setCardNote(true)}
        style={({ pressed }) => [{ marginTop: space.xl, minHeight: 64, borderRadius: 22, backgroundColor: color.surface, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18 }, pressed && { opacity: 0.7 }]}
      >
        <View style={{ width: 34, height: 24, borderRadius: 5, borderWidth: 2, borderColor: color.ink }} />
        <T style={[type.rowTitle, { flex: 1 }]}>Scan your card</T>
        <T style={{ fontSize: 22, color: color.inkSubtle }}>›</T>
      </Pressable>
      {cardNote ? (
        <T style={[type.small, sub, { marginTop: space.sm, paddingHorizontal: 4 }]}>Card scanning isn’t available yet. Choose your carrier below.</T>
      ) : null}
      <T style={[type.small, sub, { marginTop: space.xl, marginBottom: space.md, paddingHorizontal: 4 }]}>Or choose your carrier</T>
      <ChoiceList>
        {CARRIERS.map((carrier: Carrier, i) => {
          const on = state.carrier === carrier;
          return (
            <ChoiceRow
              key={carrier}
              first={i === 0}
              label={carrier}
              selected={on}
              onPress={() => set({ carrier })}
              leading={
                <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? color.accent : color.line }}>
                  <T style={{ fontFamily: font.bold, fontSize: 15, color: on ? color.onAccent : color.ink }}>{carrier[0]}</T>
                </View>
              }
            />
          );
        })}
      </ChoiceList>
    </Screen>
  );
}

// 05 · The keypad screens ---------------------------------------------------

type KeypadProps = Nav & {
  label: string;
  /** What the big figure shows: a dollar amount or a percentage. */
  value: number;
  unit: '$' | '%';
  /** Grey until the first key, as in the walkthrough. */
  fresh: boolean;
  onKey: (key: string) => void;
  below: ReactNode;
  canContinue?: boolean;
  filled?: number;
};

export function KeypadScreen({ label, value, unit, fresh, onKey, below, canContinue = true, filled, onBack, onNext }: KeypadProps) {
  const tone = { color: fresh ? color.placeholder : color.ink, textAlign: 'center' as const };
  return (
    <Screen
      onBack={onBack}
      progress={filled ? progress(filled) : undefined}
      scroll={false}
      contentStyle={{ paddingTop: space.md }}
      footer={<Button label="Continue" onPress={onNext} disabled={!canContinue} />}
    >
      <T style={[type.bodyMedium, { fontSize: 17, color: color.inkMuted, textAlign: 'center' }]}>{label}</T>
      <View style={{ minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        {unit === '$' ? (
          <Money value={value} style={[figure(80, 'bold'), tone]} suffixSize={15} stacked fitWidth={300} />
        ) : (
          <T style={[figure(84, 'bold'), tone]} maxFontSizeMultiplier={textScale.figure}>{value}%</T>
        )}
        {below}
      </View>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Keypad onKey={onKey} />
      </View>
    </Screen>
  );
}

/** The walkthrough's keypad rule: the first key replaces the grey value. */
export function pressKey(current: number, fresh: boolean, key: string, max: number): number | null {
  let typed = fresh ? '' : String(current);
  typed = key === '⌫' ? typed.slice(0, -1) : (typed === '0' ? '' : typed) + key;
  const next = parseInt(typed || '0', 10);
  return next > max ? null : next;
}

export function DeductibleBelow({ state, onEditTotal }: { state: State; onEditTotal: () => void }) {
  const pct = state.deductible > 0 ? Math.min(100, (state.met / state.deductible) * 100) : 0;
  return (
    <>
      <View style={{ width: 180, height: 6, borderRadius: 3, backgroundColor: color.trackStrong, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${pct}%`, backgroundColor: color.accent, borderRadius: 3 }} />
      </View>
      {/* "of $3,000" is the walkthrough's fixed deductible. It is tappable here,
          because a deductible is the member's own figure, not a constant. */}
      <Pressable accessibilityRole="button" accessibilityHint="Change your yearly deductible" onPress={onEditTotal} hitSlop={10}>
        <T style={[type.bodyMedium, sub]}>
          of <T style={{ color: color.inkMuted, textDecorationLine: 'underline' }}>{dollars(state.deductible)}</T> · {state.carrier}
        </T>
      </Pressable>
    </>
  );
}

// 06 · More care planned before Dec 31? -------------------------------------

const CARES: [Care, string, string][] = [
  ['none', 'Nothing else', 'Just this scan'],
  ['some', 'Some', 'Follow-up visits, physical therapy'],
  ['major', 'Major', 'Surgery or a procedure'],
];

export function CareScreen({ state, set, onBack, onNext }: Edit & Nav) {
  return (
    <Screen onBack={onBack} progress={progress(7)} footer={<Button label="Review answers" onPress={onNext} />}>
      <Heading>More care planned before Dec 31?</Heading>
      <T style={[type.body, sub, { marginTop: space.md, marginBottom: space.lg }]}>This decides whether cash or insurance wins.</T>
      <View style={{ gap: space.md }}>
        {CARES.map(([key, label, detail]) => {
          const on = state.care === key;
          return (
            <Tile key={key} selected={on} onPress={() => set({ care: key })} accessibilityLabel={`${label}, ${detail}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <T style={type.headline}>{label}</T>
                <T style={[type.bodyMedium, sub]}>{detail}</T>
              </View>
              <Radio selected={on} />
            </Tile>
          );
        })}
      </View>
    </Screen>
  );
}

// 06b · Check your answers --------------------------------------------------

export type SetupStep = 'scan' | 'zip' | 'ins' | 'ded' | 'coins' | 'oop' | 'care';

export function ReviewScreen({ state, onEdit, onBack, onNext }: Nav & { state: State; onEdit: (step: SetupStep) => void }) {
  const zip = checkZip(state.zip);
  const careShort = CARE_SHORT[state.care];
  const rows: [string, string, SetupStep][] = [
    ['Scan', `${state.part} ${state.scan}`, 'scan'],
    ['Location', zip.status === 'in' ? `${state.zip} · ${zip.city}, IN` : state.zip, 'zip'],
    ['Insurance', state.carrier, 'ins'],
    ['Deductible met', `${dollars(state.met)} of ${dollars(state.deductible)}`, 'ded'],
    ['Coinsurance', `${state.coins}%`, 'coins'],
    ['Out-of-pocket max', dollars(state.oop), 'oop'],
    ['Planned care', careShort.charAt(0).toUpperCase() + careShort.slice(1), 'care'],
  ];
  return (
    <Screen onBack={onBack} progress={progress(7)} footer={<Button label="See my estimate" onPress={onNext} />}>
      <Heading>Check your answers</Heading>
      <T style={[type.body, sub, { marginTop: space.md, marginBottom: space.sm }]}>Tap any answer to change it.</T>
      <View style={{ backgroundColor: color.surface, borderRadius: radius.card, overflow: 'hidden' }}>
        {rows.map(([label, value, step], i) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${value}. Edit`}
            onPress={() => onEdit(step)}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: color.line }, pressed && { backgroundColor: color.canvas }]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <T style={[type.caption, sub]}>{label}</T>
              {/* Wraps rather than truncating: an ellipsis would cut "estimate" off a figure. */}
              <T style={type.rowTitle}>{value}</T>
            </View>
            <T style={[type.bodyMedium, { fontFamily: font.semibold, color: color.accentDeep }]}>Edit</T>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

// 07 · Calculating ----------------------------------------------------------

export function CalcScreen({ estimate, zip, onDone }: { estimate: Estimate; zip: string; onDone: () => void }) {
  const fill = useRef(new Animated.Value(0)).current;
  const finish = useRef(onDone);
  finish.current = onDone;
  useEffect(() => {
    const start = setTimeout(() => Animated.timing(fill, { toValue: 1, duration: 2300, useNativeDriver: false }).start(), 80);
    const done = setTimeout(() => finish.current(), 2500);
    return () => {
      clearTimeout(start);
      clearTimeout(done);
    };
  }, [fill]);

  const lines: [string, boolean][] = [
    ['Your deductible', true],
    ['Negotiated rates', true],
    ['Cash prices', false],
  ];
  return (
    <Screen bare scroll={false} contentStyle={{ justifyContent: 'center', paddingHorizontal: 32, gap: 28 }}>
      <T style={figure(96, 'bold')} maxFontSizeMultiplier={textScale.figure}>{estimate.routes.length}</T>
      <T style={[type.title, { marginTop: -12 }]} maxFontSizeMultiplier={textScale.heading}>
        routes to your {estimate.scanName} near {zip}
      </T>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: color.track, overflow: 'hidden' }}>
        <Animated.View style={{ height: '100%', borderRadius: 3, backgroundColor: color.accent, width: fill.interpolate({ inputRange: [0, 1], outputRange: ['6%', '100%'] }) }} />
      </View>
      <View style={{ gap: 14 }}>
        {lines.map(([label, done]) => (
          <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T style={[type.body, { fontFamily: font.medium, color: done ? color.ink : color.inkSubtle }]}>{label}</T>
            <T style={[type.body, { fontFamily: font.medium, color: done ? color.accent : color.inkSubtle }]}>{done ? 'Done' : 'Checking'}</T>
          </View>
        ))}
      </View>
    </Screen>
  );
}
