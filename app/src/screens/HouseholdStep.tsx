import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { radius, space, stroke, textScale, type } from '../theme';
import { useStyles, useTheme } from '../ThemeProvider';
import { themed } from '../styles/themed';
import { sharedSheets } from '../styles/shared';
import { Money } from '../Money';
import household from '../../assets/household-eobs.json';
import { Eob, HouseholdPlan, review, totalAtStake } from '../claims';
import { money } from '../costing';
import { YearPlanSection } from './YearPlanSection';

/**
 * The household's claims, checked against themselves.
 *
 * Findings are discrepancies the documents demonstrate — arithmetic that does
 * not reconcile, a service billed twice, a denial that carries appeal rights.
 * None of them predicts what the payer will do, and the total is what is at
 * stake rather than what will be recovered.
 *
 * The claims are synthetic fixtures. Nothing real is read, stored or sent.
 */
function HouseholdReview() {
  const styles = useStyles(sheets);
  const shared = useStyles(sharedSheets);
  const { c } = useTheme();
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
      <Text style={shared.h2}>Check your claims</Text>
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
 * The household destination: several scans planned against one shared
 * deductible, then the household's claims checked against themselves.
 *
 * Free for everyone. There is no paid tier, so there is no locked state and
 * no sales page standing in for this one.
 */
export function HouseholdStep({
  note,
  yearPlan,
}: {
  note: string | null;
  /**
   * Everything the year plan needs, passed through rather than re-derived.
   * The list itself lives in `App.tsx` beside the screener query, because the
   * benefits it is costed against are the ones the screener already collects.
   */
  yearPlan: React.ComponentProps<typeof YearPlanSection>;
}) {
  const shared = useStyles(sharedSheets);
  return (
    <View>
      <Text style={shared.h1} maxFontSizeMultiplier={textScale.display}>Your household</Text>
      <YearPlanSection {...yearPlan} />
      <HouseholdReview />
      {note ? <Text style={shared.note}>{note}</Text> : null}
    </View>
  );
}

const sheets = themed((c) => ({
  household: { marginTop: space.md, gap: space.sm },
  finding: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: c.line,
    padding: space.md,
  },
  findingHead: { ...type.label, color: c.ink },
}));
