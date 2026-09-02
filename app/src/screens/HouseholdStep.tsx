import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { TAP_TARGET, color, radius, space, stroke, type } from '../theme';
import { shared } from '../styles/shared';
import { Money } from '../Money';
import { PrimaryButton } from '../components/PrimaryButton';
import household from '../../assets/household-eobs.json';
import { Eob, HouseholdPlan, review, totalAtStake } from '../claims';
import { money } from '../costing';
import { DEMO_PLANS, PLAN_INCLUDES, PLAN_NAME } from '../plan';

/**
 * The subscription tier: the household's claims, checked against themselves.
 *
 * Findings are discrepancies the documents demonstrate — arithmetic that does
 * not reconcile, a service billed twice, a denial that carries appeal rights.
 * None of them predicts what the payer will do, and the total is what is at
 * stake rather than what will be recovered.
 *
 * The claims are synthetic fixtures. Nothing real is read, stored or sent.
 */
function HouseholdReview() {
  const findings = useMemo(
    () => review(household.eobs as Eob[], household.plan as HouseholdPlan),
    [],
  );
  const atStake = useMemo(() => totalAtStake(findings), [findings]);

  // Grouped by claim, because two checks routinely catch the same claim from
  // different directions — a balance bill almost always fails the components
  // check too. Listed separately they read as two separate recoveries, and a
  // member would add them up. The card shows the amount once, at the largest
  // finding, which is the same rule totalAtStake uses.
  const byClaim = useMemo(() => {
    const groups: { claimId: string; member: string; amount: number | null; reasons: string[]; actions: string[] }[] = [];
    for (const finding of findings) {
      const existing = groups.find((group) => group.claimId === finding.claim_id);
      if (existing) {
        existing.amount =
          finding.amount === null
            ? existing.amount
            : Math.max(existing.amount ?? 0, finding.amount);
        existing.reasons.push(finding.summary);
        if (!existing.actions.includes(finding.action)) {
          existing.actions.push(finding.action);
        }
      } else {
        groups.push({
          claimId: finding.claim_id,
          member: finding.member,
          amount: finding.amount,
          reasons: [finding.summary],
          actions: [finding.action],
        });
      }
    }
    return groups;
  }, [findings]);

  return (
    <View style={styles.household}>
      {/* No heading of its own — the step it sits on already carries one. */}
      <Text style={shared.caption}>
        {household.eobs.length} claims reviewed · {byClaim.length}{' '}
        {byClaim.length === 1 ? 'claim to question' : 'claims to question'}
      </Text>
      {atStake > 0 && <Money value={atStake} size="large" tone="accent" />}

      {byClaim.map((group) => (
        <View key={group.claimId} style={styles.finding}>
          <Text style={styles.findingHead}>
            {group.member} · {group.claimId}
            {group.amount !== null ? ` · ${money(group.amount)}` : ''}
          </Text>
          {group.reasons.map((reason) => (
            <Text key={reason} style={shared.detailSummary}>
              {reason}
            </Text>
          ))}
          {group.actions.map((action) => (
            <Text key={action} style={shared.citation}>
              {action}
            </Text>
          ))}
        </View>
      ))}

      <Text style={shared.caption}>
        Sample claims, shown so the review can be seen working. Amounts are
        estimates of what is in dispute, not of what will be refunded.
      </Text>
    </View>
  );
}

/**
 * The paid step, in both states.
 *
 * Unlocked, it is the household review. Locked, it is the same page with the
 * plan described in full and a way to buy it — not an empty screen and not a
 * teaser. Someone deciding whether to pay should be able to read everything the
 * plan does without paying first.
 */
export function HouseholdStep({
  isSubscribed,
  demo,
  note,
  storeReady,
  onStart,
  onRestore,
}: {
  isSubscribed: boolean;
  demo: boolean;
  note: string | null;
  storeReady: boolean;
  onStart: () => void;
  onRestore: () => void;
}) {
  const [selected, setSelected] = useState(DEMO_PLANS[0].id);
  const plan = DEMO_PLANS.find((item) => item.id === selected) ?? DEMO_PLANS[0];
  // Local to this screen: `onStart`/`onRestore` are the app's one entry point
  // for each action regardless of demo vs. real store, so the pending state
  // for "is this specific tap still in flight" belongs at the call site, not
  // threaded through App.tsx's state.
  const [starting, setStarting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const handleStart = async () => {
    setStarting(true);
    try {
      await onStart();
    } finally {
      setStarting(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await onRestore();
    } finally {
      setRestoring(false);
    }
  };

  if (isSubscribed) {
    return (
      <View>
        <Text style={shared.h1}>Your household</Text>
        {/* A demo unlock must never be mistaken for a purchase. */}
        {demo && (
          <View style={shared.coverageGap}>
            <Text style={shared.coverageGapText}>
              Unlocked in demo mode. No purchase was made and nothing was
              charged.
            </Text>
          </View>
        )}
        <HouseholdReview />
        {note ? <Text style={shared.note}>{note}</Text> : null}
      </View>
    );
  }

  return (
    <View>
      <Text style={shared.h1}>{PLAN_NAME}</Text>
      <Text style={shared.body}>
        A scan happens every few years. Bills arrive all year, for everyone on
        the plan. This is the part that keeps working after the comparison is
        done.
      </Text>

      {/* Prices sit above the benefit list, not below it. The list runs to
          eight lines, and burying the choice under it means the button at the
          bottom commits to a term the member never saw. */}
      <Text style={styles.planSectionLabel}>Choose a plan</Text>
      {DEMO_PLANS.map((option) => {
        const active = option.id === selected;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${option.term}, ${option.price} ${option.cadence}`}
            onPress={() => setSelected(option.id)}
            style={({ pressed }) => [
              styles.planOption,
              active && styles.planOptionActive,
              pressed && styles.planOptionPressed,
            ]}
          >
            <View style={styles.planOptionMain}>
              <View style={styles.planOptionHead}>
                {/* Same non-colour-only selection cue as a Chip. */}
                {active && (
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color={color.accent}
                    style={styles.planOptionCheck}
                  />
                )}
                <Text style={styles.planOptionTerm}>{option.term}</Text>
                {option.badge ? (
                  <Text style={styles.planBadge}>{option.badge}</Text>
                ) : null}
              </View>
              {option.footnote ? (
                <Text style={styles.planOptionFootnote}>{option.footnote}</Text>
              ) : null}
            </View>
            <View style={styles.planOptionPrice}>
              <Text style={[styles.planPrice, active && styles.planPriceActive]}>
                {option.price}
              </Text>
              <Text style={styles.planCadence}>{option.cadence}</Text>
            </View>
          </Pressable>
        );
      })}

      <Text style={styles.planSectionLabel}>What it watches</Text>
      <View style={styles.planDetailPlain}>
        {PLAN_INCLUDES.map((line) => (
          <View key={line} style={shared.planRow}>
            <Text style={shared.planBullet}>·</Text>
            <Text style={shared.planLine}>{line}</Text>
          </View>
        ))}
      </View>

      <Text style={shared.planCaveat}>
        Findings are discrepancies these documents show against themselves. They
        are not predictions about what your insurer will decide, and the amounts
        are what is in dispute rather than what will be refunded.
      </Text>

      {/* Stated where the prices are, not only next to the button — and only
          in demo mode, where it is true. Once a RevenueCat key is configured
          this button opens a real purchase screen instead. */}
      {!storeReady && (
        <View style={styles.demoStrip}>
          <Text style={styles.demoText}>
            Demo pricing. Nothing is charged, no purchase is made and no payment
            details are collected — this unlocks the paid tier on this device so
            it can be seen working.
          </Text>
        </View>
      )}

      <PrimaryButton
        label={`Start ${plan.term.toLowerCase()} plan`}
        onPress={handleStart}
        pending={starting}
      />

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

      {note ? <Text style={shared.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  household: { marginTop: space.md, gap: space.sm },
  finding: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: color.line,
    padding: space.md,
  },
  findingHead: { ...type.label, color: color.ink },

  planDetailPlain: { marginTop: space.md, gap: space.sm },

  planSectionLabel: {
    ...type.label,
    color: color.inkMuted,
    marginTop: space.xl,
    marginBottom: space.md,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  planOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: stroke.control,
    // A control boundary, not a hairline. See `border` in theme.ts.
    borderColor: color.border,
    padding: space.md,
    marginBottom: space.sm,
    minHeight: TAP_TARGET,
  },
  planOptionPressed: { opacity: 0.7 },
  // Selection is carried by the accent border and the price colour — the same
  // accent the recommended route uses, and nowhere else. Not a cheap/expensive
  // signal, just "this is the one chosen."
  planOptionActive: { borderColor: color.accent, backgroundColor: color.accentSoft },
  planOptionMain: { flex: 1, gap: space.xs },
  planOptionHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  planOptionCheck: { marginRight: -space.xs },
  planOptionTerm: { ...type.body, fontWeight: '700', color: color.ink },
  planBadge: {
    ...type.caption,
    fontWeight: '700',
    color: color.accentInk,
    backgroundColor: color.accent,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  planOptionFootnote: { ...type.caption, color: color.inkMuted },
  planOptionPrice: { alignItems: 'flex-end' },
  planPrice: { ...type.amount, color: color.ink },
  planPriceActive: { color: color.accent },
  planCadence: { ...type.caption, color: color.inkMuted },

  demoStrip: {
    backgroundColor: color.flagBg,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
  },
  demoText: { ...type.caption, color: color.flag },
});
