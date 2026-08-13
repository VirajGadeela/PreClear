/**
 * Design tokens.
 *
 * Two things this palette deliberately avoids.
 *
 * It is not clinical blue-and-white, because that reads as a portal the
 * hospital sent you to rather than something on your side.
 *
 * And it does not use red/green for expensive/cheap. The entire finding of this
 * product is that the cheaper payment today can be the worse decision for the
 * year, so colouring the low number green would assert the opposite of what the
 * math says. Ranking is carried by position, by the size of the number, and by
 * a single accent reserved for the recommended route. Never by hue.
 */

export const color = {
  ink: '#1A1D1A',        // primary text, 15.8:1 on canvas
  inkMuted: '#585F58',   // secondary text, 6.4:1 on canvas
  canvas: '#F4F3EF',     // warm paper rather than clinical white
  surface: '#FFFFFF',    // cards lift off the canvas
  line: '#DEDCD4',       // hairlines and dividers

  // Reserved for the recommended route and nothing else. Burnt amber carries
  // no cheap/expensive connotation the way red or green would.
  accent: '#B2542A',
  accentInk: '#FFFFFF',  // on accent, 4.9:1
  accentSoft: '#F7EDE6', // accent-tinted surface for the recommended card

  // Every non-recommended route uses this, at equal weight. A cash route that
  // ranks second must look exactly like an in-network route that ranks second.
  slate: '#3F4A52',

  flag: '#7A5320',       // data-quality warnings; brown, not alarm red
  flagBg: '#F6EFE3',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;

export const type = {
  hero: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.4 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.2 },
  amount: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.3 },
  body: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '600' as const },
  caption: { fontSize: 12, lineHeight: 17 },
} as const;
