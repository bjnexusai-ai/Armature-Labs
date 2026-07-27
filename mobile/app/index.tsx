import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../src/lib/auth/AuthContext';
import { colors } from '../src/theme/theme';

/**
 * Root traffic director. expo-router needs a concrete route to redirect
 * *to*, so every branch of AuthState maps to a route here rather than
 * scattering redirect logic across screens.
 */
export default function Index() {
  const { state } = useAuth();

  switch (state.status) {
    case 'loading':
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.buttonGreen} />
        </View>
      );
    case 'signedOut':
      return <Redirect href="/(auth)/login" />;
    case 'mfaPending':
      return <Redirect href="/(auth)/mfa" />;
    case 'deviceLockPending':
      return <Redirect href="/(auth)/device-lock" />;
    case 'signedIn':
      return <Redirect href="/(app)/cases" />;
  }
}
