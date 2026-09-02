/**
 * A slider built from core React Native primitives.
 *
 * Deliberately dependency-free. @react-native-community/slider and @expo/ui
 * both ship native code, which would mean a prebuild and a fresh native build
 * before the app would run again. This works with the dev client already
 * installed.
 *
 * The thumb is 30pt because that is the size it should look; the *target* is
 * 44pt, because that is the size a finger needs. Those are different numbers
 * and this file used to conflate them.
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

import { TAP_TARGET, color, radius, space, stroke, type as typography } from './theme';

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
const TRACK = 6;

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

  // The last value actually reported, so a drag that stays inside one step does
  // not report it again. A full-width drag produces ~300 move events across 41
  // distinct values; without this, every one of them re-rendered the screen.
  const lastRef = useRef(value);
  lastRef.current = value;

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
      const next = Math.min(Math.max(stepped, minimum), maximum);
      if (next === lastRef.current) return;
      lastRef.current = next;
      onChangeRef.current(next);
    },
    [maximum, minimum, step],
  );

  // On a touch device the pressed state is the focus state — there is no hover
  // and no keyboard ring. Every other control in this app answers a finger;
  // the slider was the one that did not, so a drag gave no acknowledgement
  // that the thumb had been caught rather than the track merely tapped.
  const [dragging, setDragging] = useState(false);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        setDragging(true);
        emit(event.nativeEvent.locationX);
      },
      onPanResponderMove: (event) => emit(event.nativeEvent.locationX),
      onPanResponderRelease: () => setDragging(false),
      onPanResponderTerminate: () => setDragging(false),
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
              style={({ pressed }) => [styles.preset, pressed && styles.presetPressed]}
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
        <View
          style={[styles.thumb, dragging && styles.thumbDragging, { left: thumbLeft }]}
        />
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
    marginBottom: space.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: space.sm,
  },
  label: {
    ...typography.label,
    color: color.ink,
    flexShrink: 1,
    paddingRight: space.md,
  },
  value: {
    ...typography.label,
    color: color.ink,
    // No fontWeight. `label` is Manrope-SemiBold, a static weight file, so
    // fontWeight is not read for this role (see `font` in theme.ts) — the
    // '700' that used to sit here never rendered.
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginBottom: space.sm,
  },
  preset: {
    borderRadius: radius.sm,
    // Was 1px. A preset is a Pressable, so it takes the control weight the
    // Step 1 chips use — it had been drawn as if it were a divider.
    borderWidth: stroke.control,
    borderColor: color.border,
    paddingHorizontal: space.sm,
    minHeight: TAP_TARGET,
    justifyContent: 'center',
  },
  presetPressed: { opacity: 0.7 },
  // Matches the Chip component's unselected-state text (type.label, ink) —
  // this is a small button label, the same idiom used for the Step 1 chips,
  // not an explanatory caption.
  presetText: {
    ...typography.label,
    color: color.ink,
  },
  // 44pt of touchable height around a 30pt thumb. The visual weight is
  // unchanged; only the area that accepts a finger grew.
  track: {
    height: TAP_TARGET,
    justifyContent: 'center',
  },
  unfilled: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: TRACK,
    borderRadius: TRACK / 2,
    // `line` measures 1.2:1 against the canvas — the track was effectively
    // invisible until it was filled.
    backgroundColor: color.border,
  },
  fill: {
    position: 'absolute',
    height: TRACK,
    borderRadius: TRACK / 2,
    backgroundColor: color.slate,
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: color.surface,
    borderWidth: stroke.thumb,
    borderColor: color.slate,
  },
  // Held. The ring thickens and takes the accent rather than the thumb growing:
  // a thumb that changes size while it tracks a finger reads as the value
  // jumping, and this control's whole job is that the number under the finger
  // is the number being set.
  thumbDragging: { borderWidth: stroke.thumbHeld, borderColor: color.accent },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
  // Kept small — this is an axis endpoint, not a sentence someone reads and
  // decides from — but not muted: a faint "$10,000+" is exactly the kind of
  // thing this pass is trying to stop people skimming past.
  rangeText: {
    ...typography.caption,
    color: color.ink,
  },
  // Promoted to the slider's own body size and full ink, not caption-muted:
  // this is the one sentence that changes what value someone enters, so it
  // reads as part of the control, not an annotation trailing under it.
  help: {
    ...typography.body,
    color: color.ink,
    marginTop: space.xs,
  },
});
