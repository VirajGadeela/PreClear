/**
 * 05 · The keypad steps: deductible, amount met, coinsurance, out-of-pocket
 * maximum, and a custom amount of planned care.
 *
 * The grey figure is a placeholder, not an answer. Continue stays disabled
 * until the member types something, so a placeholder can never be carried into
 * the estimate as if it were their plan.
 */

import { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { Money } from '../Money';
import { color, figure, space, textScale, type } from '../theme';
import { Button, Keypad, Screen, T } from '../ui';

type Props = {
  label: string;
  value: number | undefined;
  placeholder: number;
  unit: '$' | '%';
  max: number;
  /** A sentence under the figure; turns to `error` when the value is not allowed. */
  help: string;
  error?: string | null;
  below?: ReactNode;
  onChange: (value: number | undefined) => void;
  onBack: () => void;
  onNext: () => void;
  progress?: { index: number; total: number };
  nextLabel?: string;
};

function display(value: number, unit: '$' | '%'): string {
  return unit === '%' ? `${value}%` : `$${value.toLocaleString('en-US')}`;
}

export function AmountStep({
  label,
  value,
  placeholder,
  unit,
  max,
  help,
  error,
  below,
  onChange,
  onBack,
  onNext,
  progress,
  nextLabel = 'Continue',
}: Props) {
  const press = (key: string) => {
    const typed = value === undefined ? '' : String(Math.round(value));
    let next = key === '⌫' ? typed.slice(0, -1) : (typed === '0' ? '' : typed) + key;
    if (next === '') return onChange(undefined);
    const number = parseInt(next, 10);
    if (number > max) return;
    onChange(number);
  };

  const { width } = useWindowDimensions();
  const shown = value ?? placeholder;
  const blocked = value === undefined || Boolean(error);

  return (
    <Screen
      onBack={onBack}
      progress={progress}
      scroll={false}
      footer={<Button label={nextLabel} onPress={onNext} disabled={blocked} />}
      contentStyle={{ paddingTop: space.md }}
    >
      <T style={[type.rowTitle, { fontFamily: type.bodyMedium.fontFamily, color: color.inkMuted, textAlign: 'center' }]}>
        {label}
      </T>
      <View style={{ minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: space.md }}>
        {unit === '$' ? (
          // Through <Money> like every dollar figure, so it carries "estimate".
          <Money
            value={shown}
            style={[figure(72, 'bold'), { color: value === undefined ? color.placeholder : color.ink, textAlign: 'center' }]}
            suffixSize={16}
            fitWidth={width - 48}
            stacked
          />
        ) : (
          <T
            accessibilityLabel={value === undefined ? `${label}, not entered` : `${label}, ${display(shown, unit)}`}
            style={[figure(76, 'bold'), { color: value === undefined ? color.placeholder : color.ink }]}
            maxFontSizeMultiplier={textScale.figure}
            numberOfLines={1}
          >
            {display(shown, unit)}
          </T>
        )}
        {below}
        <T
          style={[type.bodyMedium, { color: error ? color.ink : color.inkMuted, textAlign: 'center', maxWidth: 300 }]}
          accessibilityLiveRegion="polite"
        >
          {error ?? help}
        </T>
      </View>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Keypad onKey={press} />
      </View>
    </Screen>
  );
}
