/**
 * The walkthrough's building blocks, shared by every screen.
 *
 * Two rules from CLAUDE.md shape all of these:
 *
 *   - Every control is at least `TAP_TARGET` (44pt) in both directions, and
 *     every Pressable has a pressed style. On a touch screen the pressed state
 *     is the focus state; there is no hover and no keyboard ring to fall back
 *     on.
 *   - A scrolling body inside a flex column carries `flex: 1` itself. Without
 *     it the ScrollView sizes to its content, overflows, and the button at the
 *     bottom becomes unreachable. The primary button sits outside the scroll,
 *     pinned, so it can never scroll away.
 */

import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Component, ReactNode } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextProps,
  View,
  ViewStyle,
} from 'react-native';

import { TAP_TARGET, color, font, radius, space, textScale, type } from './theme';

/** Text with the body Dynamic Type cap. */
export function T({ style, maxFontSizeMultiplier, ...rest }: TextProps) {
  return (
    <Text
      {...rest}
      style={[{ color: color.ink }, style]}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? textScale.body}
    />
  );
}

/** A screen heading, capped lower than body text. */
export function Heading({ children, style }: { children: ReactNode; style?: StyleProp<any> }) {
  return (
    <T accessibilityRole="header" style={[type.display, style]} maxFontSizeMultiplier={textScale.heading}>
      {children}
    </T>
  );
}

export function BackButton({ onPress, tone = 'light' }: { onPress: () => void; tone?: 'light' | 'accent' }) {
  const onAccent = tone === 'accent';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.circle,
        onAccent ? styles.circleOnAccent : styles.circleLight,
        pressed && { opacity: 0.6 },
      ]}
    >
      <Ionicons name="chevron-back" size={24} color={onAccent ? color.onAccent : color.ink} />
    </Pressable>
  );
}

export function CloseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      onPress={onPress}
      style={({ pressed }) => [styles.circle, styles.circleOnAccent, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name="close" size={22} color={color.onAccent} />
    </Pressable>
  );
}

export function Progress({ index, total }: { index: number; total: number }) {
  return (
    <View
      style={styles.progress}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${index + 1} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[styles.progressSegment, { backgroundColor: i <= index ? color.ink : color.trackStrong }]}
        />
      ))}
    </View>
  );
}

type ScreenProps = {
  tone?: 'light' | 'accent';
  onBack?: () => void;
  progress?: { index: number; total: number };
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
  /** Hide the header row entirely (home tabs, calculating). */
  bare?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({
  tone = 'light',
  onBack,
  progress,
  headerLeft,
  headerRight,
  bare = false,
  children,
  footer,
  scroll = true,
  contentStyle,
}: ScreenProps) {
  const onAccent = tone === 'accent';
  const body = [styles.body, contentStyle];
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: onAccent ? color.accent : color.canvas }]}>
      <StatusBar style={onAccent ? 'light' : 'dark'} />
      {!bare && (
        <View style={styles.header}>
          <View style={styles.headerSide}>
            {headerLeft ?? (onBack ? <BackButton onPress={onBack} tone={tone} /> : null)}
          </View>
          {progress ? <Progress {...progress} /> : <View />}
          <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>{headerRight}</View>
        </View>
      )}
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.scroll, body]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** dark: the default. white: on a blue screen. light: a secondary on the canvas. outline: secondary on blue. */
  variant?: 'dark' | 'white' | 'light' | 'outline';
  accessibilityHint?: string;
};

export function Button({ label, onPress, disabled = false, variant = 'dark', accessibilityHint }: ButtonProps) {
  const look = BUTTONS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityHint={accessibilityHint}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        look.box,
        disabled && { opacity: 0.35 },
        pressed && !disabled && { opacity: 0.75 },
      ]}
    >
      <T style={[type.button, look.text]} maxFontSizeMultiplier={textScale.heading}>
        {label}
      </T>
    </Pressable>
  );
}

const BUTTONS = {
  dark: { box: { backgroundColor: color.ink }, text: { color: color.onAccent } },
  white: { box: { backgroundColor: color.surface }, text: { color: color.accentDeep } },
  light: { box: { backgroundColor: color.surface }, text: { color: color.ink } },
  outline: {
    box: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' },
    text: { color: color.onAccent },
  },
};

/** The selected/unselected radio from the walkthrough. */
export function Radio({ selected }: { selected: boolean }) {
  return (
    <View
      style={[
        styles.radio,
        selected
          ? { backgroundColor: color.accent, borderWidth: 7, borderColor: color.accentTint }
          : { borderWidth: 2, borderColor: color.border },
      ]}
    />
  );
}

export function ChoiceList({ children }: { children: ReactNode }) {
  return <View style={styles.list}>{children}</View>;
}

type ChoiceRowProps = {
  label: string;
  sub?: string;
  selected: boolean;
  onPress: () => void;
  first?: boolean;
  leading?: ReactNode;
  large?: boolean;
};

export function ChoiceRow({ label, sub, selected, onPress, first, leading, large }: ChoiceRowProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !first && styles.rowDivided,
        pressed && { backgroundColor: color.canvas },
      ]}
    >
      {leading}
      <View style={{ flex: 1 }}>
        <T style={large ? type.rowLarge : type.rowTitle}>{label}</T>
        {sub ? <T style={[type.small, { color: color.inkMuted, marginTop: 2 }]}>{sub}</T> : null}
      </View>
      <Radio selected={selected} />
    </Pressable>
  );
}

/** A large selectable card: the MRI/CT tiles and the planned-care options. */
export function Tile({
  selected,
  onPress,
  children,
  style,
  accessibilityLabel,
}: {
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: selected ? color.accentTint : color.surface,
          borderColor: selected ? color.accent : 'transparent',
        },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Tag({ label, tone = 'accent' }: { label: string; tone?: 'accent' | 'tint' | 'neutral' }) {
  const look =
    tone === 'accent'
      ? { backgroundColor: color.accent, color: color.onAccent }
      : tone === 'tint'
        ? { backgroundColor: color.accentTint, color: color.accentDeep }
        : { backgroundColor: color.track, color: color.ink };
  return (
    <View style={[styles.tag, { backgroundColor: look.backgroundColor }]}>
      <T style={[type.tag, { color: look.color }]} maxFontSizeMultiplier={textScale.heading}>
        {label}
      </T>
    </View>
  );
}

/** A tappable text link, with a full-size target. */
export function Link({ label, onPress, tone = 'accent' }: { label: string; onPress: () => void; tone?: 'accent' | 'onAccent' }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}
    >
      <T
        style={[
          type.small,
          { fontFamily: font.semibold, color: tone === 'accent' ? color.accentDeep : color.onAccent },
          tone === 'onAccent' && { textDecorationLine: 'underline' },
        ]}
      >
        {label}
      </T>
    </Pressable>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export function Keypad({ onKey }: { onKey: (key: string) => void }) {
  return (
    <View style={styles.keypad}>
      {KEYS.map((key, i) =>
        key === '' ? (
          <View key={i} style={styles.key} />
        ) : (
          <Pressable
            key={i}
            accessibilityRole="keyboardkey"
            accessibilityLabel={key === '⌫' ? 'Delete' : key}
            onPress={() => onKey(key)}
            style={({ pressed }) => [styles.key, pressed && { backgroundColor: color.track }]}
          >
            {key === '⌫' ? (
              <Ionicons name="backspace-outline" size={28} color={color.ink} />
            ) : (
              <T style={styles.keyText} maxFontSizeMultiplier={textScale.figure}>
                {key}
              </T>
            )}
          </Pressable>
        ),
      )}
    </View>
  );
}

export type HomeTab = 'home' | 'plan';

export function TabPill({ current, onHome, onNew, onPlan }: { current: HomeTab; onHome: () => void; onNew: () => void; onPlan: () => void }) {
  const item = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pillItem,
        active && { backgroundColor: color.track },
        pressed && { opacity: 0.7 },
      ]}
    >
      <T style={[type.rowTitle, { color: active ? color.ink : color.inkMuted }]} maxFontSizeMultiplier={textScale.heading}>
        {label}
      </T>
    </Pressable>
  );
  return (
    <View style={styles.pillWrap} pointerEvents="box-none">
      <View style={styles.pill}>
        {item('Estimates', current === 'home', onHome)}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New estimate"
          onPress={onNew}
          style={({ pressed }) => [styles.pillPlus, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="add" size={30} color={color.onAccent} />
        </Pressable>
        {item('Plan', current === 'plan', onPlan)}
      </View>
    </View>
  );
}

export function Segmented({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (key: string) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.key)}
            style={({ pressed }) => [
              styles.segment,
              active && styles.segmentActive,
              pressed && !active && { opacity: 0.7 },
            ]}
          >
            <T style={[type.bodyMedium, { fontFamily: font.semibold, color: active ? color.ink : color.inkMuted }]}>
              {option.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A circular icon well, as in the walkthrough's Sources and Before-you-start rows. */
export function IconWell({ name }: { name: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.iconWell}>
      <Ionicons name={name} size={20} color={color.accentDeep} />
    </View>
  );
}

/**
 * Catches a render error so one broken screen cannot blank the app.
 * A class, because React has no hook for this.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: color.canvas, justifyContent: 'center', padding: space.page }]}>
        <Heading>Something went wrong.</Heading>
        <T style={[type.body, { color: color.inkMuted, marginTop: space.sm, marginBottom: space.xxl }]}>
          Nothing you entered left this phone. Start again from the beginning.
        </T>
        <Button
          label="Start again"
          onPress={() => {
            this.setState({ failed: false });
            this.props.onReset();
          }}
        />
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    minHeight: 60,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSide: { minWidth: TAP_TARGET, flexDirection: 'row' },
  scroll: { flex: 1 },
  body: { paddingHorizontal: space.page, paddingTop: space.xl, paddingBottom: space.xxl, flexGrow: 1 },
  footer: { paddingHorizontal: space.page, paddingTop: space.md, paddingBottom: space.lg, gap: space.md - 2 },
  circle: { width: TAP_TARGET, height: TAP_TARGET, borderRadius: TAP_TARGET / 2, alignItems: 'center', justifyContent: 'center' },
  circleLight: {
    backgroundColor: color.surface,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  circleOnAccent: { backgroundColor: 'rgba(255,255,255,0.16)' },
  progress: { flexDirection: 'row', gap: 5 },
  progressSegment: { width: 18, height: 4, borderRadius: 2 },
  button: { minHeight: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  radio: { width: 24, height: 24, borderRadius: 12 },
  list: { backgroundColor: color.surface, borderRadius: radius.card, paddingVertical: space.xs, overflow: 'hidden' },
  row: { minHeight: 58, paddingHorizontal: space.xl, paddingVertical: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md + 2 },
  rowDivided: { borderTopWidth: 1, borderTopColor: color.line },
  tile: { borderRadius: radius.card, padding: 18, borderWidth: 2 },
  card: { backgroundColor: color.surface, borderRadius: radius.card, padding: space.xl + 2 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: 10 },
  link: { minHeight: TAP_TARGET, justifyContent: 'center', alignSelf: 'flex-start' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap' },
  key: { width: '33.333%', height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 32 },
  keyText: { fontFamily: font.semibold, fontSize: 30, lineHeight: 36, color: color.ink },
  pillWrap: { position: 'absolute', left: 0, right: 0, bottom: 30, alignItems: 'center' },
  pill: {
    height: 68,
    paddingHorizontal: 6,
    borderRadius: 34,
    backgroundColor: color.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
  },
  pillItem: { height: 56, paddingHorizontal: 22, borderRadius: 28, justifyContent: 'center' },
  pillPlus: { width: 56, height: 56, borderRadius: 28, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  segmented: { flexDirection: 'row', padding: 4, borderRadius: radius.card, backgroundColor: color.track },
  segment: { flex: 1, minHeight: TAP_TARGET, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  segmentActive: {
    backgroundColor: color.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  iconWell: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.accentTint, alignItems: 'center', justifyContent: 'center' },
});
