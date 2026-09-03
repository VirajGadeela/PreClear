import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { TAP_TARGET, radius, size, space, stroke, type } from '../theme';
import { useStyles, useTheme } from '../ThemeProvider';
import { themed } from '../styles/themed';

export function Chip({
  selected,
  label,
  spoken,
  block,
  onPress,
}: {
  selected: boolean;
  label: string;
  /** Said instead of `label`, where the visible text is a short form. */
  spoken?: string;
  /**
   * One option per row, all the same width.
   *
   * For labels that cannot be shortened without changing what they mean —
   * cutting "Suspected" from "Suspected meniscal tear" would turn the reason a
   * scan was ordered into a diagnosis nobody has made. Left to size themselves,
   * these chips came out at three different widths with ragged right edges;
   * stacked at full width they read as one list, and every label still fits on
   * a single line.
   */
  block?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles(sheets);
  const { c } = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={spoken ?? label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        block && styles.chipBlock,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
    >
      <View style={styles.chipContent}>
        {/* Selection is never color-only: a checkmark carries it too, so the
            state reads the same for a colorblind member as for anyone else. */}
        {selected && (
          <Ionicons name="checkmark" size={size.icon.sm} color={c.slateInk} style={styles.chipIcon} />
        )}
        <Text
          style={[
            styles.chipText,
            block && styles.chipTextBlock,
            selected && styles.chipTextSelected,
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const sheets = themed((c) => ({
  chip: {
    borderRadius: radius.md,
    borderWidth: stroke.control,
    // A control outline, not a hairline. WCAG 1.4.11 wants 3:1 and `line`
    // measures 1.2:1 against the canvas — an unselected chip is white on
    // near-white canvas (1.1:1), so this border is the only thing that says a
    // control is there.
    borderColor: c.border,
    backgroundColor: c.surface,
    paddingHorizontal: space.md,
    minHeight: TAP_TARGET,
    justifyContent: 'center',
  },
  chipSelected: { borderColor: c.slate, backgroundColor: c.slate },
  chipPressed: { opacity: 0.7 },
  chipContent: { flexDirection: 'row', alignItems: 'center' },
  chipIcon: { marginRight: space.xs },
  // Full width, so a group of these reads as one list rather than as chips of
  // three different lengths. Also removes any chance of the mid-word break a
  // narrow column produced — React Native breaks inside a word rather than
  // overflowing, and a three-across row rendered "degenerativ / e spine".
  chipBlock: { width: '100%', alignItems: 'flex-start' },
  chipTextBlock: { textAlign: 'left' },
  chipText: { ...type.label, color: c.ink },
  chipTextSelected: { color: c.slateInk },
}));
