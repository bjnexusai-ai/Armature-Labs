import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme/theme';

/**
 * Web portal uses a top-to-bottom gradient background
 * (#EAF7F5 -> #FCFCFB). RN has no cheap CSS-gradient equivalent without
 * pulling in expo-linear-gradient just for this, so M1 uses the lighter
 * of the two tones as a flat background — visually close, zero extra
 * dependency. Revisit with expo-linear-gradient in a later session if the
 * client flags the flat background as a mismatch.
 */
export function ScreenContainer({ style, children, ...rest }: ViewProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={[styles.container, style]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.backgroundTop,
  },
  container: {
    flex: 1,
    padding: spacing.lg,
  },
});
