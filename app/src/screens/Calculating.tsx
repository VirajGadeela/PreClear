/**
 * 07 · Calculating.
 *
 * The math itself takes milliseconds, so this screen does not pretend to wait
 * on anything. What it does is show the work: how many routes came out, how
 * many published price lists went in, which criteria the order was checked
 * against, and which of the member's figures were applied. Every number on it
 * comes from the estimate it precedes. It moves on by itself after about a
 * second and a half, and a tap skips it.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { publisher } from '../citation';
import { Estimate } from '../estimate';
import { CARE_SHORT, CareKey } from '../flow';
import { color, figure, font, space, textScale, type } from '../theme';
import { Screen, T } from '../ui';

const PAYER_SHORT: Record<string, string> = {
  anthem: 'Anthem',
  unitedhealthcare: 'UnitedHealthcare',
  aetna: 'Aetna',
  cigna: 'Cigna',
};

const DURATION = 1500;

type Props = {
  estimate: Estimate;
  care: CareKey;
  onDone: () => void;
};

export function Calculating({ estimate, care, onDone }: Props) {
  const fill = useRef(new Animated.Value(0)).current;
  const [stage, setStage] = useState(0);
  // Held in a ref so a parent re-render cannot restart the timers.
  const finish = useRef(onDone);
  finish.current = onDone;

  useEffect(() => {
    Animated.timing(fill, { toValue: 1, duration: DURATION, useNativeDriver: false }).start();
    const timers = [
      setTimeout(() => setStage(1), DURATION * 0.35),
      setTimeout(() => setStage(2), DURATION * 0.7),
      setTimeout(() => setStage(3), DURATION),
      setTimeout(() => finish.current(), DURATION + 300),
    ];
    return () => timers.forEach(clearTimeout);
  }, [fill]);

  const count = estimate.routes.length;
  const scan = estimate.procedure.label.charAt(0).toLowerCase() + estimate.procedure.label.slice(1);
  const rules = estimate.applicable;
  const lines = [
    `${estimate.priceLists} Indianapolis price lists for ${PAYER_SHORT[estimate.query.payer] ?? 'your insurer'}`,
    rules.length > 0
      ? `${rules.length} ${publisher(rules[0].requirement)} criteria for this order`
      : 'No published criteria recorded for this scan',
    `Your deductible and ${CARE_SHORT[care]}`,
  ];

  return (
    <Screen bare scroll={false} contentStyle={{ justifyContent: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Skip to the estimate"
        onPress={onDone}
        style={{ flex: 1, justifyContent: 'center', gap: space.xxl + 4, paddingHorizontal: space.sm }}
      >
        <View>
          <T style={figure(96, 'bold')} maxFontSizeMultiplier={textScale.figure}>
            {count}
          </T>
          <T style={type.title} maxFontSizeMultiplier={textScale.heading}>
            {count === 1 ? 'route' : 'routes'} to your {scan} in Indianapolis
          </T>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: color.track, overflow: 'hidden' }}>
          <Animated.View
            style={{
              height: '100%',
              borderRadius: 3,
              backgroundColor: color.accent,
              width: fill.interpolate({ inputRange: [0, 1], outputRange: ['6%', '100%'] }),
            }}
          />
        </View>
        <View style={{ gap: space.lg }}>
          {lines.map((line, i) => {
            const done = stage > i;
            return (
              <View key={line} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
                <T style={[type.body, { fontFamily: font.medium, flex: 1, color: done ? color.ink : color.inkSubtle }]}>
                  {line}
                </T>
                <T style={[type.body, { fontFamily: font.medium, color: done ? color.accent : color.inkSubtle }]}>
                  {done ? 'Done' : 'Checking'}
                </T>
              </View>
            );
          })}
        </View>
      </Pressable>
    </Screen>
  );
}
