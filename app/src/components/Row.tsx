import { StyleSheet, Text, View } from 'react-native';
import { space, type } from '../theme';
import { shared } from '../styles/shared';

export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={shared.rowLabel}>{label}</Text>
      {value}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
});
