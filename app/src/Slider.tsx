/**
 * A slider built from core React Native primitives.
 *
 * Deliberately dependency-free. @react-native-community/slider and @expo/ui
 * both ship native code, which would mean a prebuild and a fresh native build
 * before the app would run again. This works with the dev client already
 * installed.
 */

import { useCallback, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { color, radius, space, type as typography } from './theme';

export type Preset = { label: string; value: number };

type Props = {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
  helpText?: string;
  // Shown once at each end of the track. This is how a slider communicates
  // its range without a sentence of prose next to it — two or three
  // characters do the same job as a caption.
  rangeLabels?: [string, string];
  // Quick-jump chips for a value nobody can be expected to know exactly —
  // most people don't have their deductible or their expected medical
  // spend memorized. Tapping one moves the slider; it doesn't stay "selected,"
  // because the underlying value is continuous and dragging afterward would
  // desync it from any one preset.
  presets?: Preset[];
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
  helpText,
  rangeLabels,
  presets,
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
      {presets && presets.length > 0 && (
        <View style={styles.presetRow}>
          {presets.map((preset) => (
            <Pressable
              key={preset.label}
              accessibilityRole="button"
              accessibilityLabel={`Set ${label} to ${preset.label}`}
              onPress={() => onChangeRef.current(preset.value)}
              style={styles.preset}
            >
              <Text style={styles.presetText}>{preset.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
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
      {rangeLabels && (
        <View style={styles.rangeRow}>
          <Text style={styles.rangeText}>{rangeLabels[0]}</Text>
          <Text style={styles.rangeText}>{rangeLabels[1]}</Text>
        </View>
      )}
      {helpText ? <Text style={styles.help}>{helpText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 22,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  label: {
    color: color.ink,
    ...typography.label,
    fontSize: 14,
    flexShrink: 1,
    paddingRight: 12,
  },
  value: {
    color: color.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginBottom: space.sm,
  },
  preset: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
  },
  presetText: {
    ...typography.caption,
    fontWeight: '600',
    color: color.inkMuted,
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
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  rangeText: {
    ...typography.caption,
    color: color.inkMuted,
    opacity: 0.75,
  },
  help: {
    color: color.inkMuted,
    ...typography.caption,
    marginTop: 2,
  },
});
