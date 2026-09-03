---
version: 1
name: preclear
description: Design system for Preclear — a React Native (Expo) iOS app that ranks routes to an elective MRI or CT by what they actually cost the patient this year. Muted steel/cobalt accent on a faintly cool off-white, Manrope for headline roles over the platform system font, an 8px grid, and one rule that overrides every aesthetic preference below — hue never encodes rank.
platform: react-native
source-of-truth: app/src/theme.ts
---

# Preclear — DESIGN.md

**This file is derived from `app/src/theme.ts`, which is the source of truth.**
If the two ever disagree, `theme.ts` wins and this file is the thing that is
wrong. Do not change a value here and consider it landed — the tokens live in
code, and every hex below has a measured contrast ratio attached to it.

## 0. The rule that outranks everything else

**Hue must never encode rank, value, or "good/bad."**

The entire finding of this product is that the cheaper payment today can be the
worse decision for the year — a $574 cash payment beats a $610 in-network claim
on the day and loses to it by $452 across the year, because cash earns no
deductible credit. Colouring the low number green would assert the opposite of
what the math says.

So: no red/green for expensive/cheap. No traffic-light semantics anywhere.

Ranking is carried by **position** (the recommended route sits first), by the
**size of the number**, and by **a single accent** reserved for the recommended
route and nothing else. Every non-recommended route is drawn identically at
equal weight — a cash route ranking second must look exactly like an in-network
route ranking second.

This rule is why the two obvious off-the-shelf systems were rejected for this
project: `DESIGN.md` files in the Wise/Stripe mould ship `positive: #2ead4b` /
`negative: #d03238`, and the `ui-ux-pro-max` healthcare generator recommends a
green accent with a red destructive. Both are correct for most products and
actively wrong for this one. See `design/README.md`.

## 1. Visual theme & atmosphere

Quiet, dense, and measured. Closer to a well-set financial statement than to a
health app. The app is asking a patient to trust an unfamiliar number about
their own money, so the surface stays calm and admits its own limits — data
quality flags are a muted olive-brown, not an alarm.

Blue and off-white are used deliberately, against an earlier rule that avoided
both as too clinical. The two failure modes that rule was guarding against are
avoided directly instead: the blue is a muted steel/cobalt rather than a bright
generic "SaaS blue," and the background carries a faint cool tint rather than
sitting at stark white. Neither reads as a hospital portal on its own.

## 2. Colour palette & roles

Two schemes, one set of roles. A palette is a set of *roles*, never a set of
colours — there is no `grey900` or `blue500` anywhere — which is the only reason
a second scheme was possible without touching a single call site. `surface` sits
above `canvas` in light and below it in dark, and every stylesheet still reads
the same sentence: cards lift off the canvas.

Every ratio below is measured by `scripts/check-contrast.py`, which parses this
palette out of `theme.ts` and asserts all 46 pairs on both schemes. That script,
not this table, is the source of truth; run it after changing any hex. Several
ratios in the previous version of this table had drifted from the code by small
amounts, which is what happens to a documented number nobody checks.

| Token | Light | Dark | Role |
|---|---|---|---|
| `ink` | `#161B22` | `#E8ECF1` | Primary text |
| `inkMuted` | `#565F6B` | `#A3AEBA` | Secondary text |
| `canvas` | `#F4F6F8` | `#12171D` | App background, faint cool tint |
| `surface` | `#FFFFFF` | `#1C232B` | Cards, lifted off canvas |
| `line` | `#DEE3E7` | `#262E37` | Decorative hairlines, card edges **only** |
| `accent` | `#215A8C` | `#6FA8D6` | **Recommended route only** |
| `accentInk` | `#FFFFFF` | `#0E141A` | On an accent fill |
| `accentSoft` | `#E4EDF5` | `#18293A` | Accent-tinted recommended card |
| `accentText` | `#173F63` | `#9FC6E4` | Accent text below 18px |
| `border` | `#828C97` | `#6E7885` | Boundary of anything interactive |
| `slate` | `#3B4652` | `#C7D0DA` | Every non-recommended route, equal weight |
| `slateInk` | `#FFFFFF` | `#12171D` | On a slate fill |
| `flag` | `#6B5A2E` | `#C9B37E` | Data-quality warnings |
| `flagBg` | `#EFECE1` | `#2A2822` | Flag background |

Measured, light · dark: `ink` 15.97 · 15.18 on canvas. `inkMuted` 5.97 · 7.99 on
canvas. `accent` 6.67 · 7.07 on canvas. `accentText` 9.20 · 8.24 on accentSoft.
`border` 3.15 · 4.02 on canvas. `slateInk` 9.62 · 11.55 on slate. `flag` 5.68 ·
7.18 on flagBg. `line` 1.19 · 1.31 on canvas — below the ceiling, by design.

Three pairings are load-bearing and must not drift:

- `line` is decorative and stays under 1.5:1 in both schemes. It may never bound
  a control. The checker asserts this from below, as a ceiling.
- `border` exists because WCAG 1.4.11 wants 3:1 for an interactive boundary. An
  unselected chip is surface-on-canvas, which is invisible — this border is the
  only thing saying a control is there.
- `surface` must be lighter than `canvas` in **both** schemes. §6 bans shadow, so
  a value step plus a hairline is the only lift this system has, and a card that
  went darker than its ground would read as a hole rather than as a card.

`accentText` was called `accentDeep` until dark mode arrived. The role is
"accent variant clearing 4.5:1 below 18px"; the old name described a value, and
in dark that value is the lighter of the two.

`slateInk` was added at the same time. Four call sites used `surface` to mean
"text on a slate fill" — the primary button's label, a selected chip's label and
checkmark, the dev tier switch. That pairing does not actually fail in dark:
`surface` and `slate` invert together, so the label measures 10.16:1. It is a
naming fix, and the reason it still matters is that nothing in the code said
those two roles had to move together. Lightening `surface` to lift cards further
off the canvas would have walked a button label toward its own fill, silently.

There is no `success` and no `error` colour, and adding one is a design change
that needs an argument, not a token.

## 3. Typography

Manrope carries every headline-weight role; body and caption stay on the
platform system font. Mixing a distinctive display face with a native body face
is the considered pairing, not a missing one — loading Manrope for 13px captions
would spend a font negotiation on text nobody reads as text.

Static weight files, so `fontFamily` names the exact weight:
`Manrope-Bold` · `Manrope-ExtraBold` · `Manrope-SemiBold`.

| Role | Size / line height | Weight | Face |
|---|---|---|---|
| `display` | 32 / 40 | 800 | Manrope-ExtraBold, `-0.5` tracking |
| `amount` | 26 / 32 | 700 | Manrope-Bold, `-0.3`, **`tabular-nums`** |
| `title` | 22 / 28 | 700 | Manrope-Bold, `-0.2` |
| `body` | 16 / 24 | — | system |
| `label` | 13 / 16 | 600 | Manrope-SemiBold |
| `caption` | 13 / 20 | — | system |
| `bodyStrong` | 16 / 24 | 700 | system |
| `captionStrong` | 13 / 20 | 700 | system |

- All line heights are multiples of 4, so stacked text lands on the same grid as
  the spacing.
- `display` is 32/40, not 32/36 — React Native clips ascenders rather than
  growing the box, and "Your coverage" rendered with its tops cut off.
- `amount` is tabular by necessity: a slider-driven number must not visibly
  reflow as digits change.
- One scale, globally. There used to be two — this one and a private set inside
  `Money.tsx` — which between them defined ten font sizes with no ratio.
- `bodyStrong` and `captionStrong` are the emphasis step, and they are the only
  way to get one. `{ ...type.body, fontWeight: '700' }` at a call site is the
  same role written out by hand, which is how it drifts: one site used 600 and
  ten used 700 before these were declared. Both stay on the system font — 700
  on the platform face *is* the emphasis step, and Manrope at 13px would put a
  display face on a table value.
- There is no `eyebrow`. It was an uppercase, letter-spaced label set above a
  group, and it was deleted from `theme.ts` rather than renamed or shrunk: an
  uppercase label above content a heading already identifies is decoration
  wearing the clothes of structure, and having it as a token made it easy to
  keep reaching for. Grouping is carried by space and a hairline. This table
  listed it for some time after the code stopped defining it, which is how a
  deleted role gets hand-reimplemented at a call site — and one was, in
  `MethodStep`. Do not reintroduce it.
- Never set `fontWeight` over a Manrope role. Those are static weight files, so
  `fontFamily` names the weight and `fontWeight` is not read — a `'700'` over
  `label` renders nothing at all.

## 4. Component styling

- `radius`: `sm 8` · `md 12` · `lg 16`.
- `stroke`: `hairline 1` for things that divide (always with `line`);
  `control 1.5` for the boundary of anything a finger operates (always with
  `border`). Pairing a weight with the wrong colour is the failure this token
  exists to make obvious. `thumb 3` / `thumbHeld 4` are the slider thumb's ring
  and its held state — the thumb is not a divider and not the boundary *of* a
  control, it is the control.
- `size`: fixed component dimensions that are neither spacing nor tap targets.
  `size.icon` is `sm 16` · `md 20` · `lg 24`, and it used to be five values —
  icons were set at 16, 18, 20, 22 and 24 across five files with nothing
  choosing between them. `sm` sits beside a label inside a control, `md` is a
  standalone control's own glyph, `lg` is a navigation glyph carrying its own
  weight. `stepDot 24` is a token because the radius has to stay exactly half
  the width or the dot stops being round; it belonged to `StepBar`, went with
  it, and came back for About's numbered steps.
- Existing components are the reference implementation:
  `BackLink` · `Chip` · `Citation` · `PrimaryButton` · `Row` · `TabBar` ·
  `TopBar` · `ErrorBoundary`. Extend these before inventing a sibling.
  `StepBar` was here until the tab navigation replaced the step chain.
- Styles used by two or more files live in `app/src/styles/shared.ts`; a style
  used by one screen lives in that screen's own `StyleSheet`.
- **Stylesheets are built by `themed()`, not `StyleSheet.create`.** Write
  `themed((c) => ({ ... }))` and read it with `const styles = useStyles(sheets)`;
  the shared sheet is `useStyles(sharedSheets)`. Each sheet is built once per
  scheme at module load, so a theme switch is a context read and an index — no
  allocation on the hot paths. Never reach for an inline colour over a static
  structure (`style={[s.card, { backgroundColor: c.surface }]}`): it allocates
  every render and splits one style across two places, which is what the rule
  above exists to prevent. `useTheme()` gives you `c` for the handful of colours
  that are props rather than styles — an `Ionicons` colour, a
  `placeholderTextColor`.

## 5. Layout

An 8px grid with a single 4px half-step: `xs 4` · `sm 8` · `md 16` · `lg 24` ·
`xl 32`. **Nothing outside this scale is allowed in a stylesheet.** An earlier
scale ran 4/8/14/20/28 and the code reached the gaps by writing `space.md + 2`
in seven places, which is the symptom of a scale that does not fit its layout.

Headings take `lg` above, not `xl` — 44pt tap targets already made every step
taller, and a 32pt gap spent that budget on air.

## 6. Depth & elevation

Flat. Cards separate from the canvas by their own `surface` white plus a `line`
hairline, not by shadow. There is no elevation scale, and there is no glass,
gradient, or glow anywhere in this app.

## 7. Do's and don'ts

**Do**
- Reserve `accent` for the recommended route, exclusively.
- Draw every non-recommended route at equal weight.
- Use `tabular-nums` for any number that changes under user input.
- Treat a missing payer rule as a data limit (`flag`), not an alarm.
- Re-measure contrast when any hex changes.

**Don't**
- Don't add a green or a red. Don't imply "good deal" with hue.
- Don't introduce a value outside the 8px scale or the type scale.
- Don't put `line` on a control or `border` on a divider.
- Don't add shadows, gradients, glassmorphism, or AI purple/pink.
- Don't use emoji as icons.
- Don't state a dollar figure without the estimate framing the engine uses.

## 8. Responsive & platform behaviour

This is a **React Native (Expo) iOS app, not a website.** Guidance written for
the web does not transfer:

- **No hover.** On a touch device the pressed state *is* the focus state —
  every `Pressable` answers with `cardPressed` (`opacity: 0.7`).
- No `cursor-pointer`, no CSS, no Tailwind, no shadcn, no DOM.
- No GSAP and no ScrollTrigger. Motion is minimal and uses RN primitives.
- `TAP_TARGET = 44` minimum on anything a finger hits (Apple HIG + WCAG 2.5.5).
- Honour reduce-motion; nothing essential may live in an animation.
- **Dynamic Type is a layout constraint, not a font-size setting.** iOS text
  sizes reach ~3.1x, and React Native breaks *inside a word* rather than
  overflowing, so a heading becomes "Preclea / r / Househ / old" and a badge in
  a row too narrow for it becomes "S / a / v / e". `textScale` caps the roles
  whose failure is one unbreakable word wider than the screen; nothing carrying
  meaning is capped below WCAG 1.4.4's 200%. Where a *row* is what does not
  fit, a cap is the wrong instrument — reflow it to a column above
  `textScale.stackAbove`, because smaller text in a too-narrow row is still one
  letter per line. Any row pairing text with a number needs this. Check both
  `accessibility-extra-large` and the default size: a fix that moves the 1.0x
  rendering is a regression.

## 9. Agent prompt guide

When any design skill is used on this repo, hand it these constraints up front:

> React Native (Expo) iOS app, no web. Tokens come from `app/src/theme.ts` —
> import them, never hardcode a hex or a spacing value. Hue must never encode
> rank: no red/green for expensive/cheap, ranking is carried by position, number
> size, and the single `accent` reserved for the recommended route. 8px grid,
> one type scale, flat surfaces, 44pt minimum tap targets, WCAG-measured
> contrast. No hover states, no GSAP, no Tailwind.

Skills that fit this project: `redesign-existing-projects` (audit existing
screens), `imagegen-frontend-mobile` (screen concepts before code),
`ui-ux-pro-max` (component and accessibility patterns — ignore its colour and
motion output, see `design/README.md`; its React Native answer for animation is
Reanimated, a native module, which costs a dev-client rebuild this project has
a standing rule against — `LayoutAnimation` is the core-RN equivalent).

Its `references/pro-rules.md` checklist is the useful part and was run against
this app on 2026-09-03. Most of it already passed. Two things worth recording so
they are not re-derived: decorative icons are already out of the accessibility
tree because React Native's `Pressable` defaults to `accessible={true}`, making
each control one element — the web advice to add `aria-hidden` has no analogue
to write here. And `SafeAreaView` from `react-native` is deprecated; the
replacement, `react-native-safe-area-context`, is a native module, so this is
recorded rather than fixed.

Skills that do not apply: anything web-first — `ui-styling` (Tailwind/shadcn),
`gpt-taste` (GSAP), `imagegen-frontend-web`, `slides`, `banner-design`.
