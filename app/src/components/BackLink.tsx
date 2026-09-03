import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text } from 'react-native';
import { TAP_TARGET, size, space, type } from '../theme';
import { useStyles, useTheme } from '../ThemeProvider';
import { themed } from '../styles/themed';

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
  const styles = useStyles(sheets);
  const { c } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
      hitSlop={space.sm}
      onPress={onPress}
      style={({ pressed }) => [styles.backLink, pressed && styles.backLinkPressed]}
    >
      <Ionicons name="chevron-back" size={size.icon.md} color={c.inkMuted} />
      <Text style={styles.backLinkText}>{label}</Text>
    </Pressable>
  );
}

const sheets = themed((c) => ({
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    minHeight: TAP_TARGET,
  },
  backLinkPressed: { opacity: 0.6 },
  backLinkText: { ...type.label, color: c.inkMuted },
}));
