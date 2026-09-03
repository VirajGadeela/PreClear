import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { TAP_TARGET, size, space, textScale, type } from '../theme';
import { useStyles, useTheme } from '../ThemeProvider';
import { BackLink } from './BackLink';
import { themed } from '../styles/themed';

/**
 * The wordmark, and for now nothing else.
 *
 * It used to carry a back link, because navigation was a chain and every screen
 * needed a way one step up it. The tab bar ended the chain: every destination
 * is one tap from every other, so a back control here would either duplicate a
 * tab or walk a history the tabs deliberately do not keep.
 *
 * It renders on every screen including the cover. The cover was chrome-free at
 * first and that was right while this bar only held navigation; it stopped
 * being right the moment the bar also held the theme toggle, because a control
 * missing from the first screen is a control a member has to find twice.
 *
 * The right slot now holds the theme toggle, which is the only control that
 * belongs on every screen at once: it changes nothing about the answer, so it
 * cannot be mistaken for one of the filters.
 */
export function TopBar({
  /**
   * Where back goes from here, named. Absent on the cover, which is the root —
   * a back control there would either do nothing or quit the app, and both are
   * worse than no control.
   */
  backLabel,
  onBack,
}: {
  backLabel?: string;
  onBack?: () => void;
}) {
  const styles = useStyles(sheets);
  const { scheme, c, toggle } = useTheme();
  const dark = scheme === 'dark';

  return (
    <View style={styles.topBar}>
      {/* The left slot holds one of the two, never both. Three items do not fit
          a 375pt bar at accessibility text sizes — the wordmark already ran off
          the right edge once with only the toggle beside it — and iOS spends
          this slot on the back control by convention. The tab bar underneath
          says which destination you are on, so the brand is not carrying
          orientation while it is away. */}
      {onBack && backLabel ? (
        <BackLink label={backLabel} onPress={onBack} />
      ) : (
        <Text
          style={styles.brand}
          maxFontSizeMultiplier={textScale.chrome}
          numberOfLines={1}
        >
          Preclear
        </Text>
      )}
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: dark }}
        // Names the destination, not the current state. "Dark mode, off" is
        // read by some screen readers as a label plus a state and by others as
        // a sentence, and the second reading is the wrong instruction.
        accessibilityLabel={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        onPress={toggle}
        hitSlop={space.sm}
        style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
      >
        <Ionicons
          name={dark ? 'sunny-outline' : 'moon-outline'}
          size={size.icon.md}
          color={c.inkMuted}
        />
      </Pressable>
    </View>
  );
}

const sheets = themed((c) => ({
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
  brand: { ...type.title, color: c.ink, flexShrink: 1 },

  // A full tap target, drawn with no border and no fill. The bar is chrome and
  // the icon is the affordance; an outlined button here would compete with the
  // controls on the screen below, which are the ones that change the answer.
  toggle: {
    width: TAP_TARGET,
    height: TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  togglePressed: { opacity: 0.6 },
}));
