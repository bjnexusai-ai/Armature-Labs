import React, { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ENDPOINTS } from '../../constants/endpoints';
import { apiRequest, mutationErrorMessage } from '../../lib/api';
import { usePatientPhotoScreenProtection } from '../../lib/screenProtection';
import { colors, fontFamily, radius, spacing, typeScale } from '../../theme/theme';
import type { Approval, CaseDetailResponse } from '../../types/domain';
import { Button } from '../Button';
import { StatusBadge } from '../StatusBadge';

const APPROVAL_STATUS_TONE = {
  pending: 'amber',
  approved: 'green',
  rejected: 'coral',
} as const;

interface ApprovalActionModalProps {
  approval: Approval | null;
  /** Whether the signed-in user's canApprovePhotos flag is set. Mirrors the
   * server-side gate (`req.user.can_approve_photos` in
   * loadAndAuthorizeApproval) client-side too, per the M4 brief — an office
   * staff account without this flag shouldn't see action buttons that will
   * only 403. */
  canAct: boolean;
  onClose: () => void;
  /** Called after a successful approve/request-changes response so the
   * caller can refetch whatever it's showing (the approvals list, or a
   * case's status header + media gallery) rather than trust a local flip. */
  onResponded: () => void;
}

/**
 * One POST call at a time, either approve or request-changes. Both hit
 * confirmed real endpoints (approvals.controller.js) with the confirmed
 * real body shape (`{ comments? }` for approve, `{ comments }` required for
 * request-changes). A 409 means someone else already responded to this
 * approval — shown as its own state, not folded into the generic error.
 */
export function ApprovalActionModal({ approval, canAct, onClose, onResponded }: ApprovalActionModalProps) {
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState<'approve' | 'request-changes' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  // M5: this component stays mounted for the whole parent screen's
  // lifetime (visibility is driven by `approval` being non-null, not by
  // mount/unmount — both callers render it unconditionally). `enabled`
  // keeps protection engaged only while a photo is actually visible, not
  // for the parent screen's entire lifetime. Own key from case detail's
  // 'case-detail-photos' — the modal can be reached from the Approvals tab
  // too, where there is no other protected screen underneath it.
  usePatientPhotoScreenProtection('approval-modal-photo', approval !== null);

  if (!approval) return null;

  const isPending = approval.status === 'pending';
  const stageLabel = approval.stage === 'design' ? 'Design review' : 'Bisque try-in';

  const reset = () => {
    setComments('');
    setSubmitting(null);
    setError(null);
    setConflict(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async (action: 'approve' | 'request-changes') => {
    if (action === 'request-changes' && comments.trim().length === 0) {
      setError('Comments are required when requesting changes.');
      return;
    }
    setSubmitting(action);
    setError(null);
    setConflict(false);
    try {
      const path =
        action === 'approve'
          ? ENDPOINTS.approvalApprove(approval.id)
          : ENDPOINTS.approvalRequestChanges(approval.id);
      const body = action === 'approve' ? (comments.trim() ? { comments: comments.trim() } : {}) : { comments: comments.trim() };
      await apiRequest<{ approval: Approval; case: CaseDetailResponse['case'] }>(path, {
        method: 'POST',
        body,
      });
      reset();
      onResponded();
      onClose();
    } catch (err) {
      const message = mutationErrorMessage(err);
      // loadAndAuthorizeApproval throws a 409 specifically for "already
      // responded to" — surface it as its own state so the person
      // understands why the buttons are gone, not just a red error line.
      if ((err as { status?: number })?.status === 409) {
        setConflict(true);
      }
      setError(message);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>{stageLabel}</Text>
              <StatusBadge label={approval.status} tone={APPROVAL_STATUS_TONE[approval.status]} />
            </View>
            <Text style={styles.subtitle}>
              {approval.case_number} · {approval.patient_name || 'Unnamed patient'}
            </Text>

            <Image source={{ uri: approval.media_file_url }} style={styles.image} resizeMode="cover" />

            {!isPending && approval.comments && (
              <View style={styles.pastCommentsBox}>
                <Text style={styles.sectionLabel}>Comments</Text>
                <Text style={styles.pastComments}>{approval.comments}</Text>
              </View>
            )}

            {isPending && !canAct && (
              <Text style={styles.notice}>
                Your account doesn't have permission to approve or request changes.
              </Text>
            )}

            {isPending && canAct && (
              <>
                <Text style={styles.sectionLabel}>Comments (required to request changes)</Text>
                <TextInput
                  style={styles.input}
                  value={comments}
                  onChangeText={setComments}
                  placeholder="Add a note for the lab…"
                  placeholderTextColor={colors.inkSoft}
                  multiline
                  editable={submitting === null}
                />

                {conflict && (
                  <Text style={styles.conflict}>
                    This case moved on before your response went through — someone else already
                    responded to this approval.
                  </Text>
                )}
                {!conflict && error && <Text style={styles.error}>{error}</Text>}

                <View style={styles.actionRow}>
                  <Button
                    label="Request changes"
                    variant="secondary"
                    onPress={() => submit('request-changes')}
                    loading={submitting === 'request-changes'}
                    disabled={submitting !== null}
                    style={styles.actionButton}
                  />
                  <Button
                    label="Approve"
                    onPress={() => submit('approve')}
                    loading={submitting === 'approve'}
                    disabled={submitting !== null}
                    style={styles.actionButton}
                  />
                </View>
              </>
            )}

            <Pressable onPress={handleClose} style={styles.closeRow}>
              <Text style={styles.closeLabel}>Close</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '88%',
  },
  content: { padding: spacing.lg, gap: spacing.md },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: {
    fontFamily: fontFamily.headingExtraBold,
    fontSize: typeScale.h2,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.bodySmall,
    color: colors.inkSoft,
  },
  image: {
    width: '100%',
    height: 260,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  sectionLabel: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: typeScale.caption,
    color: colors.inkSoft,
    textTransform: 'uppercase',
  },
  pastCommentsBox: { gap: spacing.xs },
  pastComments: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.body,
    color: colors.ink,
  },
  notice: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.bodySmall,
    color: colors.inkSoft,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 80,
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.body,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  conflict: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: typeScale.bodySmall,
    color: colors.warning,
  },
  error: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: typeScale.bodySmall,
    color: colors.danger,
  },
  actionRow: { flexDirection: 'row', gap: spacing.md },
  actionButton: { flex: 1 },
  closeRow: { alignItems: 'center', paddingVertical: spacing.sm },
  closeLabel: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: typeScale.bodySmall,
    color: colors.buttonGreen,
  },
});
