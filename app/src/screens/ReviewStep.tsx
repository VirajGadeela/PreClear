/**
 * 06b · Check your answers.
 *
 * Every answer the estimate depends on, each one tappable to change. Editing a
 * row returns here rather than walking the rest of the flow again.
 */

import { Pressable, View } from 'react-native';

import { PAYER_LABELS } from '../appData';
import { dollars } from '../resultCopy';
import { Answers, bookableFacilities, careAmountOf, procedureOf } from '../flow';
import { color, font, radius, space, type } from '../theme';
import { Button, Heading, Screen, T } from '../ui';

export type ReviewTarget = 'scan' | 'ins' | 'plan' | 'booked' | 'order' | 'ded' | 'met' | 'coins' | 'oop' | 'care';

type Props = {
  answers: Answers;
  showOrder: boolean;
  onEdit: (step: ReviewTarget) => void;
  onBack: () => void;
  onNext: () => void;
  progress: { index: number; total: number };
};

export function ReviewStep({ answers, showOrder, onEdit, onBack, onNext, progress }: Props) {
  const procedure = procedureOf(answers);
  const indication = procedure?.indications.find((item) => item.key === answers.indication);
  const facility = bookableFacilities(answers).find((item) => item.facility_key === answers.orderedFacility);
  const plan = [
    answers.product ? answers.product.toUpperCase() : 'Plan type not sure',
    answers.planText.trim() || null,
  ]
    .filter(Boolean)
    .join(' · ');
  const care = careAmountOf(answers) ?? 0;

  const rows: { label: string; value: string; step: ReviewTarget }[] = [
    { label: 'Scan', value: procedure?.label ?? '', step: 'scan' },
    { label: 'Insurance', value: PAYER_LABELS[answers.payer ?? ''] ?? '', step: 'ins' },
    { label: 'Plan', value: plan, step: 'plan' },
    { label: 'Booked at', value: facility?.facility_name ?? 'Not sure yet', step: 'booked' },
    ...(showOrder
      ? [{
          label: 'Ordered for',
          value: [
            indication?.label ?? '',
            answers.treatmentWeeks !== undefined ? `${answers.treatmentWeeks} weeks of treatment` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          step: 'order' as ReviewTarget,
        }]
      : []),
    { label: 'Deductible', value: `${dollars(answers.deductibleTotal ?? 0)} a year`, step: 'ded' },
    { label: 'Deductible met', value: dollars(answers.deductibleMet ?? 0), step: 'met' },
    { label: 'Coinsurance', value: `${answers.coinsurancePct ?? 0}%`, step: 'coins' },
    { label: 'Out-of-pocket max', value: dollars(answers.oopTotal ?? 0), step: 'oop' },
    {
      label: 'Planned care',
      value: care > 0 ? `${dollars(care)} in bills` : 'No other care',
      step: 'care',
    },
  ];

  return (
    <Screen
      onBack={onBack}
      progress={progress}
      footer={<Button label="See my estimate" onPress={onNext} />}
    >
      <Heading>Check your answers</Heading>
      <T style={[type.body, { color: color.inkMuted, marginTop: space.sm, marginBottom: space.xl }]}>
        Tap any answer to change it.
      </T>
      <View style={{ backgroundColor: color.surface, borderRadius: radius.card, overflow: 'hidden' }}>
        {rows.map((row, i) => (
          <Pressable
            key={row.label}
            accessibilityRole="button"
            accessibilityLabel={`${row.label}: ${row.value}. Edit`}
            onPress={() => onEdit(row.step)}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                paddingHorizontal: space.xl,
                paddingVertical: space.md,
                minHeight: 56,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: color.line,
              },
              pressed && { backgroundColor: color.canvas },
            ]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <T style={[type.caption, { color: color.inkMuted }]}>{row.label}</T>
              <T style={type.rowTitle}>{row.value}</T>
            </View>
            <T style={[type.bodyMedium, { fontFamily: font.semibold, color: color.accentDeep }]}>Edit</T>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
