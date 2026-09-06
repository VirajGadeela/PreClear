import { Pressable, Text, View } from 'react-native';
import { TAP_TARGET, radius, space, stroke, type } from '../theme';
import { useStyles } from '../ThemeProvider';
import { themed } from '../styles/themed';

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
  const styles = useStyles(sheets);

  return (
    <View style={styles.devBar}>
      <Text style={styles.devLabel}>Testing</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: !subscribed }}
        onPress={onFree}
        style={({ pressed }) => [
          styles.devChip,
          !subscribed && styles.devChipOn,
          pressed && styles.devChipPressed,
        ]}
      >
        <Text style={[styles.devChipText, !subscribed && styles.devChipTextOn]}>
          Free
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: subscribed }}
        onPress={onPro}
        style={({ pressed }) => [
          styles.devChip,
          subscribed && styles.devChipOn,
          pressed && styles.devChipPressed,
        ]}
      >
        <Text style={[styles.devChipText, subscribed && styles.devChipTextOn]}>
          Household
        </Text>
      </Pressable>
    </View>
  );
}

const sheets = themed((c) => ({
  // Sits outside the ScrollView, so it is reachable from every step without
  // scrolling. Development builds only.
  devBar: {
    flexDirection: 'row',
    alignItems: 'center',
    // Wraps, so the second chip drops to its own line at accessibility text
    // sizes rather than being clipped by the right edge. __DEV__ only, but it
    // is on screen in every screenshot taken of this app.
    flexWrap: 'wrap',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderTopWidth: stroke.hairline,
    borderTopColor: c.line,
    backgroundColor: c.surface,
  },
  devLabel: { ...type.caption, color: c.inkMuted, marginRight: space.xs },
  devChip: {
    borderRadius: radius.sm,
    borderWidth: stroke.control,
    borderColor: c.border,
    paddingHorizontal: space.md,
    minHeight: TAP_TARGET,
    justifyContent: 'center',
  },
  devChipOn: { backgroundColor: c.slate, borderColor: c.slate },
  devChipPressed: { opacity: 0.7 },
  devChipText: { ...type.caption, color: c.inkMuted },
  devChipTextOn: { ...type.captionStrong, color: c.slateInk },
}));
