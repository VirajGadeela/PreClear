/**
 * 14 · Sources: where every number comes from, and what is not covered.
 *
 * The scope statement matters as much as the sources. Prices cover one metro,
 * two large systems publish nothing usable, and the order check covers three
 * of the ten scans. Saying so here is what keeps the rest of the app from
 * overstating what it knows.
 */

import { Ionicons } from '@expo/vector-icons';
import { Linking, View } from 'react-native';

import { color, radius, space, type } from '../theme';
import { Button, Heading, IconWell, Link, Screen, T } from '../ui';

type Item = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  meta: string;
  url?: string;
};

const ITEMS: Item[] = [
  {
    icon: 'business-outline',
    title: 'Hospital prices',
    body: 'Cash and insurer-negotiated prices from Indianapolis-area hospitals’ price transparency files, which a federal rule has required since 2021.',
    meta: 'Extracted August and October 2026',
    url: 'https://www.cms.gov/priorities/key-initiatives/hospital-price-transparency',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Insurer imaging rules',
    body: 'Guidelines insurers use to review imaging orders, such as Carelon Medical Benefits Management for Anthem.',
    meta: 'Knee MRI, lower back MRI and head CT · each rule names its document and effective date',
  },
  {
    icon: 'person-outline',
    title: 'Your plan details',
    body: 'The deductible, coinsurance and out-of-pocket max you enter. Preclear doesn’t connect to your insurer or doctor.',
    meta: 'Entered by you',
  },
  {
    icon: 'barcode-outline',
    title: 'Billing codes',
    body: 'CPT codes for each scan, maintained by the American Medical Association.',
    meta: 'One code per scan',
  },
];

export function Sources({ onBack }: { onBack: () => void }) {
  return (
    <Screen onBack={onBack} footer={<Button label="Got it" onPress={onBack} />} contentStyle={{ paddingHorizontal: space.xl }}>
      <Heading style={{ paddingHorizontal: space.xs }}>Sources</Heading>
      <T style={[type.bodyMedium, { color: color.inkMuted, marginTop: space.sm, paddingHorizontal: space.xs }]}>
        Where Preclear’s numbers come from.
      </T>
      <View style={{ gap: 10, marginTop: space.lg }}>
        {ITEMS.map((item) => (
          <View
            key={item.title}
            style={{ backgroundColor: color.surface, borderRadius: radius.card, paddingHorizontal: space.xl, paddingVertical: 18, flexDirection: 'row', gap: 14 }}
          >
            <IconWell name={item.icon} />
            <View style={{ flex: 1, gap: space.xs }}>
              <T style={type.rowTitle}>{item.title}</T>
              <T style={[type.small, { color: color.inkMuted }]}>{item.body}</T>
              <T style={[type.caption, { color: color.inkSubtle, marginTop: 2 }]}>{item.meta}</T>
              {item.url ? (
                <Link label="View source ›" onPress={() => Linking.openURL(item.url as string).catch(() => undefined)} />
              ) : null}
            </View>
          </View>
        ))}
        <T style={[type.small, { color: color.inkMuted, paddingHorizontal: space.sm, paddingTop: space.sm }]}>
          Not included: Community Health Network and St. Vincent Indianapolis don’t publish usable prices. All results are estimates, not quotes.
        </T>
      </View>
    </Screen>
  );
}
