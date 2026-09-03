/**
 * The whole product on one screen.
 *
 * Scan, coverage and routes were three sequential steps, which put the only
 * thing this app exists to show four screens from the top. Every fix attempted
 * before this one worked around that shape rather than changing it: worked
 * examples that skip the flow, a landing panel that previews the finding.
 *
 * Here the ranking is the page and the questions are a strip above it. Nothing
 * about the engine changed — `buildRoutes` and `rankRoutes` are called with the
 * same inputs, and the parity scripts still cover them.
 *
 * `Headline` was duplicated from `RoutesStep` while both existed, and only its
 * markup ever was: both read `summarize()` from `src/share.ts`, so the
 * *finding* had one definition throughout and could not drift. RoutesStep,
 * ScanStep and CoverageStep are gone as of the theme migration — nothing had
 * imported them since the tab navigation landed.
 */

import { memo, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { Citation, publisher } from '../components/Citation';
import { Money } from '../Money';
import { Row } from '../components/Row';
import { Requirement, Route } from '../routes';
import { Status } from '../requirements';
import { DemoScenario } from '../demo';
import { Procedure } from '../appData';
import { QuerySource, ScreenerQuery } from '../screener';
import { ScreenerFilters } from './ScreenerFilters';
import { summarize } from '../share';
import { sharedSheets } from '../styles/shared';
import { TAP_TARGET, radius, space, stroke, textScale, type } from '../theme';
import { useStyles } from '../ThemeProvider';
import { themed } from '../styles/themed';

type Finding = { requirement: Requirement; status: string };

/**
 * Year totals that more than one route shares.
 *
 * When a member's out-of-pocket maximum is reached, every route that runs
 * through insurance converges on the same total for the year — the plan pays
 * everything past the cap regardless of which building the scan happened in.
 * The ranking is still correct, and the saving is still real: in the default
 * example two routes both total $6,000 while their scan prices differ by $592.
 *
 * The card layout hid this because each total sat in its own box. A numbered
 * list puts them one under the other, where two identical figures read as a
 * bug rather than as a cap.
 *
 * So the rows say so, and show the figure that does still separate them. The
 * headline figure stays the year total: it is what the list is ranked by, and
 * it is the product's whole finding. Swapping it for the scan price would
 * misorder the list on screen — the cash route has the lowest scan price of
 * all and ranks last precisely because the year is what matters.
 */
function tiedTotals(routes: Route[]): Set<number> {
  const seen = new Set<number>();
  const tied = new Set<number>();
  for (const route of routes) {
    // Rounded to the cent: these are currency figures, and two totals that
    // differ by a float artefact are the same number to a member.
    const total = Math.round(route.estimate.totalThisYear * 100);
    if (seen.has(total)) tied.add(total);
    seen.add(total);
  }
  return tied;
}

/**
 * The finding, in one sentence, computed for this patient.
 *
 * Which of the three things the comparison says is decided in `src/share.ts`,
 * because the shared card has to say the same thing.
 */
function Headline({ routes }: { routes: Route[] }) {
  const styles = useStyles(sheets);
  // Above this the phrase and the figure stop sharing a line. Same instrument
  // HouseholdStep uses on its plan row, and for the same reason: a row that no
  // longer fits cannot be fixed by shrinking the text inside it.
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > textScale.stackAbove;
  const summary = summarize(routes);
  if (!summary) return null;

  const line = [styles.heroLine, stacked && styles.heroLineStacked];

  if (summary.kind === 'cash_costs_more') {
    return (
      <View style={styles.hero}>
        <View style={line}>
          <Text style={styles.heroLead}>Paying cash saves</Text>
          <Money value={summary.todayGap} size="large" tone="accent" />
        </View>
        <View style={line}>
          <Text style={styles.heroLead}>today, and costs</Text>
          <Money value={summary.yearGap} size="large" tone="accent" />
        </View>
        <Text style={styles.heroLead}>more by the end of this year.</Text>
        <Text style={styles.heroWhy}>
          Cash earns no deductible credit, so your later care starts from
          scratch.
        </Text>
      </View>
    );
  }

  if (summary.kind === 'cash_stays_cheaper') {
    return (
      <View style={styles.hero}>
        <View style={line}>
          <Text style={styles.heroLead}>Paying cash saves</Text>
          <Money value={summary.todayGap} size="large" tone="accent" />
        </View>
        <Text style={styles.heroLead}>today and stays cheaper this year.</Text>
        <Text style={styles.heroWhy}>
          You are not expected to reach your deductible, so the missing credit
          costs you little.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.hero}>
      <View style={line}>
        <Text style={styles.heroLead}>Same scan, same coverage.</Text>
        <Money value={summary.spread} size="large" tone="accent" />
      </View>
      <Text style={styles.heroLead}>separates your best and worst option.</Text>
    </View>
  );
}

/**
 * One ranked route.
 *
 * A row rather than a card, and the change is not only density. A rank numeral
 * plus a hairline reads as an ordered list; a stack of bordered cards reads as
 * an unordered set. DESIGN.md §0 asks position and the size of the number to
 * carry rank, and a numbered list is the most literal way to do that.
 *
 * Memoised because it is on the slider-driven path — the list re-renders only
 * when the deferred query settles, not on every touch-move.
 */
const RouteRow = memo(function RouteRow({
  route,
  rank,
  recommended,
  expanded,
  capped,
  findings,
  onToggle,
}: {
  route: Route;
  rank: number;
  recommended: boolean;
  expanded: boolean;
  /** This route's year total is shared with another — see `tiedTotals`. */
  capped: boolean;
  findings: Finding[];
  onToggle: () => void;
}) {
  const styles = useStyles(sheets);
  const shared = useStyles(sharedSheets);
  const statusFor = (key: string) =>
    (findings.find((finding) => finding.requirement.key === key)?.status ??
      'unmet') as Status;

  return (
    <View style={[styles.row, recommended && styles.rowRecommended]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Rank ${rank}. ${route.label} at ${route.facilityName}. Tap for the breakdown.`}
        onPress={onToggle}
        style={({ pressed }) => [styles.rowHead, pressed && shared.cardPressed]}
      >
        <Text style={styles.rank} maxFontSizeMultiplier={textScale.badge}>
          {rank}
        </Text>
        <View style={styles.rowBody}>
          <Text style={styles.routeLabel}>
            {recommended ? 'Recommended · ' : ''}
            {route.label}
          </Text>
          <Money value={route.estimate.totalThisYear} size="large" tone={recommended ? 'accent' : 'ink'} />
          <Text style={styles.meta} numberOfLines={expanded ? undefined : 2}>
            {route.facilityName} ·{' '}
            {route.estimate.scan.countsTowardDeductible
              ? 'counts toward your deductible'
              : 'earns no deductible credit'}
          </Text>
          {/* Two rows showing the same total is the correct answer and the
              wrong-looking one. Say why, and give the number that still
              separates them. */}
          {capped && (
            <Text style={styles.capped}>
              Your out-of-pocket maximum caps the year here. This scan:{' '}
              <Money value={route.estimate.scan.patientPays} size="small" />
            </Text>
          )}

          {/* Named here rather than only inside the expansion, because an
              unmet requirement changes what the row means and a collapsed row
              that hides it reads as a clean recommendation. */}
          {route.unmetRequirements.length > 0 && (
            <Text style={styles.evidence}>
              {route.unmetRequirements.length === 1
                ? `1 requirement not documented · ${publisher(route.unmetRequirements[0])}`
                : `${route.unmetRequirements.length} requirements not documented`}
            </Text>
          )}
        </View>
        <Text style={styles.chevron}>{expanded ? 'Hide' : 'Details'}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.details}>
          <Row label="Facility" value={<Text style={shared.detailSummary}>{route.facilityName}</Text>} />
          <Row label="This scan" value={<Money value={route.estimate.scan.patientPays} />} />
          <Row
            label="Deductible credit"
            value={<Money value={route.estimate.deductibleCreditEarned} />}
          />
          <Row
            label="Other care after this"
            value={<Money value={route.estimate.expectedOtherCareCost} />}
          />

          {route.warnings.map((warning) => (
            <Text key={warning} style={styles.warning}>
              {warning}
            </Text>
          ))}

          {route.unmetRequirements.map((requirement) => (
            <Citation
              key={requirement.key}
              requirement={requirement}
              status={statusFor(requirement.key)}
            />
          ))}
        </View>
      )}
    </View>
  );
});

export function ScreenerScreen({
  routes,
  findings,
  query,
  source,
  procedure,
  productOptions,
  planMatch,
  showTreatment,
  showHeadacheFeature,
  filtersOpen,
  openRouteKind,
  requirementsChecked,
  payerLabel,
  note,
  onToggleFilters,
  onOpenRoute,
  onRefine,
  onExample,
  onShare,
  onMethod,
}: {
  routes: Route[];
  findings: Finding[];
  query: ScreenerQuery;
  source: QuerySource;
  procedure: Procedure;
  productOptions: string[];
  planMatch: { matched: number; total: number } | null;
  showTreatment: boolean;
  showHeadacheFeature: boolean;
  filtersOpen: boolean;
  openRouteKind: string | null;
  requirementsChecked: number;
  payerLabel: string;
  note: string | null;
  onToggleFilters: () => void;
  onOpenRoute: (kind: string | null) => void;
  onRefine: (patch: Partial<ScreenerQuery>) => void;
  onExample: (scenario: DemoScenario) => void;
  onShare: () => void;
  onMethod: () => void;
}) {
  const styles = useStyles(sheets);
  const shared = useStyles(sharedSheets);
  const tied = tiedTotals(routes);

  return (
    <>
      <ScreenerFilters
        query={query}
        source={source}
        procedure={procedure}
        productOptions={productOptions}
        planMatch={planMatch}
        showTreatment={showTreatment}
        showHeadacheFeature={showHeadacheFeature}
        open={filtersOpen}
        onToggle={onToggleFilters}
        onRefine={onRefine}
        onExample={onExample}
      />

      {routes.length === 0 ? (
        <View>
          <Text style={shared.h1} maxFontSizeMultiplier={textScale.display}>
            No routes to compare
          </Text>
          <Text style={shared.body}>
            No facility here publishes a usable price for this insurer and scan.
            That is a gap in the published data, not a sign that no options
            exist.
          </Text>
        </View>
      ) : (
        <>
          <Headline routes={routes} />

          {/* The column header the card list never had. Until now nothing on
              screen said what the big number was until a row was expanded.
              One line, not two columns — DESIGN.md §8 records that equal
              columns were tried and break mid-word on a 375pt screen. The word
              "estimate" is deliberately absent: hard rule 5 puts it inside the
              figure, and <Money> owns that. */}
          <Text style={styles.columnHead}>Ranked by total cost this year</Text>

          {routes.map((route, index) => (
            <RouteRow
              key={route.kind}
              route={route}
              rank={index + 1}
              recommended={index === 0}
              expanded={openRouteKind === route.kind}
              capped={tied.has(Math.round(route.estimate.totalThisYear * 100))}
              findings={findings}
              onToggle={() => onOpenRoute(openRouteKind === route.kind ? null : route.kind)}
            />
          ))}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share this comparison"
            onPress={onShare}
            style={({ pressed }) => [styles.share, pressed && shared.cardPressed]}
          >
            <Text style={styles.shareText}>Share this comparison</Text>
          </Pressable>
        </>
      )}

      {/* Route 3 is missing whenever nothing is unmet, but "nothing is unmet"
          and "nothing is recorded" are different answers and the patient cannot
          tell them apart. Saying so is the honest output. */}
      {requirementsChecked === 0 && (
        <View style={shared.coverageGap}>
          <Text style={shared.coverageGapText}>
            No published requirements are recorded for {payerLabel} for this
            scan, so no order check was run. That is a gap in this app's rule
            set, not a sign that the order has none.
          </Text>
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Where these numbers come from"
        onPress={onMethod}
        style={({ pressed }) => [shared.restore, pressed && shared.restorePressed]}
      >
        <Text style={shared.restoreText}>Where these numbers come from</Text>
      </Pressable>

      {note ? <Text style={shared.note}>{note}</Text> : null}
    </>
  );
}

const sheets = themed((c) => ({
  hero: { marginBottom: space.lg },

  // Phrase and figure share a line, baseline-aligned.
  //
  // Every word and every size here is unchanged; only the arrangement moved.
  // Stacked, this headline was five blocks plus their margins and only the
  // top-ranked route cleared the tab bar — on the one screen whose whole
  // purpose is a comparison. Pairing each phrase with its own figure gets two
  // lines and about 70pt back, which is most of a route row.
  //
  // `baseline`, not `center`: a 16px phrase centred against a 26px figure sits
  // visibly high, and the two are read as one sentence.
  heroLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  heroLineStacked: { flexDirection: 'column', alignItems: 'flex-start' },

  // `body`, not `title`, and the figures at `large` rather than `hero`.
  //
  // The finding is still the largest thing on the screen, but at title/hero it
  // ran to five lines and pushed the top-ranked route below the fold — which
  // defeats the one thing results-first is for. The number carries the emphasis;
  // the words around it do not need to compete.
  heroLead: { ...type.body, color: c.ink, marginVertical: space.xs },
  heroWhy: { ...type.caption, color: c.inkMuted, marginTop: space.sm },

  columnHead: {
    ...type.label,
    color: c.inkMuted,
    paddingBottom: space.sm,
    borderBottomWidth: stroke.hairline,
    borderBottomColor: c.line,
  },

  // A row, not a card: separated by a hairline rather than bounded by a border,
  // so the list reads as one ranked sequence.
  row: {
    borderBottomWidth: stroke.hairline,
    borderBottomColor: c.line,
  },
  // The one accent in the app, and the recommended route is what it is for.
  rowRecommended: {
    backgroundColor: c.accentSoft,
    borderLeftWidth: stroke.control,
    borderLeftColor: c.accent,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    minHeight: TAP_TARGET,
  },
  // Tabular so the numerals sit on one axis down the list.
  rank: {
    ...type.label,
    color: c.inkMuted,
    fontVariant: ['tabular-nums'],
    minWidth: space.md,
  },
  rowBody: { flex: 1 },
  routeLabel: { ...type.bodyStrong, color: c.ink, marginBottom: space.xs },
  meta: { ...type.caption, color: c.inkMuted, marginTop: space.xs },
  evidence: { ...type.caption, color: c.accentText, marginTop: space.xs },
  chevron: { ...type.label, color: c.accentText },

  details: {
    paddingHorizontal: space.md,
    paddingBottom: space.md,
  },
  warning: { ...type.caption, color: c.flag, marginTop: space.sm },
  // Not `flag`. An out-of-pocket cap is the plan working as written, not a
  // problem with the published data, and the brown reserved for data-quality
  // limits would misfile it as one.
  capped: { ...type.caption, color: c.inkMuted, marginTop: space.xs },

  // Outlined and ink-toned, never accent: sharing is an action performed on a
  // result, not a result.
  share: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
    minHeight: TAP_TARGET,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: c.border,
    paddingHorizontal: space.md,
  },
  shareText: { ...type.body, fontWeight: '600', color: c.ink },
}));
