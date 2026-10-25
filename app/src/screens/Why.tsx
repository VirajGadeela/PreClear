/**
 * 10 · Why this route?
 *
 * The thesis, applied to this member's numbers. The paragraph follows whichever
 * route won, so it says cash wins when cash wins. The bars show what each kind
 * of payment adds toward the deductible. The cash bar appears only when the
 * cash route was offered, so this screen never argues against a route the
 * member was not shown.
 */

import { View } from 'react-native';

import { Estimate, isCash } from '../estimate';
import { CareKey } from '../flow';
import { Money } from '../Money';
import { whyText } from '../resultCopy';
import { color, figure, font, radius, space, type } from '../theme';
import { Button, Heading, Screen, T } from '../ui';

type Props = {
  estimate: Estimate;
  care: CareKey;
  deductibleTotal: number;
  deductibleMet: number;
  onMath: () => void;
  onBack: () => void;
};

function Bar({ label, value, total, fill }: { label: string; value: number; total: number; fill: string }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <View style={{ gap: space.sm, marginTop: space.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T style={type.rowTitle}>{label}</T>
        <Money value={value} style={[type.rowTitle, { fontVariant: ['tabular-nums'] }]} suffixSize={13} />
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: color.track, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${pct}%`, borderRadius: 5, backgroundColor: fill }} />
      </View>
    </View>
  );
}

export function Why({ estimate, care, deductibleTotal, deductibleMet, onMath, onBack }: Props) {
  const routes = estimate.routes;
  const best = routes[0];
  const insured = routes.find((route) => !isCash(route));
  const cash = routes.find(isCash);
  const worst = routes[routes.length - 1];
  const saves = best && worst ? worst.estimate.totalThisYear - best.estimate.totalThisYear : 0;

  return (
    <Screen
      onBack={onBack}
      footer={
        <>
          <Button label="See the math" variant="light" onPress={onMath} />
          <Button label="Got it" onPress={onBack} />
        </>
      }
      contentStyle={{ paddingHorizontal: space.page + 4 }}
    >
      <Heading>Cash doesn’t count toward your deductible.</Heading>
      <T style={[type.body, { fontSize: 17, lineHeight: 25, color: color.inkMuted, marginTop: space.lg }]}>
        {whyText(routes, care, estimate.cashOffered)}
      </T>

      <View style={{ marginTop: space.xxl, backgroundColor: color.surface, borderRadius: radius.card, padding: space.xl + 2 }}>
        <T style={[type.caption, { color: color.inkMuted }]}>
          Toward your <Money value={deductibleTotal} style={[type.caption, { color: color.inkMuted }]} suffixSize={13} maxScale={2} /> deductible
        </T>
        {insured ? (
          <Bar
            label="Insurance"
            value={deductibleMet + insured.estimate.deductibleCreditEarned}
            total={deductibleTotal}
            fill={color.accent}
          />
        ) : null}
        {cash ? <Bar label="Cash" value={deductibleMet} total={deductibleTotal} fill={color.ink} /> : null}

        {best && worst && saves > 0.005 ? (
          <>
            <View style={{ height: 1, backgroundColor: color.line, marginTop: space.xl + 2, marginBottom: 18 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md }}>
              <View style={{ flex: 1, gap: 3 }}>
                <T style={type.rowTitle}>Your cheapest option saves</T>
                <T style={[type.caption, { color: color.inkSubtle }]}>
                  Compared with {isCash(worst) ? 'cash' : 'insurance'} at {worst.facilityName},{' '}
                  <Money value={worst.estimate.totalThisYear} style={[type.caption, { color: color.inkSubtle }]} suffixSize={13} maxScale={2} /> this year
                </T>
              </View>
              <Money
                value={saves}
                style={[figure(32), { color: color.accent }]}
                suffixSize={13}
                stacked
              />
            </View>
          </>
        ) : null}
      </View>
    </Screen>
  );
}
