import { Component, ErrorInfo, ReactNode } from 'react';
import { Text, View } from 'react-native';
import { space, type } from '../theme';
import { useStyles } from '../ThemeProvider';
import { themed } from '../styles/themed';
import { PrimaryButton } from './PrimaryButton';

type Props = {
  children: ReactNode;
  /**
   * Called after "Start over" is pressed, so the caller can reset whatever
   * state put the crashed screen there. Clearing the caught error alone would
   * just render the same crash again if the state that triggered it did not
   * change too.
   */
  onReset: () => void;
};

type State = { error: Error | null };

/**
 * Catches a render error in one step so it cannot take the rest of the app
 * down with it. A class component because React only supports error
 * boundaries through componentDidCatch/getDerivedStateFromError — there is no
 * hook equivalent.
 *
 * Nothing is reported anywhere. Hard rule 2 forbids any SDK that transmits
 * usage data, and a stack trace from a health-adjacent app is exactly the
 * kind of thing that must stay on the device — `console.error`, dev only.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (__DEV__) {
      console.error('ErrorBoundary caught:', error, info.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ error: null });
    this.props.onReset();
  };

  render() {
    if (this.state.error) {
      return <ErrorFallback onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}

/**
 * The fallback, split out as a function component.
 *
 * Not a style decision — a mechanical one. Themed stylesheets are read through
 * `useStyles`, and a class component cannot call a hook. The alternative was
 * `static contextType`, which works but ties the boundary to one context and
 * reads worse than the split.
 */
function ErrorFallback({ onReset }: { onReset: () => void }) {
  const styles = useStyles(sheets);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Something went wrong on this screen.</Text>
      <Text style={styles.body}>
        Nothing you entered was saved or sent anywhere, so starting over is
        safe.
      </Text>
      <PrimaryButton label="Start over" onPress={onReset} tone="accent" />
    </View>
  );
}

const sheets = themed((c) => ({
  wrap: { marginTop: space.xl },
  title: { ...type.title, color: c.ink, marginBottom: space.sm },
  body: { ...type.body, color: c.inkMuted, marginBottom: space.md },
}));
