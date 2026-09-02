import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TAP_TARGET, color, size, space, stroke, type } from '../theme';
import { STEPS } from '../appData';

export function StepBar({
  current,
  onJump,
}: {
  current: number;
  onJump: (step: number) => void;
}) {
  return (
    <View style={styles.stepBar}>
      {STEPS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        // The scan flow stays sequential — a route ranking before the coverage
        // questions would be answering with defaults the member never saw.
        const locked = index > current;
        return (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: locked }}
            accessibilityLabel={
              done ? `${label}, completed, tap to change` : label
            }
            disabled={locked}
            onPress={() => onJump(index)}
            style={({ pressed }) => [
              styles.stepItem,
              pressed && styles.stepItemPressed,
            ]}
          >
            <View
              style={[
                styles.stepDot,
                active && styles.stepDotActive,
                done && styles.stepDotDone,
              ]}
            >
              <Text style={[styles.stepNumber, active && styles.stepNumberActive]}>
                {index + 1}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              style={[
                styles.stepLabel,
                active && styles.stepLabelActive,
                locked && styles.stepLabelPending,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stepBar: {
    flexDirection: 'row',
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
    paddingBottom: space.xs,
    // Four steps now, so the generous gap no longer fits across a phone.
    gap: space.sm,
    borderBottomWidth: stroke.hairline,
    borderBottomColor: color.line,
  },
  // 44pt tall because these are primary navigation, not decoration. The row
  // keeps its old height overall — the padding moved from the bar onto the
  // items, so the target grew without the bar growing.
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    flexShrink: 1,
    minHeight: TAP_TARGET,
  },
  stepItemPressed: { opacity: 0.6 },
  stepDot: {
    width: size.stepDot,
    height: size.stepDot,
    // Half the width, derived rather than restated, so the dot cannot stop
    // being round when the size changes.
    borderRadius: size.stepDot / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.line,
  },
  stepDotActive: { backgroundColor: color.accent },
  stepDotDone: { backgroundColor: color.slate },
  stepNumber: { ...type.captionStrong, color: color.inkMuted },
  stepNumberActive: { color: color.accentInk },
  stepLabel: { ...type.label, color: color.inkMuted },
  stepLabelActive: { color: color.ink },
  stepLabelPending: { opacity: 0.45 },
});
