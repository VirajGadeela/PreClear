/**
 * The only way a dollar figure is rendered in this app.
 *
 * Hard rule 5 in CLAUDE.md: every dollar figure carries the word "estimate"
 * inside the string itself, not as a footnote. Making this a component rather
 * than a formatting helper means there is one place to enforce it and no path
 * where a caller renders a bare number by accident — the suffix is typographic,
 * never optional.
 *
 * That word used to be set at `opacity: 0.72`, which measured **2.77:1** on the
 * recommended route's card and 2.84:1 in the headline, against the 4.5:1 WCAG
 * asks of text that size. The single word this product is required to show was
 * the least legible text in the app. It now renders at full opacity, in
 * `accentText` when the figure is accent-toned, which measures 9.20:1.
 *
 * Sizes come from the shared scale in `theme.ts`. This file used to carry a
 * private one.
 */

import { Text, TextStyle } from 'react-native';

import { type as typography } from './theme';
import { useStyles } from './ThemeProvider';
import { themed } from './styles/themed';

type Props = {
  value: number;
  size?: 'hero' | 'large' | 'body' | 'small';
  tone?: 'ink' | 'accent' | 'inverse';
};

const SIZES: Record<NonNullable<Props['size']>, TextStyle> = {
  hero: typography.display,
  large: typography.amount,
  body: typography.bodyStrong,
  small: typography.label,
};

/**
 * The suffix's colour, which is not always the figure's colour.
 *
 * `accent` is bright enough for a 26px figure (it clears the 3:1 large-text
 * bar) and not for the 13px word beside it, which is held to 4.5:1. Ink and
 * inverse are already far clear at any size, so they are used as-is.
 *
 * Both tone maps used to be module-scope records of raw colours. They are
 * entries in the themed sheet now — the tone is still selected by name, but the
 * name resolves to a style rather than to a hex, which is what lets it differ
 * between schemes without this file knowing there are two.
 */
const SUFFIX_TONE = {
  ink: 'suffixInk',
  accent: 'suffixAccent',
  inverse: 'suffixInverse',
} as const;

export function formatAmount(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function Money({ value, size = 'body', tone = 'ink' }: Props) {
  const styles = useStyles(sheets);
  const amount = formatAmount(value);

  return (
    <Text
      // The accessible label carries the full phrase so a screen reader never
      // hears a bare figure either.
      accessibilityLabel={`${amount} estimate`}
      style={[SIZES[size], styles[tone]]}
    >
      {amount}
      <Text style={[styles.suffix, styles[SUFFIX_TONE[tone]]]}>
        {'  estimate'}
      </Text>
    </Text>
  );
}

const sheets = themed((c) => ({
  ink: { color: c.ink },
  accent: { color: c.accent },
  inverse: { color: c.accentInk },

  suffixInk: { color: c.ink },
  suffixAccent: { color: c.accentText },
  suffixInverse: { color: c.accentInk },

  // No lineHeight: a nested Text inherits the parent's line box, and setting
  // one here would fight the figure's leading rather than the suffix's.
  //
  // `fontFamily` is named explicitly rather than left to inherit. A nested Text
  // takes the parent's family, and the parent here is the figure — Manrope
  // Bold or ExtraBold. Inheriting meant the suffix rendered in the figure's
  // heavier cut at the label's size, which is not the pairing `type.label`
  // defines anywhere else in the app.
  suffix: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    fontFamily: typography.label.fontFamily,
  },
}));
