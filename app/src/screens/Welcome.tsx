/**
 * 01 · Welcome: a scroll story that plays by itself and stops when touched.
 *
 * It carries the whole idea in the first ten seconds of the video: cash looks
 * cheaper, cash earns no deductible credit, and with more care coming the
 * ranking flips. The walkthrough drew it with invented prices. These are real:
 * Franciscan Health Indianapolis's published rates for a knee MRI (CPT 73721)
 * under Anthem Blue Access PPO with COPPS, against its published discounted
 * cash price, for a member with $2,000 of deductible left, 20% coinsurance and
 * $6,000 of out-of-pocket room.
 *
 * They are computed here from the bundle by the same `buildRoutes` the result
 * screens use, not typed in, so a change to the published files changes this
 * screen too. The plan is named on screen because the comparison is only true
 * for that plan: the same hospital publishes $360.22 for other Anthem plans,
 * where cash is the worse deal.
 *
 * `cashIsAppropriate` is forced on here, unlike the routing gate elsewhere,
 * because the point of this story is showing both numbers in the scenario
 * where insurance wins. It is an illustration, not a recommendation to pay
 * cash.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  SafeAreaView,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { data } from '../appData';
import { Money } from '../Money';
import { buildRoutes, rankRoutes } from '../routes';
import { color, figure, font, onAccentCard, space, textScale, type } from '../theme';
import { Button, T } from '../ui';

const CASE = {
  cpt: '73721',
  payer: 'anthem',
  facilityKey: 'franciscan-indianapolis',
  plan: 'Blue Access PPO with COPPS',
  benefits: { deductibleRemaining: 2000, coinsuranceRate: 0.2, oopMaxRemaining: 6000, copay: 0 },
  laterCare: 8000,
};

function caseFigures() {
  const facility = data.procedures
    .find((procedure) => procedure.cpt === CASE.cpt)
    ?.payers[CASE.payer]?.find((item) => item.facility_key === CASE.facilityKey);
  if (!facility) return null;
  const run = (other: number) => {
    const routes = rankRoutes(
      buildRoutes({
        facilities: [facility],
        benefits: CASE.benefits,
        expectedOtherAllowedSpend: other,
        orderedFacilityKey: CASE.facilityKey,
        memberPlan: CASE.plan,
        cashIsAppropriate: true,
      }),
    );
    return {
      cash: routes.find((route) => route.kind === 'cash_non_contracted'),
      insurance: routes.find((route) => route.kind === 'in_network_as_written'),
    };
  };
  const today = run(0);
  const year = run(CASE.laterCare);
  if (!today.cash || !today.insurance || !year.cash || !year.insurance) return null;
  return {
    facilityName: facility.facility_name,
    cashScan: today.cash.estimate.scan.patientPays,
    insScan: today.insurance.estimate.scan.patientPays,
    cashYear: year.cash.estimate.totalThisYear,
    insYear: year.insurance.estimate.totalThisYear,
  };
}

const FIG = caseFigures();

/** The design's autoplay: hold, scroll to the next act, hold. [ms, progress]. */
const KEYFRAMES: [number, number][] = [
  [0, 0], [1400, 0], [2900, 0.22], [4500, 0.22], [6300, 0.5],
  [7900, 0.5], [9900, 0.79], [11500, 0.79], [13300, 1],
];

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

type Props = { onStart: () => void; onAccount: () => void };

export function Welcome({ onStart, onAccount }: Props) {
  const { width, height } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const frame = useRef<number | null>(null);
  const [p, setP] = useState(0);
  const [viewport, setViewport] = useState(height);
  const contentHeight = viewport * 5.3;
  const maxY = contentHeight - viewport;

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  useEffect(() => {
    const begin = setTimeout(() => {
      const start = Date.now();
      const step = () => {
        const t = Date.now() - start;
        let i = 0;
        while (i < KEYFRAMES.length - 2 && t > KEYFRAMES[i + 1][0]) i++;
        const [t0, p0] = KEYFRAMES[i];
        const [t1, p1] = KEYFRAMES[i + 1];
        const u = clamp((t - t0) / (t1 - t0));
        const smooth = u * u * (3 - 2 * u);
        scroll.current?.scrollTo({ y: maxY * (p0 + (p1 - p0) * smooth), animated: false });
        if (t < KEYFRAMES[KEYFRAMES.length - 1][0]) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    }, 900);
    return () => {
      clearTimeout(begin);
      stop();
    };
  }, [maxY, stop]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    setP(maxY > 0 ? clamp(y / maxY) : 0);
  };

  const seg = (a: number, b: number) => clamp((p - a) / (b - a));
  const win = (a: number, b: number, c: number, d: number) => {
    const inn = seg(a, b);
    const out = seg(c, d);
    return { opacity: inn * (1 - out), transform: [{ translateY: 18 * (1 - inn) - 18 * out }] };
  };

  const acts = [win(0.1, 0.15, 0.28, 0.33), win(0.33, 0.38, 0.53, 0.58), win(0.58, 0.63, 0.8, 0.85), win(0.85, 0.9, 2, 3)];
  const heroFade = 1 - seg(0.03, 0.1);
  const cta = seg(0.9, 0.96);

  if (!FIG) return null;

  // Act 2: insurance fills the deductible, cash adds nothing.
  const fillShare = Math.min(1, FIG.insScan / CASE.benefits.deductibleRemaining);
  const filled = ease(seg(0.38, 0.48));
  const lit = Math.round(10 * fillShare * filled);

  // Act 3: both totals grow with the later care; insurance ends lower.
  const grow = ease(seg(0.64, 0.76));
  const cashNow = FIG.cashScan + (FIG.cashYear - FIG.cashScan) * grow;
  const insNow = FIG.insScan + (FIG.insYear - FIG.insScan) * grow;
  const barRoom = Math.min(300, viewport * 0.36);
  const scale = barRoom / Math.max(FIG.cashYear, FIG.insYear);
  const chip = ease(seg(0.61, 0.65));

  const answer = ease(seg(0.86, 0.92));
  const keep = FIG.cashYear - FIG.insYear;

  const muted = { color: color.onAccentMuted };
  const white = { color: color.onAccent };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.accent }}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }} onLayout={(event) => setViewport(event.nativeEvent.layout.height)}>
        {/* The stage. It sits under the ScrollView, which is transparent and only drives progress. */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
          <View style={{ position: 'absolute', top: 14, left: 28, right: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color.onAccent }} />
              <T style={[{ fontFamily: font.bold, fontSize: 22, letterSpacing: -0.66 }, white]} maxFontSizeMultiplier={1.3}>
                preclear
              </T>
            </View>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {[[0.1, 0.33], [0.33, 0.58], [0.58, 0.85], [0.85, 1]].map(([a, b]) => (
                <View key={a} style={{ width: 18, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${seg(a, b) * 100}%`, backgroundColor: color.onAccent }} />
                </View>
              ))}
            </View>
          </View>

          {/* Hero */}
          <View style={{ position: 'absolute', top: 0, bottom: 70, left: 28, right: 28, justifyContent: 'center', gap: space.lg, opacity: heroFade, transform: [{ translateY: -40 * (1 - heroFade) }] }}>
            <Money value={FIG.cashScan} style={[figure(136), white]} suffixSize={20} stacked fitWidth={width - 56} />
            <T style={[type.title, { fontFamily: font.semibold, fontSize: 26, lineHeight: 31 }, white]} maxFontSizeMultiplier={textScale.heading}>
              Cheaper isn’t always cheaper.
            </T>
          </View>
          <View style={{ position: 'absolute', bottom: 44, left: 0, right: 0, alignItems: 'center', gap: 10, opacity: heroFade }}>
            <T style={[type.caption, { fontFamily: font.semibold, letterSpacing: 0.8 }, white]}>SCROLL</T>
            <View style={{ width: 1.5, height: 32, backgroundColor: color.onAccent, borderRadius: 1 }} />
          </View>

          {/* Act 1: cash looks cheaper */}
          <View style={[{ position: 'absolute', top: 72, left: 20, right: 20, gap: space.md }, acts[0]]}>
            <T style={[type.title, white, { paddingHorizontal: 8 }]} maxFontSizeMultiplier={textScale.heading}>
              Cash looks cheaper.
            </T>
            <View style={{ height: 190, borderRadius: 26, padding: 22, backgroundColor: color.surface, flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md }}>
              <View style={{ justifyContent: 'space-between' }}>
                <View style={{ gap: 4 }}>
                  <T style={{ fontFamily: font.semibold, fontSize: 20 }}>Cash</T>
                  <T style={[type.small, { color: color.inkMuted }]}>Scan price</T>
                </View>
                <View style={{ backgroundColor: color.accentTint, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <T style={[type.caption, { fontFamily: font.semibold, color: color.accentDeep }]}>Lower price</T>
                </View>
              </View>
              <Money value={FIG.cashScan} style={[figure(54), { color: color.accentDeep, alignSelf: 'flex-end' }]} suffixSize={14} />
            </View>
            <View style={{ height: 190, borderRadius: 26, padding: 22, backgroundColor: onAccentCard, flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ gap: 4 }}>
                <T style={[{ fontFamily: font.semibold, fontSize: 20 }, white]}>Insurance</T>
                <T style={[type.small, muted]}>Scan price</T>
              </View>
              <Money value={FIG.insScan} style={[figure(54), white, { alignSelf: 'flex-end' }]} suffixSize={14} />
            </View>
          </View>

          {/* Act 2: cash earns no deductible credit */}
          <View style={[{ position: 'absolute', top: 72, left: 28, right: 28, gap: 30 }, acts[1]]}>
            <T style={[type.title, white]} maxFontSizeMultiplier={textScale.heading}>
              But cash doesn’t count toward your deductible.
            </T>
            {[
              { label: 'Insurance', amount: FIG.insScan * filled, lit },
              { label: 'Cash', amount: 0, lit: -1 },
            ].map((row) => (
              <View key={row.label} style={{ gap: space.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <T style={[type.rowLarge, white]}>{row.label}</T>
                  <T style={[{ fontFamily: font.bold, fontSize: 22 }, white]}>
                    +<Money value={row.amount} style={[{ fontFamily: font.bold, fontSize: 22 }, white]} suffixSize={13} />
                  </T>
                </View>
                <View style={{ flexDirection: 'row', gap: 5 }}>
                  {Array.from({ length: 10 }, (_, i) => (
                    <View
                      key={i}
                      style={
                        row.lit < 0
                          ? { flex: 1, height: 44, borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.35)' }
                          : { flex: 1, height: 44, borderRadius: 8, backgroundColor: i < row.lit ? color.onAccent : 'rgba(255,255,255,0.14)' }
                      }
                    />
                  ))}
                </View>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.3)', paddingTop: space.md }}>
              <Money value={0} style={[type.small, muted]} suffixSize={12} maxScale={2} />
              <T style={[type.small, muted]}>
                <Money value={CASE.benefits.deductibleRemaining} style={[type.small, muted]} suffixSize={12} maxScale={2} /> · insurance starts paying
              </T>
            </View>
          </View>

          {/* Act 3: with later care, insurance wins */}
          <View style={[{ position: 'absolute', top: 72, left: 28, right: 28, bottom: 40 }, acts[2]]}>
            <T style={[type.title, white]} maxFontSizeMultiplier={textScale.heading}>
              With surgery later this year, insurance wins.
            </T>
            <View style={{ alignItems: 'center', marginTop: space.xxl, opacity: chip, transform: [{ translateY: 14 * (1 - chip) }] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 18, borderRadius: 22, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)' }}>
                <Ionicons name="add" size={20} color={color.onAccent} />
                <T style={[type.bodyMedium, { fontFamily: font.semibold }, white]}>
                  Knee surgery ·{' '}
                  <Money value={CASE.laterCare} style={[type.bodyMedium, { fontFamily: font.semibold }, white]} suffixSize={13} maxScale={2} />
                </T>
              </View>
            </View>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 36, marginTop: space.xxl, marginHorizontal: 16, borderBottomWidth: 1.5, borderBottomColor: 'rgba(255,255,255,0.5)' }}>
              {[
                { label: 'Cash', value: cashNow, fill: 'rgba(255,255,255,0.28)', badge: false },
                { label: 'Insurance', value: insNow, fill: color.onAccent, badge: p >= 0.76 },
              ].map((bar) => (
                <View key={bar.label} style={{ flex: 1, alignItems: 'center', gap: 10 }}>
                  {bar.badge ? (
                    // Wider than its column on purpose, so "less" never wraps under the figure.
                    <View style={{ width: 176, alignItems: 'center', backgroundColor: color.surface, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}>
                      <T style={[type.caption, { fontFamily: font.semibold, color: color.accentDeep }]} maxFontSizeMultiplier={1.3}>
                        <Money value={keep} style={[type.caption, { fontFamily: font.semibold, color: color.accentDeep }]} suffixSize={12} maxScale={1.3} /> less
                      </T>
                    </View>
                  ) : null}
                  <Money value={bar.value} style={[figure(26), white, { textAlign: 'center' }]} suffixSize={12} stacked />
                  <View style={{ width: '100%', height: bar.value * scale, borderTopLeftRadius: 14, borderTopRightRadius: 14, backgroundColor: bar.fill }} />
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 36, marginHorizontal: 16, marginTop: space.md }}>
              <T style={[type.rowTitle, white, { flex: 1, textAlign: 'center' }]}>Cash</T>
              <T style={[type.rowTitle, white, { flex: 1, textAlign: 'center' }]}>Insurance</T>
            </View>
          </View>

          {/* Act 4: Preclear does this math */}
          <View style={[{ position: 'absolute', top: 72, left: 28, right: 28 }, acts[3]]}>
            <T style={[type.title, white]} maxFontSizeMultiplier={textScale.heading}>
              Preclear does this math for you.
            </T>
            <View style={{ marginTop: space.xxl + 8, opacity: answer, transform: [{ scale: 0.94 + 0.06 * answer }] }}>
              <T style={[type.rowTitle, { fontSize: 16 }, muted]}>With insurance, you keep</T>
              <Money value={keep} style={[figure(120), white, { marginTop: 14 }]} suffixSize={20} stacked fitWidth={width - 56} />
              <T style={[type.headline, { fontSize: 22 }, white, { marginTop: 10 }]}>this year.</T>
              <View style={{ marginTop: space.xxl + 4, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: color.surface, borderRadius: 999, paddingVertical: 8, paddingLeft: 8, paddingRight: 18, maxWidth: '100%' }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="checkmark" size={18} color={color.onAccent} />
                </View>
                <T style={[type.bodyMedium, { fontFamily: font.semibold, flexShrink: 1 }]}>Use insurance at {FIG.facilityName}</T>
              </View>
            </View>
          </View>
        </View>

        <ScrollView
          ref={scroll}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onScrollBeginDrag={stop}
          onTouchStart={stop}
          showsVerticalScrollIndicator={false}
          accessibilityLabel="Welcome story. Scroll to continue."
        >
          <View style={{ height: contentHeight }} />
        </ScrollView>

        <View
          pointerEvents={cta > 0.5 ? 'box-none' : 'none'}
          style={{ position: 'absolute', left: 24, right: 24, bottom: 20, gap: space.sm, opacity: cta, transform: [{ translateY: 24 * (1 - cta) }] }}
        >
          <Button label="Get started" variant="white" onPress={onStart} />
          <Pressable
            accessibilityRole="button"
            onPress={onAccount}
            style={({ pressed }) => [{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}
          >
            <T style={[type.button, { fontSize: 16 }, white]}>I have an account</T>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
