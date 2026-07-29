import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';

import {
  addPendingPhoto,
  getPendingPhotosForCase,
  subscribeToCasePhotos,
  updatePendingPhoto,
} from '../../lib/casePhotoQueue';
import { captureCasePhoto, MediaPermissionError, pickCasePhotoFromLibrary } from '../../lib/media';
import { colors, fontFamily, radius, spacing, typeScale } from '../../theme/theme';
import type { PendingCasePhoto } from '../../types/media';
import { Button } from '../Button';

/** No uuid dependency in the project yet — good enough for a local-only, session-scoped id. */
function localId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface PhotoCaptureProps {
  caseId: string;
}

/**
 * "Camera capture" per M3 scope. Wired here — inside case detail, not a
 * separate top-level screen — per the M3 brief's expectation that capture
 * hooks into `cases/[id].tsx`.
 *
 * There is no confirmed, reachable endpoint for a dentist_client to submit
 * case media to (see casePhotoQueue.ts). So this captures + converts +
 * holds the photo locally with a plainly-stated "not sent yet" status,
 * rather than either (a) posting to the staff-only `uploadCaseMedia` route
 * and having it 403, or (b) pretending the photo went somewhere.
 */
export function PhotoCapture({ caseId }: PhotoCaptureProps) {
  const [photos, setPhotos] = useState<PendingCasePhoto[]>(() => getPendingPhotosForCase(caseId));
  const [busy, setBusy] = useState<'camera' | 'library' | null>(null);

  useEffect(() => {
    setPhotos(getPendingPhotosForCase(caseId));
    return subscribeToCasePhotos(() => setPhotos(getPendingPhotosForCase(caseId)));
  }, [caseId]);

  const handleCapture = useCallback(
    async (source: 'camera' | 'library') => {
      setBusy(source);
      const placeholderId = localId();
      try {
        const asset =
          source === 'camera' ? await captureCasePhoto() : await pickCasePhotoFromLibrary();
        if (!asset) return; // user canceled

        addPendingPhoto({
          id: placeholderId,
          caseId,
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          originalMimeType: asset.originalMimeType,
          status: 'ready',
          capturedAt: new Date().toISOString(),
        });
      } catch (err) {
        if (err instanceof MediaPermissionError) {
          Alert.alert('Permission needed', err.message);
        } else {
          updatePendingPhoto(placeholderId, {
            status: 'error',
            error: 'Could not process that photo. Try again.',
          });
          Alert.alert('Something went wrong', 'Could not process that photo. Try again.');
        }
      } finally {
        setBusy(null);
      }
    },
    [caseId]
  );

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <Button
          label="Take photo"
          variant="secondary"
          loading={busy === 'camera'}
          disabled={busy !== null}
          onPress={() => handleCapture('camera')}
          style={styles.actionButton}
        />
        <Button
          label="Choose from library"
          variant="secondary"
          loading={busy === 'library'}
          disabled={busy !== null}
          onPress={() => handleCapture('library')}
          style={styles.actionButton}
        />
      </View>

      {photos.length > 0 && (
        <View style={styles.grid}>
          {photos.map((photo) => (
            <View key={photo.id} style={styles.thumbWrap}>
              <Image source={{ uri: photo.uri }} style={styles.thumb} resizeMode="cover" />
              <Text style={[styles.statusText, photo.status === 'error' && styles.statusTextError]}>
                {photo.status === 'error' ? 'Failed to process' : 'Saved on this device'}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.note}>
        Photos are saved on this device only. Your lab team can't receive photos sent from the app
        yet — this is coming in a future update.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbWrap: { width: 96, gap: spacing.xs },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  statusText: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.caption,
    color: colors.inkSoft,
  },
  statusTextError: { color: colors.danger },
  note: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.bodySmall,
    color: colors.inkSoft,
  },
});
