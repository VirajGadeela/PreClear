/**
 * Builds a stylesheet once per scheme, at module load.
 *
 * Every stylesheet in this app is already a pure function of the tokens in
 * `theme.ts` — there are no runtime-computed colours anywhere — so the whole of
 * dark mode is "call the same function with a different palette." Doing that at
 * module load rather than per render means a theme switch costs one context
 * read and an object index, and the hot paths (route rows re-ranking under a
 * dragged slider, the slider thumb itself) allocate nothing.
 *
 * The alternative considered was a `makeStyles` factory memoised per component.
 * It allocates a sheet per component per scheme and needs a cache to stop doing
 * that on every render — and with the cache it is this design, reached the long
 * way round. The other alternative, inline colours over a static structure
 * (`style={[s.card, { backgroundColor: c.surface }]}`), creates a fresh object
 * every render and splits one style across two places, which DESIGN.md §4
 * exists to prevent.
 */

import { StyleSheet } from 'react-native';
import { type Palette, type Scheme, palettes } from '../theme';

export type Themed<T> = Record<Scheme, T>;

export function themed<T extends StyleSheet.NamedStyles<T>>(
  build: (c: Palette) => T & StyleSheet.NamedStyles<T>,
): Themed<T> {
  return {
    light: StyleSheet.create(build(palettes.light)),
    dark: StyleSheet.create(build(palettes.dark)),
  };
}
