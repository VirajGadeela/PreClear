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
 *
 * Every value below was checked against WCAG rather than chosen by eye. The
 * ratios in the comments are measured, and any change to a hex here should be
 * re-measured before it lands — the two darkest tokens exist *only* because the
 * lighter ones failed.
 */

export const color = {
  ink: '#1A1D1A',        // primary text, 15.3:1 on canvas
  inkMuted: '#585F58',   // secondary text, 5.9:1 on canvas
  canvas: '#F4F3EF',     // warm paper rather than clinical white
  surface: '#FFFFFF',    // cards lift off the canvas
  line: '#DEDCD4',       // decorative hairlines and card edges only

  // Reserved for the recommended route and nothing else. Burnt amber carries
  // no cheap/expensive connotation the way red or green would.
  accent: '#B2542A',     // 4.5:1 on canvas, 5.0:1 on surface
  accentInk: '#FFFFFF',  // on accent, 5.0:1
  accentSoft: '#F7EDE6', // accent-tinted surface for the recommended card

  // The same amber, darkened, for accent text below 18px — where WCAG wants
  // 4.5:1 rather than the 3:1 large text is allowed. `accent` on `accentSoft`
  // measures 4.3:1, which is fine for a 26px figure and not fine for the word
  // beside it. 5.2:1 on accentSoft, 5.4:1 on canvas, 6.0:1 on surface.
  accentDeep: '#A04A24',

  // Control outlines — chips, text inputs, the slider track. WCAG 1.4.11 wants
  // 3:1 for the boundary of an interactive element, and `line` measures 1.2:1,
  // which is invisible. An unselected chip is white on near-white canvas
  // (1.1:1), so this border is the only thing that says a control is there.
  // 3.2:1 on canvas, 3.6:1 on surface.
  border: '#8C8779',

  // Every non-recommended route uses this, at equal weight. A cash route that
  // ranks second must look exactly like an in-network route that ranks second.
  slate: '#3F4A52',      // white on slate, 9.1:1

  flag: '#7A5320',       // data-quality warnings; brown, not alarm red
  flagBg: '#F6EFE3',     // flag on flagBg, 6.0:1
} as const;

/**
 * An 8px grid, with a single 4px half-step.
 *
 * Nothing outside this scale is allowed in a stylesheet. The previous scale ran
 * 4/8/14/20/28 and the code reached the gaps by writing `space.md + 2` in seven
 * places, which is the symptom of a scale that does not fit its own layout.
 */
export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;

/**
 * One type scale. There used to be two — this one and a private set inside
 * `Money.tsx` — which between them defined ten font sizes with no ratio.
 *
 * Line heights are all multiples of 4 so that stacked text lands on the same
 * grid as the spacing. `display`, `title` and `amount` previously declared none
 * at all and were leaded by whatever the platform chose.
 */
export const type = {
  display: { fontSize: 32, lineHeight: 36, fontWeight: '700' as const, letterSpacing: -0.5 },
  amount: { fontSize: 26, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.3 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 13, lineHeight: 16, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 20 },
} as const;

/**
 * The minimum height of anything a finger has to hit.
 *
 * Apple's HIG and WCAG 2.5.5 both land on 44. Chips were 36, step-bar items
 * were 24, and the slider track was 30.
 */
export const TAP_TARGET = 44;
