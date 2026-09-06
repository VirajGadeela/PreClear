/**
 * A titled row that shows its current value and opens on tap.
 *
 * This is the app's one way to put detail behind a tap, and it exists because
 * the same pattern had been written inline three times — the route row's
 * breakdown, the filter strip's expand, the payer groups on Sources. Three
 * implementations meant three tap targets of different heights, three chevron
 * treatments, and three chances to forget `accessibilityState`.
 *
 * The summary line is the part that earns the collapse. A closed row that says
 * only "Coverage" hides the answer and forces a tap to find out; one that says
 * "Coverage — Aetna · PPO" *is* the answer, and the tap is only needed to change
 * it. That distinction is what lets the filter panel go from eight headings and
 * forty controls down to four lines without hiding anything a member needs to
 * read.
 *
 * Deliberately not animated. Adding motion here means `LayoutAnimation` and a
 * reduce-motion check, and the honest position is that an instant open is not
 * the thing wrong with this app. See DESIGN.md §8.
 */

import { Ionicons } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { TAP_TARGET, size, space, stroke, type } from '../theme';
import { useStyles, useTheme } from '../ThemeProvider';
import { themed } from '../styles/themed';

export function Disclosure({
  title,
  /**
   * The current value, shown while closed. Omit only when there is nothing to
   * report yet — a row with no summary is a row that has to be opened to be
   * understood, which is the failure this component exists to avoid.
   */
  summary,
  open,
  onToggle,
  /** Drops the bottom hairline, for the last row in a group. */
  last = false,
  children,
}: {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  last?: boolean;
  children: ReactNode;
}) {
  const styles = useStyles(sheets);
  const { c } = useTheme();

  return (
    <View style={[styles.wrap, last && styles.wrapLast]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        // Reads the value aloud rather than only the title, so the collapsed
        // state carries the same information by ear as it does by eye.
        accessibilityLabel={summary ? `${title}. ${summary}.` : title}
        accessibilityHint={open ? 'Closes this section' : 'Opens this section'}
        onPress={onToggle}
        style={({ pressed }) => [styles.head, pressed && styles.headPressed]}
      >
        <View style={styles.headText}>
          <Text style={styles.title}>{title}</Text>
          {/* Closed only, for two reasons that turn out to be one.
              Redundancy: open, this line restates the controls directly under
              it, and a summary is only worth its space while it stands in for
              something off screen.
              Layout: it carries a `money()` figure a slider is driving, so
              "$2,000.00 (estimate) left" becomes "$10,000.00 (estimate) left"
              mid-drag, wraps onto a second line, and changes the head's height
              while a finger is on the track. Every row below jumped. Reserving
              a fixed height would have hidden that; not rendering a value the
              member is watching a control display fixes it. */}
          {!open && summary ? (
            <Text style={styles.summary} numberOfLines={2}>
              {summary}
            </Text>
          ) : null}
        </View>
        {/* Rotation, not two glyphs: the chevron points at where the content
            is, which is the one thing the icon has to say. */}
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={size.icon.md}
          color={c.inkMuted}
        />
      </Pressable>

      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const sheets = themed((c) => ({
  wrap: {
    borderBottomWidth: stroke.hairline,
    borderBottomColor: c.line,
  },
  wrapLast: { borderBottomWidth: 0 },

  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: TAP_TARGET,
    paddingVertical: space.sm,
  },
  headPressed: { opacity: 0.7 },
  headText: { flex: 1 },
  title: { ...type.bodyStrong, color: c.ink },
  // Two lines, ellipsised. One was the first try and it truncated the only
  // summary that has to carry a currency figure — hard rule 5 puts "(estimate)"
  // inside every one of those, so they are long by design. Three would be a
  // summary that had stopped summarising.
  summary: { ...type.caption, color: c.inkMuted, marginTop: space.xs },

  body: { paddingBottom: space.md },
}));
