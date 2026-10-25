/**
 * 13 · Plan: what is left on the deductible, and the plan figures behind it.
 */

import { View } from 'react-native';

import { dollars } from '../resultCopy';
import { Money } from '../Money';
import { color, figure, font, radius, space, textScale, type } from '../theme';
import { Button, HomeTab, Screen, T, TabPill } from '../ui';

type Props = {
  planLabel: string;
  deductibleTotal: number | null;
  deductibleMet: number | null;
  coinsurancePct: number | null;
  oopTotal: number | null;
  onUpdateMet: () => void;
  onSources: () => void;
  onTab: (tab: HomeTab | 'new') => void;
};

export function PlanScreen({ planLabel, deductibleTotal, deductibleMet, coinsurancePct, oopTotal, onUpdateMet, onSources, onTab }: Props) {
  const known = deductibleTotal !== null && deductibleMet !== null;
  const rows: { label: string; value: string }[] = [
    { label: 'Plan', value: planLabel },
    { label: 'Deductible', value: deductibleTotal !== null ? dollars(deductibleTotal) : 'Not entered' },
    { label: 'Coinsurance', value: coinsurancePct !== null ? `${coinsurancePct}%` : 'Not entered' },
    { label: 'Out-of-pocket max', value: oopTotal !== null ? dollars(oopTotal) : 'Not entered' },
  ];

  return (
    <View style={{ flex: 1 }}>
      <Screen bare contentStyle={{ paddingHorizontal: space.xl, paddingTop: 28, paddingBottom: 120, gap: 14 }}>
        <T accessibilityRole="header" style={[type.display, { paddingHorizontal: space.xs }]} maxFontSizeMultiplier={textScale.heading}>
          Plan
        </T>
        <View style={{ paddingHorizontal: space.xs, paddingVertical: space.xl, gap: space.sm }}>
          <T style={[type.body, { fontFamily: font.medium, color: color.inkMuted }]}>Left on your deductible</T>
          {known ? (
            <Money value={Math.max(0, (deductibleTotal as number) - (deductibleMet as number))} style={figure(76)} suffixSize={18} />
          ) : (
            <T style={[figure(76), { color: color.placeholder }]}>–</T>
          )}
          <T style={[type.bodyMedium, { color: color.inkMuted }]}>Resets Jan 1</T>
        </View>
        <View style={{ backgroundColor: color.surface, borderRadius: radius.card }}>
          {rows.map((row, i) => (
            <View
              key={row.label}
              style={{
                minHeight: 58,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: space.md,
                paddingHorizontal: space.xl,
                paddingVertical: space.sm,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: color.line,
              }}
            >
              <T style={[type.body, { fontFamily: font.medium, color: color.inkMuted }]}>{row.label}</T>
              <T style={[type.body, { fontFamily: font.semibold, flexShrink: 1, textAlign: 'right' }]}>{row.value}</T>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: space.xs }}>
          <View style={{ flex: 1.7 }}>
            <Button label="Update amount met" variant="light" onPress={onUpdateMet} disabled={!known} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Sources" variant="light" onPress={onSources} />
          </View>
        </View>
      </Screen>
      <TabPill current="plan" onHome={() => onTab('home')} onNew={() => onTab('new')} onPlan={() => onTab('plan')} />
    </View>
  );
}
