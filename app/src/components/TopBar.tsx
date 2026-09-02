import { StyleSheet, Text, View } from 'react-native';
import { color, space, textScale, type } from '../theme';
import { BackLink } from './BackLink';

/**
 * Brand plus the way out.
 *
 * The back control lives here rather than in each screen's content because this
 * bar sits outside the ScrollView. A back link inside the content scrolls off
 * the top, so on a long screen — the routes list, the household review — there
 * would be no way home without scrolling up first. Here it is always on screen.
 */
export function TopBar({ backLabel, onBack }: { backLabel: string; onBack: () => void }) {
  return (
    <View style={styles.topBar}>
      <BackLink label={backLabel} onPress={onBack} />
      <Text
        style={styles.brand}
        maxFontSizeMultiplier={textScale.chrome}
        numberOfLines={1}
      >
        Preclear
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    gap: space.md,
  },
  // Capped and shrinkable. At accessibility text sizes the wordmark ran off
  // the right edge of the screen: `space-between` gives it as much width as
  // it asks for, and it asked for more than the screen had. The cap keeps it
  // on one line, `flexShrink` keeps it inside the bar if the back label is
  // long as well, and `numberOfLines` is the last resort behind both.
  brand: { ...type.title, color: color.ink, flexShrink: 1 },
});
