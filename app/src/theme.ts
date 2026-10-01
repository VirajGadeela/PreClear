import { DynamicColorIOS } from 'react-native';

/**
 * Design tokens.
 *
 * The rule that outranks the rest: hue never encodes rank, value, or
 * good/bad. The entire finding of this product is that the cheaper payment
 * today can be the worse decision for the year, so colouring the low number
 * green would assert the opposite of what the math says. Ranking is carried by
 * position, by the size of the number, and by a single accent reserved for the
 * recommended route. Never by hue. That rule survives every restyle and is why
 * the Stripe/Wise-mould systems were rejected for this repo: they ship
 * `positive: #2ead4b` / `negative: #d03238`, correct for most products and
 * actively wrong for this one. There is no success colour and no error colour,
 * and adding one is a design change that needs an argument, not a token.
 *
 * Palette lineage, so the reversals are legible rather than mysterious:
 *
 *   - Passes 1-2 avoided blue and white on purpose — together they were held
 *     to read as a clinical portal rather than as something on the patient's
 *     side. Accent was a clay/oxblood, `#B2542A`.
 *   - Pass 3 (2026-08-25) overrode that at explicit request: muted steel/cobalt
 *     `#215A8C` on a faintly cool off-white, dodging the two failure modes the
 *     original rule was really about — a bright generic "SaaS blue" and a stark
 *     clinical white. It flagged its own provisionality: "worth a second look
 *     once this has been seen next to real content."
 *   - Pass 4 (2026-09-03, this one) is that second look. Stark monochrome
 *     grounds, a single indigo accent, and a dark theme.
 *
 * ---
 *
 * TWO GROUNDS, SO EVERY PAIR IS MEASURED TWICE.
 *
 * Colours are `DynamicColorIOS`, resolved by UIKit per trait collection. That
 * is deliberate and load-bearing: `StyleSheet.create` runs at module scope and
 * captures values at import time, so a JS-side theme object would have forced
 * all 17 stylesheets in this app into memoised factories. UIKit re-resolves on
 * `traitCollectionDidChange` instead, so appearance flips live, no relaunch and
 * no refactor. iOS-only, which is this app's only platform.
 *
 * The consequence to know: these are `OpaqueColorValue`, not `string`. They are
 * accepted anywhere RN takes a `ColorValue` — styles, `placeholderTextColor`,
 * `ActivityIndicator color`. Third-party props typed `color?: string` (the
 * `@expo/vector-icons` glyphs) will not take them; pass `style={{ color }}`
 * there instead, since an Ionicon is a Text.
 *
 * `palette` below is the raw source of both themes and is what
 * `scripts/check-contrast.sh` measures. Ratios in the comments are computed,
 * not estimated. Any change to a hex must clear its floor against ALL FOUR
 * grounds it can sit on — canvas, surface, accentSoft, flagBg — in BOTH
 * themes, and the script is what enforces that. Measuring against canvas and
 * surface only is how the pre-pass-4 `border` shipped at 2.83:1 on the
 * recommended card, below the 3:1 WCAG 1.4.11 asks of a control boundary.
 */

/** The colour roles. Both themes implement all of them; neither may omit one. */
const LIGHT = {
  ink: '#0A0A0A',        // primary text        — worst ground 16.89:1
  inkMuted: '#5F6672',   // secondary text      — worst 4.94:1
  canvas: '#FAFAFA',     // the app ground
  surface: '#FFFFFF',    // cards, sheets
  line: '#E6E8EB',       // decorative hairlines and card edges only

  // Reserved for the recommended route and primary actions. Nothing else.
  accent: '#3D5BD9',     // worst ground 4.85:1 (floor 3:1, it is never small text)
  accentInk: '#FFFFFF',  // on accent, 5.68:1
  accentSoft: '#EDF0FD', // accent-tinted surface for the recommended card

  // The accent hue at a lightness that clears 4.5:1 for text under 18px, on
  // whatever ground it sits on. Renamed from `accentDeep` in pass 4 because
  // "deep" encodes a direction that REVERSES under theming: this is darker
  // than `accent` in light and LIGHTER than it in dark. The job is constant;
  // the direction is not. Do not "fix" the dark value to be darker.
  accentText: '#2B3FA0', // worst ground 7.72:1

  // Control outlines. WCAG 1.4.11 wants 3:1 for the boundary of an interactive
  // element. Darkened in pass 4 from #8A9099, which cleared canvas and surface
  // but not accentSoft (2.83) or flagBg (2.74) — and bordered controls sit on
  // the recommended card.
  border: '#7C828B',     // worst ground 3.25:1

  // Every non-recommended route, at equal weight. A cash route ranking second
  // must look exactly like an in-network route ranking second.
  slate: '#2E3339',      // 12.20:1 on canvas

  // Text and glyphs ON a slate fill. This used to be `surface`, which worked
  // only because `surface` happened to be white; in dark `surface` is #161616,
  // so a selected chip's label would have gone dark-on-grey.
  //
  // It inverts with the fill rather than staying white. In dark, `slate` is a
  // LIGHT grey — the non-recommended fill and the secondary button both go
  // light-on-black there, which is the inverted-button pattern the reference
  // language uses — so its ink has to go dark. `check-contrast.sh` caught this
  // as 1.61:1 when this was white in both themes.
  slateInk: '#FFFFFF',   // on slate, 12.74:1

  flag: '#6B5A2E',       // data-quality warnings; muted olive-brown, never alarm red
  flagBg: '#F0EDE2',     // flag on flagBg, 5.73:1

  // Cast by `elevation` below. See the note there for why dark is transparent.
  shadow: '#0A0A0A',
} as const;

type Role = keyof typeof LIGHT;

/**
 * Dark. Not an inversion — every value is solved for this ground.
 *
 * `inkMuted` in particular cannot be flipped: muted text must sit further from
 * the ground on black than on white to read as the same weight of secondary.
 * Ratios here run deliberately below the light theme's. Maximising contrast on
 * a dark ground makes 32px ExtraBold halate on OLED; clearing the floor with
 * margin is the target, not exceeding it.
 */
const DARK: Record<Role, string> = {
  ink: '#F5F6F7',        // worst ground 15.15:1
  inkMuted: '#9BA3AF',   // worst 6.44:1
  canvas: '#0A0A0A',
  surface: '#161616',    // the lift itself — see `elevation`
  line: '#262626',

  accent: '#7B93FF',     // worst ground 5.82:1
  accentInk: '#0A0A0A',  // dark text on a light fill here, 7.03:1
  accentSoft: '#151B33',

  accentText: '#A5B6FF', // LIGHTER than accent. Read the note above.

  border: '#6E757E',     // worst ground 3.52:1

  slate: '#C7CCD3',      // light fill on a dark ground — see the note in LIGHT
  slateInk: '#0A0A0A',   // dark ink, because the fill inverted

  flag: '#CDB584',
  flagBg: '#241F14',     // flag on flagBg, 8.23:1

  shadow: 'transparent', // see `elevation`
};

/** Raw hexes for both themes. Consumed by `scripts/check-contrast.sh`. */
export const palette = { light: LIGHT, dark: DARK } as const;

/**
 * The tokens every stylesheet reads. One per role, resolved by UIKit.
 */
export const color = Object.fromEntries(
  (Object.keys(LIGHT) as Role[]).map((role) => [
    role,
    DynamicColorIOS({ light: LIGHT[role], dark: DARK[role] }),
  ]),
) as Record<Role, ReturnType<typeof DynamicColorIOS>>;


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

/**
 * Corner radii, tightened in pass 4 from 8/12/16.
 *
 * The reference language is geometric and close-cropped; a 16pt radius on a
 * full-width card reads soft next to hairline borders and near-black type.
 * Chips keep the smallest step so they stay legible as controls rather than
 * reading as pills.
 */
export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
} as const;

/**
 * The two opacities the app is allowed to use, and what each one means.
 *
 * Seven distinct literals had accumulated across five files — 0.45, 0.6, 0.7,
 * 0.75, 0.85 — with no rule about which applied when. These replace all of
 * them.
 *
 * Neither may be used to lighten *text*. Fading type to suggest hierarchy is
 * how the "estimate" suffix ended up at 2.77:1 in the 2026-08-14 audit, and it
 * is a contrast failure wearing a design decision's clothes. Secondary text
 * uses `inkMuted`, which is measured. `disabled` is exempt from WCAG 1.4.3,
 * and is the one case where a control may sit below the ratio.
 */
/**
 * Depth. Three levels, two renderings, one token set.
 *
 * The light theme lifts with a shadow. The dark theme cannot: compositing
 * black over a #0A0A0A ground gives 1.008:1 at 6% opacity and only 1.045:1 at
 * 30% — below what the existing hairline already achieves, and a smudge rather
 * than depth long before it is visible. So `shadow` is `transparent` in dark
 * (Core Animation multiplies shadowColor's alpha by shadowOpacity, so alpha 0
 * means no shadow) and depth there is carried by `surface` sitting above
 * `canvas` plus the hairline edge. That is why this needs no theme branch.
 *
 * `raised` is for TAPPABLE cards only. If every panel lifts, the route cards
 * stop being the things that lift and elevation joins hue on the list of
 * channels that can no longer carry rank — see the argument already written
 * out in `LandingStep`'s proof panel.
 *
 * Three RN-iOS traps: `overflow: 'hidden'` cancels a shadow; a transparent
 * `backgroundColor` renders none; Android `elevation` is irrelevant here.
 */
export const elevation = {
  /** Flush. Dividers and static panels. */
  flat: {},
  /** A resting, tappable card. */
  raised: {
    shadowColor: color.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  /** Chrome floating over scrolling content. Casts upward. */
  sticky: {
    shadowColor: color.shadow,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  /** Sheets — the only thing that floats above the whole screen. */
  overlay: {
    shadowColor: color.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
  },
} as const;

export const opacity = {
  /** Pressed feedback. On a touch device the pressed state IS the focus state. */
  pressed: 0.7,
  /** Non-interactive controls only. Never on text that must still be read. */
  disabled: 0.45,
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
  /**
   * Added in pass 4. The scale ran 32/26/22/16/13 — five sizes carrying
   * roughly fifteen roles, with a 6pt cliff between `title` and `body`, so
   * `title` was simultaneously the brand wordmark, every section heading, the
   * error-boundary title and the route hero's sentence fragments.
   *
   * 18 is not an arbitrary midpoint: it is exactly where WCAG relaxes from
   * 4.5:1 to 3:1, so it is the smallest size at which `accent` may carry text
   * without reaching for `accentDeep`.
   */
  subtitle: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700' as const,
    fontFamily: font.bold,
    letterSpacing: -0.15,
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

  /**
   * Section eyebrow. Reinstated 2026-09-03 — a deliberate reversal, recorded.
   *
   * This role was added 2026-09-01, then deleted 2026-09-02 on the reasoning
   * that "an uppercase label above content that a heading already identifies
   * is decoration wearing the clothes of structure", with a note saying not to
   * reintroduce it. Pass 4 reintroduces it anyway, at explicit request, as
   * part of a restyle where uppercase section labels carry real structure
   * rather than ornament.
   *
   * The earlier objection was fair and is answered by narrowing the role
   * rather than by disputing it: an eyebrow is for a section a heading does
   * NOT already name. Where a heading is present and says the same thing, the
   * eyebrow is still the wrong tool — use `space.xl` and a hairline.
   *
   * 12/16 rather than the 13/16 it had before: at 13 it competed with `label`
   * and `caption`, which already share that size. Uppercase and tracking
   * travel together — apply them from here, never separately at a call site,
   * which is how they drifted apart the first time.
   */
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as const,
    fontFamily: font.semiBold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  },
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
