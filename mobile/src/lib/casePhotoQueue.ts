import type { PendingCasePhoto } from '../types/media';

/**
 * Real gap, confirmed against the live backend (not the plan doc) before
 * writing this file:
 *
 *  - POST /api/cases/:id/media (uploadCaseMedia) is `requireInternal` —
 *    lab staff only. A dentist_client gets a 403.
 *  - POST /api/cases/:id/notes accepts only { body, visibility } (zod
 *    `.strict()`), no attachment field.
 *  - POST /api/approvals/:id/approve and /:id/request-changes accept only
 *    { comments } (zod `.strict()`), no attachment field.
 *  - There is no other write endpoint a dentist_client can reach that
 *    takes a file.
 *
 * So there is nowhere to send a captured photo. Per the M3 brief: build
 * the capture flow up to "have a converted image, ready to send" and stub
 * the actual send with a clearly marked TODO — do not invent a submission
 * endpoint or silently drop the photo. Photos captured in this session
 * stay in-memory (cleared on app restart) with a visible "pending"
 * status; there is intentionally no fake "uploaded" state.
 *
 * TODO(backend): once a portal-facing media endpoint exists — either a
 * new route or an attachment field added to notes/approvals — replace
 * `submitPendingPhoto` below with a real apiRequest call. Nothing else in
 * this file should need to change; PhotoCapture.tsx only calls the
 * functions exported here.
 */

type Listener = () => void;

let photos: PendingCasePhoto[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeToCasePhotos(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPendingPhotosForCase(caseId: string): PendingCasePhoto[] {
  return photos.filter((p) => p.caseId === caseId);
}

export function addPendingPhoto(photo: PendingCasePhoto) {
  photos = [photo, ...photos];
  emit();
}

export function updatePendingPhoto(id: string, patch: Partial<PendingCasePhoto>) {
  photos = photos.map((p) => (p.id === id ? { ...p, ...patch } : p));
  emit();
}

export function removePendingPhoto(id: string) {
  photos = photos.filter((p) => p.id !== id);
  emit();
}

/**
 * Stubbed on purpose — see file header. Does not call the network. Logs so
 * the gap is visible in dev tooling instead of failing silently.
 */
export async function submitPendingPhoto(id: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(
    `[casePhotoQueue] submitPendingPhoto(${id}) — no-op. No backend endpoint exists yet for a ` +
      'dentist_client to submit case media. See MOBILE_LOG.md M3 entry.'
  );
  return Promise.resolve();
}
