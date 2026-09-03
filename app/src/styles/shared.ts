/**
 * Styles used by more than one screen or component.
 *
 * Everything here earns its place by actually being imported from at least two
 * files — a style used by only one screen lives in that screen's own
 * StyleSheet instead. See `app/src/theme.ts` for the tokens these are built
 * from; nothing in this file introduces a value outside that scale.
 */

import { TAP_TARGET, radius, space, type } from '../theme';
import { themed } from './themed';

export const sharedSheets = themed((c) => ({
  h1: { ...type.display, color: c.ink, marginTop: space.lg, marginBottom: space.sm },
  // lg, not xl. The 44pt tap targets made every step taller, and a 32pt gap
  // above each heading spent that budget on air — the scan step's primary
  // button is already the furthest thing from the top of the flow.
  h2: { ...type.title, color: c.ink, marginTop: space.lg, marginBottom: space.md },
  body: { ...type.body, color: c.inkMuted, marginBottom: space.md },
  caption: { ...type.caption, color: c.inkMuted, marginBottom: space.md },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  featureBlock: { marginTop: space.lg, gap: space.sm },

  // On a touch device the pressed state is the focus state — there is no
  // hover and no keyboard ring to fall back on. Every Pressable answers.
  cardPressed: { opacity: 0.7 },

  rowLabel: { ...type.caption, color: c.inkMuted },
  detailSummary: { ...type.caption, color: c.ink, marginTop: space.xs },
  citation: { ...type.caption, color: c.inkMuted, marginTop: space.xs },

  planRow: { flexDirection: 'row', gap: space.sm },
  planBullet: { ...type.captionStrong, color: c.accent },
  planLine: { ...type.caption, color: c.ink, flex: 1 },
  planCaveat: { ...type.caption, color: c.inkMuted, marginTop: space.xs },

  // Uses the data-quality flag colour, not an alarm colour. A missing rule is
  // a limit of the data, the same class of thing as a suspect rate.
  coverageGap: {
    backgroundColor: c.flagBg,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
  },
  coverageGapText: { ...type.caption, color: c.flag },

  // Deliberately quiet. Restore is a recovery path, not an offer, so it must
  // not compete with the unlock card above it.
  restore: {
    alignItems: 'center',
    marginTop: space.md,
    minHeight: TAP_TARGET,
    justifyContent: 'center',
  },
  restorePressed: { opacity: 0.6 },
  restoreText: { ...type.caption, color: c.inkMuted },

  note: { ...type.caption, color: c.flag, marginTop: space.md },
}));
