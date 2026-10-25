/**
 * 04d · Why was it ordered?
 *
 * Only shown when the member's insurer publishes imaging criteria for this
 * scan, and the follow-up questions only when one of those criteria reads the
 * answer: weeks of treatment for knee and lower-back rules, the warning-sign
 * question for head CT. Asking for a fact no rule uses is noise, and CLAUDE.md
 * records the time a weeks slider showed up for a headache that nothing read.
 *
 * Nothing here predicts whether a claim is paid. The answers are checked
 * against the insurer's own published criteria, and the result screen reports
 * which ones the order does not record yet.
 */

import { Pressable, View } from 'react-native';

import { data, PAYER_LABELS } from '../appData';
import { publisher } from '../citation';
import { Answers, HeadacheAnswer, cptOf, procedureOf } from '../flow';
import { checkOrder, readsField, usesTreatmentWeeks } from '../requirements';
import { TAP_TARGET, color, figure, space, textScale, type } from '../theme';
import { Button, ChoiceList, ChoiceRow, Heading, Screen, T } from '../ui';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  answers: Answers;
  onChange: (patch: Partial<Answers>) => void;
  onBack: () => void;
  onNext: () => void;
  progress: { index: number; total: number };
};

const HEADACHE: { key: HeadacheAnswer; label: string }[] = [
  { key: 'yes', label: 'Yes' },
  { key: 'no', label: 'No' },
  { key: 'unsure', label: 'Not sure' },
];

function Stepper({ value, onChange }: { value: number | undefined; onChange: (next: number) => void }) {
  const button = (name: 'remove' | 'add', next: number, label: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onChange(Math.max(0, Math.min(52, next)))}
      style={({ pressed }) => ({
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: pressed ? color.track : color.canvas,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Ionicons name={name} size={26} color={color.ink} />
    </Pressable>
  );
  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: 24,
        padding: space.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: TAP_TARGET + 24,
      }}
    >
      {button('remove', (value ?? 0) - 1, 'One week fewer')}
      <View style={{ alignItems: 'center' }} accessibilityLiveRegion="polite">
        <T style={[figure(40, 'bold'), { color: value === undefined ? color.placeholder : color.ink }]} maxFontSizeMultiplier={textScale.figure}>
          {value === undefined ? '–' : value}
        </T>
        <T style={[type.caption, { color: color.inkMuted }]}>{value === 1 ? 'week' : 'weeks'}</T>
      </View>
      {button('add', (value ?? 0) + 1, 'One week more')}
    </View>
  );
}

export function OrderStep({ answers, onChange, onBack, onNext, progress }: Props) {
  const procedure = procedureOf(answers);
  const cpt = cptOf(answers) ?? '';
  const payerLabel = PAYER_LABELS[answers.payer ?? ''] ?? '';
  const applicable = answers.indication
    ? checkOrder(data.requirements, payerLabel, cpt, answers.indication, {})
    : [];
  const asksWeeks = applicable.some((finding) => usesTreatmentWeeks(finding.requirement.check));
  const asksHeadache = applicable.some((finding) =>
    readsField(finding.requirement.check, 'headache_concerning_feature'),
  );
  const who = applicable[0] ? publisher(applicable[0].requirement) : null;

  return (
    <Screen
      onBack={onBack}
      progress={progress}
      footer={<Button label="Continue" onPress={onNext} disabled={!answers.indication} />}
    >
      <Heading>Why was it ordered?</Heading>
      <T style={[type.body, { color: color.inkMuted, marginTop: space.sm, marginBottom: space.xxl }]}>
        Your insurer publishes criteria for this scan. Preclear checks your order against them.
      </T>
      <ChoiceList>
        {(procedure?.indications ?? []).map((indication, i) => (
          <ChoiceRow
            key={indication.key}
            first={i === 0}
            label={indication.label}
            selected={answers.indication === indication.key}
            onPress={() =>
              onChange({ indication: indication.key, treatmentWeeks: undefined, headache: undefined })
            }
          />
        ))}
      </ChoiceList>

      {asksWeeks ? (
        <View style={{ marginTop: space.xxl, gap: space.sm }}>
          <T style={[type.rowTitle, { paddingHorizontal: space.xs }]}>Weeks of treatment so far</T>
          <T style={[type.small, { color: color.inkMuted, paddingHorizontal: space.xs }]}>
            Physical therapy, medication or rest your doctor directed for this problem.
          </T>
          <Stepper value={answers.treatmentWeeks} onChange={(treatmentWeeks) => onChange({ treatmentWeeks })} />
        </View>
      ) : null}

      {asksHeadache ? (
        <View style={{ marginTop: space.xxl, gap: space.sm }}>
          <T style={[type.rowTitle, { paddingHorizontal: space.xs }]}>
            Does the order note a concerning headache feature?
          </T>
          <ChoiceList>
            {HEADACHE.map((option, i) => (
              <ChoiceRow
                key={option.key}
                first={i === 0}
                label={option.label}
                selected={answers.headache === option.key}
                onPress={() => onChange({ headache: option.key })}
              />
            ))}
          </ChoiceList>
        </View>
      ) : null}

      {who ? (
        <T style={[type.caption, { color: color.inkSubtle, marginTop: space.lg, paddingHorizontal: space.xs }]}>
          Criteria published by {who}.
        </T>
      ) : null}
    </Screen>
  );
}
