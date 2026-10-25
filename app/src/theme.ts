/**
 * Design tokens, taken from the Claude Design walkthrough (2026-10-25).
 *
 * The walkthrough is Geist on a warm off-white, with one blue used two ways: as
 * the ground of the two "answer" screens (the welcome story and the best
 * route), and as the selected state everywhere else. Hue still never encodes
 * cheap or expensive. The recommended route is marked by position, by size and
 * by a "Best" tag, never by a green number, because the whole finding of this
 * product is that the cheaper payment today can be the worse one for the year.
 *
 * The design wrote colours in OKLCH. React Native does not parse OKLCH, so each
 * one is converted to the nearest sRGB hex. Two of the design's greys failed
 * WCAG and were darkened rather than kept:
 *
 *   - `#777` captions measured 4.10:1 on the canvas, under the 4.5:1 that
 *     13-15px text needs. `inkSubtle` is `#666`, 5.26:1.
 *   - `#CFCFCA` radio outlines measured 1.56:1 on white. That outline is the
 *     only thing showing an unselected option exists, so it is held to the
 *     3:1 control floor. `border` is `#8A8A85`, 3.47:1 on white.
 *
 * Every ratio in a comment is measured by `scripts/check-contrast.py`, which
 * parses this file. Change a hex, run the script.
 */

export type Palette = {
  /** Page ground. */
  canvas: string;
  /** Cards and rows that sit on the canvas. */
  surface: string;
  /** Body text and the primary button. 18.9:1 on surface, 17.3:1 on canvas. */
  ink: string;
  /** Secondary text. 7.46:1 on surface, 6.83:1 on canvas. */
  inkMuted: string;
  /** Captions. 5.74:1 on surface, 5.26:1 on canvas. */
  inkSubtle: string;
  /** The grey "not typed yet" figure on a keypad screen. Large text only. 3.02:1 on canvas. */
  placeholder: string;
  /** Unselected radio and checkbox outlines. 3.47:1 on surface, 3.18:1 on canvas. */
  border: string;
  /** Hairline dividers. Decorative and must stay under 1.5:1. 1.15:1 on surface. */
  line: string;
  /** Unfilled bars, the segmented control, pressed keys. Decorative. */
  track: string;
  /** Inactive progress segments. Decorative. */
  trackStrong: string;
  /** The blue. A fill, and also text on light grounds. 6.32:1 on surface. */
  accent: string;
  /** Accent text on the tint, and small accent text. 7.76:1 on accentTint. */
  accentDeep: string;
  /** Selected tiles and icon wells. */
  accentTint: string;
  /** Text on the accent fill. 6.32:1 on accent. */
  onAccent: string;
  /** Secondary text on the accent fill. 5.14:1 on accent. */
  onAccentMuted: string;
};

export const palettes: { light: Palette } = {
  light: {
    canvas: '#F5F5F3',
    surface: '#FFFFFF',
    ink: '#111111',
    inkMuted: '#555555',
    inkSubtle: '#666666',
    placeholder: '#8E8E89',
    border: '#8A8A85',
    line: '#EFEFEB',
    track: '#ECECE8',
    trackStrong: '#D6D6D2',
    accent: '#3453D3',
    accentDeep: '#2238B8',
    accentTint: '#E6EEFF',
    onAccent: '#FFFFFF',
    onAccentMuted: '#DEE8FF',
  },
};

export const color = palettes.light;

/** White at 12% over the accent, for the unselected cards on a blue screen. */
export const onAccentCard = 'rgba(255,255,255,0.12)';

/** A strict 4px base: 4/8/12/16/20/24/28/32. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  page: 24,
};

export const radius = {
  row: 22,
  card: 24,
  tile: 26,
  pill: 999,
};

/** Every control is at least this tall or wide. */
export const TAP_TARGET = 44;

export const font = {
  regular: 'Geist-Regular',
  medium: 'Geist-Medium',
  semibold: 'Geist-SemiBold',
  bold: 'Geist-Bold',
  extrabold: 'Geist-ExtraBold',
  mono: 'GeistMono-Medium',
};

/**
 * Dynamic Type caps, by what breaks.
 *
 * Body text scales freely up to 2x, which is WCAG 1.4.4's 200%. Headings and
 * figures are capped lower because their failure is a single unbreakable word
 * or number wider than the screen, which React Native breaks mid-word rather
 * than overflowing.
 */
export const textScale = {
  body: 2,
  heading: 1.4,
  figure: 1.15,
};

// Letter spacing in the design is in em; React Native wants points.
const tight = (size: number, em: number) => Math.round(size * em * 100) / 100;

export const type = {
  display: { fontFamily: font.bold, fontSize: 36, lineHeight: 42, letterSpacing: tight(36, -0.04) },
  title: { fontFamily: font.bold, fontSize: 30, lineHeight: 36, letterSpacing: tight(30, -0.035) },
  headline: { fontFamily: font.semibold, fontSize: 24, lineHeight: 30, letterSpacing: tight(24, -0.02) },
  rowTitle: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22 },
  rowLarge: { fontFamily: font.semibold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 23 },
  bodyMedium: { fontFamily: font.medium, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: font.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  tag: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16 },
  mono: { fontFamily: font.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.7 },
  button: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22 },
};

/** A figure at any size, with the design's tight tracking. */
export function figure(size: number, weight: 'bold' | 'extrabold' = 'extrabold') {
  return {
    fontFamily: weight === 'bold' ? font.bold : font.extrabold,
    fontSize: size,
    lineHeight: Math.round(size * 1.08),
    letterSpacing: tight(size, size >= 60 ? -0.055 : -0.04),
    fontVariant: ['tabular-nums' as const],
  };
}
