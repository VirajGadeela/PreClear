import { StyleSheet, Text, View } from 'react-native';
import { color, space, textScale, type } from '../theme';

/**
 * The wordmark, and for now nothing else.
 *
 * It used to carry a back link, because navigation was a chain and every screen
 * needed a way one step up it. The tab bar ended the chain: every destination
 * is one tap from every other, so a back control here would either duplicate a
 * tab or walk a history the tabs deliberately do not keep.
 *
 * The right slot is left free on purpose — the theme toggle belongs there, and
 * a bar with one item is easier to add a second to than a bar with three.
 */
export function TopBar() {
  return (
    <View style={styles.topBar}>
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
