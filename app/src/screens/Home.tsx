/**
 * 12 · Estimates, with Upcoming and Past.
 *
 * Upcoming lists the estimates saved this session, plus the one the demo
 * account comes with. Each card is recomputed from its answers by the engine,
 * so a saved estimate can never show a figure the engine would not produce
 * today. Nothing is written to the phone's storage: saving lasts until the app
 * closes.
 *
 * Past is the demo account's scan history, from `demoProfile.ts`. Each scan
 * says whether it counted toward the deductible, which is the product's whole
 * point in one word. A member who came in through "Get started" has no
 * history, because Preclear does not connect to an insurer.
 */

import { Pressable, View } from 'react-native';

import { PastScan } from '../demoProfile';
import { Estimate } from '../estimate';
import { Answers } from '../flow';
import { Money } from '../Money';
import { dollars, saveLine, verb } from '../resultCopy';
import { color, figure, font, radius, space, textScale, type } from '../theme';
import { HomeTab, Screen, Segmented, T, TabPill, Tag } from '../ui';

export type SavedCard = { id: string; label: string; answers: Answers; estimate: Estimate };

type Props = {
  initials: string;
  view: 'upcoming' | 'past';
  onView: (view: 'upcoming' | 'past') => void;
  cards: SavedCard[];
  deductibleMet: number | null;
  deductibleTotal: number | null;
  history: PastScan[];
  onOpen: (card: SavedCard) => void;
  onTab: (tab: HomeTab | 'new') => void;
};

function Avatar({ initials }: { initials: string }) {
  return (
    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
      <T style={{ fontFamily: font.semibold, fontSize: 16, color: color.onAccent }} maxFontSizeMultiplier={1.2}>
        {initials}
      </T>
    </View>
  );
}

function EstimateCard({ card, onPress }: { card: SavedCard; onPress: () => void }) {
  const best = card.estimate.routes[0];
  if (!best) return null;
  const line = saveLine(card.estimate.routes);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [{ backgroundColor: color.surface, borderRadius: 28, padding: space.xl + 2, gap: space.sm }, pressed && { opacity: 0.8 }]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T style={[type.small, { color: color.inkMuted }]}>{card.estimate.procedure.label}</T>
        <T style={[type.small, { color: color.inkMuted }]}>{card.label}</T>
      </View>
      <Money value={best.estimate.scan.patientPays} style={[figure(56), { marginVertical: space.xs }]} suffixSize={15} />
      <T style={type.rowTitle}>
        {verb(best)} at {best.facilityName}
      </T>
      {line ? <T style={[type.small, { color: color.accentDeep }]}>{line}</T> : null}
    </Pressable>
  );
}

function DeductibleCard({ met, total }: { met: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (met / total) * 100) : 0;
  return (
    <View style={{ backgroundColor: color.surface, borderRadius: 28, paddingHorizontal: space.xl + 2, paddingVertical: space.xl, gap: space.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' }}>
        <T style={[type.small, { color: color.inkMuted }]}>Deductible met</T>
        <T style={[type.rowTitle, { fontFamily: font.bold }]}>
          {dollars(met)} <T style={[type.small, { color: color.inkSubtle }]}>/ {dollars(total)}</T>
        </T>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: color.track, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${pct}%`, borderRadius: 4, backgroundColor: color.accent }} />
      </View>
    </View>
  );
}

function Past({ history }: { history: PastScan[] }) {
  if (history.length === 0) {
    return (
      <T style={[type.body, { color: color.inkMuted, paddingHorizontal: space.xs, marginTop: space.sm }]}>
        No past scans yet. Preclear doesn’t connect to your insurer, so it only knows what you enter.
      </T>
    );
  }
  const years = Array.from(new Set(history.map((scan) => scan.year)));
  const thisYear = history.filter((scan) => scan.year === years[0]);
  const spent = thisYear.reduce((sum, scan) => sum + scan.amount, 0);
  const counted = thisYear.reduce((sum, scan) => sum + scan.counted, 0);

  return (
    <View style={{ gap: space.md }}>
      <View style={{ backgroundColor: color.accent, borderRadius: 28, paddingHorizontal: space.xl + 2, paddingVertical: 18, gap: space.xs }}>
        <T style={[type.small, { color: color.onAccentMuted }]}>Spent on scans in {years[0]}</T>
        <Money value={spent} style={[figure(44), { color: color.onAccent }]} suffixSize={15} />
        <T style={[type.small, { color: color.onAccentMuted }]}>{dollars(counted)} counted toward your deductible</T>
      </View>
      {years.map((year) => (
        <View key={year}>
          <T style={[type.caption, { fontFamily: font.semibold, color: color.inkMuted, paddingHorizontal: space.xs, paddingBottom: 6 }]}>
            {year}
          </T>
          <View style={{ backgroundColor: color.surface, borderRadius: radius.card }}>
            {history
              .filter((scan) => scan.year === year)
              .map((scan, i) => (
                <View
                  key={`${scan.name}-${scan.date}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    paddingHorizontal: 18,
                    paddingVertical: space.md,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: color.line,
                  }}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <T style={type.rowTitle}>{scan.name}</T>
                    <T style={[type.caption, { color: color.inkMuted }]}>
                      {scan.paidBy === 'cash' ? 'Cash' : 'Insurance'} · {scan.facilityName} · {scan.date}
                    </T>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    <Money value={scan.amount} style={[type.rowTitle, { fontFamily: font.bold, textAlign: 'right' }]} suffixSize={12} stacked />
                    <Tag label={scan.counted > 0 ? 'Counted' : 'Didn’t count'} tone="neutral" />
                  </View>
                </View>
              ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export function Home({ initials, view, onView, cards, deductibleMet, deductibleTotal, history, onOpen, onTab }: Props) {
  return (
    <View style={{ flex: 1 }}>
      <Screen bare contentStyle={{ paddingHorizontal: space.xl, paddingTop: 28, paddingBottom: 120, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xs }}>
          <T accessibilityRole="header" style={type.display} maxFontSizeMultiplier={textScale.heading}>
            Estimates
          </T>
          <Avatar initials={initials} />
        </View>
        <Segmented
          options={[
            { key: 'upcoming', label: 'Upcoming' },
            { key: 'past', label: 'Past' },
          ]}
          value={view}
          onChange={(key) => onView(key as 'upcoming' | 'past')}
        />
        {view === 'upcoming' ? (
          <>
            {cards.length === 0 ? (
              <T style={[type.body, { color: color.inkMuted, paddingHorizontal: space.xs }]}>
                No saved estimates yet. Tap + to price a scan.
              </T>
            ) : (
              cards.map((card) => <EstimateCard key={card.id} card={card} onPress={() => onOpen(card)} />)
            )}
            {deductibleMet !== null && deductibleTotal !== null ? (
              <DeductibleCard met={deductibleMet} total={deductibleTotal} />
            ) : null}
          </>
        ) : (
          <Past history={history} />
        )}
      </Screen>
      <TabPill current="home" onHome={() => onTab('home')} onNew={() => onTab('new')} onPlan={() => onTab('plan')} />
    </View>
  );
}
