/**
 * 08 · Best route.
 *
 * The answer, on the blue ground the welcome story ends on: what the best
 * route costs for the scan, where, and what it saves over the year against the
 * best route of the other kind. "Best" means the lowest estimated total for
 * the year. It is the engine's rank 1, nothing more.
 *
 * When the order does not record one of the insurer's published criteria, a
 * row says so and opens the checklist. That is paperwork for the doctor's
 * office, never a prediction about a claim.
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';

import { Estimate } from '../estimate';
import { Money } from '../Money';
import { saveLine, verb } from '../resultCopy';
import { color, figure, font, space, textScale, type } from '../theme';
import { Button, CloseButton, Link, Screen, T } from '../ui';

type Props = {
  estimate: Estimate;
  saved: boolean;
  onToggleSave: () => void;
  onViewSaved: () => void;
  onClose: () => void;
  onRoutes: () => void;
  onWhy: () => void;
  onChecklist: () => void;
  onSources: () => void;
};

export function Answer({ estimate, saved, onToggleSave, onViewSaved, onClose, onRoutes, onWhy, onChecklist, onSources }: Props) {
  const best = estimate.routes[0];
  const { width } = useWindowDimensions();
  const [toast, setToast] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const toggle = () => {
    if (timer.current) clearTimeout(timer.current);
    if (!saved) {
      setToast(true);
      timer.current = setTimeout(() => setToast(false), 3200);
    } else {
      setToast(false);
    }
    onToggleSave();
  };

  const saveButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      onPress={toggle}
      style={({ pressed }) => [
        {
          minHeight: 44,
          paddingLeft: 14,
          paddingRight: 18,
          borderRadius: 22,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          backgroundColor: saved ? color.surface : 'rgba(255,255,255,0.16)',
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={saved ? 'checkmark' : 'bookmark-outline'} size={18} color={saved ? color.accentDeep : color.onAccent} />
      <T style={[type.bodyMedium, { fontFamily: font.semibold, color: saved ? color.accentDeep : color.onAccent }]}>
        {saved ? 'Saved' : 'Save estimate'}
      </T>
    </Pressable>
  );

  if (!best) {
    return (
      <Screen tone="accent" headerLeft={<CloseButton onPress={onClose} />}>
        <T style={[type.title, { color: color.onAccent }]}>No published price for this scan and insurer.</T>
        <T style={[type.body, { color: color.onAccentMuted, marginTop: space.md }]}>
          None of the hospitals Preclear reads publishes a usable rate for this combination.
        </T>
      </Screen>
    );
  }

  const line = saveLine(estimate.routes);
  const unmet = estimate.unmet.length;

  return (
    <Screen
      tone="accent"
      headerLeft={<CloseButton onPress={onClose} />}
      headerRight={saveButton}
      footer={
        <>
          <Button label="See all routes" variant="white" onPress={onRoutes} />
          <Button label="Why this route?" variant="outline" onPress={onWhy} />
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
            <T style={[type.caption, { color: color.onAccent }]}>Estimate based on your plan. Not a quote.</T>
            <Link label="Sources" tone="onAccent" onPress={onSources} />
          </View>
        </>
      }
      contentStyle={{ justifyContent: 'center', paddingHorizontal: space.page + 4 }}
    >
      <View style={{ gap: space.md + 2 }}>
        <T style={[type.rowTitle, { color: color.onAccent }]}>{estimate.procedure.label} · best route</T>
        <Money
          value={best.estimate.scan.patientPays}
          style={[figure(96), { color: color.onAccent }]}
          suffixSize={18}
          stacked
          fitWidth={width - 64}
        />
        <T style={[type.headline, { color: color.onAccent }]} maxFontSizeMultiplier={textScale.heading}>
          {verb(best)} at {best.facilityName}
        </T>
        {line ? (
          <View style={{ alignSelf: 'flex-start', marginTop: space.sm, backgroundColor: color.surface, borderRadius: 20, paddingHorizontal: space.lg, paddingVertical: 10 }}>
            <T style={[type.bodyMedium, { fontFamily: font.semibold, color: color.accentDeep }]}>{line}</T>
          </View>
        ) : null}
        {unmet > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={onChecklist}
            style={({ pressed }) => [
              {
                marginTop: space.sm,
                minHeight: 52,
                borderRadius: 20,
                borderWidth: 1.5,
                borderColor: 'rgba(255,255,255,0.5)',
                paddingHorizontal: space.lg,
                paddingVertical: space.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="document-text-outline" size={20} color={color.onAccent} />
            <T style={[type.bodyMedium, { fontFamily: font.semibold, color: color.onAccent, flex: 1 }]}>
              {unmet === 1 ? '1 published criterion' : `${unmet} published criteria`} to check on your order
            </T>
            <Ionicons name="chevron-forward" size={18} color={color.onAccent} />
          </Pressable>
        ) : null}
      </View>

      {toast ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            position: 'absolute',
            top: 0,
            left: space.xl,
            right: space.xl,
            minHeight: 60,
            borderRadius: 30,
            backgroundColor: color.surface,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            paddingLeft: 10,
            paddingRight: 8,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 17,
            shadowOffset: { width: 0, height: 14 },
          }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={18} color={color.onAccent} />
          </View>
          <View style={{ flex: 1 }}>
            <T style={[type.bodyMedium, { fontFamily: font.semibold }]}>Saved to Estimates</T>
            <T style={[type.caption, { color: color.inkMuted }]}>Find it on your Estimates screen</T>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setToast(false);
              onViewSaved();
            }}
            style={({ pressed }) => [
              { minHeight: 44, paddingHorizontal: space.lg, borderRadius: 22, backgroundColor: color.accentTint, justifyContent: 'center' },
              pressed && { opacity: 0.7 },
            ]}
          >
            <T style={[type.small, { fontFamily: font.semibold, color: color.accentDeep }]}>View</T>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}
