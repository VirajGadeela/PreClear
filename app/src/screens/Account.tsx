/**
 * 12, 12b and 13: the account screens, as designed.
 *
 * Estimates (Upcoming), Past scans and Plan. "I have an account" lands here,
 * and the video introduces it as a demo account. The past scans are sample
 * data from `demoProfile.ts`, priced from real hospital files.
 */

import { Pressable, View } from 'react-native';

import { DEMO_HISTORY, DEMO_INITIALS, DEMO_SPENT } from '../demoProfile';
import { Estimate, State, isCash } from '../flow';
import { Money } from '../Money';
import { dollars } from '../resultCopy';
import { color, figure, font, radius, space, textScale, type } from '../theme';
import { Button, HomeTab, Screen, Segmented, T, TabPill, Tag } from '../ui';
import { saveLine } from './Results';

const sub = { color: color.inkMuted };

type Tabs = { onTab: (tab: HomeTab | 'new') => void };

function Header({ title }: { title: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 4 }}>
      <T accessibilityRole="header" style={type.display} maxFontSizeMultiplier={textScale.heading}>{title}</T>
      {title === 'Estimates' ? (
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
          <T style={{ fontFamily: font.semibold, fontSize: 16, color: color.onAccent }} maxFontSizeMultiplier={1.2}>{DEMO_INITIALS}</T>
        </View>
      ) : null}
    </View>
  );
}

const SEGMENTS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
];

// 12 · Estimates ------------------------------------------------------------

export function HomeScreen({ estimate, state, onOpen, onPast, onTab }: Tabs & { estimate: Estimate; state: State; onOpen: () => void; onPast: () => void }) {
  const best = estimate.best;
  const line = saveLine(estimate);
  const met = Math.min(state.met, state.deductible);
  return (
    <View style={{ flex: 1 }}>
      <Screen bare contentStyle={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 120, gap: 14 }}>
        <Header title="Estimates" />
        <Segmented options={SEGMENTS} value="upcoming" onChange={(key) => key === 'past' && onPast()} />
        {best ? (
          <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [{ backgroundColor: color.surface, borderRadius: 28, padding: 22, gap: 8 }, pressed && { opacity: 0.8 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T style={[type.small, sub]}>{estimate.scanName}</T>
              <T style={[type.small, sub]}>Today</T>
            </View>
            <Money value={best.estimate.scan.patientPays} style={[figure(64), { marginVertical: 6 }]} suffixSize={15} />
            <T style={type.rowTitle}>{isCash(best) ? 'Pay cash' : 'Use insurance'} at {best.facilityName}</T>
            {line ? <T style={[type.small, { color: color.accentDeep }]}>{line}</T> : null}
          </Pressable>
        ) : null}
        <View style={{ backgroundColor: color.surface, borderRadius: 28, paddingVertical: 20, paddingHorizontal: 22, gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: space.sm }}>
            <T style={[type.small, sub]}>Deductible met</T>
            <T style={{ fontFamily: font.bold, fontSize: 18, color: color.ink }}>
              {dollars(met)} <T style={{ fontFamily: font.medium, fontSize: 14, color: color.inkSubtle }}>/ {dollars(state.deductible)}</T>
            </T>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: color.track, overflow: 'hidden' }}>
            <View style={{ height: '100%', borderRadius: 4, backgroundColor: color.accent, width: `${state.deductible > 0 ? (met / state.deductible) * 100 : 0}%` }} />
          </View>
        </View>
      </Screen>
      <TabPill current="home" onHome={() => onTab('home')} onNew={() => onTab('new')} onPlan={() => onTab('plan')} />
    </View>
  );
}

// 12b · Past ----------------------------------------------------------------

export function PastScreen({ onUpcoming, onTab }: Tabs & { onUpcoming: () => void }) {
  const counted = DEMO_HISTORY.filter((scan) => scan.year === '2026').reduce((sum, scan) => sum + scan.counted, 0);
  const years = ['2026', '2025'];
  return (
    <View style={{ flex: 1 }}>
      <Screen bare contentStyle={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 130, gap: 12 }}>
        <Header title="Estimates" />
        <Segmented options={SEGMENTS} value="past" onChange={(key) => key === 'upcoming' && onUpcoming()} />
        <View style={{ backgroundColor: color.accent, borderRadius: 28, paddingVertical: 18, paddingHorizontal: 22, gap: 4 }}>
          <T style={[type.small, { color: color.onAccentMuted }]}>Spent on scans in 2026</T>
          <Money value={DEMO_SPENT} style={[figure(48), { color: color.onAccent }]} suffixSize={15} />
          <T style={[type.small, { color: color.onAccentMuted }]}>{dollars(counted)} counted toward your deductible</T>
        </View>
        {years.map((year) => (
          <View key={year}>
            <T style={[type.caption, { fontFamily: font.semibold, color: color.inkMuted, paddingHorizontal: 4, paddingTop: 2, paddingBottom: 6 }]}>{year}</T>
            <View style={{ backgroundColor: color.surface, borderRadius: radius.card }}>
              {DEMO_HISTORY.filter((scan) => scan.year === year).map((scan, i) => (
                <View key={`${scan.name}-${scan.date}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 18, borderTopWidth: i ? 1 : 0, borderTopColor: color.line }}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <T style={type.rowTitle}>{scan.name}</T>
                    <T style={[type.caption, sub]} numberOfLines={1}>{scan.paidBy === 'cash' ? 'Cash' : 'Insurance'} · {scan.facilityName} · {scan.date}</T>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    <Money value={scan.amount} style={{ fontFamily: font.bold, fontSize: 20, color: color.ink, textAlign: 'right' }} suffixSize={11} stacked />
                    <Tag label={scan.counted > 0 ? 'Counted' : 'Didn’t count'} tone="neutral" />
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
      </Screen>
      <TabPill current="home" onHome={() => onTab('home')} onNew={() => onTab('new')} onPlan={() => onTab('plan')} />
    </View>
  );
}

// 13 · Plan -----------------------------------------------------------------

export function PlanScreen({ state, onUpdateMet, onSources, onTab }: Tabs & { state: State; onUpdateMet: () => void; onSources: () => void }) {
  const met = Math.min(state.met, state.deductible);
  const rows: [string, string][] = [
    ['Plan', state.carrier],
    ['Deductible', dollars(state.deductible)],
    ['Coinsurance', `${state.coins}%`],
    ['Out-of-pocket max', dollars(Math.max(state.oop, state.deductible))],
  ];
  return (
    <View style={{ flex: 1 }}>
      <Screen bare contentStyle={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 120, gap: 14 }}>
        <Header title="Plan" />
        <View style={{ paddingTop: 24, paddingBottom: 20, paddingHorizontal: 4, gap: 8 }}>
          <T style={[type.body, { fontFamily: font.medium }, sub]}>Left on your deductible</T>
          <Money value={state.deductible - met} style={figure(84)} suffixSize={16} stacked />
          <T style={[type.bodyMedium, sub]}>Resets Jan 1</T>
        </View>
        <View style={{ backgroundColor: color.surface, borderRadius: radius.card }}>
          {rows.map(([label, value], i) => (
            <View key={label} style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderTopWidth: i ? 1 : 0, borderTopColor: color.line }}>
              <T style={[type.body, { fontFamily: font.medium }, sub]}>{label}</T>
              <T style={[type.body, { fontFamily: font.semibold }]}>{value}</T>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <View style={{ flex: 1.4 }}><Button label="Update amount met" variant="light" onPress={onUpdateMet} /></View>
          <View style={{ flex: 1 }}><Button label="Sources" variant="light" onPress={onSources} /></View>
        </View>
      </Screen>
      <TabPill current="plan" onHome={() => onTab('home')} onNew={() => onTab('new')} onPlan={() => onTab('plan')} />
    </View>
  );
}
