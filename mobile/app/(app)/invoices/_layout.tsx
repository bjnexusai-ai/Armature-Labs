import { Stack } from 'expo-router';
import React from 'react';

import { colors, fontFamily } from '../../../src/theme/theme';

export default function InvoicesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { fontFamily: fontFamily.headingBold, color: colors.ink },
        headerTintColor: colors.primaryTeal,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Invoices' }} />
      <Stack.Screen name="[id]" options={{ title: 'Invoice detail' }} />
    </Stack>
  );
}
