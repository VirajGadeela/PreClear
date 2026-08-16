/**
 * A slider built from core React Native primitives.
 *
 * Deliberately dependency-free. @react-native-community/slider and @expo/ui
 * both ship native code, which would mean a prebuild and a fresh native build
 * before the app would run again. This works with the dev client already
 * installed.
 *
 * A slider is its question, its value, its control. Nothing else. If the
 * value needs a sentence next to it to be understandable, the label is wrong
 * — fix the label, don't add the sentence back.
 */

import { useCallback, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { color, space } from './theme';

type Props = {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
};

const THUMB = 30;

export function Slider({
  label,
  value,
  minimum,
  maximum,
  step,
  onChange,
  format,
}: Props) {
  const [width, setWidth] = useState(0);
  // The responder closes over these, so they have to be refs rather than state.
  const widthRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.width;
    widthRef.current = measured;
    setWidth(measured);
  }, []);

  const emit = useCallback(
    (x: number) => {
      const track = widthRef.current - THUMB;
      if (track <= 0) return;
      const ratio = Math.min(Math.max((x - THUMB / 2) / track, 0), 1);
      const raw = minimum + ratio * (maximum - minimum);
      const stepped = Math.round(raw / step) * step;
      onChangeRef.current(Math.min(Math.max(stepped, minimum), maximum));
    },
    [maximum, minimum, step],
  );

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => emit(event.nativeEvent.locationX),
      onPanResponderMove: (event) => emit(event.nativeEvent.locationX),
    }),
  ).current;

  const ratio = maximum > minimum ? (value - minimum) / (maximum - minimum) : 0;
  const thumbLeft = ratio * Math.max(width - THUMB, 0);

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{format(value)}</Text>
      </View>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: minimum, max: maximum, now: value }}
        style={styles.track}
        onLayout={onLayout}
        {...responder.panHandlers}
      >
        <View style={styles.unfilled} />
        <View style={[styles.fill, { width: thumbLeft + THUMB / 2 }]} />
        <View style={[styles.thumb, { left: thumbLeft }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: space.xl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  label: {
    color: color.ink,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
    paddingRight: 12,
  },
  value: {
    color: color.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  track: {
    height: THUMB,
    justifyContent: 'center',
  },
  unfilled: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: color.line,
  },
  fill: {
    position: 'absolute',
    height: 6,
    borderRadius: 3,
    backgroundColor: color.slate,
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: color.surface,
    borderWidth: 3,
    borderColor: color.slate,
  },
});
