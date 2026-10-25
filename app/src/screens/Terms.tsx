/**
 * 01b · Before you start.
 *
 * Three things a member should know before they type anything. The checkbox is
 * kept from the walkthrough, but it agrees to these three points rather than
 * to a Terms of Service and Privacy Policy: neither document exists, and links
 * that go nowhere are worse than none.
 */

import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { color, radius, space, type } from '../theme';
import { Button, Heading, IconWell, Screen, T } from '../ui';

const POINTS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'receipt-outline',
    title: 'It’s an estimate',
    body: 'Your real bill can differ. Confirm the price with the facility before you book.',
  },
  {
    icon: 'medkit-outline',
    title: 'Not medical advice',
    body: 'Ask your doctor which scan you need. Preclear only compares costs.',
  },
  {
    icon: 'lock-closed-outline',
    title: 'Your info stays private',
    body: 'We never sell your health or insurance details.',
  },
];

type Props = {
  agreed: boolean;
  onToggle: () => void;
  onBack: () => void;
  onNext: () => void;
};

export function Terms({ agreed, onToggle, onBack, onNext }: Props) {
  return (
    <Screen onBack={onBack} footer={<Button label="Agree and continue" onPress={onNext} disabled={!agreed} />}>
      <Heading>Before you start</Heading>
      <T style={[type.body, { color: color.inkMuted, marginTop: space.sm }]}>Three quick things to know.</T>
      <View style={{ backgroundColor: color.surface, borderRadius: radius.card, marginTop: space.xxl }}>
        {POINTS.map((point, i) => (
          <View
            key={point.title}
            style={{
              flexDirection: 'row',
              gap: 14,
              paddingHorizontal: 18,
              paddingVertical: space.lg,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: color.line,
            }}
          >
            <IconWell name={point.icon} />
            <View style={{ flex: 1, gap: 3 }}>
              <T style={type.rowTitle}>{point.title}</T>
              <T style={[type.small, { color: color.inkMuted }]}>{point.body}</T>
            </View>
          </View>
        ))}
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        onPress={onToggle}
        style={({ pressed }) => [
          { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: space.xl, paddingHorizontal: space.xs, minHeight: 44 },
          pressed && { opacity: 0.7 },
        ]}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: agreed ? color.accent : color.surface,
            borderWidth: agreed ? 0 : 2,
            borderColor: color.border,
          }}
        >
          {agreed ? <Ionicons name="checkmark" size={18} color={color.onAccent} /> : null}
        </View>
        <T style={[type.bodyMedium, { flex: 1 }]}>I understand these three things.</T>
      </Pressable>
    </Screen>
  );
}
