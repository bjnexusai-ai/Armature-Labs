import { useEffect, useState } from 'react';
import { ApiError, createNote, listNotes } from '../lib/api';
import type { CaseNote, NoteVisibility } from '../lib/caseTypes';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// Case Notes / Messages (Frontend Session 5) — confirmed directly against
// backend/src/controllers/notes.controller.js. Two-way: staff and the
// owning dentist_client can both read and write here (route is NOT
// requireInternal, tenant isolation scopes access instead). A
// dentist_client only ever gets visibility='portal' rows back from the
// list endpoint — the internal/portal toggle below is hidden for that role
// since the backend silently forces 'portal' for a portal author anyway.
export function NotesPanel({ caseId }: { caseId: number }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isInternal = user?.role !== 'dentist_client';

  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<NoteVisibility>('internal');
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    listNotes(caseId)
      .then((res) => setNotes(res.notes))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load notes.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [caseId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      await createNote(caseId, {
        body: body.trim(),
        // Omitted entirely for a portal author — the backend forces
        // 'portal' regardless, sending it anyway would just be noise.
        visibility: isInternal ? visibility : undefined,
      });
      setBody('');
      showToast('Note sent');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send that note.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="surface-card rounded-[16px] p-4 mb-4">
        <label className="block text-[12.5px] font-semibold text-ink mb-1.5">
          {isInternal ? 'New message' : 'Message the lab'}
        </label>
        <textarea
          className="form-input h-20 resize-none py-2 mb-2.5"
          placeholder={isInternal ? 'Write a note for the team or the dental office…' : 'Write a message to the lab…'}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
        />
        <div className="flex items-center justify-between gap-2.5">
          {isInternal ? (
            <div className="range-toggle">
              <button
                type="button"
                className={`range-btn ${visibility === 'internal' ? 'active' : ''}`}
                onClick={() => setVisibility('internal')}
              >
                Internal only
              </button>
              <button
                type="button"
                className={`range-btn ${visibility === 'portal' ? 'active' : ''}`}
                onClick={() => setVisibility('portal')}
              >
                Visible to office
              </button>
            </div>
          ) : (
            <span className="text-[11.5px] text-ink-soft">This message is visible to the assigned lab staff.</span>
          )}
          <button type="submit" className="btn-primary h-9 px-4 rounded-[9px] font-semibold text-[13px] disabled:opacity-60" disabled={submitting || !body.trim()}>
            {submitting ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>

      {error && (
        <div className="text-[12.5px] text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2.5">
          <div className="skeleton h-16 rounded-[14px]" />
          <div className="skeleton h-16 rounded-[14px]" />
        </div>
      ) : notes.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H10l-4.5 4V16H6.5A2.5 2.5 0 0 1 4 13.5v-7Z" />
          </svg>
          <h4>No messages yet</h4>
          <p>Notes between the lab and dental office for this case will show up here.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {notes.map((n) => {
            const mine = n.author_id === user?.id;
            return (
              <div
                key={n.id}
                className="surface-card rounded-[14px] p-3.5"
                style={mine ? { borderColor: 'rgba(28,138,147,0.28)' } : undefined}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-semibold text-ink">
                    {mine ? 'You' : `Author #${n.author_id}`}
                  </span>
                  <div className="flex items-center gap-2">
                    {n.visibility === 'internal' && (
                      <span className="text-[10px] font-mono uppercase tracking-wide bg-page-bg-top text-ink-soft rounded px-1.5 py-0.5">
                        internal
                      </span>
                    )}
                    <span className="text-[11px] text-ink-soft">{timeAgo(n.created_at)}</span>
                  </div>
                </div>
                <p className="text-[13px] text-ink m-0 whitespace-pre-wrap">{n.body}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
