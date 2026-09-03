/**
 * Where every number on the routes screen came from.
 *
 * The requirement records have carried `document_title`, `section_id`,
 * `version`, `effective_date` and `source_url` since the pipeline was written,
 * and until this screen existed all of it surfaced in one place only: inside an
 * expanded route card, for requirements an order had *failed*. So the criteria
 * an order passed were invisible, and so were the price files under every
 * dollar figure.
 *
 * That is the wrong way round. This app asks a member to believe a
 * counterintuitive claim about their own money, and the provenance is the
 * argument for it rather than an appendix to it. It is also the part of this
 * product that cannot be guessed at from the outside — anyone can assert a
 * price, and almost nobody can say which published file it came out of.
 *
 * Everything here is read from the shipped bundle rather than restated, so the
 * screen cannot drift out of step with the rules the engine actually applied.
 * A hardcoded list of "our sources" is precisely the kind of claim that stays
 * true in the README and stops being true in the data.
 */

import { Linking, Pressable, Text, View } from 'react-native';
import { useMemo } from 'react';

import { data } from '../appData';
import { FAQ } from '../marketing';
import { Requirement } from '../routes';
import { sharedSheets } from '../styles/shared';
import { TAP_TARGET, radius, space, stroke, type } from '../theme';
import { useStyles } from '../ThemeProvider';
import { themed } from '../styles/themed';

export function MethodStep() {
  const styles = useStyles(sheets);
  const shared = useStyles(sharedSheets);
  // Grouped by payer, because a payer with two recorded rules and one with
  // nine are different products to a member, and a flat list of 21 hides that
  // completely.
  const byPayer = useMemo(() => {
    const groups = new Map<string, Requirement[]>();
    for (const requirement of data.requirements) {
      const list = groups.get(requirement.payer) ?? [];
      list.push(requirement);
      groups.set(requirement.payer, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, []);

  const facilityCount = useMemo(() => {
    const names = new Set<string>();
    for (const procedure of data.procedures) {
      for (const bundles of Object.values(procedure.payers)) {
        for (const bundle of bundles) names.add(bundle.facility_name);
      }
    }
    return names.size;
  }, []);

  return (
    <View>
      <Text style={shared.h1}>Where these numbers come from</Text>
      <Text style={shared.body}>{data.disclosure}</Text>

      <Text style={shared.h2}>Prices</Text>
      <Text style={shared.body}>
        Rates come from {data.generated_from} — the files hospitals and payers
        are federally required to publish. This build covers {facilityCount}{' '}
        {facilityCount === 1 ? 'facility' : 'facilities'} in {data.metro} across{' '}
        {data.procedures.length}{' '}
        {data.procedures.length === 1 ? 'procedure' : 'procedures'}.
      </Text>
      {/* Named rather than implied: a member checking a figure needs to know
          which scan it belongs to. */}
      {data.procedures.map((procedure) => (
        <Text key={procedure.cpt} style={styles.procedure}>
          {procedure.label} · CPT {procedure.cpt}
        </Text>
      ))}

      <Text style={shared.h2}>Requirements</Text>
      <Text style={shared.body}>
        {data.requirements.length} published criteria across {byPayer.length}{' '}
        insurers. Each is quoted from the document beneath it and checked against
        what the order records. This reports documentation, never a coverage
        outcome.
      </Text>

      {byPayer.map(([payer, requirements]) => (
        <View key={payer} style={styles.group}>
          <Text style={styles.groupPayer}>
            {payer} · {requirements.length}{' '}
            {requirements.length === 1 ? 'rule' : 'rules'}
          </Text>
          {requirements.map((requirement) => (
            <View key={requirement.key} style={styles.source}>
              <Text style={shared.detailSummary}>{requirement.summary}</Text>
              {/* The payer's own words. The line above is ours, and the
                  difference between the two is what lets a member check us. */}
              <Text style={styles.quote}>“{requirement.quote}”</Text>
              <Text style={shared.citation}>
                {requirement.document_title} · {requirement.section_id} ·
                effective {requirement.effective_date}
              </Text>
              {/* Not always the payer: Anthem's imaging criteria are Carelon's
                  and Cigna's are eviCore's. A member who calls the wrong
                  organisation gets nowhere, so it is named. */}
              {requirement.reviewed_by !== requirement.payer && (
                <Text style={shared.citation}>
                  Reviewed by {requirement.reviewed_by}
                </Text>
              )}
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Open the source document for ${requirement.summary}`}
                onPress={() => Linking.openURL(requirement.source_url)}
                style={styles.link}
              >
                <Text style={styles.linkText}>Source document</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ))}

      {/* Underneath the sources, not on a tab of its own. A reader with a
          question about a claim is already here, and an answer sitting beside
          the document it depends on is worth more than the same answer one tap
          further away.

          Written as plain stacked blocks rather than as an accordion: six
          questions do not need progressive disclosure, and a collapsed answer
          is an answer somebody does not read. */}
      <Text style={shared.h2}>Questions</Text>
      {FAQ.map((entry) => (
        <View key={entry.q} style={styles.faq}>
          <Text style={styles.faqQuestion}>{entry.q}</Text>
          <Text style={styles.faqAnswer}>{entry.a}</Text>
        </View>
      ))}

      <Text style={shared.h2}>What this is not</Text>
      {/* Stated here rather than only in a footnote. This is the screen a
          sceptical reader opens, and so the screen where an overclaim would do
          the most damage. */}
      <Text style={shared.body}>
        These are estimates, not quotes. Nothing here predicts whether a claim
        will be paid or denied — it reports which published criteria an order
        does not document as met. Nothing here recommends a different scan or a
        different treatment. Your benefit figures are the ones you entered, and
        they are never stored or sent anywhere.
      </Text>
    </View>
  );
}

const sheets = themed((c) => ({
  faq: { marginBottom: space.lg },
  faqQuestion: { ...type.bodyStrong, color: c.ink, marginBottom: space.xs },
  faqAnswer: { ...type.body, color: c.inkMuted },

  procedure: { ...type.caption, color: c.inkMuted, marginBottom: space.xs },

  group: { marginTop: space.lg },
  groupPayer: {
    ...type.label,
    color: c.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: space.sm,
  },
  source: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: c.line,
    padding: space.md,
    marginBottom: space.sm,
  },
  // Italic behind a rule, so the payer's words are visibly not ours.
  quote: {
    ...type.caption,
    color: c.inkMuted,
    fontStyle: 'italic',
    marginTop: space.sm,
    paddingLeft: space.sm,
    borderLeftWidth: 2,
    borderLeftColor: c.line,
  },
  link: { minHeight: TAP_TARGET, justifyContent: 'center' },
  linkText: { ...type.caption, fontWeight: '700', color: c.accent },
}));
