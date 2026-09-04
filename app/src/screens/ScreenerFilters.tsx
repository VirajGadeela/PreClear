/**
 * Everything the screener is asking, above the answer it produces.
 *
 * This is the scan step and the coverage step folded into one collapsible
 * strip. They were two full screens standing between a member and the only
 * thing this app exists to show; as a strip they are a refinement of a result
 * that is already on screen.
 *
 * Collapsed is the default and the important state. It has to say three things
 * in one line — what is being priced, whose plan, and *whose numbers these are*
 * — because a results-first screen ranks routes before anyone has entered
 * anything, and the collapsed strip is the only place that can admit it.
 *
 * Open, it is four `Disclosure` rows and one of them at a time. It used to be
 * one flat scroll: eight headings, about eighteen chips, three or four sliders
 * carrying six preset chips between them, and a text field — the densest
 * surface in the app by a wide margin, and the thing that got it called
 * overwhelming twice. Four lines that each name their own current value replace
 * it, and nothing is more than one tap away.
 *
 * The grouping is by *what the answer is about*, which moved two controls.
 * Weeks of treatment and the headache question read like coverage questions and
 * are not: they describe what the order documents, they exist only because of
 * the chosen indication, and they feed the requirement check rather than the
 * cost math. They belong with the scan.
 */

import { Pressable, Text, TextInput, View } from 'react-native';

import { Chip } from '../components/Chip';
import { Disclosure } from '../components/Disclosure';
import { Slider } from '../Slider';
import { money } from '../costing';
import { DEMO_SCENARIOS, DemoScenario } from '../demo';
import { PAYER_CHIP_LABELS, PAYER_LABELS, Procedure, data } from '../appData';
import { QuerySource, ScreenerQuery } from '../screener';
import { sharedSheets } from '../styles/shared';
import { TAP_TARGET, radius, space, stroke, type } from '../theme';
import { useStyles, useTheme } from '../ThemeProvider';
import { themed } from '../styles/themed';

/** Which group is open. `null` is all four closed, which is the default. */
export type FilterGroup = 'example' | 'scan' | 'coverage' | 'year';

/**
 * The collapsed line.
 *
 * Two facts, not the whole query: what is being priced, and whose plan.
 *
 * It carried the deductible too, and should not. Every dollar figure in this
 * app renders through `money()`, which by hard rule 5 puts "(estimate)" inside
 * the string — so a benefit figure here reads "$6,250.00 (estimate) left" and
 * wraps the strip onto three lines. The heaviest formatting in the app does not
 * belong on its most compact surface, and the figure is one tap away in the
 * panel that owns it.
 */
function summarise(query: ScreenerQuery, procedureLabel: string): string {
  return [procedureLabel, PAYER_CHIP_LABELS[query.payer] ?? query.payer].join(' · ');
}

/**
 * The three group summaries.
 *
 * Each is what its row says while closed, and the reason the collapse costs
 * nothing: a closed row reading "Coverage — Aetna · PPO" *is* the answer, and
 * opening it is only needed to change it.
 *
 * `summariseYear` is the awkward one, and the awkwardness is hard rule 5 doing
 * its job. `money()` puts "(estimate)" inside the string, so three figures in
 * one summary reads "$6,250.00 (estimate) deductible left · 20% · $8,000.00
 * (estimate) other care" and truncates — which is exactly the trap the
 * collapsed strip above already avoids by carrying no figures at all.
 *
 * One figure, then. The deductible is the one that decides the ranking, so it
 * is spelled out; coinsurance is a percentage rather than an amount and costs
 * nothing; and expected other care — the hinge, per CLAUDE.md — is named
 * without a number, because a second "(estimate)" buys less than it costs. The
 * exact figure is one tap away on the slider that owns it.
 *
 * There is a real question underneath this: `money()` labels a *projected cost*
 * as an estimate, and the deductible here is a number the member typed about
 * their own plan. That distinction may well justify a different formatter for
 * echoed inputs — but hard rule 5 says every dollar figure, and narrowing a
 * hard rule is not a formatting decision. Left alone deliberately.
 */
function summariseScan(query: ScreenerQuery, procedure: Procedure): string {
  const indication = procedure.indications.find((item) => item.key === query.indication);
  return [procedure.label, indication?.label].filter(Boolean).join(' · ');
}

function summariseCoverage(query: ScreenerQuery): string {
  const payer = PAYER_CHIP_LABELS[query.payer] ?? query.payer;
  const product = query.product ? query.product.toUpperCase() : null;
  return [payer, product, query.planText.trim() || null].filter(Boolean).join(' · ');
}

function summariseYear(query: ScreenerQuery): string {
  const other =
    query.expectedOtherSpend > 0 ? 'other care expected' : 'no other care';
  return [
    `${money(query.deductible)} left`,
    `${Math.round(query.coinsurance * 100)}%`,
    other,
  ].join(' · ');
}

export function ScreenerFilters({
  query,
  source,
  procedure,
  productOptions,
  planMatch,
  showTreatment,
  showHeadacheFeature,
  open,
  openGroup,
  onToggle,
  onOpenGroup,
  onRefine,
  onExample,
}: {
  query: ScreenerQuery;
  source: QuerySource;
  procedure: Procedure;
  productOptions: string[];
  planMatch: { matched: number; total: number } | null;
  showTreatment: boolean;
  showHeadacheFeature: boolean;
  open: boolean;
  openGroup: FilterGroup | null;
  onToggle: () => void;
  onOpenGroup: (group: FilterGroup | null) => void;
  onRefine: (patch: Partial<ScreenerQuery>) => void;
  onExample: (scenario: DemoScenario) => void;
}) {
  const styles = useStyles(sheets);
  const shared = useStyles(sharedSheets);
  const { c } = useTheme();

  // One at a time. Two open groups is most of the flat scroll back again, and
  // the whole point of the summary line is that a closed row still answers.
  const toggleGroup = (group: FilterGroup) =>
    onOpenGroup(openGroup === group ? null : group);

  return (
    <View style={styles.strip}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={
          open
            ? 'Hide the filters'
            : `Refine. Currently ${summarise(query, procedure.label)}`
        }
        onPress={onToggle}
        style={({ pressed }) => [styles.head, pressed && shared.cardPressed]}
      >
        <View style={styles.headText}>
          {/*
            The only thing standing between a results-first screen and a claim
            it has not earned.

            Until a member moves a control the ranking below is built from
            inputs nobody entered, and the step flow this replaced locked its
            forward steps precisely so that could not happen. So the line does
            two jobs in one breath: it denies the claim, then offers it. Denial
            first, because a member who reads only the first half must still
            come away right.

            "Not your numbers" rather than "not real numbers" — the rates are
            real and published, and the facilities are named. What is
            hypothetical is the patient, and saying otherwise would undersell
            the one thing this app can defend.

            Disappears the moment `source` becomes 'mine', which is the only
            moment it stops being true.
          */}
          {source === 'example' && (
            <Text style={styles.exampleTag}>
              An example, not your numbers. Refine for yours.
            </Text>
          )}
          <Text style={styles.summary} numberOfLines={2}>
            {summarise(query, procedure.label)}
          </Text>
        </View>
        <Text style={styles.toggle}>{open ? 'Done' : 'Refine'}</Text>
      </Pressable>

      {open && (
        <View style={styles.body}>
          {/* First, because it is the fastest route to a real answer for
              someone who has not got their own figures to hand. No summary
              line: there is no current value to report, only three ways in. */}
          <Disclosure
            title="Start from an example"
            open={openGroup === 'example'}
            onToggle={() => toggleGroup('example')}
          >
            <View style={shared.chipWrap}>
              {DEMO_SCENARIOS.map((scenario) => (
                <Chip
                  key={scenario.id}
                  selected={false}
                  label={scenario.title}
                  spoken={`${scenario.title}. ${scenario.teaser}`}
                  block
                  onPress={() => onExample(scenario)}
                />
              ))}
            </View>
          </Disclosure>

          <Disclosure
            title="Scan"
            summary={summariseScan(query, procedure)}
            open={openGroup === 'scan'}
            onToggle={() => toggleGroup('scan')}
          >
            <View style={shared.chipWrap}>
              {data.procedures.map((item) => (
                <Chip
                  key={item.cpt}
                  selected={item.cpt === query.cpt}
                  label={item.label}
                  onPress={() => onRefine({ cpt: item.cpt })}
                />
              ))}
            </View>

            {procedure.indications.length > 0 && (
              <View style={styles.field}>
                <Text style={shared.rowLabel}>Why it was ordered</Text>
                <View style={shared.chipWrap}>
                  {procedure.indications.map((option) => (
                    <Chip
                      key={option.key}
                      selected={option.key === query.indication}
                      label={option.label}
                      block
                      onPress={() => onRefine({ indication: option.key })}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* These two describe what the order records, not what the plan
                pays, and they appear only for indications whose published
                criteria read them. They sat under "coverage" and did not
                belong there. */}
            {showTreatment && (
              <Slider
                label="Weeks of treatment so far"
                value={query.treatmentWeeks}
                minimum={0}
                maximum={12}
                step={1}
                onChange={(value) => onRefine({ treatmentWeeks: value })}
                format={(value) => `${value} ${value === 1 ? 'week' : 'weeks'}`}
              />
            )}

            {/* Three states, not two. Neither chip selected means the order does
                not record this, which is the common case and reads as "not
                documented" rather than as a criterion the order failed. */}
            {showHeadacheFeature && (
              <View style={shared.featureBlock}>
                <Text style={shared.rowLabel}>Concerning headache feature documented?</Text>
                <View style={shared.chipWrap}>
                  <Chip
                    label="Yes"
                    selected={query.headacheFeature === true}
                    onPress={() =>
                      onRefine({
                        headacheFeature: query.headacheFeature === true ? undefined : true,
                      })
                    }
                  />
                  <Chip
                    label="No"
                    selected={query.headacheFeature === false}
                    onPress={() =>
                      onRefine({
                        headacheFeature: query.headacheFeature === false ? undefined : false,
                      })
                    }
                  />
                </View>
              </View>
            )}
          </Disclosure>

          <Disclosure
            title="Coverage"
            summary={summariseCoverage(query)}
            open={openGroup === 'coverage'}
            onToggle={() => toggleGroup('coverage')}
          >
            <View style={shared.chipWrap}>
              {Object.keys(PAYER_LABELS).map((key) => (
                <Chip
                  key={key}
                  selected={key === query.payer}
                  label={PAYER_CHIP_LABELS[key]}
                  spoken={PAYER_LABELS[key]}
                  onPress={() => onRefine({ payer: key })}
                />
              ))}
            </View>

            {/* The plan sets the price, not the payer. Product type is asked for
                because it is the one plan fact a member can read off their card
                and answer correctly — the published plan strings differ by campus
                and contract suffix and match nothing a patient would recognise. */}
            {productOptions.length > 1 && (
              <View style={styles.field}>
                <Text style={shared.rowLabel}>Plan type</Text>
                <View style={shared.chipWrap}>
                  {[...productOptions, undefined].map((option) => (
                    <Chip
                      key={option ?? 'unsure'}
                      selected={option === query.product}
                      label={option ? option.toUpperCase() : 'Not sure'}
                      onPress={() =>
                        onRefine({ product: option === query.product ? undefined : option })
                      }
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Typed rather than photographed: reading the card needs a camera and
                an OCR module, and the image is the one object in this product that
                hard rule 3 has to govern. Nothing here is stored. */}
            <View style={styles.field}>
              <Text style={shared.rowLabel}>Plan name</Text>
              <TextInput
                value={query.planText}
                onChangeText={(value) => onRefine({ planText: value })}
                placeholder="e.g. Blue Access PPO"
                placeholderTextColor={c.inkMuted}
                autoCorrect={false}
                autoCapitalize="words"
                accessibilityLabel="Plan name as printed on your insurance card, optional"
                style={styles.input}
              />
              {/* One Text, three states. The no-match case still has to say so — a
                  name that matches nothing is silently ignored otherwise. */}
              <Text style={planMatch?.matched === 0 ? styles.inputWarn : shared.caption}>
                {!planMatch
                  ? 'Optional. Pins your exact rate.'
                  : planMatch.matched === 0
                    ? 'No match, showing every rate.'
                    : `Matches ${planMatch.matched} of ${planMatch.total} facilities.`}
              </Text>
            </View>
          </Disclosure>

          <Disclosure
            title="Your year"
            summary={summariseYear(query)}
            open={openGroup === 'year'}
            onToggle={() => toggleGroup('year')}
            last
          >
            <Slider
              label="Deductible remaining"
              value={query.deductible}
              minimum={0}
              maximum={10000}
              step={250}
              onChange={(value) => onRefine({ deductible: value })}
              format={money}
              // Most people do not know this figure exactly, and a quick jump
              // beats hunting for it with a drag.
              presets={[
                { label: 'Met it', value: 0 },
                { label: 'About half', value: 1500 },
                { label: 'Barely touched', value: 5000 },
              ]}
            />
            <Slider
              label="Coinsurance after deductible"
              value={query.coinsurance}
              minimum={0}
              maximum={0.5}
              step={0.05}
              onChange={(value) => onRefine({ coinsurance: value })}
              format={(value) => `${Math.round(value * 100)}%`}
            />
            <Slider
              label="Other care you expect this year"
              value={query.expectedOtherSpend}
              minimum={0}
              maximum={20000}
              step={500}
              onChange={(value) => onRefine({ expectedOtherSpend: value })}
              format={money}
              presets={[
                { label: 'None planned', value: 0 },
                { label: 'A few visits', value: 1500 },
                { label: 'Ongoing care', value: 6000 },
              ]}
            />
          </Disclosure>
        </View>
      )}
    </View>
  );
}

const sheets = themed((c) => ({
  strip: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: c.line,
    marginTop: space.md,
    marginBottom: space.lg,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.md,
    minHeight: TAP_TARGET,
    paddingVertical: space.sm,
  },
  headText: { flex: 1 },
  // Not `flag`. A worked example is not a data-quality problem — it is the app
  // being honest about whose numbers these are, and the brown reserved for
  // published-data limits would misfile it as one.
  exampleTag: { ...type.label, color: c.inkMuted, marginBottom: space.xs },
  summary: { ...type.body, color: c.ink },
  toggle: { ...type.label, color: c.accentText },
  body: {
    borderTopWidth: stroke.hairline,
    borderTopColor: c.line,
    paddingHorizontal: space.md,
  },
  // A labelled control inside an open group. The group title is the heading
  // now, so these are `rowLabel` rather than `h2` — a second heading level
  // inside a disclosure is what the eight `h2`s here used to be.
  field: { marginTop: space.md },
  input: {
    ...type.body,
    color: c.ink,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: stroke.control,
    // A control outline, not a hairline — WCAG 1.4.11 wants 3:1 and `line`
    // measures 1.19:1 against the canvas.
    borderColor: c.border,
    paddingHorizontal: space.md,
    minHeight: TAP_TARGET + space.xs,
    marginTop: space.sm,
    marginBottom: space.sm,
  },
  // Brown, matching the data-quality flags. A name that matches nothing is a
  // limit of the published data, not an error the patient made.
  inputWarn: { ...type.caption, color: c.flag },
}));
