import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';

import { colors, radius, shadow, spacing } from '../theme/theme';

export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
});
