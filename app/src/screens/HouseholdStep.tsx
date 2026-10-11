import { Text, View } from 'react-native';
import { textScale } from '../theme';
import { useStyles } from '../ThemeProvider';
import { sharedSheets } from '../styles/shared';
import { YearPlanSection } from './YearPlanSection';

/**
 * The household destination: several scans planned against one shared
 * deductible.
 *
 * Free for everyone. There is no paid tier, so there is no locked state and
 * no sales page standing in for this one. The claims review that used to sit
 * under the year plan was removed with the paid tier; its engine stays in
 * `pipeline/claims/`.
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
      {note ? <Text style={shared.note}>{note}</Text> : null}
    </View>
  );
}
