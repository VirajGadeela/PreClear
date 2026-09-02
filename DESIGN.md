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

Every ratio below is measured, not estimated. Any change to a hex must be
re-measured before it lands.

| Token | Hex | Role | Measured |
|---|---|---|---|
| `ink` | `#161B22` | Primary text | 16.0:1 canvas · 17.6:1 surface |
| `inkMuted` | `#565F6B` | Secondary text | 5.97:1 canvas · 6.53:1 surface |
| `canvas` | `#F4F6F8` | App background, faint cool tint | — |
| `surface` | `#FFFFFF` | Cards, lifted off canvas | — |
| `line` | `#DEE3E7` | Decorative hairlines, card edges **only** | 1.05:1 — invisible by design |
| `accent` | `#215A8C` | **Recommended route only** | 6.67:1 canvas · 7.23:1 surface |
| `accentInk` | `#FFFFFF` | On accent | 7.23:1 |
| `accentSoft` | `#E4EDF5` | Accent-tinted recommended card | — |
| `accentDeep` | `#173F63` | Accent text below 18px | 9.20:1 accentSoft · 10.06:1 canvas |
| `border` | `#828C97` | Boundary of anything interactive | 3.15:1 canvas · 3.40:1 surface |
| `slate` | `#3B4652` | Every non-recommended route, equal weight | 9.62:1 white-on · 8.88:1 canvas |
| `flag` | `#6B5A2E` | Data-quality warnings | 5.68:1 on flagBg |
| `flagBg` | `#EFECE1` | Flag background | — |

Two pairings are load-bearing and must not drift:

- `line` is decorative and measures 1.05:1. It may never bound a control.
- `border` exists because WCAG 1.4.11 wants 3:1 for an interactive boundary. An
  unselected chip is white on near-white canvas — this border is the only thing
  saying a control is there.

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

- All line heights are multiples of 4, so stacked text lands on the same grid as
  the spacing.
- `display` is 32/40, not 32/36 — React Native clips ascenders rather than
  growing the box, and "Your coverage" rendered with its tops cut off.
- `amount` is tabular by necessity: a slider-driven number must not visibly
  reflow as digits change.
- One scale, globally. There used to be two — this one and a private set inside
  `Money.tsx` — which between them defined ten font sizes with no ratio.

## 4. Component styling

- `radius`: `sm 8` · `md 12` · `lg 16`.
- `stroke`: `hairline 1` for things that divide (always with `line`);
  `control 1.5` for the boundary of anything a finger operates (always with
  `border`). Pairing a weight with the wrong colour is the failure this token
  exists to make obvious.
- Existing components are the reference implementation:
  `BackLink` · `Chip` · `PrimaryButton` · `Row` · `StepBar` · `TopBar` ·
  `ErrorBoundary`. Extend these before inventing a sibling.
- Styles used by two or more files live in `app/src/styles/shared.ts`; a style
  used by one screen lives in that screen's own `StyleSheet`.

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
motion output, see `design/README.md`).

Skills that do not apply: anything web-first — `ui-styling` (Tailwind/shadcn),
`gpt-taste` (GSAP), `imagegen-frontend-web`, `slides`, `banner-design`.
