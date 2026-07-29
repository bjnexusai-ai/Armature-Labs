/**
 * Mobile-only types — unlike domain.ts, these have no backend counterpart.
 * There is no case-media-upload endpoint a dentist_client can call (see
 * MOBILE_LOG.md M3 entry / src/lib/casePhotoQueue.ts), so a captured photo
 * never becomes a server record. This type describes the local-only
 * lifecycle of a photo from capture through (eventually) submission.
 */

export type PendingCasePhotoStatus =
  | 'processing' // HEIC->JPEG conversion in progress
  | 'ready' // converted, held locally, nothing to send it to yet
  | 'error'; // capture or conversion failed

export interface PendingCasePhoto {
  id: string;
  caseId: string;
  /** Local file:// URI of the converted JPEG. Never uploaded anywhere yet. */
  uri: string;
  width: number;
  height: number;
  /** Original asset's reported MIME type, before conversion — kept for the log/debug only. */
  originalMimeType: string | null;
  status: PendingCasePhotoStatus;
  capturedAt: string;
  error?: string;
}
