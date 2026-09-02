import { StyleSheet, Text, View } from 'react-native';
import { color, radius, space, stroke, textScale, type } from '../theme';
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
    winner: cashWins ? 'Paying cash' : 'Staying in-network',
    gap: Math.abs(cash.estimate.totalThisYear - inNetwork.estimate.totalThisYear),
  };
}

const FLIP = [
  flipRow('alone', 'If this scan is your only care this year', 0),
  flipRow('more', 'If you expect $8,000 more care this year', 8000),
].filter((row): row is FlipRow => row !== null);

export function LandingStep({
  onNext,
  onHousehold,
}: {
  onNext: () => void;
  onHousehold: () => void;
}) {
  return (
    <View style={styles.landing}>
      <Text
        style={styles.landingHeadline}
        maxFontSizeMultiplier={textScale.display}
      >
        Cash can look cheaper today but cost more by year's end.
      </Text>
      <PrimaryButton label="Compare my options" onPress={onNext} tone="accent" />
      {/* Slate, not accent — this is a second, equally-weighted destination,
          not competing with the scan comparison for the one accent color. */}
      <PrimaryButton label="See household plan" onPress={onHousehold} />

      {/* The one eyebrow on this screen. It labels the panel because the panel
          is a distinct claim, not a continuation of the headline above it. */}
      <View style={styles.proof}>
        <Text style={styles.proofEyebrow}>The same knee MRI, twice</Text>

        {FLIP.map((row, index) => (
          <View
            key={row.key}
            style={[styles.proofRow, index > 0 && styles.proofRowDivided]}
          >
            <Text style={styles.proofScenario}>{row.scenario}</Text>
            <View style={styles.proofOutcome}>
              <Text style={styles.proofWinner}>{row.winner} costs less, by</Text>
              <Money value={row.gap} size="large" tone="accent" />
            </View>
          </View>
        ))}

        {/* Names the plan vaguely on purpose, because naming it precisely would
            need more words than this line can hold and naming it wrongly is
            worse than not naming it. $610.44 is Franciscan's Anthem *employee*
            COPPS rate, not its Blue Access PPO rate ($992.51) — the two differ
            by 63%, which is the entire reason step 1 asks for a plan at all. */}
        <Text style={styles.proofSource}>
          Published Franciscan Health Carmel rates for one Anthem plan. The plan
          sets the price, so yours will differ.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  landing: { marginTop: space.xl },
  landingHeadline: { ...type.display, color: color.ink, marginBottom: space.xl },

  // A hairline-bordered panel on the canvas rather than a raised card. Nothing
  // here is interactive, so elevation would be claiming a hierarchy the panel
  // does not have — the route cards on step 3 are the things that lift.
  proof: {
    marginTop: space.lg,
    borderWidth: stroke.hairline,
    borderColor: color.line,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  proofEyebrow: {
    ...type.eyebrow,
    color: color.inkMuted,
    marginBottom: space.sm,
  },
  proofRow: { paddingVertical: space.sm },
  // The divider sits between the two scenarios because the inversion between
  // them is the point. It separates two readings of one case, not two items.
  proofRowDivided: { borderTopWidth: stroke.hairline, borderTopColor: color.line },
  proofScenario: { ...type.caption, color: color.inkMuted },
  proofOutcome: { marginTop: space.sm },
  proofWinner: { ...type.label, color: color.ink, marginBottom: space.xs },
  proofSource: {
    ...type.caption,
    color: color.inkMuted,
    borderTopWidth: stroke.hairline,
    borderTopColor: color.line,
    paddingTop: space.sm,
    marginTop: space.sm,
  },
});
