import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { color, radius, space, type } from '../theme';

export function PrimaryButton({
  label,
  onPress,
  tone = 'slate',
  /**
   * Set while an async action this button started (a purchase, a restore) is
   * in flight. Without this, tapping "Start yearly plan" gave no feedback for
   * however long the store round-trip took, which reads as an unresponsive
   * button rather than a working one — and invites a second tap that fires
   * the purchase flow twice.
   */
  pending = false,
  /**
   * Drops the top margin, for a button that is already separated from the
   * content by its own container — the pinned action bar in `App.tsx`, where
   * the bar's padding and top rule do the spacing this margin normally does.
   */
  compact = false,
}: {
  label: string;
  onPress: () => void;
  tone?: 'slate' | 'accent';
  pending?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: pending, busy: pending }}
      disabled={pending}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        tone === 'accent' && styles.buttonAccent,
        pressed && !pending && styles.buttonPressed,
        pending && styles.buttonPending,
      ]}
    >
      {pending ? (
        <ActivityIndicator color={tone === 'accent' ? color.accentInk : color.surface} />
      ) : (
        <Text style={[styles.buttonText, tone === 'accent' && styles.buttonTextAccent]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.slate,
    borderRadius: radius.md,
    marginTop: space.xl,
    minHeight: space.xl + space.lg,
  },
  buttonCompact: { marginTop: 0 },
  buttonPending: { opacity: 0.75 },
  // Accent is reserved for the recommended route elsewhere in the app; this
  // is the one other place it appears, and it's the only accent element on
  // the landing screen.
  buttonAccent: { backgroundColor: color.accent },
  buttonPressed: { opacity: 0.85 },
  buttonText: { ...type.bodyStrong, color: color.surface },
  buttonTextAccent: { color: color.accentInk },
});
