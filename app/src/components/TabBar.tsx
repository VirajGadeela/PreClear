/**
 * The app's three destinations, always reachable.
 *
 * This replaces a numbered step bar, and the difference is not cosmetic. A step
 * bar says "you are part-way through a sequence"; there is no sequence now. The
 * screener answers on arrival, and the other two destinations are places you go
 * rather than stages you pass.
 *
 * Hand-rolled rather than react-navigation. That library needs
 * react-native-screens, react-native-safe-area-context and
 * react-native-gesture-handler — all native, all requiring a prebuild — to
 * deliver a three-tab bar with no stack semantics and no deep linking.
 * CLAUDE.md asks for a JS implementation wherever one is reasonable, and at
 * three tabs it plainly is.
 *
 * Selection is never colour-only, matching Chip. The active tab is a *filled*
 * icon in `ink`; an inactive one is the outline at `inkMuted`. Icon shape
 * carries the state, so it survives a monochrome rendering and does not depend
 * on distinguishing two greys.
 *
 * Deliberately not `accent`. DESIGN.md §0 reserves that for the recommended
 * route, and a tab bar is chrome — the loudest colour in the app should not be
 * spent on furniture that is on screen the whole time.
 */

import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { TAP_TARGET, size, space, stroke, textScale, type } from '../theme';
import { useStyles, useTheme } from '../ThemeProvider';
import { themed } from '../styles/themed';

export type Tab = 'screener' | 'sources' | 'household';

type TabSpec = {
  key: Tab;
  label: string;
  /** Filled when active, outline when not. */
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
};

/**
 * Three, not four.
 *
 * The reference this borrows from carries a "History" tab. Nothing in this app
 * is stored — it is a hard rule, and the coverage controls say so on screen —
 * so a history tab would have nothing to show and would contradict the promise
 * beside it.
 *
 * `Sources` was reachable only as a hidden sibling of the landing screen. It is
 * the most defensible content in the app: every rate's provenance and every
 * payer rule quoted verbatim. Making it a destination is the point of having
 * destinations at all.
 */
export const TABS: TabSpec[] = [
  { key: 'screener', label: 'Compare', icon: 'swap-vertical-outline', activeIcon: 'swap-vertical' },
  { key: 'sources', label: 'Sources', icon: 'document-text-outline', activeIcon: 'document-text' },
  { key: 'household', label: 'Household', icon: 'people-outline', activeIcon: 'people' },
];

export function TabBar({
  current,
  onSelect,
}: {
  current: Tab;
  /**
   * Fires on every press, including a press on the tab already showing —
   * iOS treats that as "scroll this tab to the top", and the caller does.
   */
  onSelect: (tab: Tab) => void;
}) {
  const styles = useStyles(sheets);
  const { c } = useTheme();

  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {TABS.map((tab) => {
        const active = tab.key === current;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={() => onSelect(tab.key)}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
          >
            <Ionicons
              name={active ? tab.activeIcon : tab.icon}
              size={size.icon.lg}
              color={active ? c.ink : c.inkMuted}
            />
            <Text
              style={[styles.label, active && styles.labelActive]}
              maxFontSizeMultiplier={textScale.chrome}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const sheets = themed((c) => ({
  bar: {
    flexDirection: 'row',
    borderTopWidth: stroke.hairline,
    borderTopColor: c.line,
    backgroundColor: c.canvas,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: TAP_TARGET + space.sm,
    paddingVertical: space.sm,
  },
  tabPressed: { opacity: 0.6 },
  label: { ...type.caption, color: c.inkMuted },
  // Manrope-SemiBold via the `label` role rather than a fontWeight, which this
  // font's static weight files would not read.
  labelActive: { ...type.label, color: c.ink },
}));
