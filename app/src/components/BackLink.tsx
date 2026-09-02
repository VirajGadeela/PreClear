import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';
import { TAP_TARGET, color, space, type } from '../theme';

/**
 * The one back control in the app.
 *
 * It names its destination rather than just saying "Back", because this app has
 * two things a member can be inside — the scan flow and the household plan —
 * and "Back" alone does not say which way you are about to go.
 *
 * The chevron was a Unicode character rather than an icon glyph until this
 * redesign, specifically to avoid a native module this app didn't otherwise
 * need. `@expo/vector-icons` turned out to ride on `expo-font`, already
 * compiled into this build for Manrope — so it costs nothing further, and a
 * vector glyph aligns and weights consistently across devices in a way a
 * font's own punctuation character does not.
 */
export function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
      hitSlop={space.sm}
      onPress={onPress}
      style={({ pressed }) => [styles.backLink, pressed && styles.backLinkPressed]}
    >
      <Ionicons name="chevron-back" size={20} color={color.inkMuted} />
      <Text style={styles.backLinkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    minHeight: TAP_TARGET,
  },
  backLinkPressed: { opacity: 0.6 },
  backLinkText: { ...type.label, color: color.inkMuted },
});
