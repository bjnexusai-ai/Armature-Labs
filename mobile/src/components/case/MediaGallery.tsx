import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamily, radius, spacing, typeScale } from '../../theme/theme';
import type { Approval } from '../../types/domain';
import { StatusBadge } from '../StatusBadge';

const APPROVAL_STATUS_TONE = {
  pending: 'amber',
  approved: 'green',
  rejected: 'coral',
} as const;

/**
 * "Media gallery (read-only)" per the plan — but the backend has no
 * GET /api/cases/:id/media route (uploadCaseMedia is lab-staff-only POST).
 * The only real read path to case media for a dentist_client is
 * GET /api/approvals?caseId=X, which joins each design/bisque approval to
 * its file. So this shows design/bisque-stage review photos with their
 * approval status — not a general "every file on this case" gallery.
 * Progress photos (case_files with other media_stage values) are lab-
 * staff-only on the backend and genuinely not visible to mobile at all.
 * See MOBILE_LOG.md M2 entry.
 */
interface MediaGalleryProps {
  approvals: Approval[];
  /** canApprovePhotos for the signed-in user — mirrors the backend gate
   * client-side (M4 brief) so a user without it doesn't see a Respond
   * button that would only 403. Omit to render fully read-only (e.g. if a
   * caller doesn't need the action affordance at all). */
  canAct?: boolean;
  /** Called with the tapped pending approval so the parent can open the
   * shared ApprovalActionModal — case detail owns that modal instance
   * (not MediaGallery) so it can refetch the case/status header itself
   * after a response, per the M4 brief's "don't leave the header stale". */
  onRespond?: (approval: Approval) => void;
}

export function MediaGallery({ approvals, canAct = false, onRespond }: MediaGalleryProps) {
  if (approvals.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No design or bisque photos yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {approvals.map((approval) => (
        <View key={approval.id} style={styles.item}>
          <Image source={{ uri: approval.media_file_url }} style={styles.thumb} resizeMode="cover" />
          <View style={styles.itemMeta}>
            <Text style={styles.stageLabel}>
              {approval.stage === 'design' ? 'Design review' : 'Bisque try-in'}
            </Text>
            <StatusBadge label={approval.status} tone={APPROVAL_STATUS_TONE[approval.status]} />
          </View>
          {approval.comments && <Text style={styles.comments}>{approval.comments}</Text>}
          {approval.status === 'pending' && canAct && onRespond && (
            <Pressable onPress={() => onRespond(approval)} style={styles.respondRow}>
              <Text style={styles.respondLabel}>Respond</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  item: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  thumb: {
    width: '100%',
    height: 200,
    backgroundColor: colors.border,
  },
  itemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
  },
  stageLabel: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: typeScale.body,
    color: colors.ink,
  },
  comments: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.bodySmall,
    color: colors.inkSoft,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  respondRow: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  respondLabel: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: typeScale.bodySmall,
    color: colors.buttonGreen,
  },
  empty: { paddingVertical: spacing.lg, alignItems: 'center' },
  emptyText: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.bodySmall,
    color: colors.inkSoft,
  },
});
