/**
 * 06 · More care planned before Dec 31?
 *
 * The hinge of the whole estimate. Cash earns no deductible credit, so whether
 * it wins depends on how much other care is coming this year, and setting this
 * to nothing is not neutral: it is the assumption that no more care happens.
 *
 * The three shortcuts are bills (allowed amounts), not what the member pays;
 * the engine runs them through the plan. Each shows its figure, and "A
 * different amount" opens a keypad, so the shortcut never hides the number
 * that decides the answer.
 */

import { View } from 'react-native';

import { dollars } from '../resultCopy';
import { Answers, CARE_AMOUNTS, CareKey } from '../flow';
import { color, space, type } from '../theme';
import { Button, Heading, Radio, Screen, T, Tile } from '../ui';

type Props = {
  answers: Answers;
  onChange: (patch: Partial<Answers>) => void;
  onBack: () => void;
  onNext: () => void;
  progress: { index: number; total: number };
  nextLabel: string;
};

const OPTIONS: { key: CareKey; label: string; sub: string }[] = [
  { key: 'none', label: 'Nothing else', sub: 'Just this scan' },
  { key: 'some', label: 'Some', sub: `Follow-up visits, physical therapy · ${dollars(CARE_AMOUNTS.some)} in bills` },
  { key: 'major', label: 'Major', sub: `Surgery or a procedure · ${dollars(CARE_AMOUNTS.major)} in bills` },
  { key: 'custom', label: 'A different amount', sub: 'Type the bills you expect' },
];

export function CareStep({ answers, onChange, onBack, onNext, progress, nextLabel }: Props) {
  return (
    <Screen
      onBack={onBack}
      progress={progress}
      footer={<Button label={nextLabel} onPress={onNext} disabled={!answers.care} />}
    >
      <Heading>More care planned before Dec 31?</Heading>
      <T style={[type.body, { color: color.inkMuted, marginTop: space.sm, marginBottom: space.xl }]}>
        This decides whether cash or insurance wins.
      </T>
      <View style={{ gap: space.md }}>
        {OPTIONS.map((option) => {
          const selected = answers.care === option.key;
          return (
            <Tile
              key={option.key}
              selected={selected}
              onPress={() => onChange({ care: option.key })}
              accessibilityLabel={`${option.label}, ${option.sub}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.xl }}
            >
              <View style={{ flex: 1, gap: space.xs }}>
                <T style={type.headline}>{option.label}</T>
                <T style={[type.bodyMedium, { color: color.inkMuted }]}>{option.sub}</T>
              </View>
              <Radio selected={selected} />
            </Tile>
          );
        })}
      </View>
    </Screen>
  );
}
