import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, space, textScale } from '../theme';
import { shared } from '../styles/shared';
import { Chip } from '../components/Chip';
import { Slider } from '../Slider';
import { money } from '../costing';

/**
 * Held outside the component because it renders only in the disclosed state.
 * The question above it is the control; this is the reference material behind
 * it, and the collapsed screen is what most people will read.
 */
const HEADACHE_EXAMPLE =
  'For example sudden severe onset, a change in pattern, a new headache after ' +
  'age 50, or an abnormal neurological exam. Your insurer publishes the full list.';

/** Three states, so the chips are data rather than two hand-written controls. */
const YES_NO = [
  { label: 'Yes', value: true },
  { label: 'No', value: false },
] as const;

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
  const [showExample, setShowExample] = useState(false);

  return (
    <>
      <Text style={shared.h1} maxFontSizeMultiplier={textScale.display}>Your coverage</Text>
      <Text style={[shared.caption, styles.lede]}>Nothing is stored.</Text>

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

      {/* Three states, not two. Neither chip selected means the order does not
          record this, which is the common case and reads as "not documented"
          rather than as a criterion the order failed. Tapping a selected chip
          clears it back to unanswered. */}
      {showHeadacheFeature && (
        <>
          <Text style={shared.rowLabel}>
            Concerning headache feature documented?
          </Text>
          {/* Same disclosure idea as a route card, at the size this screen
              needs: the examples are reference material, not the question.
              `onPress` on a Text is core RN, so this costs no wrapper. */}
          <Text
            accessibilityRole="button"
            accessibilityState={{ expanded: showExample }}
            style={styles.disclosure}
            onPress={() => setShowExample(!showExample)}
          >
            {showExample ? HEADACHE_EXAMPLE : 'Details'}
          </Text>
          <View style={shared.chipWrap}>
            {YES_NO.map((option) => (
              <Chip
                key={option.label}
                label={option.label}
                selected={headacheFeature === option.value}
                onPress={() =>
                  onHeadacheFeature(
                    headacheFeature === option.value ? undefined : option.value,
                  )
                }
              />
            ))}
          </View>
        </>
      )}

    </>
  );
}

const styles = StyleSheet.create({
  // The gap the removed slider-block wrapper used to carry, moved onto the
  // line above it. One token rather than the wrapper's 24 plus the caption's
  // own 16, because reaching a total by adding two tokens together is the
  // arithmetic theme.ts's spacing scale exists to prevent.
  lede: { marginBottom: space.xl },
  disclosure: { ...shared.caption, color: color.accentDeep },
});
