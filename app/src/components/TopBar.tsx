import { StyleSheet, Text, View } from 'react-native';
import { color, space, type } from '../theme';
import { BackLink } from './BackLink';

/**
 * Brand plus the way out.
 *
 * The back control lives here rather than in each screen's content because this
 * bar sits outside the ScrollView. A back link inside the content scrolls off
 * the top, so on a long screen — the routes list, the household review — there
 * would be no way home without scrolling up first. Here it is always on screen.
 */
export function TopBar({ backLabel, onBack }: { backLabel: string; onBack: () => void }) {
  return (
    <View style={styles.topBar}>
      <BackLink label={backLabel} onPress={onBack} />
      <Text style={styles.brand}>Preclear</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    gap: space.md,
  },
  brand: { ...type.title, color: color.ink },
});
