/**
 * 10b · The math.
 *
 * The estimate taken apart, row by row, for the best insured route and (when
 * it was offered) the cash route, so a reader can check the ranking by hand.
 * Cents are shown here and nowhere else: this is the one screen where the
 * figures are meant to add up exactly.
 *
 * Every row is a field the engine already returned (`CostEstimate`,
 * `YearEstimate`). Nothing is recomputed.
 */

import { View } from 'react-native';

import { money } from '../costing';
import { Estimate, isCash } from '../estimate';
import { CARE_SHORT, CareKey } from '../flow';
import { Money } from '../Money';
import { dollars } from '../resultCopy';
import { Route } from '../routes';
import { color, font, radius, space, type } from '../theme';
import { Button, Heading, Link, Screen, T } from '../ui';

type Props = {
  estimate: Estimate;
  care: CareKey;
  careAmount: number;
  deductibleTotal: number;
  deductibleMet: number;
  oopTotal: number;
  onSources: () => void;
  onBack: () => void;
};

type Row = { label: string; note?: string; values: number[] };

const COLUMN = 104;

function shortName(route: Route): string {
  return route.facilityName.replace(/^IU Health /, 'IU ').replace(/ Health /, ' ').replace(/ Hospital$/, '');
}

export function TheMath({ estimate, care, careAmount, deductibleTotal, deductibleMet, oopTotal, onSources, onBack }: Props) {
  const insured = estimate.routes.find((route) => !isCash(route));
  const cash = estimate.routes.find(isCash);
  const columns = [insured, cash].filter((route): route is Route => Boolean(route));
  const pct = Math.round(estimate.benefits.coinsuranceRate * 100);

  const scanNote = (() => {
    if (!insured) return undefined;
    const scan = insured.estimate.scan;
    const parts = [`${money(scan.appliedToDeductible)} deductible`];
    if (scan.coinsurancePaid > 0) parts.push(`${pct}% of the rest`);
    if (scan.shieldedByOopMax > 0) parts.push('capped by your yearly max');
    return `Insurance: ${parts.join(' + ')}`;
  })();

  const rows: Row[] = [
    { label: 'Price before insurance', note: 'The hospital’s published rate or cash price', values: columns.map((r) => r.allowedAmount) },
    { label: 'You pay for the scan', note: scanNote, values: columns.map((r) => r.estimate.scan.patientPays) },
    { label: 'Counts toward deductible', values: columns.map((r) => r.estimate.scan.appliedToDeductible) },
    { label: 'Deductible left', note: 'After the scan', values: columns.map((r) => r.estimate.scan.benefitsAfter.deductibleRemaining) },
    {
      label: 'Later care',
      note: careAmount > 0 ? `${CARE_SHORT[care].charAt(0).toUpperCase()}${CARE_SHORT[care].slice(1)}, ${money(careAmount)} in bills` : 'None planned',
      values: columns.map((r) => r.estimate.expectedOtherCareCost),
    },
  ];

  const cell = (value: number, strong = false) => (
    <View style={{ width: COLUMN, alignItems: 'flex-end' }}>
      <Money
        value={value}
        cents
        stacked
        style={[
          strong ? { fontFamily: font.extrabold, fontSize: 18, lineHeight: 22 } : { fontFamily: font.semibold, fontSize: 15, lineHeight: 20 },
          { textAlign: 'right', fontVariant: ['tabular-nums'] },
        ]}
        suffixSize={11}
        maxScale={1.3}
      />
    </View>
  );

  return (
    <Screen onBack={onBack} footer={<Button label="Got it" onPress={onBack} />} contentStyle={{ paddingHorizontal: space.xl }}>
      <Heading style={{ paddingHorizontal: space.xs }}>The math</Heading>
      <T style={[type.small, { color: color.inkMuted, marginTop: space.sm, paddingHorizontal: space.xs }]}>
        {dollars(deductibleMet)} of your {dollars(deductibleTotal)} deductible met. {pct}% coinsurance after.{' '}
        {dollars(oopTotal)} yearly max.
      </T>
      <Link label="Sources" onPress={onSources} />

      <View style={{ backgroundColor: color.surface, borderRadius: radius.card, paddingHorizontal: 18, marginTop: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingVertical: space.sm + 2, borderBottomWidth: 1, borderBottomColor: color.line }}>
          <View style={{ flex: 1 }} />
          {columns.map((route) => (
            <View key={route.kind} style={{ width: COLUMN, alignItems: 'flex-end' }}>
              <T style={[type.small, { fontFamily: font.semibold, color: isCash(route) ? color.ink : color.accentDeep }]}>
                {isCash(route) ? 'Cash' : 'Insurance'}
              </T>
              <T style={[type.caption, { color: color.inkMuted, textAlign: 'right' }]} numberOfLines={2}>
                {shortName(route)}
              </T>
            </View>
          ))}
        </View>

        {rows.map((row) => (
          <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm + 2, borderBottomWidth: 1, borderBottomColor: color.line }}>
            <View style={{ flex: 1, paddingRight: space.sm, gap: 2 }}>
              <T style={[type.bodyMedium, { fontFamily: font.medium }]}>{row.label}</T>
              {row.note ? <T style={[type.caption, { fontSize: 12, lineHeight: 16, color: color.inkSubtle }]}>{row.note}</T> : null}
            </View>
            {row.values.map((value, i) => <View key={i}>{cell(value)}</View>)}
          </View>
        ))}

        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md }}>
          <T style={[type.rowTitle, { flex: 1, fontFamily: font.bold }]}>Total this year</T>
          {columns.map((route) => (
            <View key={route.kind}>{cell(route.estimate.totalThisYear, true)}</View>
          ))}
        </View>
      </View>

      <T style={[type.caption, { color: color.inkSubtle, marginTop: space.md, paddingHorizontal: space.xs }]}>
        Room left under your yearly max assumes the deductible met is all you’ve paid so far this year.
      </T>
    </Screen>
  );
}
