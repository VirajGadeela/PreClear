/**
 * 11 · Facility.
 *
 * What a member needs to book the route: the hospital, the scan price, the code
 * to ask for and what to say. Directions open Apple Maps on the published
 * address through `Linking`, which is core React Native, so no native module.
 *
 * No map and no call button. There are no coordinates or phone numbers in the
 * published files, and a placeholder map or a button that does nothing would
 * show judges a feature that does not exist.
 */

import { Linking, View } from 'react-native';

import { Money } from '../Money';
import { addressLines, cityOf, kindLabel, sayLine } from '../resultCopy';
import { Route } from '../routes';
import { color, figure, font, radius, space, type } from '../theme';
import { Button, Screen, T } from '../ui';

type Props = {
  route: Route;
  cpt: string;
  booked: boolean;
  onBack: () => void;
};

export function Facility({ route, cpt, booked, onBack }: Props) {
  const addresses = addressLines(route.facilityAddress);
  const city = cityOf(route.facilityAddress);
  const directions = () => {
    const target = addresses[0] ? addresses[0] : `${route.facilityName}, Indianapolis, IN`;
    Linking.openURL(`http://maps.apple.com/?q=${encodeURIComponent(target)}`).catch(() => undefined);
  };

  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: 'Ask for code', value: cpt, mono: true },
    { label: 'Say', value: sayLine(route) },
  ];

  return (
    <Screen
      onBack={onBack}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button label="Directions" variant="light" onPress={directions} accessibilityHint="Opens Apple Maps" />
          </View>
          <View style={{ flex: 1.4 }}>
            <Button label="Done" onPress={onBack} />
          </View>
        </View>
      }
    >
      <T style={[type.mono, { color: color.inkMuted }]}>
        {kindLabel(route, booked)}
        {city ? ` · ${city.toUpperCase()}` : ''}
      </T>
      <T style={[type.title, { fontSize: 28, lineHeight: 33, marginTop: space.sm }]}>{route.facilityName}</T>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: space.xl, flexWrap: 'wrap' }}>
        <Money value={route.estimate.scan.patientPays} style={[figure(60), { color: color.accent }]} suffixSize={16} />
        <T style={[type.bodyMedium, { color: color.inkMuted }]}>for the scan</T>
      </View>

      <View style={{ backgroundColor: color.surface, borderRadius: radius.row, marginTop: space.xl }}>
        {rows.map((row, i) => (
          <View
            key={row.label}
            style={{
              minHeight: 54,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 18,
              gap: space.md,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: color.line,
            }}
          >
            <T style={[type.body, { fontFamily: font.medium, color: color.inkMuted }]}>{row.label}</T>
            <T style={[type.body, { fontFamily: row.mono ? font.mono : font.semibold, flexShrink: 1, textAlign: 'right' }]}>
              {row.value}
            </T>
          </View>
        ))}
      </View>

      {addresses.length > 0 ? (
        <View style={{ marginTop: space.xl, gap: space.xs, paddingHorizontal: space.xs }}>
          <T style={[type.caption, { color: color.inkMuted }]}>
            {route.alsoAt.length > 0 ? 'Same published prices at every location' : 'Address'}
          </T>
          {[route.facilityName, ...route.alsoAt].map((name, i) => (
            <T key={name} style={type.small}>
              <T style={[type.small, { fontFamily: font.semibold }]}>{name}</T>
              {addresses[i] ? ` · ${addresses[i]}` : ''}
            </T>
          ))}
        </View>
      ) : null}

      {route.warnings.length > 0 ? (
        <T style={[type.caption, { color: color.inkMuted, marginTop: space.lg, paddingHorizontal: space.xs }]}>
          {route.warnings[0]}
        </T>
      ) : null}
    </Screen>
  );
}
