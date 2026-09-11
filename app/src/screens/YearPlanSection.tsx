import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { TAP_TARGET, radius, size, space, stroke, type } from '../theme';
import { useStyles, useTheme } from '../ThemeProvider';
import { themed } from '../styles/themed';
import { sharedSheets } from '../styles/shared';
import { Money } from '../Money';
import { Chip } from '../components/Chip';
import { PrimaryButton } from '../components/PrimaryButton';
import { data } from '../appData';
import type { PlanBenefits } from '../costing';
import { optimizeYearPlan, type PlannedProcedure, MAX_PROCEDURES } from '../yearPlan';
import { HOUSEHOLD_MEMBERS, procedureLabel } from '../yearPlanData';

/**
 * The paid tier's first section: several scans, one shared deductible.
 *
 * The single-scan screener answers "what does this one cost me this year". A
 * household with three scans coming has a different question, because the
 * three compete for the same deductible: run them all through insurance and
 * they fund it together, pay cash for them and none of them does.
 *
 * What is shown per procedure is a *decision*, never a dollar figure. The year
 * total does not depend on the order the scans happen in, but the attribution
 * does — whichever insured scan is costed first absorbs the deductible and
 * looks expensive. Printing that split would invent a ranking between two scans
 * the arithmetic does not support. See `yearPlan.ts`.
 */
export function YearPlanSection({
  procedures,
  benefits,
  expectedOtherSpend,
  payerLabel,
  onAdd,
  onRemove,
  onShare,
}: {
  procedures: PlannedProcedure[];
  benefits: PlanBenefits;
  expectedOtherSpend: number;
  payerLabel: string;
  onAdd: (member: string, cpt: string) => void;
  onRemove: (id: string) => void;
  onShare: () => void;
}) {
  const styles = useStyles(sheets);
  const shared = useStyles(sharedSheets);
  const { c } = useTheme();

  const [member, setMember] = useState(HOUSEHOLD_MEMBERS[0]);
  const [cpt, setCpt] = useState(data.procedures[0].cpt);

  const comparison = useMemo(() => {
    if (procedures.length === 0) return null;
    return optimizeYearPlan(procedures, benefits, expectedOtherSpend);
  }, [procedures, benefits, expectedOtherSpend]);

  const full = procedures.length >= MAX_PROCEDURES;
  // Whether cash was ever an option, so a zero saving can say which it is.
  const anyCash = procedures.some((item) => item.cashPrice !== null);

  return (
    <View style={styles.section}>
      <Text style={shared.h2}>Plan your year</Text>
      <Text style={shared.caption}>
        Scans your household knows are coming, against one shared deductible.
        {' '}
        {payerLabel} · {data.metro}
      </Text>

      {procedures.map((procedure) => {
        const decision = comparison?.best.decisions.find(
          (item) => item.procedure.id === procedure.id,
        );
        return (
          <View key={procedure.id} style={styles.planned}>
            <View style={styles.plannedMain}>
              <Text style={styles.plannedHead}>
                {procedure.member} · {procedureLabel(procedure.cpt)}
              </Text>
              {decision ? (
                <Text style={styles.plannedDecision}>
                  {decision.payCash ? 'Pay cash' : 'Run through insurance'} ·{' '}
                  {decision.facility}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${procedure.member}, ${procedureLabel(
                procedure.cpt,
              )}`}
              onPress={() => onRemove(procedure.id)}
              style={({ pressed }) => [styles.remove, pressed && styles.removePressed]}
            >
              <Ionicons name="close" size={size.icon.sm} color={c.inkMuted} />
            </Pressable>
          </View>
        );
      })}

      {comparison ? (
        <View style={styles.verdict}>
          <Text style={shared.rowLabel}>What your year costs</Text>
          <Money value={comparison.best.totalThisYear} size="large" tone="accent" />
          {comparison.saving > 0.01 ? (
            <Text style={styles.verdictWhy}>
              <Money value={comparison.saving} size="small" /> less than{' '}
              {comparison.alternative === comparison.allCash
                ? 'paying cash for all of them'
                : 'running all of them through insurance'}
              .
            </Text>
          ) : anyCash ? (
            <Text style={styles.verdictWhy}>
              Cash and insurance come out the same here.
            </Text>
          ) : (
            // Never say the two come out the same when one of them was never
            // on offer. No facility publishing a cash price is a gap in the
            // data, not a tie.
            <Text style={styles.verdictWhy}>
              No cash price is published for these.
            </Text>
          )}
          <Text style={styles.credit}>
            Only the insured payments count toward your deductible. Cash earns
            no credit, so later care starts from scratch.
          </Text>
          {/* The assumption stated, not buried. `expectedOtherAllowedSpend` is
              an explicit input everywhere else in this repo for exactly this
              reason — and here it means care beyond the scans listed above,
              which is a narrower thing than it means on the screener. A member
              who read it the other way would be counting these scans twice. */}
          <Text style={styles.assumption}>
            Assumes <Money value={expectedOtherSpend} size="small" /> of other
            care beyond these. Change it under Your year.
          </Text>
        </View>
      ) : (
        <Text style={shared.body}>
          Add the scans your household expects this year. With more than one,
          this works out which to run through insurance and which to pay cash
          for.
        </Text>
      )}

      <View style={styles.add}>
        <Text style={shared.rowLabel}>Who is it for</Text>
        <View style={shared.chipWrap}>
          {HOUSEHOLD_MEMBERS.map((role) => (
            <Chip
              key={role}
              label={role}
              selected={role === member}
              onPress={() => setMember(role)}
            />
          ))}
        </View>

        <Text style={shared.rowLabel}>Which scan</Text>
        <View style={shared.chipWrap}>
          {data.procedures.map((item) => (
            <Chip
              key={item.cpt}
              label={item.label}
              spoken={`${item.label}, CPT ${item.cpt}`}
              block
              selected={item.cpt === cpt}
              onPress={() => setCpt(item.cpt)}
            />
          ))}
        </View>

        {full ? (
          <Text style={shared.caption}>
            That is as many as this plans at once.
          </Text>
        ) : (
          <PrimaryButton label="Add to your year" onPress={() => onAdd(member, cpt)} />
        )}
      </View>

      {comparison ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share this year plan"
          onPress={onShare}
          style={({ pressed }) => [shared.restore, pressed && shared.restorePressed]}
        >
          <Text style={shared.restoreText}>Share this plan</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const sheets = themed((c) => ({
  section: { marginTop: space.md },

  planned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: c.line,
    paddingLeft: space.md,
    marginBottom: space.sm,
    minHeight: TAP_TARGET,
  },
  plannedMain: { flex: 1, paddingVertical: space.sm },
  plannedHead: { ...type.label, color: c.ink },
  plannedDecision: { ...type.caption, color: c.inkMuted, marginTop: space.xs },
  // Full-height so the target is the row's height, not the icon's.
  remove: {
    width: TAP_TARGET,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePressed: { opacity: 0.5 },

  // The accent fill is the same one the recommended route uses and nothing
  // else. It marks the answer, never cheap-or-expensive — hue carries no rank
  // anywhere in this app.
  verdict: {
    backgroundColor: c.accentSoft,
    borderRadius: radius.lg,
    borderLeftWidth: stroke.control,
    borderLeftColor: c.accent,
    padding: space.md,
    marginTop: space.sm,
    gap: space.xs,
  },
  verdictWhy: { ...type.body, color: c.ink },
  assumption: { ...type.caption, color: c.accentText, marginTop: space.xs },
  // The thesis, not compliance text: the ranking is only ever counterintuitive
  // because cash earns no deductible credit. Last thing on this card to cut.
  credit: { ...type.caption, color: c.accentText, marginTop: space.xs },

  add: {
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: stroke.hairline,
    borderTopColor: c.line,
    gap: space.sm,
  },
}));
