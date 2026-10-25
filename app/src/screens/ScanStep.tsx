/**
 * 02 · What scan?
 *
 * The walkthrough's two-step picker: scan type, then body part. The member is
 * saying what their doctor ordered, not shopping between scan types, so no
 * price appears anywhere on this screen (hard rule 6: never suggest a
 * different modality). The detail line names the exact code and its scope,
 * including "without contrast": an order with contrast is a different code at
 * a different price, and this is where a member would notice.
 */

import { View } from 'react-native';

import { Answers, MODALITIES, PARTS, Part, Modality, procedureOf } from '../flow';
import { color, figure, font, space, textScale, type } from '../theme';
import { Button, ChoiceList, ChoiceRow, Heading, Screen, T, Tile } from '../ui';

type Props = {
  answers: Answers;
  onChange: (patch: Partial<Answers>) => void;
  onBack: () => void;
  onNext: () => void;
  progress: { index: number; total: number };
};

export function ScanStep({ answers, onChange, onBack, onNext, progress }: Props) {
  const procedure = procedureOf(answers);
  return (
    <Screen
      onBack={onBack}
      progress={progress}
      footer={<Button label="Continue" onPress={onNext} disabled={!procedure} />}
    >
      <Heading>What scan?</Heading>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: space.xxl }}>
        {MODALITIES.map((modality) => (
          <Tile
            key={modality.key}
            selected={answers.modality === modality.key}
            onPress={() => onChange({ modality: modality.key as Modality })}
            accessibilityLabel={`${modality.key}, ${modality.sub}`}
            style={{ flex: 1, minHeight: 112, justifyContent: 'space-between' }}
          >
            <T style={figure(34, 'bold')} maxFontSizeMultiplier={textScale.figure}>
              {modality.key}
            </T>
            <T style={[type.small, { color: color.inkMuted }]}>{modality.sub}</T>
          </Tile>
        ))}
      </View>

      <View style={{ marginTop: space.xxl }}>
        <ChoiceList>
          {PARTS.map((part, i) => (
            <ChoiceRow
              key={part}
              first={i === 0}
              large
              label={part}
              selected={answers.part === part}
              onPress={() => onChange({ part: part as Part })}
            />
          ))}
        </ChoiceList>
      </View>

      {procedure ? (
        <T style={[type.caption, { color: color.inkSubtle, marginTop: space.md, paddingHorizontal: space.xs }]}>
          {procedure.detail} · CPT{' '}
          <T style={[type.caption, { fontFamily: font.mono, color: color.inkSubtle }]}>{procedure.cpt}</T>
        </T>
      ) : null}
    </Screen>
  );
}
