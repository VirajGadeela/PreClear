/**
 * 09 · All routes.
 *
 * The engine's routes, cheapest year first: two to four of them, never a fixed
 * number. A cheaper-hospital route appears only when there is a real saving,
 * a fix-the-order route only when a published criterion is not recorded, and
 * cash only when the member is not expected to reach their deductible. When
 * cash is held back, a line says why, so its absence is not mistaken for a gap.
 *
 * Every row says whether its payment counts toward the deductible. That clause
 * is the thesis of the product, not fine print, and it stays on every row.
 */

import { Pressable, View } from 'react-native';

import { CARE_SHORT, CareKey } from '../flow';
import { Estimate } from '../estimate';
import { Money } from '../Money';
import { creditClause, kindLabel } from '../resultCopy';
import { Route } from '../routes';
import { color, figure, radius, space, type } from '../theme';
import { Button, Heading, Screen, T, Tag } from '../ui';

type Props = {
  estimate: Estimate;
  care: CareKey;
  booked: boolean;
  onOpen: (route: Route) => void;
  onBack: () => void;
};

export function AllRoutes({ estimate, care, booked, onOpen, onBack }: Props) {
  return (
    <Screen onBack={onBack} footer={<Button label="Got it" onPress={onBack} />}>
      <Heading>All routes</Heading>
      <T style={[type.bodyMedium, { color: color.inkMuted, marginTop: space.sm, marginBottom: space.lg }]}>
        What you’d pay this year, including {CARE_SHORT[care]}.
      </T>
      <View style={{ gap: 10 }}>
        {estimate.routes.map((route, i) => (
          <Pressable
            key={route.kind}
            accessibilityRole="button"
            accessibilityHint="Opens this route"
            onPress={() => onOpen(route)}
            style={({ pressed }) => [
              {
                backgroundColor: color.surface,
                borderRadius: radius.card,
                paddingHorizontal: space.xl,
                paddingVertical: 18,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                borderWidth: 2,
                borderColor: i === 0 ? color.accent : 'transparent',
              },
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={{ flex: 1, gap: 5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                <T style={[type.mono, { color: color.inkMuted }]}>{kindLabel(route, booked)}</T>
                {i === 0 ? <Tag label="Best" /> : null}
              </View>
              <T style={type.rowTitle}>{route.facilityName}</T>
              <T style={[type.small, { color: color.inkMuted }]}>
                Scan <Money value={route.estimate.scan.patientPays} style={[type.small, { color: color.inkMuted }]} suffixSize={14} maxScale={2} /> · {creditClause(route)}
              </T>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Money value={route.estimate.totalThisYear} style={[figure(26, 'bold'), { textAlign: 'right' }]} suffixSize={12} stacked />
              <T style={[type.caption, { color: color.inkMuted }]}>this year</T>
            </View>
          </Pressable>
        ))}
      </View>
      {!estimate.cashOffered ? (
        <T style={[type.small, { color: color.inkMuted, marginTop: space.lg, paddingHorizontal: space.xs }]}>
          No cash route: with {CARE_SHORT[care]} ahead you’re expected to reach your deductible, and cash would earn none of it.
        </T>
      ) : null}
    </Screen>
  );
}
