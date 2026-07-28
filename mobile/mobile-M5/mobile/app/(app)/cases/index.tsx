import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Card } from '../../../src/components/Card';
import { LogoutButton } from '../../../src/components/LogoutButton';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { STATUS_TONE } from '../../../src/constants/caseStatus';
import { ENDPOINTS } from '../../../src/constants/endpoints';
import { useApi } from '../../../src/lib/useApi';
import { colors, fontFamily, spacing, typeScale } from '../../../src/theme/theme';
import type { CasesListResponse, CaseSummary } from '../../../src/types/domain';

/**
 * GET /api/cases — for a dentist_client this is already tenant-scoped to
 * their own practice(s) server-side (practiceScopeClause in the
 * controller); no client-side practiceId filtering needed or allowed
 * (the backend 400s if a portal user passes practiceId at all).
 */
export default function CasesListScreen() {
  const router = useRouter();
  const { data, loading, refreshing, error, refetch } = useApi<CasesListResponse>(
    ENDPOINTS.cases
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Loading cases…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
        <Pressable onPress={refetch}>
          <Text style={styles.retry}>Tap to retry</Text>
        </Pressable>
      </View>
    );
  }

  const cases = data?.cases ?? [];

  return (
    <FlatList
      data={cases}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} />}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={styles.muted}>No cases yet.</Text>
        </View>
      }
      ListHeaderComponent={cases.length > 0 ? undefined : undefined}
      ListFooterComponent={<LogoutButton />}
      renderItem={({ item }) => <CaseRow caseItem={item} onPress={() => router.push(`/(app)/cases/${item.id}`)} />}
    />
  );
}

function CaseRow({ caseItem, onPress }: { caseItem: CaseSummary; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.rowWrapper}>
      <Card>
        <View style={styles.rowTop}>
          <Text style={styles.caseNumber}>{caseItem.case_number}</Text>
          <StatusBadge label={caseItem.current_status} tone={STATUS_TONE[caseItem.current_status]} />
        </View>
        <Text style={styles.patientName}>
          {caseItem.patient_name || 'Unnamed patient'}
        </Text>
        <View style={styles.rowBottom}>
          <Text style={styles.meta}>Due {caseItem.due_date}</Text>
          {caseItem.priority !== 'Standard' && (
            <Text style={[styles.meta, styles.priority]}>{caseItem.priority}</Text>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  muted: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.body,
    color: colors.inkSoft,
  },
  error: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: typeScale.body,
    color: colors.danger,
    textAlign: 'center',
  },
  retry: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: typeScale.bodySmall,
    color: colors.buttonGreen,
  },
  rowWrapper: { marginBottom: spacing.sm },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  caseNumber: {
    fontFamily: fontFamily.mono,
    fontSize: typeScale.mono,
    color: colors.inkSoft,
  },
  patientName: {
    fontFamily: fontFamily.headingBold,
    fontSize: typeScale.h3,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  rowBottom: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  meta: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.bodySmall,
    color: colors.inkSoft,
  },
  priority: {
    fontFamily: fontFamily.bodySemiBold,
    color: colors.warning,
  },
});
