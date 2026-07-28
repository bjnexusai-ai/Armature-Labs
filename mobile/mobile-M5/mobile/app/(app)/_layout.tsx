import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenContainer } from '../../src/components/ScreenContainer';
import { isOfficeFacingRole } from '../../src/constants/roles';
import { usePushNotifications } from '../../src/hooks/usePushNotifications';
import { useAuth } from '../../src/lib/auth/AuthContext';
import { colors, fontFamily, spacing, typeScale } from '../../src/theme/theme';

export default function AppLayout() {
  const { state } = useAuth();

  // Registers for push (permission + token; token *submission* is a stub —
  // see src/lib/push.ts) and wires notification listeners. Placed here
  // rather than root _layout.tsx so it only ever runs for a signed-in,
  // office-facing session — never during signedOut/deviceLockPending, and
  // never for a lab-internal role that has no mobile screens to deep-link
  // into anyway.
  usePushNotifications();

  if (state.status !== 'signedIn') {
    // Covers signedOut/deviceLockPending/loading — bounce back
    // through the root traffic director rather than duplicating the
    // redirect targets here.
    return <Redirect href="/" />;
  }

  // Mobile is dental-office-facing only (plan §5). Lab-internal roles
  // (technician/admin/lab_manager) have no screens here — this is a
  // deliberate wall, not a missing feature.
  if (!isOfficeFacingRole(state.user.role)) {
    return (
      <ScreenContainer style={styles.notAvailable}>
        <Text style={styles.notAvailableTitle}>Not available on mobile</Text>
        <Text style={styles.notAvailableBody}>
          This account role uses the Armature Labs web portal. Mobile is built for
          dental-office accounts.
        </Text>
      </ScreenContainer>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryTeal,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarStyle: { borderTopColor: colors.border, backgroundColor: colors.card },
        tabBarLabelStyle: { fontFamily: fontFamily.bodyMedium, fontSize: typeScale.caption },
      }}
    >
      <Tabs.Screen
        name="cases"
        options={{
          title: 'Cases',
          tabBarIcon: ({ color, size }) => <Ionicons name="folder-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="approvals"
        options={{
          title: 'Approvals',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="invoices"
        options={{
          title: 'Invoices',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  notAvailable: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  notAvailableTitle: {
    fontFamily: fontFamily.headingBold,
    fontSize: typeScale.h2,
    color: colors.ink,
    textAlign: 'center',
  },
  notAvailableBody: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.body,
    color: colors.inkSoft,
    textAlign: 'center',
  },
});
