import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';

import { ApprovalActionModal } from '../../../src/components/case/ApprovalActionModal';
import { Card } from '../../../src/components/Card';
import { LogoutButton } from '../../../src/components/LogoutButton';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { ENDPOINTS } from '../../../src/constants/endpoints';
import { useAuth } from '../../../src/lib/auth/AuthContext';
import { useApi } from '../../../src/lib/useApi';
import { colors, fontFamily, spacing, typeScale } from '../../../src/theme/theme';
import type { Approval, ApprovalsListResponse } from '../../../src/types/domain';

const APPROVAL_STATUS_TONE = {
  pending: 'amber',
  approved: 'green',
  rejected: 'coral',
} as const;

const SECTION_ORDER: Array<{ key: Approval['status']; title: string }> = [
  { key: 'pending', title: 'Pending' },
  { key: 'approved', title: 'Approved' },
  { key: 'rejected', title: 'Changes requested' },
];

/**
 * GET /api/approvals — confirmed real in M3, reused here (not re-verified
 * from scratch per the M4 brief). Not gated on can_approve_photos —
 * visibility is the same as case visibility (practiceScopeClause); the
 * flag only gates the two write actions, checked client-side below so a
 * user without it sees the list read-only, no action buttons.
 */
export default function ApprovalsScreen() {
  const { state } = useAuth();
  const canApprovePhotos = state.status === 'signedIn' && state.user.canApprovePhotos;

  const { data, loading, refreshing, error, refetch } = useApi<ApprovalsListResponse>(
    ENDPOINTS.approvalsList
  );
  const [activeApproval, setActiveApproval] = useState<Approval | null>(null);

  const sections = useMemo(() => {
    const approvals = data?.approvals ?? [];
    return SECTION_ORDER.map((section) => ({
      title: section.title,
      status: section.key,
      data: approvals.filter((a) => a.status === section.key),
    })).filter((section) => section.data.length > 0);
  }, [data]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Loading approvals…</Text>
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

  return (
    <>
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} />}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.muted}>No approvals yet.</Text>
          </View>
        }
        ListFooterComponent={<LogoutButton />}
        renderItem={({ item }) => (
          <ApprovalRow approval={item} onPress={() => setActiveApproval(item)} />
        )}
      />

      <ApprovalActionModal
        approval={activeApproval}
        canAct={canApprovePhotos}
        onClose={() => setActiveApproval(null)}
        onResponded={refetch}
      />
    </>
  );
}

function ApprovalRow({ approval, onPress }: { approval: Approval; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.rowWrapper}>
      <Card>
        <View style={styles.rowTop}>
          <Text style={styles.caseNumber}>{approval.case_number}</Text>
          <StatusBadge label={approval.status} tone={APPROVAL_STATUS_TONE[approval.status]} />
        </View>
        <Text style={styles.patientName}>{approval.patient_name || 'Unnamed patient'}</Text>
        <Text style={styles.meta}>
          {approval.stage === 'design' ? 'Design review' : 'Bisque try-in'}
        </Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  muted: { fontFamily: fontFamily.bodyRegular, fontSize: typeScale.body, color: colors.inkSoft },
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
  sectionHeader: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: typeScale.caption,
    color: colors.inkSoft,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
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
  meta: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.bodySmall,
    color: colors.inkSoft,
  },
});
