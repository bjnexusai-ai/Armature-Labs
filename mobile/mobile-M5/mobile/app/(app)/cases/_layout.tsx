import { Stack } from 'expo-router';
import React from 'react';

import { colors, fontFamily } from '../../../src/theme/theme';

export default function CasesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { fontFamily: fontFamily.headingBold, color: colors.ink },
        headerTintColor: colors.primaryTeal,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Cases' }} />
      <Stack.Screen name="[id]" options={{ title: 'Case detail' }} />
    </Stack>
  );
}
