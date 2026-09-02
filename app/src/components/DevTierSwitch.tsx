import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TAP_TARGET, color, radius, space, stroke, type } from '../theme';

/** Free/Pro switch for testing. `__DEV__` only — see the call site in App.tsx. */
export function DevTierSwitch({
  subscribed,
  onFree,
  onPro,
}: {
  subscribed: boolean;
  onFree: () => void;
  onPro: () => void;
}) {
  return (
    <View style={styles.devBar}>
      <Text style={styles.devLabel}>Testing</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: !subscribed }}
        onPress={onFree}
        style={[styles.devChip, !subscribed && styles.devChipOn]}
      >
        <Text style={[styles.devChipText, !subscribed && styles.devChipTextOn]}>
          Free
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: subscribed }}
        onPress={onPro}
        style={[styles.devChip, subscribed && styles.devChipOn]}
      >
        <Text style={[styles.devChipText, subscribed && styles.devChipTextOn]}>
          Household
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Sits outside the ScrollView, so it is reachable from every step without
  // scrolling. Development builds only.
  devBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderTopWidth: stroke.hairline,
    borderTopColor: color.line,
    backgroundColor: color.surface,
  },
  devLabel: { ...type.caption, color: color.inkMuted, marginRight: space.xs },
  devChip: {
    borderRadius: radius.sm,
    borderWidth: stroke.control,
    borderColor: color.border,
    paddingHorizontal: space.md,
    minHeight: TAP_TARGET,
    justifyContent: 'center',
  },
  devChipOn: { backgroundColor: color.slate, borderColor: color.slate },
  devChipText: { ...type.caption, color: color.inkMuted },
  devChipTextOn: { color: color.surface, fontWeight: '700' },
});
