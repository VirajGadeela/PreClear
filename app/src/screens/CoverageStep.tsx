import { StyleSheet, Text, View } from 'react-native';
import { space, textScale } from '../theme';
import { shared } from '../styles/shared';
import { Chip } from '../components/Chip';
import { Slider } from '../Slider';
import { money } from '../costing';

export function CoverageStep({
  deductible,
  coinsurance,
  expectedOtherSpend,
  treatmentWeeks,
  showTreatment,
  headacheFeature,
  showHeadacheFeature,
  onDeductible,
  onCoinsurance,
  onExpectedOtherSpend,
  onTreatmentWeeks,
  onHeadacheFeature,
}: {
  deductible: number;
  coinsurance: number;
  expectedOtherSpend: number;
  treatmentWeeks: number;
  showTreatment: boolean;
  headacheFeature: boolean | undefined;
  showHeadacheFeature: boolean;
  onDeductible: (value: number) => void;
  onCoinsurance: (value: number) => void;
  onExpectedOtherSpend: (value: number) => void;
  onTreatmentWeeks: (value: number) => void;
  onHeadacheFeature: (value: boolean | undefined) => void;
}) {
  return (
    <View>
      <Text style={shared.h1} maxFontSizeMultiplier={textScale.display}>Your coverage</Text>
      <Text style={shared.caption}>From your plan documents. Nothing is stored.</Text>

      <View style={styles.sliderBlock}>
        <Slider
          label="Deductible remaining"
          value={deductible}
          minimum={0}
          maximum={10000}
          step={250}
          onChange={onDeductible}
          format={money}
          // Carried over from the Aug 13 branch. Most people do not know this
          // figure exactly, and a quick jump beats hunting for it with a drag.
          presets={[
            { label: 'Met it', value: 0 },
            { label: 'About half', value: 1500 },
            { label: 'Barely touched', value: 5000 },
          ]}
        />
        <Slider
          label="Coinsurance after deductible"
          value={coinsurance}
          minimum={0}
          maximum={0.5}
          step={0.05}
          onChange={onCoinsurance}
          format={(value) => `${Math.round(value * 100)}%`}
        />
        <Slider
          label="Other care you expect this year"
          value={expectedOtherSpend}
          minimum={0}
          maximum={20000}
          step={500}
          onChange={onExpectedOtherSpend}
          format={money}
          presets={[
            { label: 'None planned', value: 0 },
            { label: 'A few visits', value: 1500 },
            { label: 'Ongoing care', value: 6000 },
          ]}
        />
        {showTreatment && (
          <Slider
            label="Weeks of treatment so far"
            value={treatmentWeeks}
            minimum={0}
            maximum={12}
            step={1}
            onChange={onTreatmentWeeks}
            format={(value) => `${value} ${value === 1 ? 'week' : 'weeks'}`}
          />
        )}
      </View>

      {/* Three states, not two. Neither chip selected means the order does not
          record this, which is the common case and reads as "not documented"
          rather than as a criterion the order failed. Tapping a selected chip
          clears it back to unanswered. */}
      {showHeadacheFeature && (
        <View style={shared.featureBlock}>
          <Text style={shared.rowLabel}>
            Does the order document a concerning headache feature?
          </Text>
          <Text style={shared.caption}>
            For example sudden severe onset, a change in pattern, a new headache
            after age 50, or an abnormal neurological exam. Your insurer
            publishes the full list.
          </Text>
          <View style={shared.chipWrap}>
            <Chip
              label="Yes"
              selected={headacheFeature === true}
              onPress={() =>
                onHeadacheFeature(headacheFeature === true ? undefined : true)
              }
            />
            <Chip
              label="No"
              selected={headacheFeature === false}
              onPress={() =>
                onHeadacheFeature(headacheFeature === false ? undefined : false)
              }
            />
          </View>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  sliderBlock: { marginTop: space.lg },
});
