/**
 * A labelled row of preset values — the replacement for the sliders.
 *
 * Three reasons this beats a slider here, in order of how much they matter.
 *
 * **It cannot lag.** A slider emits a value on every touch-move event, and each
 * one re-ran `buildRoutes` and `rankRoutes` across every facility. Roughly sixty
 * full routing passes a second, on a step that does not display a route. A tap
 * emits one value.
 *
 * **It is honest about precision.** Every figure on this screen is a number the
 * patient is recalling, not reading off a statement. A slider that lands on
 * $2,250 implies a precision nobody has; a bucket does not.
 *
 * **It is reachable.** The slider thumb was a 30pt target that had to be dragged
 * accurately. These are 44pt and need one tap.
 *
 * The presets deliberately include every value the demo walkthrough in
 * CLAUDE.md uses — $2,000 remaining, 20% coinsurance, $8,000 of other care, and
 * 2 and 6 weeks of treatment — so the ranking flip can be reproduced by tapping
 * rather than by landing a drag on an exact number.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TAP_TARGET, color, radius, space, type as typography } from './theme';

export type ChoiceOption = {
  value: number;
  /** Short enough to sit in a row of six. */
  label: string;
  /** Spoken instead of `label`, where the short form would be unclear. */
  spoken?: string;
};

export function Choice({
  label,
  value,
  options,
  onChange,
  readout,
}: {
  label: string;
  value: number;
  options: ChoiceOption[];
  onChange: (value: number) => void;
  /**
   * The selected value, fully formatted. Money passes through `money()` so the
   * word "estimate" stays inside the string — the short chip labels below are
   * scale markings, and this is the figure.
   */
  readout: string;
}) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{readout}</Text>
      </View>
      <View style={styles.row}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.spoken ?? option.label}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.option,
                selected && styles.optionSelected,
                pressed && styles.optionPressed,
              ]}
            >
              <Text
                numberOfLines={1}
                style={[styles.optionText, selected && styles.optionTextSelected]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: space.lg },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: space.sm,
    marginBottom: space.sm,
  },
  label: { ...typography.label, color: color.ink, flexShrink: 1 },
  value: { ...typography.label, color: color.ink, fontWeight: '700' },

  // Wraps rather than overflows. Six presets fit one line on a phone at this
  // padding; a narrower device or larger text gets a second line instead of a
  // row that runs off the screen.
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },

  // Tighter horizontally than a normal chip so six fit across, and full height
  // so the target is still 44pt. Condensing the height instead would have made
  // the row unreachable rather than merely tight.
  option: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.surface,
    paddingHorizontal: space.sm,
    minHeight: TAP_TARGET,
  },
  optionSelected: { borderColor: color.slate, backgroundColor: color.slate },
  optionPressed: { opacity: 0.7 },
  optionText: { ...typography.label, color: color.ink },
  optionTextSelected: { color: color.surface },
});
