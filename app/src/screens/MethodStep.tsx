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
import { useMemo, useState } from 'react';

import { data } from '../appData';
import { FAQ, HOW_IT_WORKS } from '../marketing';
import { Disclosure } from '../components/Disclosure';
import { Requirement } from '../routes';
import { sharedSheets } from '../styles/shared';
import { TAP_TARGET, radius, size, space, stroke, textScale, type } from '../theme';
import { useStyles } from '../ThemeProvider';
import { themed } from '../styles/themed';

export function MethodStep() {
  const styles = useStyles(sheets);
  // One key across the whole screen, so payer groups, individual rules and FAQ
  // entries all close each other. This screen is ~1,500 words with everything
  // open; letting two branches open at once is most of that back.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggle = (key: string) => setOpenKey((current) => (current === key ? null : key));
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
      <Text style={shared.h1} maxFontSizeMultiplier={textScale.display}>
        Where these numbers come from
      </Text>
      <Text style={shared.body}>{data.disclosure}</Text>

      {/* Moved here off the cover. Three lines, not three paragraphs — the
          directions a member needs mid-task are the control labels and the
          button, and an explainer belongs on the screen a sceptic opens rather
          than on the one they are trying to get past. */}
      <Text style={shared.h2}>How it works</Text>
      {HOW_IT_WORKS.map((step) => (
        <View key={step.n} style={styles.step}>
          <View style={styles.stepDot}>
            <Text style={styles.stepNumber} maxFontSizeMultiplier={textScale.badge}>
              {step.n}
            </Text>
          </View>
          <View style={styles.stepBody}>
            <Text style={styles.stepText}>{step.title}</Text>
            <Text style={styles.stepNote}>{step.body}</Text>
          </View>
        </View>
      ))}

      <Text style={shared.h2}>Prices</Text>
      <Text style={shared.body}>
        Rates come from {data.generated_from}, the files hospitals and payers
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

      {/* Closed by default, one at a time. Every rule used to render its
          summary, its verbatim quote, a citation, a reviewer line and a link,
          all at once — 845 words of payer text on arrival. None of it is gone;
          it is two taps rather than a scroll, and the quote is still directly
          under the summary that claims it. */}
      {byPayer.map(([payer, requirements]) => (
        <Disclosure
          key={payer}
          title={payer}
          summary={`${requirements.length} ${requirements.length === 1 ? 'rule' : 'rules'}`}
          open={openKey === payer}
          onToggle={() => toggle(payer)}
        >
          {requirements.map((requirement, index) => (
            <Disclosure
              key={requirement.key}
              title={requirement.summary}
              open={openKey === requirement.key}
              onToggle={() => toggle(requirement.key)}
              last={index === requirements.length - 1}
            >
              {/* The payer's own words. The title above is ours, and the
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
                style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
              >
                <Text style={styles.linkText}>Source document</Text>
              </Pressable>
            </Disclosure>
          ))}
        </Disclosure>
      ))}

      {/* Underneath the sources, not on a tab of its own. A reader with a
          question about a claim is already here, and an answer sitting beside
          the document it depends on is worth more than the same answer one tap
          further away.

          These shipped as plain stacked blocks, on the argument that six
          questions do not need progressive disclosure and a collapsed answer is
          one nobody reads. That was right about six questions in isolation and
          wrong about this screen: they sit at the bottom of the longest page in
          the app, and the question is what a reader scans for. The question is
          still fully visible — only the answer folds. */}
      <Text style={shared.h2}>Questions</Text>
      {FAQ.map((entry, index) => (
        <Disclosure
          key={entry.q}
          title={entry.q}
          open={openKey === entry.q}
          onToggle={() => toggle(entry.q)}
          last={index === FAQ.length - 1}
        >
          <Text style={styles.faqAnswer}>{entry.a}</Text>
        </Disclosure>
      ))}

      <Text style={shared.h2}>What this is not</Text>
      {/* Stated here rather than only in a footnote. This is the screen a
          sceptical reader opens, and so the screen where an overclaim would do
          the most damage. */}
      <Text style={shared.body}>
        These are estimates, not quotes. Nothing here predicts whether a claim
        will be paid or denied. It reports which published criteria an order
        does not document as met. Nothing here recommends a different scan or a
        different treatment. Your benefit figures are the ones you entered, and
        they are never stored or sent anywhere.
      </Text>
    </View>
  );
}

const sheets = themed((c) => ({
  // One line each, numbered. The dot is `slate`, not `accent` — the recommended
  // route owns that, and a step numeral is not a recommendation.
  step: { flexDirection: 'row', gap: space.md, marginBottom: space.md },
  stepDot: {
    width: size.stepDot,
    height: size.stepDot,
    borderRadius: size.stepDot / 2,
    backgroundColor: c.slate,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: { ...type.label, color: c.slateInk },
  stepBody: { flex: 1 },
  stepText: { ...type.bodyStrong, color: c.ink },
  stepNote: { ...type.caption, color: c.inkMuted },

  faqAnswer: { ...type.body, color: c.inkMuted },

  procedure: { ...type.caption, color: c.inkMuted, marginBottom: space.xs },

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
  // This one leaves the app. Without a press state the tap looks ignored for
  // however long iOS takes to hand over to the browser, which is the longest
  // wait in the app and the only one with no feedback at all.
  linkPressed: { opacity: 0.6 },
  linkText: { ...type.caption, fontWeight: '700', color: c.accent },
}));
