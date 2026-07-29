import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApprovalActionModal } from '../../../src/components/case/ApprovalActionModal';
import { MediaGallery } from '../../../src/components/case/MediaGallery';
import { NotesThread } from '../../../src/components/case/NotesThread';
import { PhotoCapture } from '../../../src/components/case/PhotoCapture';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { STATUS_TONE } from '../../../src/constants/caseStatus';
import { ENDPOINTS } from '../../../src/constants/endpoints';
import { apiRequest } from '../../../src/lib/api';
import { useAuth } from '../../../src/lib/auth/AuthContext';
import { usePatientPhotoScreenProtection } from '../../../src/lib/screenProtection';
import { useApi } from '../../../src/lib/useApi';
import { colors, fontFamily, spacing, typeScale } from '../../../src/theme/theme';
import type {
  Approval,
  ApprovalsListResponse,
  CaseDetailResponse,
  CaseNote,
  CaseNoteCreateResponse,
  CaseNotesResponse,
} from '../../../src/types/domain';

export default function CaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const canApprovePhotos = state.status === 'signedIn' && state.user.canApprovePhotos;

  // M5: this screen's Media section renders design/bisque review photos
  // (MediaGallery) — protected for the whole time the screen is mounted.
  // See src/lib/screenProtection.ts for exactly what "protected" means on
  // each platform (real prevention on both, not detection-only).
  usePatientPhotoScreenProtection('case-detail-photos');

  const caseQuery = useApi<CaseDetailResponse>(id ? ENDPOINTS.caseDetail(id) : null);
  const approvalsQuery = useApi<ApprovalsListResponse>(id ? ENDPOINTS.approvals(id) : null);
  const notesQuery = useApi<CaseNotesResponse>(id ? ENDPOINTS.caseNotes(id) : null);

  const [localNotes, setLocalNotes] = useState<CaseNote[] | null>(null);
  const [sending, setSending] = useState(false);
  const [activeApproval, setActiveApproval] = useState<Approval | null>(null);

  const notes = localNotes ?? notesQuery.data?.notes ?? [];

  const handleSendNote = useCallback(
    async (body: string) => {
      if (!id) return;
      setSending(true);
      try {
        const res = await apiRequest<CaseNoteCreateResponse>(ENDPOINTS.caseNotes(id), {
          method: 'POST',
          body: { body },
        });
        // Optimistic-ish: append locally rather than refetching the whole
        // list, since the backend doesn't return an updated full list here.
        setLocalNotes([res.note, ...notes]);
      } finally {
        setSending(false);
      }
    },
    [id, notes]
  );

  const refreshAll = useCallback(async () => {
    setLocalNotes(null);
    await Promise.all([caseQuery.refetch(), approvalsQuery.refetch(), notesQuery.refetch()]);
  }, [caseQuery, approvalsQuery, notesQuery]);

  if (caseQuery.loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Loading case…</Text>
      </View>
    );
  }

  if (caseQuery.error || !caseQuery.data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{caseQuery.error ?? 'Case not found.'}</Text>
      </View>
    );
  }

  const { case: caseRecord, currentStage } = caseQuery.data;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={caseQuery.refreshing || approvalsQuery.refreshing || notesQuery.refreshing}
          onRefresh={refreshAll}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.caseNumber}>{caseRecord.case_number}</Text>
          <StatusBadge
            label={caseRecord.current_status}
            tone={STATUS_TONE[caseRecord.current_status]}
          />
        </View>
        <Text style={styles.patientName}>{caseRecord.patient_name || 'Unnamed patient'}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>Due {caseRecord.due_date}</Text>
          {currentStage && <Text style={styles.meta}>• {currentStage.stage_name}</Text>}
          {caseRecord.priority !== 'Standard' && (
            <Text style={[styles.meta, styles.priority]}>• {caseRecord.priority}</Text>
          )}
        </View>
        {caseRecord.rx_instructions && (
          <View style={styles.rxBox}>
            <Text style={styles.sectionLabel}>Rx instructions</Text>
            <Text style={styles.rxText}>{caseRecord.rx_instructions}</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Media</Text>
        {approvalsQuery.loading ? (
          <Text style={styles.muted}>Loading media…</Text>
        ) : approvalsQuery.error ? (
          <Text style={styles.error}>{approvalsQuery.error}</Text>
        ) : (
          <MediaGallery
            approvals={approvalsQuery.data?.approvals ?? []}
            canAct={canApprovePhotos}
            onRespond={setActiveApproval}
          />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Add photo</Text>
        {id && <PhotoCapture caseId={id} />}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notes</Text>
        {notesQuery.loading ? (
          <Text style={styles.muted}>Loading notes…</Text>
        ) : notesQuery.error ? (
          <Text style={styles.error}>{notesQuery.error}</Text>
        ) : (
          <NotesThread notes={notes} onSend={handleSendNote} sending={sending} />
        )}
      </View>

      <ApprovalActionModal
        approval={activeApproval}
        canAct={canApprovePhotos}
        onClose={() => setActiveApproval(null)}
        onResponded={() => {
          // Refetch both — the case's status badge (STAGE_TO_FORWARD/REVERT
          // moves it) and the approvals-backed gallery's own per-item
          // status, rather than trusting a local flip on either (M4 brief).
          caseQuery.refetch();
          approvalsQuery.refetch();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl, flexGrow: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  muted: { fontFamily: fontFamily.bodyRegular, fontSize: typeScale.body, color: colors.inkSoft },
  error: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: typeScale.body,
    color: colors.danger,
    textAlign: 'center',
  },
  header: { gap: spacing.xs },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  caseNumber: {
    fontFamily: fontFamily.mono,
    fontSize: typeScale.mono,
    color: colors.inkSoft,
  },
  patientName: {
    fontFamily: fontFamily.headingExtraBold,
    fontSize: typeScale.h1,
    color: colors.ink,
  },
  metaRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  meta: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.bodySmall,
    color: colors.inkSoft,
  },
  priority: { fontFamily: fontFamily.bodySemiBold, color: colors.warning },
  rxBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  sectionLabel: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: typeScale.caption,
    color: colors.inkSoft,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  rxText: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.body,
    color: colors.ink,
  },
  section: { gap: spacing.md },
  sectionTitle: {
    fontFamily: fontFamily.headingBold,
    fontSize: typeScale.h2,
    color: colors.ink,
  },
});
