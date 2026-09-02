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
 * `accentDeep` when the figure is accent-toned, which measures 5.2:1.
 *
 * Sizes come from the shared scale in `theme.ts`. This file used to carry a
 * private one.
 */

import { StyleSheet, Text, TextStyle } from 'react-native';

import { color, type as typography } from './theme';

type Props = {
  value: number;
  size?: 'hero' | 'large' | 'body' | 'small';
  tone?: 'ink' | 'accent' | 'inverse';
};

const SIZES: Record<NonNullable<Props['size']>, TextStyle> = {
  hero: typography.display,
  large: typography.amount,
  body: { ...typography.body, fontWeight: '600' },
  small: typography.label,
};

const TONES: Record<NonNullable<Props['tone']>, string> = {
  ink: color.ink,
  accent: color.accent,
  inverse: color.accentInk,
};

/**
 * The suffix's colour, which is not always the figure's colour.
 *
 * `accent` is bright enough for a 26px figure (4.3:1 clears the 3:1 large-text
 * bar) and not for the 13px word beside it. Ink and inverse are already far
 * clear of 4.5:1 at any size, so they are used as-is.
 */
const SUFFIX_TONES: Record<NonNullable<Props['tone']>, string> = {
  ink: color.ink,
  accent: color.accentDeep,
  inverse: color.accentInk,
};

export function formatAmount(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function Money({ value, size = 'body', tone = 'ink' }: Props) {
  const amount = formatAmount(value);
  return (
    <Text
      // The accessible label carries the full phrase so a screen reader never
      // hears a bare figure either.
      accessibilityLabel={`${amount} estimate`}
      style={[SIZES[size], { color: TONES[tone] }]}
    >
      {amount}
      <Text style={[styles.suffix, { color: SUFFIX_TONES[tone] }]}>
        {'  estimate'}
      </Text>
    </Text>
  );
}

const styles = StyleSheet.create({
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
});
