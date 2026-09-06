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

export type Scheme = 'light' | 'dark';

/**
 * The role names every stylesheet is written against.
 *
 * A palette is a set of *roles*, not a set of colours, and that is what makes a
 * second scheme possible at all. Nothing below is named for what it looks like
 * — there is no `grey900` or `blue500` — so `surface` can sit above `canvas` in
 * light and below it in dark while every call site stays the same sentence:
 * "cards lift off the canvas."
 */
export type Palette = {
  ink: string;
  inkMuted: string;
  canvas: string;
  surface: string;
  line: string;
  accent: string;
  accentInk: string;
  accentSoft: string;
  accentText: string;
  border: string;
  slate: string;
  slateInk: string;
  flag: string;
  flagBg: string;
};

/**
 * Two schemes. Only colour varies between them — `space`, `radius`, `stroke`,
 * `type`, `TAP_TARGET`, `size` and `textScale` are invariant, which is why
 * `themed()` in `styles/themed.ts` builds each stylesheet twice and nothing
 * else in this file is duplicated.
 *
 * Every ratio in the comments below is measured by `scripts/check-contrast.py`,
 * which asserts them on both schemes. That script is the source of truth: if a
 * comment and the script disagree, the comment is stale. A few of these were —
 * they were written by hand before anything checked them, and the drift was
 * small (17.6 for ink on surface, actually 17.3) but it is exactly the drift
 * that makes a documented ratio worthless. Change a hex, run the script.
 */
export const palettes: Record<Scheme, Palette> = {
  light: {
    ink: '#161B22',        // primary text, 15.97:1 on canvas, 17.30:1 on surface
    inkMuted: '#565F6B',   // secondary text, 5.97:1 on canvas, 6.47:1 on surface
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
    accentText: '#173F63',

    // Control outlines — chips, text inputs, the slider track. WCAG 1.4.11 wants
    // 3:1 for the boundary of an interactive element, and `line` measures 1.19:1,
    // which is invisible. An unselected chip is white on near-white canvas, so
    // this border is the only thing that says a control is there.
    // 3.15:1 on canvas, 3.42:1 on surface.
    border: '#828C97',

    // Every non-recommended route uses this, at equal weight. A cash route that
    // ranks second must look exactly like an in-network route that ranks second.
    // Kept as a cool slate rather than a second blue, so it reads as neutral
    // next to the one blue that means "recommended."
    slate: '#3B4652',      // 8.88:1 on canvas
    slateInk: '#FFFFFF',   // on slate, 9.62:1

    flag: '#6B5A2E',       // data-quality warnings; muted olive-brown, not alarm red
    flagBg: '#EFECE1',     // flag on flagBg, 5.68:1
  },

  /**
   * Dark is a role inversion, not a second design.
   *
   * Three things constrain it beyond the ratios:
   *
   *   - `surface` sits *lighter* than `canvas`, the reverse of light. DESIGN.md
   *     §6 bans shadow, so a value step plus a hairline is the only lift
   *     mechanism this system has, and a card that went darker than its ground
   *     would read as a hole rather than as a card.
   *   - `line` stays near-invisible (1.15:1 on surface). If it were legible it
   *     would become a second `border`, and the whole point of keeping the two
   *     apart is that one divides and one is the boundary of something a finger
   *     operates.
   *   - `slate` inverts from a dark fill to a light one, which is why `slateInk`
   *     exists. Four call sites were using `surface` to mean "text on a slate
   *     fill" — the primary button's label, a selected chip's label and its
   *     checkmark, the dev tier switch. That pairing does *not* break here, and
   *     it is worth being exact about why not: `surface` and `slate` invert
   *     together, so the label lands at 10.16:1 rather than at anything close
   *     to a failure. The problem is that nothing said they had to invert
   *     together. Two unrelated roles were tied by a coincidence of value, and
   *     lightening `surface` to lift cards further off the canvas would have
   *     quietly walked the button's label toward its own fill with no test and
   *     no name to catch it. `slateInk` is that name.
   *
   * The accent stays the same steel/cobalt family, lifted until it reads as
   * text on a dark ground. It is still the only hue in the app that means
   * anything, and it still means exactly one thing.
   */
  dark: {
    ink: '#E8ECF1',        // primary text, 15.18:1 on canvas, 13.36:1 on surface
    inkMuted: '#A3AEBA',   // secondary text, 7.99:1 on canvas, 7.04:1 on surface
    canvas: '#12171D',     // near-black with the same faint cool tint as light
    surface: '#1C232B',    // lighter than canvas — the lift, since §6 bans shadow
    line: '#262E37',       // 1.15:1 on surface; decorative, and deliberately barely there

    accent: '#6FA8D6',     // 7.07:1 on canvas, 6.23:1 on surface
    accentInk: '#0E141A',  // on accent, 7.28:1 — dark ink on a light fill now
    accentSoft: '#18293A', // accent-tinted surface, still lighter than canvas

    // 8.24:1 on accentSoft, 10.01:1 on canvas, 8.81:1 on surface.
    accentText: '#9FC6E4',

    // 4.02:1 on canvas, 3.54:1 on surface — clears WCAG 1.4.11's 3:1 on both.
    // Chosen darker than the first candidate so the slider's filled portion
    // still separates from its unfilled track (2.87:1, against light's 2.81:1).
    border: '#6E7885',

    slate: '#C7D0DA',      // 11.55:1 on canvas
    slateInk: '#12171D',   // on slate, 11.55:1

    flag: '#C9B37E',       // the same muted olive, lifted; 8.78:1 on canvas
    flagBg: '#2A2822',     // flag on flagBg, 7.18:1
  },
};

/**
 * The light palette, under the name every un-migrated stylesheet still imports.
 *
 * Kept so the theme migration could land file by file with a runnable app after
 * each step rather than as one 148-reference commit. Delete it once nothing
 * imports it; `grep -rn "color\." app/src` is the check.
 */
export const color = palettes.light;
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
 * (3.15:1 on canvas) and never with `color.line` (1.19:1, invisible by
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
 * `icon` is three sizes, and it used to be five. Icons were set at 16, 18, 20,
 * 22 and 24 across five files with nothing choosing between them — 18 and 22
 * existed only because nobody had written down what the scale was. Three sizes
 * with a job each is a scale; five picked per call site is drift that reads as
 * a lack of polish before anyone can say why.
 *
 *   sm  beside a label, inside a control — a chip's checkmark
 *   md  a standalone control's own glyph — the back chevron, the theme toggle
 *   lg  a navigation glyph carrying its own weight — a tab bar icon
 *
 * `stepDot` is one number describing one circle, and it is a token because the
 * border radius has to stay exactly half the width or the dot stops being
 * round — `width: 24, height: 24, borderRadius: 12` was written inline three
 * times before it had a name. It belonged to `StepBar`, went with it, and came
 * back for the About screen's numbered steps. Same value, different component,
 * same reason.
 */
export const size = {
  icon: {
    sm: 16,
    md: 20,
    lg: 24,
  },
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
