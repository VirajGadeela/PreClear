/**
 * Design tokens.
 *
 * One thing this palette still avoids: red/green for expensive/cheap. The
 * entire finding of this product is that the cheaper payment today can be the
 * worse decision for the year, so colouring the low number green would assert
 * the opposite of what the math says. Ranking is carried by position, by the
 * size of the number, and by a single accent reserved for the recommended
 * route. Never by hue.
 *
 * Revised 2026-08-25 (second pass). The first two passes both avoided blue and
 * white on purpose — the reasoning on record was that it reads as a clinical
 * portal rather than something on the patient's side. This pass overrides
 * that call deliberately, at explicit request: blue and off-white, chosen to
 * avoid the two failure modes that made the original rule sound reasonable —
 * a bright, generic "SaaS blue" and a stark, clinical white. The blue below is
 * a muted steel/cobalt rather than a primary blue, and the background carries
 * a faint cool tint rather than sitting at true white, so neither reads as a
 * hospital portal on its own. Whether that's actually the case is worth a
 * second look once this has been seen next to real content, not just assumed
 * because the hexes measure fine.
 *
 * Every value below is checked against WCAG rather than chosen by eye. The
 * ratios in the comments are measured, and any change to a hex here should be
 * re-measured before it lands.
 */

export const color = {
  ink: '#161B22',        // primary text, 16.0:1 on canvas, 17.6:1 on surface
  inkMuted: '#565F6B',   // secondary text, 5.97:1 on canvas, 6.53:1 on surface
  canvas: '#F4F6F8',     // off-white with a faint cool tint, not stark white
  surface: '#FFFFFF',    // cards lift off the canvas
  line: '#DEE3E7',       // decorative hairlines and card edges only

  // Reserved for the recommended route and nothing else. A muted steel/cobalt
  // rather than a bright primary blue — the generic "SaaS blue" is as much a
  // default-AI tell as the clay/oxblood this replaced.
  accent: '#215A8C',     // 6.67:1 on canvas, 7.23:1 on surface
  accentInk: '#FFFFFF',  // on accent, 7.23:1
  accentSoft: '#E4EDF5', // accent-tinted surface for the recommended card

  // The same blue, darkened, for accent text below 18px — where WCAG wants
  // 4.5:1 rather than the 3:1 large text is allowed. `accent` already clears
  // that (6.10:1 on accentSoft), so this exists for the darkest small-text
  // case rather than out of necessity — 9.20:1 on accentSoft, 10.06:1 on
  // canvas, 10.89:1 on surface.
  accentDeep: '#173F63',

  // Control outlines — chips, text inputs, the slider track. WCAG 1.4.11 wants
  // 3:1 for the boundary of an interactive element, and `line` measures 1.05:1,
  // which is invisible. An unselected chip is white on near-white canvas, so
  // this border is the only thing that says a control is there.
  // 3.15:1 on canvas, 3.40:1 on surface.
  border: '#828C97',

  // Every non-recommended route uses this, at equal weight. A cash route that
  // ranks second must look exactly like an in-network route that ranks second.
  // Kept as a cool slate rather than a second blue, so it reads as neutral
  // next to the one blue that means "recommended."
  slate: '#3B4652',      // white on slate, 9.62:1; on canvas, 8.88:1

  flag: '#6B5A2E',       // data-quality warnings; muted olive-brown, not alarm red
  flagBg: '#EFECE1',     // flag on flagBg, 5.68:1
} as const;

/**
 * An 8px grid, with a single 4px half-step.
 *
 * Nothing outside this scale is allowed in a stylesheet. An earlier scale ran
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
  /**
   * Card corners. The reference this was drawn from rounds panels far more
   * than controls, which is what separates a surface from a button — at one
   * shared radius everything reads as the same kind of object.
   */
  xl: 24,
} as const;

/**
 * Two stroke weights, and which one to use is a semantic question rather than
 * a visual one.
 *
 * The app had been following this rule correctly almost everywhere without it
 * being written down: 1px for things that merely divide, 1.5px for the
 * boundary of anything a finger operates. Two places had drifted — the
 * slider's preset chips and the dev tier switch, both interactive, both drawn
 * at the decorative weight — which is what an unnamed convention eventually
 * does.
 *
 * The distinction is not decoration. WCAG 1.4.11 asks 3:1 for the boundary of
 * an interactive element, which is why `control` pairs with `color.border`
 * (3.15:1 on canvas) and never with `color.line` (1.05:1, invisible by
 * design). Pairing a weight with the wrong colour is the failure this token
 * exists to make obvious.
 */
export const stroke = {
  /** Card edges, dividers, section rules. Always with `color.line`. */
  hairline: 1,
  /** Chips, inputs, plan options, anything pressable. Always with `color.border`. */
  control: 1.5,
  /**
   * The slider thumb's ring, and its held state. Neither of the two weights
   * above fits: the thumb is not a divider and not the boundary *of* a
   * control — it is the control. These were `3` and `4` written inline, which
   * is the same unnamed convention `hairline`/`control` exist to prevent.
   */
  thumb: 3,
  thumbHeld: 4,
} as const;

/**
 * Font families, loaded once at app start (see `App.tsx`'s `useFonts` gate).
 *
 * Manrope carries every headline-weight role — display, title, amount, and the
 * label weight used for step numbers and section headers. Body and caption
 * stay on the platform system font: it's already legible, it's free, and
 * mixing a distinctive display face with a native body face is a considered
 * pairing, not a missing one. Loading Manrope for 13px captions would be
 * spending a font negotiation on text nobody looks at as text.
 *
 * Static weight files, not a single variable font — so `fontFamily` names the
 * exact weight and `fontWeight` in `type` below is not read for these roles.
 * It stays in the object for type-compatibility with call sites that also set
 * `fontWeight` directly (harmless, and RN ignores a redundant match).
 */
export const font = {
  /**
   * The display serif, used only for the headline on a screen.
   *
   * A serif against a geometric sans is the pairing this app was missing: the
   * two faces do different jobs, so the headline reads as a statement rather
   * than as larger body text. Reserved for `serif` below — a serif at 13px in
   * a chip would be costume rather than hierarchy.
   */
  serif: 'InstrumentSerif-Regular',
  bold: 'Manrope-Bold',
  extraBold: 'Manrope-ExtraBold',
  semiBold: 'Manrope-SemiBold',
} as const;

/**
 * One type scale. There used to be two — this one and a private set inside
 * `Money.tsx` — which between them defined ten font sizes with no ratio.
 *
 * Line heights are all multiples of 4 so that stacked text lands on the same
 * grid as the spacing.
 */
export const type = {
  // 40, not 36. A 32px bold face needs more than 1.125 line height — React
  // Native clips the ascenders of the first line rather than growing the box,
  // and "Your coverage" rendered with its tops cut off by the step bar. 1.25
  // matches the ratio the other two headings use.
  display: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '800' as const,
    fontFamily: font.extraBold,
    letterSpacing: -0.5,
  },
  /**
   * The serif headline. Larger and more open than `display`, because a serif
   * at the same size reads smaller and needs the leading — 38/44 rather than
   * 32/40. `fontWeight` is deliberately absent: this is a single-weight face,
   * and asking React Native to synthesise a bold from it produces a smeared
   * outline rather than a heavier cut.
   */
  serifDisplay: {
    fontSize: 32,
    lineHeight: 40,
    fontFamily: font.serif,
    letterSpacing: -0.5,
  },
  /** The opening clause of a bold-lead paragraph. Same size as body. */
  lead: { fontSize: 16, lineHeight: 24, fontWeight: '700' as const, fontFamily: font.bold },
  amount: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700' as const,
    fontFamily: font.bold,
    letterSpacing: -0.3,
    // Digits keep a fixed width, so a slider-driven number doesn't visibly
    // reflow as its digits change from, say, "1" to "8".
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
    fontFamily: font.bold,
    letterSpacing: -0.2,
  },
  body: { fontSize: 16, lineHeight: 24 },
  // Semibold Manrope, not the system font — this is the step-bar number and
  // the chip label, places where the display face's character reads even at
  // small sizes without the weight of a full headline face. It is not
  // uppercase and has no added tracking; that was the deleted `eyebrow`.
  label: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600' as const,
    fontFamily: font.semiBold,
  },
  caption: { fontSize: 13, lineHeight: 20 },

  /**
   * Emphasised body and caption.
   *
   * These existed already, as `{ ...type.body, fontWeight: '700' }` written
   * out at ten call sites across five files. That is a fourth weight role in
   * everything but name — undeclared, so unenforceable, and impossible to
   * change in one place. Declared here at the same size and line height, so
   * the rendering is unchanged and the scale is once again the whole scale.
   *
   * Both stay on the system font: 700 on the platform face is the emphasis
   * step, and reaching for Manrope here would put a display face on a 13px
   * table value.
   */
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '700' as const },
  captionStrong: { fontSize: 13, lineHeight: 20, fontWeight: '700' as const },

  // There was an `eyebrow` role here — an uppercase, letter-spaced label set
  // above a group. It is deliberately gone, not renamed or shrunk. An
  // uppercase label above content that a heading already identifies is
  // decoration wearing the clothes of structure, and having it as a token
  // made it easy to keep reaching for. Grouping is carried by space and a
  // hairline now. Do not reintroduce it.
} as const;

/**
 * The minimum height of anything a finger has to hit.
 *
 * Apple's HIG and WCAG 2.5.5 both land on 44.
 */
export const TAP_TARGET = 44;

/**
 * Fixed component sizes that are not spacing and not tap targets.
 *
 * `stepDot` was `width: 24, height: 24, borderRadius: 12` inline — three
 * magic numbers describing one circle, where the radius has to stay exactly
 * half the width or the dot stops being round.
 */
export const size = {
  stepDot: 24,
} as const;

/**
 * Caps on Dynamic Type scaling, by role.
 *
 * iOS's accessibility text sizes run to roughly 3.1x, and three things break
 * before they get there — measured on an iPhone SE, the narrowest screen this
 * app supports, at `accessibility-extra-large`:
 *
 *   - `display` at that size makes a single word wider than the 327pt content
 *     column, and React Native breaks mid-word rather than overflowing, so the
 *     household heading rendered "Preclea / r / Househ / old". Same failure
 *     already on record for chips ("degenerativ / e spine").
 *   - The brand wordmark in `TopBar` ran off the right edge of the screen.
 *   - The "Save 27%" badge, in a row that could no longer fit it, was squeezed
 *     to a sliver and set one letter per line — "S / a / v / e".
 *
 * A cap is the right instrument for the first two, because the failure is that
 * one unbreakable word is wider than the screen and no amount of wrapping
 * helps. The third is a layout bug, fixed with `flexWrap` where it happens;
 * the cap there is only a second line of defence.
 *
 * WCAG 1.4.4 asks that text reach 200% without loss of content or function, so
 * nothing here caps below 2.0 except the two roles that are chrome rather than
 * content — the wordmark, and a badge whose saving is also stated in the price
 * beside it. Body, caption and title text is deliberately absent from this
 * object: it carries the meaning, and it scales the whole way.
 */
export const textScale = {
  /** Screen headings. Holds this app's longest heading word on one line. */
  display: 1.8,
  /** The brand wordmark. The screen heading below it carries the content. */
  chrome: 1.4,
  /** Pill badges sharing a row with text that already says the same thing. */
  badge: 1.5,
  /**
   * The `fontScale` above which a side-by-side row stacks into a column.
   *
   * Not a cap — a layout threshold, and the one that actually fixes the badge.
   * A capped badge in a row that is still too narrow is a capped badge set one
   * letter per line. The plan option puts a term and a price on one line, and
   * at 1.6x the price alone claims most of a 327pt column, leaving the term to
   * be broken mid-word. Above this the two stack and each gets full width.
   *
   * 1.6 is where the measurement puts it, not a round number: `amount` is 26px,
   * and 26 x 1.6 = 41.6px, at which "$69.99" is about half the content column.
   */
  stackAbove: 1.6,
} as const;
