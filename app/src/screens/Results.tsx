/**
 * 08 to 11, and 14: the walkthrough's result screens, as designed.
 *
 * Best route, All routes, Why this route, The math, Facility and Sources.
 * Layout and wording are the walkthrough's; every figure is the engine's,
 * priced from published hospital files, and carries "estimate" (hard rule 5).
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, View, useWindowDimensions } from 'react-native';

import { CARE_SHORT, Estimate, Option, State, isCash } from '../flow';
import { formatMiles } from '../geo';
import { Money } from '../Money';
import { addressLines, dollars } from '../resultCopy';
import { color, figure, font, radius, space, textScale, type } from '../theme';
import { Button, CloseButton, Heading, IconWell, Link, Screen, T, Tag } from '../ui';

const sub = { color: color.inkMuted };
const verb = (route: Option) => (isCash(route) ? 'Pay cash' : 'Use insurance');

/** "$376 (estimate) less than paying cash, this year": against the best route of the other kind. */
export function saveLine(estimate: Estimate): string | null {
  const { best, other } = estimate;
  if (!best || !other) return null;
  const diff = other.estimate.totalThisYear - best.estimate.totalThisYear;
  return `${dollars(diff)} less than ${isCash(best) ? 'using insurance' : 'paying cash'}, this year`;
}

// 08 · Best route -----------------------------------------------------------

type AnswerProps = {
  estimate: Estimate;
  state: State;
  saved: boolean;
  onToggleSave: () => void;
  onViewSaved: () => void;
  onClose: () => void;
  onRoutes: () => void;
  onWhy: () => void;
  onSources: () => void;
  onLocation: () => void;
};

export function AnswerScreen({ estimate, state, saved, onToggleSave, onViewSaved, onClose, onRoutes, onWhy, onSources, onLocation }: AnswerProps) {
  const { width } = useWindowDimensions();
  const [toast, setToast] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const best = estimate.best;
  const white = { color: color.onAccent };

  const toggle = () => {
    if (timer.current) clearTimeout(timer.current);
    setToast(!saved);
    if (!saved) timer.current = setTimeout(() => setToast(false), 3200);
    onToggleSave();
  };

  const saveButton = (
    <Pressable
      accessibilityRole="button"
      onPress={toggle}
      style={({ pressed }) => [{ minHeight: 44, paddingLeft: 14, paddingRight: 18, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: saved ? color.surface : 'rgba(255,255,255,0.16)' }, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name={saved ? 'checkmark' : 'bookmark-outline'} size={18} color={saved ? color.accentDeep : color.onAccent} />
      <T style={[type.bodyMedium, { fontFamily: font.semibold, color: saved ? color.accentDeep : color.onAccent }]}>{saved ? 'Saved' : 'Save estimate'}</T>
    </Pressable>
  );

  if (!best) {
    return (
      <Screen tone="accent" headerLeft={<CloseButton onPress={onClose} />} footer={<Button label="Change location" variant="light" onPress={onLocation} />}>
        <T style={[type.title, white, { marginTop: space.xxl }]}>No hospital within {state.radius} mi of {state.zip} publishes a price for this scan.</T>
        <T style={[type.body, { color: color.onAccentMuted, marginTop: space.md }]}>Try a wider radius.</T>
      </Screen>
    );
  }

  const line = saveLine(estimate);
  return (
    <Screen
      tone="accent"
      headerLeft={<CloseButton onPress={onClose} />}
      headerRight={saveButton}
      contentStyle={{ justifyContent: 'center', paddingHorizontal: 28 }}
      footer={
        <>
          <Button label="See all routes" variant="light" onPress={onRoutes} />
          <Button label="Why this route?" variant="outline" onPress={onWhy} />
          <Pressable accessibilityRole="link" onPress={onSources} style={{ minHeight: 32, alignItems: 'center', justifyContent: 'center' }}>
            <T style={[type.caption, white, { textAlign: 'center' }]}>
              Estimate based on your plan. Not a quote. <T style={{ textDecorationLine: 'underline', fontFamily: font.semibold }}>Sources</T>
            </T>
          </Pressable>
        </>
      }
    >
      <View style={{ gap: 14 }}>
        <T style={[type.rowTitle, { fontSize: 16 }, white]}>{estimate.scanName} · best route</T>
        <Money value={best.estimate.scan.patientPays} style={[figure(104), white]} suffixSize={18} stacked fitWidth={width - 56} />
        <T style={[type.headline, white]} maxFontSizeMultiplier={textScale.heading}>{verb(best)} at {best.facilityName}</T>
        {line ? (
          <View style={{ alignSelf: 'flex-start', marginTop: 10, backgroundColor: color.surface, borderRadius: 20, paddingHorizontal: space.lg, paddingVertical: 10 }}>
            <T style={[type.bodyMedium, { fontFamily: font.semibold, color: color.accentDeep }]}>{line}</T>
          </View>
        ) : null}
      </View>

      {toast ? (
        <View accessibilityLiveRegion="polite" style={{ position: 'absolute', top: 0, left: 20, right: 20, minHeight: 60, borderRadius: 30, backgroundColor: color.surface, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 10, paddingRight: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 17, shadowOffset: { width: 0, height: 14 } }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={18} color={color.onAccent} />
          </View>
          <View style={{ flex: 1 }}>
            <T style={[type.bodyMedium, { fontFamily: font.semibold }]}>Saved to Estimates</T>
            <T style={[type.caption, sub]}>Find it anytime on your home screen</T>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setToast(false);
              onViewSaved();
            }}
            style={({ pressed }) => [{ minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: color.accentTint, justifyContent: 'center' }, pressed && { opacity: 0.7 }]}
          >
            <T style={[type.small, { fontFamily: font.semibold, color: color.accentDeep }]}>View</T>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

// 09 · All routes -----------------------------------------------------------

export function RoutesScreen({ estimate, state, onOpen, onBack }: { estimate: Estimate; state: State; onOpen: (route: Option) => void; onBack: () => void }) {
  const shown = estimate.routes.slice(0, 4);
  return (
    <Screen onBack={onBack} contentStyle={{ paddingHorizontal: 20, paddingTop: 12, gap: 10 }} footer={<Button label="Got it" onPress={onBack} />}>
      <Heading style={{ paddingHorizontal: 4 }}>All routes</Heading>
      <T style={[type.bodyMedium, sub, { paddingHorizontal: 4, paddingBottom: 10 }]}>What you’d pay this year, including {CARE_SHORT[state.care]}.</T>
      {shown.map((route, i) => (
        <Pressable
          key={route.kind}
          accessibilityRole="button"
          onPress={() => onOpen(route)}
          style={({ pressed }) => [{ backgroundColor: color.surface, borderRadius: radius.card, paddingVertical: 18, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderColor: i === 0 ? color.accent : 'transparent' }, pressed && { opacity: 0.8 }]}
        >
          <View style={{ flex: 1, gap: 5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <T style={[type.mono, { fontSize: 11, color: color.inkMuted }]}>{isCash(route) ? 'CASH' : 'INSURANCE'}</T>
              {i === 0 ? <Tag label="Best" /> : null}
            </View>
            <T style={type.rowTitle} numberOfLines={1}>{route.facilityName}</T>
            <T style={[type.small, sub]}>
              Scan <Money value={route.estimate.scan.patientPays} style={[type.small, sub]} suffixSize={12} maxScale={2} /> · {formatMiles(route.distance)}
            </T>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Money value={route.estimate.totalThisYear} style={[figure(28, 'bold'), { textAlign: 'right' }]} suffixSize={11} stacked />
            <T style={[type.caption, { fontSize: 12, color: color.inkMuted }]}>this year</T>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

// 10 · Why this route? ------------------------------------------------------

function whyText(estimate: Estimate, state: State): string {
  const { best, bestInsurance, bestCash, benefits, laterCare } = estimate;
  const careShort = CARE_SHORT[state.care];
  if (!best) return '';
  if (!isCash(best)) {
    const credit = dollars(best.estimate.deductibleCreditEarned);
    if (bestCash && bestInsurance && bestCash.estimate.scan.patientPays < bestInsurance.estimate.scan.patientPays) {
      return `Cash is cheaper today. But insurance adds ${credit} toward your deductible, and with ${careShort} ahead, that pays off.`;
    }
    return `Insurance is cheaper today too, and it adds ${credit} toward your deductible.`;
  }
  if (laterCare === 0) {
    return 'With nothing else planned, you won’t reach your deductible this year. The lower cash price wins.';
  }
  if (laterCare < benefits.deductibleRemaining) {
    return `Even with ${careShort}, you won’t reach your deductible this year. The lower cash price wins.`;
  }
  // The walkthrough's sentence would be untrue here: the member does reach
  // the deductible, and cash still wins because its price is that much lower.
  return `You’ll reach your deductible with ${careShort} either way, and the cash price is low enough to still come out ahead.`;
}

export function WhyScreen({ estimate, state, onMath, onBack }: { estimate: Estimate; state: State; onMath: () => void; onBack: () => void }) {
  const { best, bestInsurance } = estimate;
  const shown = estimate.routes.slice(0, 4);
  const worst = shown[shown.length - 1];
  const D = state.deductible;
  const met = Math.min(state.met, D);
  const afterIns = met + (bestInsurance?.estimate.deductibleCreditEarned ?? 0);
  const bar = (value: number, fill: string) => (
    <View style={{ height: 10, borderRadius: 5, backgroundColor: color.track, overflow: 'hidden' }}>
      <View style={{ height: '100%', borderRadius: 5, backgroundColor: fill, width: `${D > 0 ? Math.min(100, (value / D) * 100) : 0}%` }} />
    </View>
  );
  const row = (label: string, value: number, fill: string) => (
    <View style={{ gap: space.sm, marginTop: space.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T style={[type.rowTitle, { fontSize: 16 }]}>{label}</T>
        <Money value={value} style={[type.rowTitle, { fontSize: 16 }]} suffixSize={12} />
      </View>
      {bar(value, fill)}
    </View>
  );
  const saves = best && worst ? worst.estimate.totalThisYear - best.estimate.totalThisYear : 0;

  return (
    <Screen
      onBack={onBack}
      contentStyle={{ paddingHorizontal: 28, paddingTop: 12, gap: 16 }}
      footer={
        <>
          <Button label="See the math" variant="light" onPress={onMath} />
          <Button label="Got it" onPress={onBack} />
        </>
      }
    >
      <T accessibilityRole="header" style={[type.display, { fontSize: 38, lineHeight: 44, letterSpacing: -1.7 }]} maxFontSizeMultiplier={textScale.heading}>
        Cash doesn’t count toward your deductible.
      </T>
      <T style={[type.body, { fontSize: 17, lineHeight: 25, color: '#444444' }]}>{whyText(estimate, state)}</T>
      <View style={{ marginTop: 12, backgroundColor: color.surface, borderRadius: radius.card, padding: 22 }}>
        <T style={[type.caption, sub]}>Toward your {dollars(D)} deductible</T>
        {bestInsurance ? row('Insurance', afterIns, color.accent) : null}
        {estimate.bestCash ? row('Cash', met, color.ink) : null}
        {best && worst && saves > 0.005 ? (
          <>
            <View style={{ height: 1, backgroundColor: color.line, marginTop: 22, marginBottom: 18 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md }}>
              <View style={{ flex: 1, gap: 3 }}>
                <T style={[type.rowTitle, { fontSize: 16 }]}>Your cheapest option saves</T>
                <T style={[type.caption, { color: color.inkSubtle }]}>
                  Compared with {isCash(worst) ? 'cash' : 'insurance'} at {worst.facilityName}, {dollars(worst.estimate.totalThisYear)} this year
                </T>
              </View>
              <Money value={saves} style={[figure(34), { color: color.accent, textAlign: 'right' }]} suffixSize={12} stacked />
            </View>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

// 10b · The math ------------------------------------------------------------

const shortName = (route: Option) =>
  route.facilityName.replace(/^IU Health /, 'IU ').replace(/ Health /, ' ').replace(/ Hospital( - Carmel)?$/, '');

export function MathScreen({ estimate, state, onSources, onBack }: { estimate: Estimate; state: State; onSources: () => void; onBack: () => void }) {
  const ins = estimate.bestInsurance;
  const cash = estimate.bestCash;
  const cols = [ins, cash].filter((route): route is Option => Boolean(route));
  const D = state.deductible;
  const met = Math.min(state.met, D);
  const co = state.coins;
  const careShort = CARE_SHORT[state.care];
  const insDeductible = ins?.estimate.scan.appliedToDeductible ?? 0;

  const rows: { label: string; note?: string; values: number[] }[] = [
    { label: 'Scan price', values: cols.map((r) => r.allowedAmount) },
    { label: 'You pay for the scan', note: `${dollars(insDeductible)} deductible + ${co}% of the rest`, values: cols.map((r) => r.estimate.scan.patientPays) },
    { label: 'Counts toward deductible', values: cols.map((r) => r.estimate.scan.appliedToDeductible) },
    { label: 'Deductible left', note: `Of ${dollars(D)}, after the scan`, values: cols.map((r) => r.estimate.scan.benefitsAfter.deductibleRemaining) },
    {
      label: 'Later care',
      note: estimate.laterCare ? `${careShort.charAt(0).toUpperCase()}${careShort.slice(1)}, ${dollars(estimate.laterCare)}` : 'None planned',
      values: cols.map((r) => r.estimate.expectedOtherCareCost),
    },
  ];
  const insWins = ins && cash ? ins.estimate.totalThisYear <= cash.estimate.totalThisYear : true;
  const cell = (value: number, total = false, win = false) => (
    <View style={{ width: 92, alignItems: 'flex-end' }}>
      <Money
        value={value}
        stacked
        suffixSize={11}
        maxScale={1.3}
        style={[total ? { fontFamily: font.extrabold, fontSize: 21, lineHeight: 25, letterSpacing: -0.6 } : { fontFamily: font.semibold, fontSize: 16, lineHeight: 21 }, { textAlign: 'right', fontVariant: ['tabular-nums'], color: win ? color.accentDeep : color.ink }]}
      />
    </View>
  );
  const divider = { borderBottomWidth: 1, borderBottomColor: color.line };

  return (
    <Screen onBack={onBack} contentStyle={{ paddingHorizontal: 20, paddingTop: 12 }} footer={<Button label="Got it" onPress={onBack} />}>
      <Heading style={{ paddingHorizontal: 4 }}>The math</Heading>
      <T style={[type.bodyMedium, sub, { paddingHorizontal: 4, paddingTop: 6 }]}>
        {dollars(met)} of your {dollars(D)} deductible met. {co}% coinsurance after. {dollars(Math.max(state.oop, D))} yearly max. Estimate only.{' '}
        <T onPress={onSources} accessibilityRole="link" style={{ color: color.accentDeep, fontFamily: font.semibold }}>Sources</T>
      </T>
      <View style={{ backgroundColor: color.surface, borderRadius: radius.card, paddingHorizontal: 18, marginTop: 14 }}>
        <View style={[{ flexDirection: 'row', paddingVertical: 9 }, divider]}>
          <View style={{ flex: 1 }} />
          {cols.map((route) => (
            <View key={route.kind} style={{ width: 92, alignItems: 'flex-end', gap: 2 }}>
              <T style={[type.small, { fontFamily: font.semibold, color: isCash(route) ? color.ink : color.accentDeep }]}>{isCash(route) ? 'Cash' : 'Insurance'}</T>
              <T style={[type.caption, { fontSize: 12, color: color.inkMuted, textAlign: 'right' }]} numberOfLines={2}>{shortName(route)}</T>
            </View>
          ))}
        </View>
        {rows.map((row) => (
          <View key={row.label} style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9 }, divider]}>
            <View style={{ flex: 1, gap: 2, paddingRight: 6 }}>
              <T style={[type.bodyMedium, { fontFamily: font.medium }]}>{row.label}</T>
              {row.note ? <T style={[type.caption, { fontSize: 12, lineHeight: 15, color: color.inkSubtle }]}>{row.note}</T> : null}
            </View>
            {row.values.map((value, i) => <View key={i}>{cell(value)}</View>)}
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}>
          <T style={[type.rowTitle, { flex: 1, fontFamily: font.bold }]}>Total this year</T>
          {cols.map((route) => (
            <View key={route.kind}>{cell(route.estimate.totalThisYear, true, isCash(route) ? !insWins : insWins)}</View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

// 11 · Facility -------------------------------------------------------------

export function FacilityScreen({ route, cpt, onBack }: { route: Option; cpt: string; onBack: () => void }) {
  const address = addressLines(route.facilityAddress)[0] ?? '';
  const open = (url: string) => Linking.openURL(url).catch(() => undefined);
  // Apple Maps for both. Directions route to the published address; booking
  // opens the hospital's place card, which carries its phone number. The price
  // files publish no phone numbers, so the app does not invent one.
  const directions = () => open(`http://maps.apple.com/?daddr=${encodeURIComponent(address || route.facilityName)}`);
  const book = () => open(`http://maps.apple.com/?q=${encodeURIComponent(`${route.facilityName}, ${address}`)}`);

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <View style={{ height: 290, backgroundColor: '#E4E4DF', alignItems: 'center', justifyContent: 'center', gap: space.sm }}>
        <View style={{ position: 'absolute', top: 62, left: 20 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={({ pressed }) => [{ width: 44, height: 44, borderRadius: 22, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={24} color={color.ink} />
          </Pressable>
        </View>
        <Ionicons name="location" size={34} color={color.accent} />
        {address ? <T style={[type.caption, { color: color.inkMuted, paddingHorizontal: 40, textAlign: 'center' }]}>{address}</T> : null}
      </View>
      <Screen bare contentStyle={{ paddingTop: 24, gap: 6 }} footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Button label="Directions" variant="light" onPress={directions} /></View>
          <View style={{ flex: 2 }}><Button label="Call to book" onPress={book} /></View>
        </View>
      }>
        <T style={[type.mono, { fontSize: 11, color: color.inkMuted }]}>{isCash(route) ? 'CASH' : 'INSURANCE'} · {formatMiles(route.distance)}</T>
        <T style={[type.title, { fontSize: 28, lineHeight: 33 }]}>{route.facilityName}</T>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 18, marginBottom: 4, flexWrap: 'wrap' }}>
          <Money value={route.estimate.scan.patientPays} style={[figure(64), { color: color.accent }]} suffixSize={15} />
          <T style={[type.bodyMedium, sub]}>for the scan</T>
        </View>
        <View style={{ backgroundColor: color.surface, borderRadius: 22, marginTop: 14 }}>
          <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: color.line }}>
            <T style={[type.body, { fontFamily: font.medium, color: color.inkMuted }]}>Ask for code</T>
            <T style={{ fontFamily: font.mono, fontSize: 16, color: color.ink }}>{cpt}</T>
          </View>
          <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, gap: space.md }}>
            <T style={[type.body, { fontFamily: font.medium, color: color.inkMuted }]}>Say</T>
            <T style={[type.body, { fontFamily: font.semibold, flexShrink: 1, textAlign: 'right' }]}>{isCash(route) ? 'Self-pay price, please' : 'In-network, using insurance'}</T>
          </View>
        </View>
      </Screen>
    </View>
  );
}

// 14 · Sources --------------------------------------------------------------

const SOURCES: { icon: 'business-outline' | 'shield-outline' | 'person-outline' | 'grid-outline'; title: string; body: string; meta: string; url?: string }[] = [
  {
    icon: 'business-outline',
    title: 'Hospital prices',
    body: 'Cash and insurer-negotiated prices from Indiana hospitals’ price transparency files, which a federal rule has required since 2021.',
    // The walkthrough said August. Seven of the ten scans were added in October.
    meta: 'Extracted August and October 2026',
    url: 'https://www.cms.gov/hospital-price-transparency',
  },
  {
    icon: 'shield-outline',
    title: 'Insurer imaging rules',
    body: 'Guidelines insurers use to review imaging orders, such as Carelon Medical Benefits Management for Anthem.',
    meta: 'Each rule names its document and effective date',
  },
  {
    icon: 'person-outline',
    title: 'Your plan details',
    body: 'The deductible, coinsurance and out-of-pocket max you enter. Preclear doesn’t connect to your insurer or doctor.',
    meta: 'Entered by you',
  },
  {
    icon: 'grid-outline',
    title: 'Billing codes',
    body: 'CPT codes for each scan, maintained by the American Medical Association.',
    meta: 'One code per scan',
  },
];

export function SourcesScreen({ onBack }: { onBack: () => void }) {
  return (
    <Screen onBack={onBack} contentStyle={{ paddingHorizontal: 20, paddingTop: 12 }} footer={<Button label="Got it" onPress={onBack} />}>
      <Heading style={{ paddingHorizontal: 4 }}>Sources</Heading>
      <T style={[type.bodyMedium, sub, { paddingHorizontal: 4, paddingTop: 6 }]}>Where Preclear’s numbers come from.</T>
      <View style={{ gap: 10, marginTop: 16 }}>
        {SOURCES.map((item) => (
          <View key={item.title} style={{ backgroundColor: color.surface, borderRadius: radius.card, paddingVertical: 18, paddingHorizontal: 20, flexDirection: 'row', gap: 14 }}>
            <IconWell name={item.icon} />
            <View style={{ flex: 1, gap: 4 }}>
              <T style={type.rowTitle}>{item.title}</T>
              <T style={[type.small, sub]}>{item.body}</T>
              <T style={[type.caption, { color: color.inkSubtle, marginTop: 2 }]}>{item.meta}</T>
              {item.url ? <Link label="View source ›" onPress={() => Linking.openURL(item.url as string).catch(() => undefined)} /> : null}
            </View>
          </View>
        ))}
        <T style={[type.small, sub, { paddingHorizontal: 6, paddingTop: 6 }]}>
          Not included: Community Health Network and St. Vincent Indianapolis don’t publish usable prices. All results are estimates, not quotes.
        </T>
      </View>
    </Screen>
  );
}
