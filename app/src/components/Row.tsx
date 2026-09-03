import { Text, View } from 'react-native';
import { space } from '../theme';
import { useStyles } from '../ThemeProvider';
import { themed } from '../styles/themed';
import { sharedSheets } from '../styles/shared';

export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  const styles = useStyles(sheets);
  const shared = useStyles(sharedSheets);

  return (
    <View style={styles.row}>
      <Text style={shared.rowLabel}>{label}</Text>
      {value}
    </View>
  );
}

const sheets = themed((c) => ({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
}));
