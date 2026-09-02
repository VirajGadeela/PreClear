import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { TAP_TARGET, color, radius, space, stroke, type } from '../theme';
import { shared } from '../styles/shared';
import { Money } from '../Money';
import { Row } from '../components/Row';
import { PrimaryButton } from '../components/PrimaryButton';
import { PLAN_INCLUDES, PLAN_NAME } from '../plan';
import { Requirement, Route } from '../routes';
import { statusLabel } from '../requirements';
import { summarize } from '../share';

/**
 * The finding, in one sentence, computed for this patient.
 *
 * This is the whole product and it has to land before anyone reads a card. It
 * deliberately names both numbers when they disagree, because the disagreement
 * is the point.
 */
function Headline({ routes }: { routes: Route[] }) {
  // Which of the three things this comparison says is decided in src/share.ts,
  // because the shared card has to say the same thing. This renders that
  // answer; it no longer works it out. Two copies of the decision would
  // eventually disagree, and a card contradicting the screen it came from is
  // worse than no card at all.
  const summary = summarize(routes);
  if (!summary) return null;

  if (summary.kind === 'cash_costs_more') {
    return (
      <View style={styles.hero}>
        <Text style={styles.heroLead}>Paying cash saves</Text>
        <Money value={summary.todayGap} size="hero" tone="accent" />
        <Text style={styles.heroLead}>today, and costs</Text>
        <Money value={summary.yearGap} size="hero" tone="accent" />
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
        <Text style={styles.heroLead}>Paying cash saves</Text>
        <Money value={summary.todayGap} size="hero" tone="accent" />
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
      <Text style={styles.heroLead}>Same scan, same coverage.</Text>
      <Money value={summary.spread} size="hero" tone="accent" />
      <Text style={styles.heroLead}>separates your best and worst option.</Text>
    </View>
  );
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
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${route.label} at ${route.facilityName}. Tap for the breakdown.`}
        onPress={onToggle}
        style={({ pressed }) => (pressed ? shared.cardPressed : undefined)}
      >
        <View style={styles.routeLabelRow}>
          {/* Recommended is never colour-only either — the same reasoning as
              a selected chip. The badge on `card` already carries it for
              sighted users who see hue; this carries it for everyone else. */}
          {recommended && (
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={color.accentDeep}
              style={styles.routeLabelIcon}
            />
          )}
          <Text style={styles.routeLabel}>{route.label}</Text>
        </View>

        <Money
          value={route.estimate.totalThisYear}
          size="large"
          tone={recommended ? 'accent' : 'ink'}
        />

        {/* The caveat travels with the number it qualifies, rather than waiting
            behind a tap. These warnings used to render only inside the expanded
            details, so a facility whose published rate is a percent-of-charge
            artifact or a carve-out looked identical to a clean one until you
            opened it — and the collapsed card is what most people will read.
            The full explanation still sits in the details below. */}
        {route.warnings.length > 0 && (
          <View style={styles.badge}>
            <Ionicons name="alert-circle" size={13} color={color.flag} />
            <Text style={styles.badgeText}>Published rate flagged</Text>
          </View>
        )}

        <View style={styles.whyRow}>
          <Text style={styles.why} numberOfLines={expanded ? undefined : 2}>
            {route.estimate.scan.countsTowardDeductible
              ? 'Counts toward your deductible.'
              : 'Earns no deductible credit.'}
          </Text>
          <View style={styles.chevronRow}>
            <Text style={styles.chevron}>{expanded ? 'Hide' : 'Details'}</Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={color.slate}
            />
          </View>
        </View>
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
  onShare,
  onMethod,
  requirementsChecked,
  payerLabel,
}: {
  routes: Route[];
  findings: { requirement: Requirement; status: string }[];
  isSubscribed: boolean;
  note: string | null;
  onRestore: () => void;
  onOpenHousehold: () => void;
  onShare: () => void;
  onMethod: () => void;
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
        <Text style={shared.h1}>No routes to compare</Text>
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

      {/*
        Under the ranked list and above the plan offer, so it reads as the end
        of the free comparison rather than as an upsell.

        The text it produces carries the same "estimate" on every figure that
        the screen does — see src/share.ts. A number qualified on screen and
        bare in a screenshot would break hard rule 5 at exactly the point the
        figure reaches someone who cannot see where it came from.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share this comparison"
        onPress={onShare}
        style={({ pressed }) => [styles.share, pressed && shared.cardPressed]}
      >
        <Ionicons name="share-outline" size={18} color={color.ink} />
        <Text style={styles.shareText}>Share this comparison</Text>
      </Pressable>

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

      {/* Reachable from the result as well as the homepage. A member reading
          a figure they doubt should not have to return to the start to find
          out what produced it. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Where these numbers come from"
        onPress={onMethod}
        style={({ pressed }) => [shared.restore, pressed && shared.restorePressed]}
      >
        <Text style={shared.restoreText}>Where these numbers come from</Text>
      </Pressable>

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

  // Outlined and ink-toned rather than accent: sharing is an action performed
  // on a result, not a result. The one accent in this app marks the
  // recommended route and must not compete with a button.
  share: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space.lg,
    minHeight: TAP_TARGET,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: color.border,
    paddingHorizontal: space.md,
  },
  shareText: { ...type.body, fontWeight: '600', color: color.ink },
  routeLabelRow: { flexDirection: 'row', alignItems: 'center' },
  routeLabelIcon: { marginRight: space.xs },
  routeLabel: { ...type.caption, fontWeight: '700', color: color.inkMuted },

  // Flag colours, not alarm colours — a suspect published row is a limit of
  // the data, the same class of thing as a missing rule.
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    backgroundColor: color.flagBg,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    marginTop: space.sm,
  },
  badgeText: { ...type.label, color: color.flag },

  whyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
    marginTop: space.sm,
  },
  why: { ...type.caption, color: color.inkMuted, flex: 1 },
  chevronRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  chevron: { ...type.label, color: color.slate },

  details: { borderTopWidth: stroke.hairline, borderTopColor: color.line, marginTop: space.md, paddingTop: space.md },
  rowValue: { ...type.caption, color: color.ink, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  warning: {
    ...type.caption,
    color: color.flag,
    backgroundColor: color.flagBg,
    borderRadius: radius.sm,
    padding: space.sm,
    marginTop: space.sm,
  },

  requirement: { borderTopWidth: stroke.hairline, borderTopColor: color.line, marginTop: space.md, paddingTop: space.md },
  requirementStatus: { ...type.caption, fontWeight: '700', color: color.flag },
  link: { ...type.caption, fontWeight: '700', color: color.accent, marginTop: space.xs },
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
  lockTitle: { ...type.body, fontWeight: '700', color: color.ink },
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
