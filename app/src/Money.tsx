/**
 * The only way a dollar figure is rendered in this app.
 *
 * Hard rule 5 in CLAUDE.md: every dollar figure carries the word "estimate"
 * inside the string itself, not as a footnote. Making this a component rather
 * than a formatting helper means there is one place to enforce it and no path
 * where a caller renders a bare number by accident — the suffix is typographic,
 * never optional.
 */

import { StyleSheet, Text, TextStyle } from 'react-native';

import { color } from './theme';

type Props = {
  value: number;
  size?: 'hero' | 'large' | 'body' | 'small';
  tone?: 'ink' | 'accent' | 'inverse';
};

const SIZES: Record<NonNullable<Props['size']>, TextStyle> = {
  hero: { fontSize: 34, fontWeight: '700', letterSpacing: -0.6 },
  large: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13, fontWeight: '600' },
};

const SUFFIX: Record<NonNullable<Props['size']>, TextStyle> = {
  hero: { fontSize: 14, fontWeight: '600' },
  large: { fontSize: 12, fontWeight: '600' },
  body: { fontSize: 12, fontWeight: '500' },
  small: { fontSize: 11, fontWeight: '500' },
};

const TONES: Record<NonNullable<Props['tone']>, string> = {
  ink: color.ink,
  accent: color.accent,
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
      <Text style={[SUFFIX[size], styles.suffix, { color: TONES[tone] }]}>
        {'  estimate'}
      </Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  suffix: { opacity: 0.72 },
});
