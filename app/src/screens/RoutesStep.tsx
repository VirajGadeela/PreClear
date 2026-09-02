import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { color, radius, space, stroke, textScale, type } from '../theme';
import { shared } from '../styles/shared';
import { Money } from '../Money';
import { Row } from '../components/Row';
import { PrimaryButton } from '../components/PrimaryButton';
import { PLAN_INCLUDES, PLAN_NAME } from '../plan';
import { Requirement, Route } from '../routes';
import { statusLabel } from '../requirements';

/**
 * The finding, in one sentence, computed for this patient.
 *
 * This is the whole product and it has to land before anyone reads a card. It
 * deliberately names both numbers when they disagree, because the disagreement
 * is the point.
 */
function Headline({ routes }: { routes: Route[] }) {
  const cash = routes.find((route) => route.kind === 'cash_non_contracted');
  const insured = routes.find((route) => route.kind !== 'cash_non_contracted');

  if (cash && insured) {
    const todayGap = insured.estimate.scan.patientPays - cash.estimate.scan.patientPays;
    const yearGap = cash.estimate.totalThisYear - insured.estimate.totalThisYear;

    if (todayGap > 0.01 && yearGap > 0.01) {
      return (
        <View style={styles.hero}>
          <Text style={styles.heroLead}>Paying cash saves</Text>
          <Money value={todayGap} size="hero" tone="accent" />
          <Text style={styles.heroLead}>today, and costs</Text>
          <Money value={yearGap} size="hero" tone="accent" />
          <Text style={styles.heroLead}>more by the end of this year.</Text>
          <Text style={styles.heroWhy}>
            Cash earns no deductible credit, so your later care starts from
            scratch.
          </Text>
        </View>
      );
    }
    if (todayGap > 0.01) {
      return (
        <View style={styles.hero}>
          <Text style={styles.heroLead}>Paying cash saves</Text>
          <Money value={todayGap} size="hero" tone="accent" />
          <Text style={styles.heroLead}>today and stays cheaper this year.</Text>
          <Text style={styles.heroWhy}>
            You are not expected to reach your deductible, so the missing credit
            costs you little.
          </Text>
        </View>
      );
    }
  }

  const spread =
    routes.length > 1
      ? routes[routes.length - 1].estimate.totalThisYear -
        routes[0].estimate.totalThisYear
      : 0;
  if (spread > 0.01) {
    return (
      <View style={styles.hero}>
        <Text style={styles.heroLead}>Same scan, same coverage.</Text>
        <Money value={spread} size="hero" tone="accent" />
        <Text style={styles.heroLead}>separates your best and worst option.</Text>
      </View>
    );
  }
  return null;
}

function RouteCard({
  route,
  recommended,
  expanded,
  findings,
  onToggle,
}: {
  route: Route;
  recommended: boolean;
  expanded: boolean;
  findings: { requirement: Requirement; status: string }[];
  onToggle: () => void;
}) {
  const statusFor = (key: string) =>
    findings.find((finding) => finding.requirement.key === key)?.status ?? 'unmet';

  return (
    <View style={[styles.card, recommended && styles.cardRecommended]}>
      {/* Three elements inside the pressable, and that is the whole collapsed
          card: what the route is, what it costs, and one meta line.
          
          What used to be here: a row wrapper holding a checkmark icon beside
          the label, a pill holding an alert icon beside "Published rate
          flagged", and a row holding the deductible sentence beside a chevron
          and the word Details. Nine elements carrying five pieces of
          information, most of them wrappers. Recommendation, the rate warning
          and the expand affordance are all words now — which also keeps
          recommendation from being carried by colour alone, the job the
          checkmark used to do. */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded, selected: recommended }}
        accessibilityLabel={`${recommended ? 'Recommended. ' : ''}${route.label} at ${route.facilityName}. Tap for the breakdown.`}
        onPress={onToggle}
        style={({ pressed }) => (pressed ? shared.cardPressed : undefined)}
      >
        <Text style={styles.routeLabel}>
          {recommended ? 'Recommended · ' : ''}
          {route.label}
        </Text>

        <Money
          value={route.estimate.totalThisYear}
          size="large"
          tone={recommended ? 'accent' : 'ink'}
        />

        <Text style={styles.meta} numberOfLines={expanded ? undefined : 2}>
          {route.estimate.scan.countsTowardDeductible
            ? 'Counts toward your deductible'
            : 'Earns no deductible credit'}
          {route.warnings.length > 0 ? ' · Rate flagged' : ''}
          {' · '}
          {expanded ? 'Hide' : 'Details'}
        </Text>
      </Pressable>

      {expanded && (
        <View style={styles.details}>
          <Row label="Facility" value={<Text style={styles.rowValue}>{route.facilityName}</Text>} />
          <Row label="This scan" value={<Money value={route.estimate.scan.patientPays} />} />
          <Row
            label="Deductible credit"
            value={<Money value={route.estimate.deductibleCreditEarned} />}
          />
          <Row
            label="Other care after this"
            value={<Money value={route.estimate.expectedOtherCareCost} />}
          />
          <Row
            label="Requirements not documented"
            value={
              <Text style={styles.rowValue}>{route.unmetRequirements.length}</Text>
            }
          />

          {route.warnings.map((warning) => (
            <Text key={warning} style={styles.warning}>
              {warning}
            </Text>
          ))}

          {route.unmetRequirements.map((requirement) => (
            <View key={requirement.key} style={styles.requirement}>
              <Text style={styles.requirementStatus}>
                {statusLabel(statusFor(requirement.key) as any)}
              </Text>
              <Text style={shared.detailSummary}>{requirement.summary}</Text>
              <Text style={shared.citation}>
                {requirement.payer} · {requirement.section_id} · {requirement.version}
              </Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => Linking.openURL(requirement.source_url)}
              >
                <Text style={styles.link}>Source document</Text>
              </Pressable>
              {requirement.alternative_pathway && (
                <Text style={styles.detailHedge}>
                  One of several alternative criteria; another may apply instead.
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * What the household plan actually does, before anyone is asked to buy it.
 *
 * Tapping straight through to the purchase sheet asked for money before saying
 * what it was for, so this expands in place first. The lines come from
 * `src/plan.ts`, and each one names a check that exists in `src/claims.ts` — if
 * a claim is made here, the engine performs it.
 *
 * No price appears on this card. Pricing belongs on the household plan page,
 * where the term being bought is on screen next to it.
 */
function PlanOffer({
  subscribed,
  onOpenHousehold,
}: {
  subscribed: boolean;
  onOpenHousehold: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (subscribed) {
    return (
      <View style={[styles.lock, styles.lockActive]}>
        <Text style={styles.lockTitle}>{PLAN_NAME} is active</Text>
        <Text style={styles.lockBody}>
          Your household's claims are being checked against their own numbers.
        </Text>
        <PrimaryButton label="Open household review" onPress={onOpenHousehold} />
      </View>
    );
  }

  return (
    <View style={styles.lock}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => (pressed ? shared.cardPressed : undefined)}
      >
        <Text style={styles.lockTitle}>Watch the whole household</Text>
        <Text style={styles.lockBody}>
          Every bill and explanation of benefits that arrives, checked against
          its own numbers all year.
        </Text>
        <Text style={styles.lockCta}>{open ? 'Hide' : "What's included"}</Text>
      </Pressable>

      {open && (
        <View style={styles.planDetail}>
          {PLAN_INCLUDES.map((line) => (
            <View key={line} style={shared.planRow}>
              <Text style={shared.planBullet}>·</Text>
              <Text style={shared.planLine}>{line}</Text>
            </View>
          ))}
          <Text style={shared.planCaveat}>
            Findings are discrepancies these documents show against themselves.
            They are not predictions about what your insurer will decide.
          </Text>
          <PrimaryButton label="See plans and pricing" onPress={onOpenHousehold} />
        </View>
      )}
    </View>
  );
}

export function RoutesStep({
  routes,
  findings,
  isSubscribed,
  note,
  onRestore,
  onOpenHousehold,
  requirementsChecked,
  payerLabel,
}: {
  routes: Route[];
  findings: { requirement: Requirement; status: string }[];
  isSubscribed: boolean;
  note: string | null;
  onRestore: () => void;
  onOpenHousehold: () => void;
  requirementsChecked: number;
  payerLabel: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await onRestore();
    } finally {
      setRestoring(false);
    }
  };

  if (routes.length === 0) {
    return (
      <View>
        <Text style={shared.h1} maxFontSizeMultiplier={textScale.display}>No routes to compare</Text>
        <Text style={shared.body}>
          No facility here publishes a usable price for this insurer and scan.
          That is a gap in the published data, not a sign that no options exist.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <Headline routes={routes} />
      {/* Every route is free. The comparison is the hook, and a scan happens
          every few years — what recurs is claims, which is what the household
          plan below watches. */}
      {routes.map((route, index) => (
        <RouteCard
          key={route.kind}
          route={route}
          recommended={index === 0}
          expanded={open === route.kind}
          findings={findings}
          onToggle={() => setOpen(open === route.kind ? null : route.kind)}
        />
      ))}

      {/* The results screen advertises the plan; it does not contain it. The
          review itself lives on its own step, so a subscriber is not made to
          re-answer the scan questions to reach the thing they pay for. */}
      <PlanOffer subscribed={isSubscribed} onOpenHousehold={onOpenHousehold} />

      {/* Route 3 is missing whenever nothing is unmet, but "nothing is unmet"
          and "nothing is recorded" are different answers and the patient cannot
          tell them apart. Saying so is the honest output — CLAUDE.md treats a
          silent gap as worse than an admitted one. */}
      {requirementsChecked === 0 && (
        <View style={shared.coverageGap}>
          <Text style={shared.coverageGapText}>
            No published requirements are recorded for {payerLabel} for this
            scan, so no order check was run. That is a gap in this app's rule
            set, not a sign that the order has none.
          </Text>
        </View>
      )}

      {/* App Store review requires a restore path, and it is the only way a
          member who reinstalls gets their entitlement back. */}
      {!isSubscribed && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Restore a previous purchase"
          accessibilityState={{ disabled: restoring, busy: restoring }}
          disabled={restoring}
          onPress={handleRestore}
          style={({ pressed }) => [shared.restore, pressed && shared.restorePressed]}
        >
          {restoring ? (
            <ActivityIndicator size="small" color={color.inkMuted} />
          ) : (
            <Text style={shared.restoreText}>Restore purchase</Text>
          )}
        </Pressable>
      )}

      {note ? <Text style={shared.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: space.lg, marginBottom: space.lg },
  heroLead: { ...type.title, color: color.ink, marginVertical: space.xs },
  heroWhy: { ...type.body, color: color.inkMuted, marginTop: space.md },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: stroke.hairline,
    borderColor: color.line,
    padding: space.md,
    marginBottom: space.md,
  },
  cardRecommended: { borderColor: color.accent, backgroundColor: color.accentSoft },
  routeLabel: { ...type.captionStrong, color: color.inkMuted },

  // One line under the amount, carrying the deductible fact, the data-quality
  // warning when there is one, and the expand affordance.
  meta: { ...type.caption, color: color.inkMuted, marginTop: space.sm },

  details: { borderTopWidth: stroke.hairline, borderTopColor: color.line, marginTop: space.md, paddingTop: space.md },
  rowValue: { ...type.captionStrong, color: color.ink, flexShrink: 1, textAlign: 'right' },
  warning: {
    ...type.caption,
    color: color.flag,
    backgroundColor: color.flagBg,
    borderRadius: radius.sm,
    padding: space.sm,
    marginTop: space.sm,
  },

  requirement: { borderTopWidth: stroke.hairline, borderTopColor: color.line, marginTop: space.md, paddingTop: space.md },
  requirementStatus: { ...type.captionStrong, color: color.flag },
  link: { ...type.captionStrong, color: color.accent, marginTop: space.xs },
  detailHedge: { ...type.caption, color: color.inkMuted, marginTop: space.xs },

  // Hairline, matching `card` above: both are containers that happen to be
  // tappable, and in both the control is identified by its own heading and CTA
  // text rather than by its edge. What carries "not yet active" here is the
  // dashed style, not the weight.
  lock: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: stroke.hairline,
    borderStyle: 'dashed',
    borderColor: color.line,
    padding: space.md,
  },
  lockActive: {
    borderStyle: 'solid',
    borderColor: color.accent,
    backgroundColor: color.accentSoft,
  },
  lockTitle: { ...type.bodyStrong, color: color.ink },
  lockBody: { ...type.caption, color: color.inkMuted, marginTop: space.xs },
  lockCta: { ...type.label, color: color.accent, marginTop: space.sm },
  planDetail: {
    borderTopWidth: stroke.hairline,
    borderTopColor: color.line,
    marginTop: space.md,
    paddingTop: space.md,
    gap: space.sm,
  },
});
