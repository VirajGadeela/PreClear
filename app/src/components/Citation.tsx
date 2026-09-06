/**
 * One unmet requirement, rendered as a citation.
 *
 * This is the most defensible thing in the app and it was the least visible:
 * the card showed our own paraphrase, then `payer · section_id · version` in
 * muted 13px, then a bare "Source document" link. A reader had no way to tell
 * that string from an identifier we invented, because the payer's own words —
 * already in the bundle as `quote` — never rendered at all.
 *
 * So the order here is deliberate and it is not the order the data is in:
 *
 *   1. what it means for you        (`summary`, our sentence)
 *   2. what the document says       (`quote`, verbatim, in quotation marks)
 *   3. which document that is       (title, publisher, section, version, date)
 *   4. go and read it               (the link)
 *
 * The quote sits in an inset block rather than behind a left rule because the
 * two stroke weights in `theme.ts` are spoken for — `hairline` pairs with
 * `line`, which measures 1.05:1 and would be invisible, and `control` means
 * "boundary of something a finger operates", which a quotation is not.
 *
 * Nothing here predicts a denial, and the copy must never drift that way. It
 * reports what a published document requires and what the order does not yet
 * document. See `app/src/requirements.ts`.
 */

import { Linking, Pressable, Text, View } from 'react-native';
import { TAP_TARGET, radius, space, stroke, type } from '../theme';
import { useStyles } from '../ThemeProvider';
import { themed } from '../styles/themed';
import { Requirement } from '../routes';
import { Status, statusLabel } from '../requirements';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * `2026-02-03` to `3 Feb 2026`.
 *
 * Split on the string rather than going through `Date`, which would read the
 * ISO date as UTC midnight and render the previous day for anyone west of
 * Greenwich — the effective date of a payer guideline is a fact about the
 * document, not an instant in the reader's timezone.
 */
function formatEffective(iso: string): string {
  const [year, month, day] = iso.split('-');
  const name = MONTHS[Number(month) - 1];
  if (!name || !year || !day) return iso;
  return `${Number(day)} ${name} ${year}`;
}

/**
 * Who published the criteria, which is usually not the payer.
 *
 * Advanced imaging review is delegated — Anthem to Carelon, Cigna to eviCore —
 * and naming the delegate is part of what makes the citation checkable. Aetna
 * and UnitedHealthcare write their own, and the data marks that by putting
 * "(self-published)" in `reviewed_by`; repeating the payer's name twice on one
 * line reads as a bug, so that case collapses to the payer alone.
 */
export function publisher(requirement: Requirement): string {
  if (requirement.reviewed_by.includes('self-published')) return requirement.payer;
  return requirement.reviewed_by;
}

function attribution(requirement: Requirement): string {
  if (requirement.reviewed_by.includes('self-published')) return requirement.payer;
  return `${requirement.payer} · reviewed by ${requirement.reviewed_by}`;
}

export function Citation({
  requirement,
  status,
}: {
  requirement: Requirement;
  status: Status;
}) {
  const styles = useStyles(sheets);
  const effective = formatEffective(requirement.effective_date);

  return (
    <View style={styles.wrap}>
      <Text style={styles.status}>{statusLabel(status)}</Text>
      {/* The limit of what the app saw, next to the judgement it made.
          Every status here is derived from the member's own answers, and the
          app has no access to the order or the chart, so a criterion shown as
          unmet may already be recorded and this may be nothing to raise. Said
          on every citation rather than once elsewhere, because this is the
          screen where a member decides whether to phone their doctor. */}
      <Text style={styles.provenance}>
        Judged from your answers, not from your chart. The office may already
        have this recorded.
      </Text>
      <Text style={styles.summary}>{requirement.summary}</Text>

      {/* The verbatim text. Quotation marks rather than italics: they say
          "these are their words, not ours" without inventing a type style
          that exists nowhere else in the app. */}
      <View style={styles.quoteBlock}>
        <Text style={styles.quote}>{`“${requirement.quote}”`}</Text>
      </View>

      <Text style={styles.docTitle}>{requirement.document_title}</Text>
      <Text style={styles.docMeta}>{attribution(requirement)}</Text>
      <Text style={styles.docMeta}>
        {requirement.section_id} · {requirement.version} · effective {effective}
      </Text>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open the source document: ${requirement.document_title}, section ${requirement.section_id}`}
        onPress={() => Linking.openURL(requirement.source_url)}
        style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
      >
        <Text style={styles.linkText}>Read the source document</Text>
      </Pressable>

      {requirement.alternative_pathway && (
        <Text style={styles.hedge}>
          One of several alternative criteria; another may apply instead.
        </Text>
      )}
    </View>
  );
}

const sheets = themed((c) => ({
  wrap: {
    borderTopWidth: stroke.hairline,
    borderTopColor: c.line,
    marginTop: space.md,
    paddingTop: space.md,
  },

  status: { ...type.captionStrong, color: c.flag },
  // Muted, not `flag`. The status above it is the finding; this is the caveat
  // on the finding, and giving it the warning colour too would read as a
  // second problem rather than as the limit of the first.
  provenance: { ...type.caption, color: c.inkMuted, marginTop: space.xs },
  summary: { ...type.caption, color: c.ink, marginTop: space.xs },

  // Inset on the canvas tint so the payer's words sit visibly apart from ours
  // on a white card, without a border competing with the card's own edge.
  quoteBlock: {
    backgroundColor: c.canvas,
    borderRadius: radius.sm,
    padding: space.md,
    marginTop: space.sm,
    marginBottom: space.sm,
  },
  // Body size, not caption. This is the sentence the whole screen is evidence
  // for; setting it at 13px alongside our own paraphrase said the opposite.
  quote: { ...type.body, color: c.ink },

  docTitle: { ...type.captionStrong, color: c.ink, marginTop: space.xs },
  docMeta: { ...type.caption, color: c.inkMuted },

  link: {
    minHeight: TAP_TARGET,
    justifyContent: 'center',
  },
  linkPressed: { opacity: 0.6 },
  // `accentText`, not `accent`: this is 13px, where WCAG wants 4.5:1 rather
  // than the 3:1 large text is allowed. See the token comments in theme.ts.
  linkText: { ...type.captionStrong, color: c.accentText },

  hedge: { ...type.caption, color: c.inkMuted, marginBottom: space.sm },
}));
