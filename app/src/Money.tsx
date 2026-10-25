/**
 * The only way a dollar figure is rendered in this app.
 *
 * Hard rule 5 in CLAUDE.md: every dollar figure carries the word "estimate"
 * inside the string itself, not as a footnote. Making this a component rather
 * than a formatting helper means there is one place to enforce it and no path
 * where a caller renders a bare number by accident. The suffix is part of the
 * same Text, and part of the accessibility label, so a screen reader never
 * hears a bare figure either.
 *
 * The walkthrough sets figures very large (up to 136pt) in whole dollars. The
 * suffix is drawn small beside the figure, or on the line under it where a
 * column is too narrow for both (`stacked`), but it is never left out.
 * Sentences that carry a figure use `money()` from `costing.ts`, which writes
 * "(estimate)" into the string the same way.
 */

import { StyleProp, Text, TextStyle, View } from 'react-native';

import { font, textScale } from './theme';

type Props = {
  value: number;
  style?: StyleProp<TextStyle>;
  /** Size of the word "estimate". Defaults to a third of the figure, at least 12. */
  suffixSize?: number;
  /** Show cents. Off by default: the walkthrough sets whole dollars. */
  cents?: boolean;
  /** Put "estimate" on its own line under the figure. */
  stacked?: boolean;
  /** Dynamic Type cap. Large figures are capped so they cannot outgrow the screen. */
  maxScale?: number;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  /**
   * Shrink the figure so it fits this many points across. Used instead of
   * `adjustsFontSizeToFit`, which only works on iOS: on the web the figure was
   * truncated to "$376..." and the word "estimate" fell off the end.
   */
  fitWidth?: number;
};

/** Geist's tabular digits, at the walkthrough's tight tracking, run about 0.6em wide. */
const DIGIT_EM = 0.6;

export function formatAmount(value: number, cents = false): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}

export function Money({
  value,
  style,
  suffixSize,
  cents = false,
  stacked = false,
  maxScale = textScale.figure,
  numberOfLines,
  adjustsFontSizeToFit,
  fitWidth,
}: Props) {
  const amount = formatAmount(value, cents);
  const flat = (Array.isArray(style) ? Object.assign({}, ...style) : style) as TextStyle | undefined;
  const size = suffixSize ?? Math.max(12, Math.round((flat?.fontSize ?? 16) / 3));

  let fitted: TextStyle | null = null;
  if (fitWidth && flat?.fontSize) {
    const fits = Math.floor(fitWidth / (amount.length * DIGIT_EM));
    if (fits < flat.fontSize) {
      fitted = { fontSize: fits, lineHeight: Math.round(fits * 1.08), letterSpacing: -0.05 * fits };
    }
  }

  if (stacked) {
    // One accessible element, read as "$376 estimate". The word sits directly
    // under the figure rather than inside its line box, because a nested Text
    // inherits the figure's line height and a 120pt figure pushed "estimate"
    // half a screen away from the number it qualifies.
    const align = flat?.textAlign;
    return (
      <View
        accessible
        accessibilityLabel={`${amount} estimate`}
        style={{ alignItems: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start' }}
      >
        <Text style={[style, fitted]} maxFontSizeMultiplier={maxScale}>
          {amount}
        </Text>
        <Text
          style={{
            fontFamily: font.semibold,
            fontSize: size,
            lineHeight: Math.round(size * 1.3),
            color: flat?.color,
            // Pull the word up into the figure's empty line space, so it sits
            // under the digits rather than a line below them. Large figures
            // carry the most slack (a 136pt figure has about 20pt of it).
            marginTop: -Math.round(((fitted?.fontSize ?? flat?.fontSize ?? 16) as number) * 0.12),
          }}
          maxFontSizeMultiplier={maxScale}
        >
          estimate
        </Text>
      </View>
    );
  }

  return (
    <Text
      accessibilityLabel={`${amount} estimate`}
      style={[style, fitted]}
      maxFontSizeMultiplier={maxScale}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
    >
      {amount}
      <Text
        style={{ fontFamily: font.semibold, fontSize: size, letterSpacing: 0 }}
      >
        {/* An en space: the figure's tight tracking ate an ordinary one, and
            "$368estimate" read as one word. */}
        {' estimate'}
      </Text>
    </Text>
  );
}
