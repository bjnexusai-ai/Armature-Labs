import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../../src/components/Button';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { useAuth } from '../../src/lib/auth/AuthContext';
import { colors, fontFamily, spacing, typeScale } from '../../src/theme/theme';

/**
 * Device PIN/biometric gate — separate from account login/MFA. Shown on
 * cold start (if enabled) and again after the app has been backgrounded
 * past the re-lock window (see AuthContext.RELOCK_AFTER_BACKGROUND_MS).
 */
export default function DeviceLockScreen() {
  const { unlockDevice, state } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const attemptUnlock = React.useCallback(async () => {
    setError(null);
    const success = await unlockDevice();
    if (!success) {
      setError('Unlock canceled or failed. Try again.');
    }
  }, [unlockDevice]);

  // Prompt immediately on arrival so the user doesn't need an extra tap.
  useEffect(() => {
    attemptUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userName = state.status === 'deviceLockPending' ? state.user.fullName : '';

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome back{userName ? `, ${userName}` : ''}</Text>
        <Text style={styles.subtitle}>Unlock to continue</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <Button label="Unlock" onPress={attemptUnlock} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: 'center' },
  content: { alignItems: 'center', gap: spacing.lg },
  title: {
    fontFamily: fontFamily.headingExtraBold,
    fontSize: typeScale.h1,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.body,
    color: colors.inkSoft,
  },
  error: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: typeScale.bodySmall,
    color: colors.danger,
  },
});
