import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getPractice, listPracticeContracts, listPracticeNotes, createPracticeNote } from '../lib/api';
import type { Practice, PracticeContract, PracticeNote } from '../lib/caseTypes';
import { NewContractModal } from '../components/NewContractModal';
import { useToast } from '../context/ToastContext';

type Tab = 'contracts' | 'notes';

// Contracts/Notes tabs — notes tab has no visibility toggle since practice
// notes have no client-facing side at all (contrast with case notes),
// confirmed against accounts.controller.js's own comment.
export function PracticeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('contracts');

  const [practice, setPractice] = useState<Practice | null>(null);
  const [contracts, setContracts] = useState<PracticeContract[]>([]);
  const [notes, setNotes] = useState<PracticeNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newContractOpen, setNewContractOpen] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([getPractice(id), listPracticeContracts(id), listPracticeNotes(id)])
      .then(([p, c, n]) => {
        setPractice(p.practice);
        setContracts(c.contracts);
        setNotes(n.notes);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this practice.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddNote() {
    if (!id || !noteBody.trim()) return;
    setNoteSubmitting(true);
    try {
      await createPracticeNote(id, { body: noteBody.trim() });
      setNoteBody('');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not add the note.');
    } finally {
      setNoteSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-11 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error || !practice) {
    return (
      <div className="text-[12.5px] text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5">
        {error || 'Practice not found.'}
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => navigate('/practices')} className="text-[12.5px] text-[#1C8A93] font-semibold mb-4">
        ← Back to practices
      </button>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-lg font-bold text-ink mb-1">{practice.practice_name}</h2>
          <p className="text-sm text-ink-soft">
            {[practice.city, practice.state].filter(Boolean).join(', ') || '—'}
          </p>
        </div>
        {tab === 'contracts' && (
          <button
            onClick={() => setNewContractOpen(true)}
            className="px-4 py-2.5 rounded-[10px] text-white text-[13px] font-semibold"
            style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
          >
            + New contract
          </button>
        )}
      </div>

      <div className="range-toggle mb-4">
        <button className={`range-btn ${tab === 'contracts' ? 'active' : ''}`} onClick={() => setTab('contracts')}>
          Contracts
        </button>
        <button className={`range-btn ${tab === 'notes' ? 'active' : ''}`} onClick={() => setTab('notes')}>
          Notes
        </button>
      </div>

      <div className="surface-card rounded-[18px] p-5">
        {tab === 'contracts' ? (
          contracts.length === 0 ? (
            <div className="empty-state">
              <h4>No contracts yet</h4>
              <p>Add a contract to record this practice's terms.</p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Payment terms', 'Credit limit', 'Start', 'End', 'Created'].map((h) => (
                    <th
                      key={h}
                      className="text-left text-[11px] uppercase tracking-wider text-ink-soft pb-2.5 border-b border-border"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.id}>
                    <td className="p-3 border-b border-border text-[13px] font-semibold">{c.payment_terms}</td>
                    <td className="p-3 border-b border-border text-[13px]">${Number(c.credit_limit).toFixed(2)}</td>
                    <td className="p-3 border-b border-border text-[13px] text-ink-soft">
                      {new Date(c.contract_start_date).toLocaleDateString()}
                    </td>
                    <td className="p-3 border-b border-border text-[13px] text-ink-soft">
                      {c.contract_end_date ? new Date(c.contract_end_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="p-3 border-b border-border text-[13px] text-ink-soft">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <div>
            <div className="flex gap-2 mb-4">
              <input
                className="form-input flex-1"
                type="text"
                placeholder="Add a note…"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
              />
              <button
                onClick={handleAddNote}
                disabled={noteSubmitting || !noteBody.trim()}
                className="px-4 rounded-[9px] text-white text-[13px] font-semibold disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
              >
                Add
              </button>
            </div>
            {notes.length === 0 ? (
              <div className="empty-state">
                <h4>No notes yet</h4>
                <p>Account interaction notes (calls, pricing discussions) will show up here.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {notes.map((n) => (
                  <div key={n.id} className="border border-border rounded-xl p-3">
                    <p className="text-[13px] text-ink">{n.body}</p>
                    <p className="text-[11px] text-ink-soft mt-1">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <NewContractModal
        open={newContractOpen}
        practiceId={practice.id}
        onClose={() => setNewContractOpen(false)}
        onCreated={load}
      />
    </div>
  );
}
