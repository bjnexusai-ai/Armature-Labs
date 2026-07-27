import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '../../src/components/Button';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { ApiError } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth/AuthContext';
import { colors, fontFamily, spacing, typeScale, radius } from '../../src/theme/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      // AuthContext + expo-router's <Redirect> in index.tsx handle navigation
      // once state flips (signedIn / mfaPending) — no explicit push here.
      await login(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Incorrect email or password.');
      } else if (err instanceof ApiError && err.status === 429) {
        // B10 adds rate limiting to /api/auth/login — this is that path.
        setError('Too many attempts. Please wait a moment and try again.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Armature Labs</Text>
          <Text style={styles.subtitle}>Sign in to your practice account</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              placeholder="you@practice.com"
              placeholderTextColor={colors.inkSoft}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              placeholder="••••••••"
              placeholderTextColor={colors.inkSoft}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Button label="Sign in" onPress={handleSubmit} loading={loading} disabled={!canSubmit} />
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'center' },
  header: { marginBottom: spacing.xxl },
  title: {
    fontFamily: fontFamily.headingExtraBold,
    fontSize: typeScale.display,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.body,
    color: colors.inkSoft,
  },
  form: { gap: spacing.lg },
  field: { gap: spacing.xs },
  fieldLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: typeScale.bodySmall,
    color: colors.ink,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.body,
    color: colors.ink,
    backgroundColor: colors.card,
  },
  error: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: typeScale.bodySmall,
    color: colors.danger,
  },
});
