import { useEffect, useState } from 'react';
import { ApiError, createProgressPhoto, listProgressPhotos } from '../lib/api';
import type { ProgressPhoto } from '../lib/caseTypes';
import { useToast } from '../context/ToastContext';

// Progress Photos (Frontend Session 5) — confirmed directly against
// backend/src/controllers/progressPhotos.controller.js. requireInternal at
// the route — this component is only ever rendered for internal roles
// (gated in CaseActivityPanel.tsx), not by a role check duplicated here.
export function ProgressPhotosPanel({ caseId }: { caseId: number }) {
  const { showToast } = useToast();
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [fileUrl, setFileUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    listProgressPhotos(caseId)
      .then((res) => setPhotos(res.progressPhotos))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load progress photos.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [caseId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fileUrl.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createProgressPhoto(caseId, { fileUrl: fileUrl.trim(), caption: caption.trim() || undefined });
      setFileUrl('');
      setCaption('');
      setAdding(false);
      showToast('Photo added');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add that photo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3.5">
        <span className="text-[12.5px] text-ink-soft">Internal production shots — not visible to the dental office.</span>
        <button
          onClick={() => setAdding((a) => !a)}
          className="btn-primary h-9 px-4 rounded-[9px] font-semibold text-[13px]"
        >
          {adding ? 'Cancel' : '+ Add photo'}
        </button>
      </div>

      {adding && (
        <form onSubmit={handleSubmit} className="surface-card rounded-[16px] p-4 mb-4">
          <div className="mb-3">
            <label className="block text-[12.5px] font-semibold text-ink mb-1.5">Photo URL</label>
            <input
              className="form-input"
              type="text"
              placeholder="https://…"
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              required
            />
          </div>
          <div className="mb-3.5">
            <label className="block text-[12.5px] font-semibold text-ink mb-1.5">
              Caption <span className="text-ink-soft font-normal">(optional)</span>
            </label>
            <input
              className="form-input"
              type="text"
              placeholder="e.g. Bisque try-in, occlusal view"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={255}
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !fileUrl.trim()}
            className="h-9 px-4 rounded-[9px] text-white font-semibold text-[13px] disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
          >
            {submitting ? 'Adding…' : 'Add photo'}
          </button>
        </form>
      )}

      {error && (
        <div className="text-[12.5px] text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="skeleton h-32 rounded-[14px]" />
          <div className="skeleton h-32 rounded-[14px]" />
          <div className="skeleton h-32 rounded-[14px]" />
        </div>
      ) : photos.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3.5" y="5" width="17" height="14" rx="2" />
            <circle cx="8.5" cy="10" r="1.5" fill="currentColor" stroke="none" />
            <path d="M3.5 15.5 8 12l3 2.5 3.5-3.5L20.5 15" />
          </svg>
          <h4>No progress photos yet</h4>
          <p>Production shots added for this case will show up here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {photos.map((p) => (
            <div key={p.id} className="surface-card rounded-[14px] overflow-hidden">
              <div className="bg-page-bg-top aspect-square flex items-center justify-center overflow-hidden">
                <img src={p.file_url} alt={p.caption || 'Progress photo'} className="w-full h-full object-cover" />
              </div>
              <div className="p-2.5">
                {p.caption && <p className="text-[12px] text-ink m-0 mb-1">{p.caption}</p>}
                <span className="text-[10.5px] text-ink-soft font-mono">
                  {new Date(p.taken_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
