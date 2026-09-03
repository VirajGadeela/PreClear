/**
 * Which scheme is showing, and the two hooks every styled file uses.
 *
 * Deliberately not persisted. Storing the choice would need AsyncStorage or
 * expo-secure-store, both native modules, and CLAUDE.md's standing rule is to
 * prefer a JS implementation whenever one is reasonable — adding a native
 * dependency costs a dev-client rebuild three weeks before the deadline, to
 * remember one boolean.
 *
 * It does not follow the system either, and that is not laziness: this app's
 * `ios/Preclear/Info.plist` pins `UIUserInterfaceStyle: Light`, so
 * `Appearance.getColorScheme()` returns `'light'` on this build no matter what
 * the device is set to, and following it would produce a toggle that appears to
 * do nothing on first launch. The seed reads the system value anyway, so that
 * the day the plist changes this starts behaving correctly with no code change.
 *
 * For a two-minute demo an explicit toggle is also simply better than a system
 * follow: both schemes go on camera in one gesture.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';

import { type Palette, type Scheme, palettes } from './theme';
import { type Themed } from './styles/themed';

type ThemeValue = {
  scheme: Scheme;
  /** The active palette. Named `c` at call sites — it appears in every style. */
  c: Palette;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeValue>({
  scheme: 'light',
  c: palettes.light,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setScheme] = useState<Scheme>(
    () => (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'),
  );

  const value = useMemo<ThemeValue>(
    () => ({
      scheme,
      c: palettes[scheme],
      toggle: () => setScheme((s) => (s === 'light' ? 'dark' : 'light')),
    }),
    [scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/**
 * Picks this scheme's copy of a stylesheet built by `themed()`.
 *
 * One context read and one property access. Call it as many times as a file has
 * sheets — screens that also use the shared styles call it twice.
 */
export function useStyles<T>(sheets: Themed<T>): T {
  return sheets[useContext(ThemeContext).scheme];
}
