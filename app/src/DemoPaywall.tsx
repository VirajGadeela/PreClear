/**
 * The household plan paywall.
 *
 * This is a demo sheet, not a purchase. No store product exists yet and nothing
 * here touches RevenueCat — `onStart` simply flips the app's entitlement so the
 * paid tier can be seen working end to end. The sheet says this on screen; a
 * paywall that looked real while taking no money would be the one screen in this
 * app allowed to mislead, and it is not.
 *
 * When a RevenueCat key is present, `App.tsx` presents the real paywall instead
 * and this sheet is never shown. The switch is one condition, in one place.
 *
 * Compliance notes:
 *   - prices here are subscription prices, not medical estimates, so they do not
 *     render through <Money>. See the note in `plan.ts`.
 *   - no analytics, no tracking, nothing recorded about whether this was opened
 *     or dismissed (hard rule 2).
 */

import { useState } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DEMO_PLANS, PLAN_INCLUDES, PLAN_NAME } from './plan';
import { color, radius, space, type } from './theme';

export function DemoPaywall({
  visible,
  onClose,
  onStart,
  onRestore,
}: {
  visible: boolean;
  onClose: () => void;
  onStart: () => void;
  onRestore: () => void;
}) {
  const [selected, setSelected] = useState(DEMO_PLANS[0].id);
  const plan = DEMO_PLANS.find((item) => item.id === selected) ?? DEMO_PLANS[0];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.sheet}>
        <View style={styles.bar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            onPress={onClose}
            style={styles.close}
          >
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator
        >
          <Text style={styles.eyebrow}>{PLAN_NAME}</Text>
          <Text style={styles.title}>Watch the whole household</Text>
          <Text style={styles.lede}>
            A scan happens every few years. Bills arrive all year, for everyone
            on the plan.
          </Text>

          {/* Prices sit above the benefit list, not below it. The list runs to
              eight lines, and burying the choice under it means the pinned
              button commits to a term the member never saw. */}
          <Text style={styles.sectionLabel}>Choose a plan</Text>
          {DEMO_PLANS.map((option) => {
            const active = option.id === selected;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${option.term}, ${option.price} ${option.cadence}`}
                onPress={() => setSelected(option.id)}
                style={[styles.option, active && styles.optionActive]}
              >
                <View style={styles.optionMain}>
                  <View style={styles.optionHead}>
                    <Text style={styles.optionTerm}>{option.term}</Text>
                    {option.badge ? (
                      <Text style={styles.badge}>{option.badge}</Text>
                    ) : null}
                  </View>
                  {option.footnote ? (
                    <Text style={styles.optionFootnote}>{option.footnote}</Text>
                  ) : null}
                </View>
                <View style={styles.optionPrice}>
                  <Text style={[styles.price, active && styles.priceActive]}>
                    {option.price}
                  </Text>
                  <Text style={styles.cadence}>{option.cadence}</Text>
                </View>
              </Pressable>
            );
          })}

          <Text style={styles.sectionLabel}>What it watches</Text>
          <View style={styles.includes}>
            {PLAN_INCLUDES.map((line) => (
              <View key={line} style={styles.includeRow}>
                <Text style={styles.tick}>✓</Text>
                <Text style={styles.includeLine}>{line}</Text>
              </View>
            ))}
          </View>

          {/* Stated where the prices are, not only next to the button. */}
          <View style={styles.demoStrip}>
            <Text style={styles.demoText}>
              Demo pricing. Nothing is charged, no purchase is made and no
              payment details are collected — this unlocks the paid tier on this
              device so it can be seen working.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Restore a previous purchase"
            onPress={onRestore}
            style={styles.restore}
          >
            <Text style={styles.restoreText}>Restore purchase</Text>
          </Pressable>

          <Text style={styles.legal}>
            The scan comparison is free and stays free. The claims shown in this
            build are synthetic samples, not anyone's real records.
          </Text>
        </ScrollView>

        {/* Pinned. The benefit list is eight lines long by design, and a member
            should not have to reach the end of it to find the way to buy — or
            the sentence saying this build does not charge. */}
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Start the household plan, ${plan.term}, demo only`}
            onPress={onStart}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          >
            <Text style={styles.ctaText}>Start {plan.term.toLowerCase()} plan</Text>
          </Pressable>
          <Text style={styles.footerNote}>
            Demo only — nothing is charged and no purchase is made.
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: color.canvas },
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  close: { minHeight: 44, justifyContent: 'center' },
  closeText: { ...type.label, color: color.inkMuted },

  scrollView: { flex: 1 },
  scroll: { paddingHorizontal: space.lg, paddingBottom: space.xl * 2 },

  eyebrow: { ...type.label, color: color.accent, marginBottom: space.xs },
  title: { ...type.hero, color: color.ink, marginBottom: space.sm },
  lede: { ...type.body, color: color.inkMuted },

  includes: { gap: space.sm },
  includeRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  tick: { ...type.label, color: color.accent, width: 14 },
  includeLine: { ...type.body, color: color.ink, flex: 1 },

  sectionLabel: {
    ...type.label,
    color: color.inkMuted,
    marginTop: space.xl,
    marginBottom: space.md,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.line,
    padding: space.md + 2,
    marginBottom: space.sm,
  },
  // Selection is carried by the accent border and the price colour, the same
  // accent the recommended route uses. Nothing here uses hue to mean cheap.
  optionActive: { borderColor: color.accent, backgroundColor: color.accentSoft },
  optionMain: { flex: 1, gap: space.xs },
  optionHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  optionTerm: { ...type.body, fontWeight: '700', color: color.ink },
  badge: {
    ...type.caption,
    fontWeight: '700',
    color: color.accentInk,
    backgroundColor: color.accent,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  optionFootnote: { ...type.caption, color: color.inkMuted },
  optionPrice: { alignItems: 'flex-end' },
  price: { ...type.amount, color: color.ink },
  priceActive: { color: color.accent },
  cadence: { ...type.caption, color: color.inkMuted },

  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.line,
    backgroundColor: color.surface,
  },
  footerNote: {
    ...type.caption,
    color: color.inkMuted,
    textAlign: 'center',
    marginTop: space.sm,
  },
  cta: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.accent,
    borderRadius: radius.md,
    minHeight: 52,
  },
  ctaPressed: { opacity: 0.85 },
  ctaText: { ...type.body, fontWeight: '700', color: color.accentInk },

  demoStrip: {
    backgroundColor: color.flagBg,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
  },
  demoText: { ...type.caption, color: color.flag },

  restore: {
    alignItems: 'center',
    marginTop: space.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  restoreText: { ...type.caption, color: color.inkMuted },

  legal: { ...type.caption, color: color.inkMuted, marginTop: space.sm },
});
