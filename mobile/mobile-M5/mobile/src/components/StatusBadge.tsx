import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontFamily, radius, spacing, typeScale, StatusTone } from '../theme/theme';

interface StatusBadgeProps {
  label: string;
  tone: StatusTone;
}

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  const { text, background } = colors.status[tone];
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <Text style={[styles.label, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  label: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: typeScale.caption,
  },
});
