import { StyleSheet, Text, TextInput, View } from 'react-native';
import { TAP_TARGET, color, radius, space, stroke, textScale, type } from '../theme';
import { shared } from '../styles/shared';
import { Chip } from '../components/Chip';
import { data, PAYER_CHIP_LABELS, PAYER_LABELS, Procedure } from '../appData';

export function ScanStep({
  procedure,
  cpt,
  indication,
  payer,
  product,
  productOptions,
  planText,
  planMatch,
  onCpt,
  onIndication,
  onPayer,
  onProduct,
  onPlanText,
}: {
  procedure: Procedure;
  cpt: string;
  indication: string;
  payer: string;
  product: string | undefined;
  productOptions: string[];
  planText: string;
  planMatch: { matched: number; total: number } | null;
  onCpt: (value: string) => void;
  onIndication: (value: string) => void;
  onPayer: (value: string) => void;
  onProduct: (value: string | undefined) => void;
  onPlanText: (value: string) => void;
}) {
  return (
    <>
      <Text style={shared.h1} maxFontSizeMultiplier={textScale.display}>What scan was ordered?</Text>
      <View style={shared.chipWrap}>
        {data.procedures.map((item) => (
          <Chip
            key={item.cpt}
            selected={item.cpt === cpt}
            label={item.label}
            onPress={() => onCpt(item.cpt)}
          />
        ))}
      </View>
      <Text style={shared.caption}>{procedure.detail} · CPT {procedure.cpt}</Text>

      {procedure.indications.length > 0 && (
        <>
          <Text style={shared.h2}>Why was it ordered?</Text>
          <View style={shared.chipWrap}>
            {procedure.indications.map((option) => (
              <Chip
                key={option.key}
                selected={option.key === indication}
                label={option.label}
                block
                onPress={() => onIndication(option.key)}
              />
            ))}
          </View>
        </>
      )}

      <Text style={shared.h2}>Insurer</Text>
      <View style={shared.chipWrap}>
        {Object.keys(PAYER_LABELS).map((key) => (
          <Chip
            key={key}
            selected={key === payer}
            label={PAYER_CHIP_LABELS[key]}
            spoken={PAYER_LABELS[key]}
            onPress={() => onPayer(key)}
          />
        ))}
      </View>

      {/* The plan sets the price, not the payer. Product type is asked for
          because it is the one plan fact a member can read off their card and
          answer correctly — the published plan strings differ by campus and
          contract suffix and match nothing a patient would recognise. */}
      {productOptions.length > 1 && (
        <>
          <Text style={shared.h2}>Plan type</Text>
          <View style={shared.chipWrap}>
            {[...productOptions, undefined].map((option) => (
              <Chip
                key={option ?? 'unsure'}
                selected={option === product}
                label={option ? option.toUpperCase() : 'Not sure'}
                onPress={() => onProduct(option === product ? undefined : option)}
              />
            ))}
          </View>
        </>
      )}

      {/* The plan name pins one rate where the type above can only narrow to a
          group. Typed rather than photographed: reading the card needs a camera
          and an OCR module, and the image is the one object in this product
          that hard rule 3 has to govern. Nothing here is stored. */}
      <Text style={shared.h2}>Plan name</Text>
      <TextInput
        value={planText}
        onChangeText={onPlanText}
        placeholder="e.g. Blue Access PPO"
        placeholderTextColor={color.inkMuted}
        autoCorrect={false}
        autoCapitalize="words"
        accessibilityLabel="Plan name as printed on your insurance card, optional"
        style={styles.input}
      />
      {/* One Text, three states. The no-match case still has to say so — a
          name that matches nothing is silently ignored otherwise. */}
      <Text
        style={planMatch?.matched === 0 ? styles.inputWarn : shared.caption}
      >
        {!planMatch
          ? 'Optional. Pins your exact rate.'
          : planMatch.matched === 0
            ? 'No match, showing every rate. Check the spelling.'
            : `Matches ${planMatch.matched} of ${planMatch.total} facilities.`}
      </Text>

    </>
  );
}

const styles = StyleSheet.create({
  input: {
    ...type.body,
    color: color.ink,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: stroke.control,
    // A control outline, not a hairline — WCAG 1.4.11 wants 3:1 and `line`
    // measures 1.2:1 against the canvas.
    borderColor: color.border,
    paddingHorizontal: space.md,
    minHeight: TAP_TARGET + space.xs,
    marginBottom: space.sm,
  },
  // Brown, matching the data-quality flags. A name that matches nothing is a
  // limit of the published data, not an error the patient made.
  inputWarn: { ...type.caption, color: color.flag },
});
