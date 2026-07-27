import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '../../src/components/Button';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { ApiError } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth/AuthContext';
import { colors, fontFamily, radius, spacing, typeScale } from '../../src/theme/theme';

/**
 * MFA verification step — plan B11: "MFA: enrollment flow, verification
 * at login, recovery path — applies to all 5 roles." This screen only
 * covers the *verify* half; enrollment (first-time setup) is a B11+M-side
 * follow-up once the enrollment endpoint contract is confirmed, since
 * enrollment likely needs a QR/secret display step that doesn't exist yet.
 * "Use a recovery code instead" is stubbed pending the recovery endpoint.
 */
export default function MfaScreen() {
  const { verifyMfa, state } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const email = state.status === 'mfaPending' ? state.email : '';

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await verifyMfa(code.trim());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Incorrect code. Please try again.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Verify it's you</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit code from your authenticator app{email ? ` for ${email}` : ''}.
        </Text>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="000000"
          placeholderTextColor={colors.inkSoft}
          textAlign="center"
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Button
          label="Verify"
          onPress={handleSubmit}
          loading={loading}
          disabled={code.trim().length !== 6 || loading}
        />
        <Button
          label="Use a recovery code instead"
          variant="ghost"
          onPress={() => {
            // Wired once B11's recovery endpoint contract is confirmed —
            // deliberately not silently guessed at, unlike the verify path
            // above which matches the plan's named MFA endpoints closely
            // enough to build against now.
          }}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.xxl, marginBottom: spacing.xxl },
  title: {
    fontFamily: fontFamily.headingExtraBold,
    fontSize: typeScale.h1,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.body,
    color: colors.inkSoft,
  },
  form: { gap: spacing.lg },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    fontFamily: fontFamily.mono,
    fontSize: typeScale.display,
    letterSpacing: 8,
    color: colors.ink,
    backgroundColor: colors.card,
  },
  error: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: typeScale.bodySmall,
    color: colors.danger,
  },
});
