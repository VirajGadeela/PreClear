/**
 * 04 · Your insurance, 04b · Your plan, 04c · Where is it booked?
 *
 * Insurer first, because the plan types and the hospital list both depend on
 * it. The plan matters more than the insurer: one Anthem hospital publishes
 * five different rates for the same knee MRI, so the type (and, if the member
 * has it, the name on the card) decides which one is theirs.
 *
 * No card scanning. It would need a camera and on-device text recognition,
 * two native modules, and the card image is the one piece of data hard rule 3
 * says to discard on sight. Typing the plan name reaches the same answer.
 */

import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';

import { PAYER_LABELS } from '../appData';
import { Answers, bookableFacilities, facilitiesFor, productsFor } from '../flow';
import { cityOf } from '../resultCopy';
import { planMatchSummary } from '../routes';
import { color, font, radius, space, type } from '../theme';
import { Button, ChoiceList, ChoiceRow, Heading, Screen, T } from '../ui';

type StepProps = {
  answers: Answers;
  onChange: (patch: Partial<Answers>) => void;
  onBack: () => void;
  onNext: () => void;
  progress: { index: number; total: number };
};

const CARRIERS: { key: string; label: string }[] = [
  { key: 'anthem', label: 'Anthem Blue Cross' },
  { key: 'unitedhealthcare', label: 'UnitedHealthcare' },
  { key: 'aetna', label: 'Aetna' },
  { key: 'cigna', label: 'Cigna' },
];

function Initial({ letter, selected }: { letter: string; selected: boolean }) {
  return (
    <View
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected ? color.accent : color.line,
      }}
    >
      <T style={{ fontFamily: font.bold, fontSize: 15, color: selected ? color.onAccent : color.ink }}>{letter}</T>
    </View>
  );
}

export function InsuranceStep({ answers, onChange, onBack, onNext, progress }: StepProps) {
  return (
    <Screen
      onBack={onBack}
      progress={progress}
      footer={<Button label="Continue" onPress={onNext} disabled={!answers.payer} />}
    >
      <Heading>Your insurance</Heading>
      <T style={[type.body, { color: color.inkMuted, marginTop: space.sm, marginBottom: space.xxl }]}>
        Choose the company on your card.
      </T>
      <ChoiceList>
        {CARRIERS.map((carrier, i) => (
          <ChoiceRow
            key={carrier.key}
            first={i === 0}
            label={carrier.label}
            selected={answers.payer === carrier.key}
            onPress={() => onChange({ payer: carrier.key })}
            leading={<Initial letter={carrier.label[0]} selected={answers.payer === carrier.key} />}
          />
        ))}
      </ChoiceList>
    </Screen>
  );
}

const PRODUCT_LABELS: Record<string, { label: string; sub: string }> = {
  ppo: { label: 'PPO', sub: 'Preferred provider organization' },
  hmo: { label: 'HMO', sub: 'Health maintenance organization' },
  pos: { label: 'POS', sub: 'Point of service' },
  epo: { label: 'EPO', sub: 'Exclusive provider organization' },
};

export function PlanStep({ answers, onChange, onBack, onNext, progress }: StepProps) {
  const products = productsFor(answers);
  const match = planMatchSummary(facilitiesFor(answers), answers.planText);
  const payer = PAYER_LABELS[answers.payer ?? ''] ?? 'your insurer';

  return (
    <Screen
      onBack={onBack}
      progress={progress}
      footer={<Button label="Continue" onPress={onNext} disabled={answers.product === undefined} />}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'position' : undefined}>
        <Heading>Your plan</Heading>
        <T style={[type.body, { color: color.inkMuted, marginTop: space.sm, marginBottom: space.xxl }]}>
          The plan sets the price, not just the insurer. It’s printed on your card.
        </T>
        <ChoiceList>
          {products.map((product, i) => (
            <ChoiceRow
              key={product}
              first={i === 0}
              label={PRODUCT_LABELS[product]?.label ?? product.toUpperCase()}
              sub={PRODUCT_LABELS[product]?.sub}
              selected={answers.product === product}
              onPress={() => onChange({ product })}
            />
          ))}
          <ChoiceRow
            first={products.length === 0}
            label="Not sure"
            sub={`Shows the full range ${payer} publishes`}
            selected={answers.product === null}
            onPress={() => onChange({ product: null })}
          />
        </ChoiceList>

        <T style={[type.small, { color: color.inkMuted, marginTop: space.xxl, marginBottom: space.sm, paddingHorizontal: space.xs }]}>
          Plan name, if you have it (optional)
        </T>
        <TextInput
          value={answers.planText}
          onChangeText={(planText) => onChange({ planText })}
          placeholder="e.g. Blue Access PPO"
          placeholderTextColor={color.inkSubtle}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="done"
          accessibilityLabel="Plan name, optional"
          maxFontSizeMultiplier={2}
          style={{
            minHeight: 56,
            borderRadius: radius.row,
            backgroundColor: color.surface,
            paddingHorizontal: space.xl,
            fontFamily: font.semibold,
            fontSize: 17,
            color: color.ink,
            borderWidth: 1.5,
            borderColor: answers.planText ? color.accent : color.border,
          }}
        />
        {match ? (
          <T style={[type.small, { color: color.inkMuted, marginTop: space.sm, paddingHorizontal: space.xs }]}>
            {match.matched > 0
              ? `Matches published prices at ${match.matched} of ${match.total} hospitals.`
              : 'No hospital lists a plan by that name, so prices use your plan type.'}
          </T>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

export function BookedStep({ answers, onChange, onBack, onNext, progress }: StepProps) {
  const facilities = bookableFacilities(answers);
  return (
    <Screen
      onBack={onBack}
      progress={progress}
      footer={<Button label="Continue" onPress={onNext} disabled={answers.orderedFacility === undefined} />}
    >
      <Heading>Where is it booked?</Heading>
      <T style={[type.body, { color: color.inkMuted, marginTop: space.sm, marginBottom: space.xxl }]}>
        Indianapolis-area hospitals that publish an in-network price for your insurer.
      </T>
      <ChoiceList>
        {facilities.map((facility, i) => (
          <ChoiceRow
            key={facility.facility_key}
            first={i === 0}
            label={facility.facility_name}
            sub={cityOf(facility.facility_address) || undefined}
            selected={answers.orderedFacility === facility.facility_key}
            onPress={() => onChange({ orderedFacility: facility.facility_key })}
          />
        ))}
        <ChoiceRow
          first={facilities.length === 0}
          label="Not sure yet"
          sub="Compares against a typical price instead"
          selected={answers.orderedFacility === null}
          onPress={() => onChange({ orderedFacility: null })}
        />
      </ChoiceList>
      <T style={[type.caption, { color: color.inkSubtle, marginTop: space.md, paddingHorizontal: space.xs }]}>
        Community Health Network and St. Vincent Indianapolis don’t publish usable prices, so they aren’t listed.
      </T>
    </Screen>
  );
}
