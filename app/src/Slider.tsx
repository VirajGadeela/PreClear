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
  Text,
  View,
} from 'react-native';

import { TAP_TARGET, radius, space, stroke, type as typography } from './theme';
import { useStyles } from './ThemeProvider';
import { themed } from './styles/themed';

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
  const styles = useStyles(sheets);
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

  // The responder is created once, so it closes over the first render's props.
  // Anything the gesture arithmetic reads has to arrive through a ref, the
  // same way `width` and `onChange` already do.
  //
  // `step` is in here for the same reason the bounds are, and `emit` reads all
  // three from here rather than from its own closure. `emit` is a useCallback
  // that correctly lists them as dependencies, but the responder captured the
  // *first* one and keeps calling it forever, so those dependencies never
  // reach the gesture. That was invisible for as long as every slider's range
  // was a constant, and it stopped being invisible the moment one range
  // started tracking another control -- see the note on stepping below.
  const boundsRef = useRef({ minimum, maximum, step });
  boundsRef.current = { minimum, maximum, step };

  // The distance between the finger and the centre of the thumb at the moment
  // the thumb was grabbed. Zero when the touch landed on bare track.
  const grabRef = useRef(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.width;
    widthRef.current = measured;
    setWidth(measured);
  }, []);

  const emit = useCallback((x: number) => {
    // Live bounds, not the ones this closure was born with. The
    // out-of-pocket-maximum slider takes its minimum from the deductible, so
    // a stale minimum mapped the finger onto a range the member had already
    // moved: the value could be dragged below the deductible, and the guard
    // in App.tsx then pushed it straight back up. The thumb fought the drag.
    const { minimum: lo, maximum: hi, step: increment } = boundsRef.current;

    const track = widthRef.current - THUMB;
    if (track <= 0) return;
    const ratio = Math.min(Math.max((x - THUMB / 2) / track, 0), 1);
    const raw = lo + ratio * (hi - lo);

    // Steps are counted from the minimum, not from zero, which is the rule an
    // <input type="range"> follows and the one this had wrong. Counting from
    // zero puts the grid at multiples of `step` regardless of where the track
    // starts, so a minimum that is not itself a multiple is unreachable: with
    // the deductible at $2,250 the out-of-pocket slider bottomed out at
    // $2,500 and could never be dragged to its own left end.
    const stepped = lo + Math.round((raw - lo) / increment) * increment;
    const next = Math.min(Math.max(stepped, lo), hi);
    if (next === lastRef.current) return;
    lastRef.current = next;
    onChangeRef.current(next);
  }, []);

  // On a touch device the pressed state is the focus state — there is no hover
  // and no keyboard ring. Every other control in this app answers a finger;
  // the slider was the one that did not, so a drag gave no acknowledgement
  // that the thumb had been caught rather than the track merely tapped.
  const [dragging, setDragging] = useState(false);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Capture, not bubble.
      //
      // This slider sits inside the screener's scroll view, under a filter
      // panel and above a ranked list — so there is a lot to scroll and the
      // ScrollView is eager to claim a drag with any vertical component. It
      // would win the negotiation mid-gesture, fire onPanResponderTerminate,
      // and drop the thumb halfway through a drag. Claiming on the capture
      // phase settles it before the ScrollView is asked.
      //
      // This was survivable while the sliders had a short screen to themselves.
      // It is not survivable on a screen you can scroll.
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      // Two different gestures start here, and they must not behave the same.
      //
      // Grabbing the *thumb* is a drag: the value must not change until the
      // finger moves, and the thumb has to stay under the part of it that was
      // grabbed. Emitting on grant snapped the thumb's centre to the finger,
      // so catching it anywhere but dead centre jumped the value before the
      // drag began — up to half a thumb of deductible, from a touch the member
      // would call "picking it up". Apple's rule is that touch and content move
      // together, and iOS's own UISlider does not jump on touch-down either.
      //
      // Touching *bare track* is a different intent: the member is pointing at
      // a value, so jump to it and then track 1:1 from there.
      onPanResponderGrant: (event) => {
        setDragging(true);
        const { minimum: lo, maximum: hi } = boundsRef.current;
        const travel = Math.max(widthRef.current - THUMB, 0);
        const ratio = hi > lo ? (lastRef.current - lo) / (hi - lo) : 0;
        const thumbCentre = ratio * travel + THUMB / 2;
        const x = event.nativeEvent.locationX;
        if (Math.abs(x - thumbCentre) <= THUMB / 2) {
          grabRef.current = x - thumbCentre;
          return;
        }
        grabRef.current = 0;
        emit(x);
      },
      onPanResponderMove: (event) => emit(event.nativeEvent.locationX - grabRef.current),
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
        {/*
          None of these may become the touch target.

          `emit` reads `nativeEvent.locationX`, which React Native measures
          against the view the touch was dispatched to — not against the view
          holding the responder. The thumb is a 30pt child of the track, so
          grabbing the thumb rather than the bare track made locationX a number
          between 0 and 30 relative to the thumb, and the value snapped toward
          the minimum. Grabbing the thumb is the obvious way to use a slider,
          which is what made this look like the whole control was broken.

          pointerEvents="none" keeps the track the only target, so locationX is
          always measured against the thing the arithmetic assumes.
        */}
        <View pointerEvents="none" style={styles.unfilled} />
        <View pointerEvents="none" style={[styles.fill, { width: thumbLeft + THUMB / 2 }]} />
        <View
          pointerEvents="none"
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

const sheets = themed((c) => ({
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
    color: c.ink,
    flexShrink: 1,
    paddingRight: space.md,
  },
  value: {
    ...typography.label,
    color: c.ink,
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
    borderColor: c.border,
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
    color: c.ink,
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
    // `line` measures 1.19:1 against the canvas — the track was effectively
    // invisible until it was filled.
    backgroundColor: c.border,
  },
  fill: {
    position: 'absolute',
    height: TRACK,
    borderRadius: TRACK / 2,
    backgroundColor: c.slate,
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: c.surface,
    borderWidth: stroke.thumb,
    borderColor: c.slate,
  },
  // Held. The ring thickens and takes the accent rather than the thumb growing:
  // a thumb that changes size while it tracks a finger reads as the value
  // jumping, and this control's whole job is that the number under the finger
  // is the number being set.
  thumbDragging: { borderWidth: stroke.thumbHeld, borderColor: c.accent },
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
    color: c.ink,
  },
  // Promoted to the slider's own body size and full ink, not caption-muted:
  // this is the one sentence that changes what value someone enters, so it
  // reads as part of the control, not an annotation trailing under it.
  help: {
    ...typography.body,
    color: c.ink,
    marginTop: space.xs,
  },
}));
