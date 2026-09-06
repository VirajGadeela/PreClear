import { Text, View } from 'react-native';
import { radius, space, stroke, textScale, type } from '../theme';
import { useStyles } from '../ThemeProvider';
import { themed } from '../styles/themed';
import { Money } from '../Money';
import { PrimaryButton } from '../components/PrimaryButton';
import { data } from '../appData';
import { PlanBenefits } from '../costing';
import { buildRoutes, rankRoutes } from '../routes';

/**
 * The landing screen's proof, and the one thing on this page carrying real
 * numbers.
 *
 * The headline above it asserts that cash can be cheaper today and dearer by
 * year's end. Asserting it is not the same as showing it, and the screen used
 * to do only the first — headline, two buttons, and then most of a phone of
 * empty space. This panel is the assertion demonstrated on one real, published
 * case, which is the most characteristic thing this product has to show.
 *
 * The case is the Franciscan Health Carmel row recorded in CLAUDE.md: Anthem
 * member, CPT 73721 (knee MRI, no contrast), $2,000 deductible remaining. Both
 * rows below are the same scan at the same facility for the same member —
 * only the amount of other care expected that year changes, and the cheaper
 * route inverts between them.
 *
 * The numbers are computed through `buildRoutes`/`rankRoutes` below, the same
 * engine every other screen uses, rather than transcribed. Transcribing them
 * used to be exactly the kind of drift this repo runs three parity scripts to
 * prevent elsewhere: a rate change in `preclear-data.json` or a change to the
 * costing math would have left this panel asserting the old answer with
 * nothing to catch it. Routing the plan through `matchesMemberPlan` (the same
 * function the scan step's plan-name field uses) also makes the plan
 * self-describing instead of hand-written, which is how an earlier version of
 * this panel quoted the wrong plan's rate in the first place.
 *
 * These are real published rates, not illustrations, and they are labelled as
 * one facility's rather than as anyone's own — a member arriving here has
 * entered nothing yet, so nothing on this screen can be their number.
 *
 * Note which token carries "cheaper here": `accent`, the same one reserved for
 * the recommended route everywhere else. It lands on cash in the first row and
 * on in-network in the second. That inversion is the whole point, and it is why
 * this stays inside the palette's rule against hue meaning cheap or dear —
 * the accent marks *what wins in this scenario*, never *which kind of route is
 * better*.
 */
const FLIP_CPT = '73721';
const FLIP_PAYER = 'anthem';
const FLIP_FACILITY_KEY = 'franciscan-carmel';
// Pins the Anthem *employee* COPPS rate ($610.44), not the Blue Access PPO
// rate ($992.51) this same facility publishes for the same code — see the
// plan-string mechanics note in CLAUDE.md. `matchesMemberPlan` only needs
// enough of the plan name to be unambiguous; it does not need to be exact.
const FLIP_MEMBER_PLAN = 'Franciscan Employee COPPS';
const FLIP_BENEFITS: PlanBenefits = {
  deductibleRemaining: 2000,
  coinsuranceRate: 0.2,
  oopMaxRemaining: 6000,
  copay: 0,
};

const FLIP_FACILITY = data.procedures
  .find((procedure) => procedure.cpt === FLIP_CPT)
  ?.payers[FLIP_PAYER]?.find(
    (facility) => facility.facility_key === FLIP_FACILITY_KEY,
  );

type FlipRow = { key: string; scenario: string; winner: string; gap: number };

/**
 * One scenario's outcome: same facility, same plan, only the year's other
 * spending changes.
 *
 * `cashIsAppropriate` is hardcoded true here regardless of the real routing
 * gate elsewhere (CLAUDE.md: the cash route is normally only surfaced when a
 * deductible is unlikely to be met). This panel exists specifically to show
 * both numbers side by side even in the scenario where in-network wins — that
 * comparison is the point, not a recommendation to pay cash.
 */
function flipRow(key: string, scenario: string, otherSpend: number): FlipRow | null {
  if (!FLIP_FACILITY) return null;

  const routes = rankRoutes(
    buildRoutes({
      facilities: [FLIP_FACILITY],
      benefits: FLIP_BENEFITS,
      expectedOtherAllowedSpend: otherSpend,
      orderedFacilityKey: FLIP_FACILITY_KEY,
      memberPlan: FLIP_MEMBER_PLAN,
      cashIsAppropriate: true,
    }),
  );
  const inNetwork = routes.find((route) => route.kind === 'in_network_as_written');
  const cash = routes.find((route) => route.kind === 'cash_non_contracted');
  if (!inNetwork || !cash) return null;

  const cashWins = cash.estimate.totalThisYear < inNetwork.estimate.totalThisYear;
  return {
    key,
    scenario,
    winner: cashWins ? 'Cash' : 'In-network',
    gap: Math.abs(cash.estimate.totalThisYear - inNetwork.estimate.totalThisYear),
  };
}

const FLIP = [
  flipRow('alone', 'Only care this year', 0),
  flipRow('more', 'With $8,000 more care', 8000),
].filter((row): row is FlipRow => row !== null);

/**
 * The cover, and the only screen outside the tabs.
 *
 * It was `LandingStep` while navigation was a chain, and the rename is not
 * cosmetic: a step is a stage you pass through, and this is a page you read
 * once. Everything on it leads into the tabs and nothing leads back except the
 * hardware back gesture, which is the right shape for a cold open.
 *
 * Four things, and that is the whole screen: a headline, one line explaining
 * it, one button, and the proof panel. It briefly also carried a second button,
 * two more worked examples, a link to Sources and a numbered how-it-works
 * block — every one of which duplicated something the tab bar or the filter
 * panel already offers, on the screen least able to afford it.
 *
 * The proof panel earns its place by being the only thing here that argues
 * rather than asserts: one real published case where the ranking inverts. A
 * reader who leaves after four seconds should have seen that, not a paragraph
 * about the controls.
 */
export function AboutScreen({ onNext }: { onNext: () => void }) {
  const styles = useStyles(sheets);

  return (
    <>
      {/* Two lines at 32px on the narrowest screen. The previous headline ran
          to four, which is a paragraph set in a display face rather than a
          headline. */}
      <Text
        style={styles.landingHeadline}
        maxFontSizeMultiplier={textScale.display}
      >
        Cash can cost more by year's end.
      </Text>
      <Text style={styles.landingSub}>
        Same scan, same plan. The cheaper payment can still lose.
      </Text>

      {/* One button. There used to be a second, to the household plan, and it
          is a tab — always on screen, one tap, and it does not need to compete
          with the only action this screen exists to offer. */}
      <PrimaryButton label="Compare my options" onPress={onNext} tone="accent" />

      {/* The panel had an uppercase label above it reading "THE SAME KNEE MRI,
          TWICE". The two rows below say the same thing by being two readings of
          one case, and the border already says where the panel starts. */}
      {/* A panel, not a button. It used to open the same case in the screener,
          which is exactly the example machinery that has now gone: tapping it
          landed a member on a ranking belonging to somebody else. It proves the
          claim and stops there, which is all a proof has to do. */}
      <View style={styles.proof}>
        {FLIP.map((row, index) => (
          <View
            key={row.key}
            style={[styles.proofRow, index > 0 && styles.proofRowDivided]}
          >
            {/* Scenario and outcome were two Texts inside a wrapper View —
                three elements for one sentence. The condition and its
                consequence are one thought, so they are one Text at one
                weight; the line break is the only separation they need. */}
            <Text style={styles.proofLine}>
              {row.scenario}
              {'\n'}
              {row.winner} is cheaper by
            </Text>
            <Money value={row.gap} size="large" tone="accent" />
          </View>
        ))}

        {/* Names the plan vaguely on purpose: $610.44 is Franciscan's Anthem
            *employee* COPPS rate, not its Blue Access PPO rate ($992.51), and
            naming it wrongly is worse than not naming it. */}
        <Text style={styles.proofSource}>
          Franciscan Health Carmel, one Anthem plan. Yours will differ.
        </Text>

      </View>

      {/* What the comparison is built on. The reference this came from puts
          a stat band in this position; the difference is that each of these is
          counted from the bundle at render, so none of them can drift from the
          data they describe. */}
      <View style={styles.stats}>
        {corpusStats().map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <Text style={styles.statValue} maxFontSizeMultiplier={textScale.display}>
              {stat.value}
            </Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

/**
 * What the comparison is actually built on, counted from the bundle.
 *
 * Read rather than written down, so a figure here cannot outlive the data it
 * describes — the facility count changed twice this month. The reference this
 * borrows from puts unverifiable stats in this position ("95% accuracy"); every
 * number below is a length of something in `preclear-data.json`.
 */
function corpusStats() {
  const facilities = new Set<string>();
  const payers = new Set<string>();
  for (const procedure of data.procedures) {
    for (const [payer, list] of Object.entries(procedure.payers)) {
      payers.add(payer);
      for (const facility of list) facilities.add(facility.facility_key);
    }
  }
  return [
    { value: String(facilities.size), label: 'Indianapolis hospitals, real published prices' },
    { value: String(data.requirements.length), label: 'payer requirement rules, each one citable' },
    { value: String(payers.size), label: 'insurers, with prices for every one' },
  ];
}

const sheets = themed((c) => ({
  // The screen's own top margin, which used to live on a wrapper View that did
  // nothing else. One less element for one style property.
  // `lg` above, not `xl`. The wordmark now sits above this heading on the cover
  // as it does everywhere else, and stacking a 32pt gap under the bar put the
  // headline a third of the way down the screen.
  landingHeadline: {
    ...type.serifDisplay,
    color: c.ink,
    marginTop: space.lg,
    marginBottom: space.md,
  },
  // One line under the headline, and the only explanation on the screen. The
  // proof panel below argues it with real numbers, which is a better job than
  // a second paragraph would do.
  landingSub: { ...type.body, color: c.inkMuted, marginBottom: space.xl },

  // A hairline-bordered panel on the canvas rather than a raised card. Nothing
  // here is interactive, so elevation would be claiming a hierarchy the panel
  // does not have — the route cards on step 3 are the things that lift.
  proof: {
    marginTop: space.lg,
    borderWidth: stroke.hairline,
    borderColor: c.line,
    borderRadius: radius.xl,
    backgroundColor: c.surface,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.lg,
  },
  // A row per stat rather than a three-across band: the labels here are
  // sentences, not single words, and three of them across a phone would break
  // mid-word the way the indication chips once did.
  stats: { marginTop: space.lg, gap: space.md },
  stat: { flexDirection: 'row', alignItems: 'baseline', gap: space.md },
  // The sans, not the serif, and for a specific reason: Instrument Serif's
  // figure one is a plain vertical stroke, so "11" rendered as "ll". The
  // reference sets its stat numerals in the geometric sans for the same reason.
  //
  // `ink`, not `accent`, which is a deliberate departure from the commit these
  // stats came from. This screen already spends accent twice — on the primary
  // button, and on whichever route wins each row of the proof panel. That
  // second one is load-bearing: the accent moves between cash and in-network
  // across the two rows, and that inversion is the entire argument the cover
  // makes. Three large blue numerals above it compete with it for the same
  // meaning while carrying none. Size already ranks these.
  statValue: { ...type.display, color: c.ink, minWidth: 56 },
  statLabel: { ...type.caption, color: c.inkMuted, flex: 1 },

  proofRow: { paddingVertical: space.sm },
  // The divider sits between the two scenarios because the inversion between
  // them is the point. It separates two readings of one case, not two items.
  proofRowDivided: { borderTopWidth: stroke.hairline, borderTopColor: c.line },
  proofLine: { ...type.caption, color: c.ink, marginBottom: space.xs },
  proofSource: {
    ...type.caption,
    color: c.inkMuted,
    borderTopWidth: stroke.hairline,
    borderTopColor: c.line,
    paddingTop: space.sm,
    marginTop: space.sm,
  },

}));
