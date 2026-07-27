import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { ScreenContainer } from '../../../src/components/ScreenContainer';
import { LogoutButton } from '../../../src/components/LogoutButton';
import { colors, fontFamily, spacing, typeScale } from '../../../src/theme/theme';

/**
 * Placeholder — screen content ships in M2 (plan §1). M1's job here is
 * only the shell: this route exists, it's reachable from the right tab,
 * it's styled with the shared theme, and it's gated behind auth. No
 * fake/mock case data is rendered — an empty placeholder is more honest
 * than a hardcoded list that looks real but isn't wired to anything.
 */
export default function ApprovalsScreen() {
  return (
    <ScreenContainer>
      <Text style={styles.title}>Approvals</Text>
      <Text style={styles.body}>Approvals content ships in M2.</Text>
      <LogoutButton />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fontFamily.headingExtraBold,
    fontSize: typeScale.h1,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  body: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.body,
    color: colors.inkSoft,
    marginBottom: spacing.xl,
  },
});
