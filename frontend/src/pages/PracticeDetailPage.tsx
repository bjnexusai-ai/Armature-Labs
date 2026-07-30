import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ApiError,
  getPractice,
  listPracticeContracts,
  listPracticeNotes,
  createPracticeNote,
  listPatients,
  createPatient,
  updatePatient,
} from '../lib/api';
import type { Practice, PracticeContract, PracticeNote, Patient } from '../lib/caseTypes';
import { NewContractModal } from '../components/NewContractModal';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

type Tab = 'contracts' | 'notes' | 'patients';

// Contracts/Notes/Patients tabs — notes tab has no visibility toggle since
// practice notes have no client-facing side at all (contrast with case
// notes), confirmed against accounts.controller.js's own comment. Patients
// is scoped to this practice (not a lab-wide standalone resource) per the
// client-spec doc — matches this same nested-tab pattern rather than a
// top-level nav item.
export function PracticeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('contracts');

  const [practice, setPractice] = useState<Practice | null>(null);
  const [contracts, setContracts] = useState<PracticeContract[]>([]);
  const [notes, setNotes] = useState<PracticeNote[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newContractOpen, setNewContractOpen] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  // Writes gated the way patients.routes.js actually gates them: internal
  // staff always allowed; dentist_client requires can_edit_patient_info.
  const canEditPatients = user?.role !== 'dentist_client' || Boolean(user?.canEditPatientInfo);

  const [newPatientFirstName, setNewPatientFirstName] = useState('');
  const [newPatientLastName, setNewPatientLastName] = useState('');
  const [patientSubmitting, setPatientSubmitting] = useState(false);
  const [patientFormError, setPatientFormError] = useState<string | null>(null);

  const [editingPatientId, setEditingPatientId] = useState<number | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      getPractice(id),
      listPracticeContracts(id),
      listPracticeNotes(id),
      listPatients({ practiceId: Number(id) }),
    ])
      .then(([p, c, n, pat]) => {
        setPractice(p.practice);
        setContracts(c.contracts);
        setNotes(n.notes);
        setPatients(pat.patients);
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

  async function handleAddPatient() {
    if (!id || !newPatientFirstName.trim() || !newPatientLastName.trim()) return;
    setPatientSubmitting(true);
    setPatientFormError(null);
    try {
      await createPatient({
        practiceId: Number(id),
        firstName: newPatientFirstName.trim(),
        lastName: newPatientLastName.trim(),
      });
      setNewPatientFirstName('');
      setNewPatientLastName('');
      load();
    } catch (err) {
      setPatientFormError(err instanceof ApiError ? err.message : 'Could not add the patient.');
    } finally {
      setPatientSubmitting(false);
    }
  }

  function startEditPatient(p: Patient) {
    setEditingPatientId(p.id);
    setEditFirstName(p.first_name);
    setEditLastName(p.last_name);
  }

  function cancelEditPatient() {
    setEditingPatientId(null);
    setEditFirstName('');
    setEditLastName('');
  }

  async function handleSavePatient(patientId: number) {
    if (!editFirstName.trim() || !editLastName.trim()) return;
    setEditSubmitting(true);
    try {
      await updatePatient(patientId, {
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
      });
      cancelEditPatient();
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not update the patient.');
    } finally {
      setEditSubmitting(false);
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
      <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5">
        {error || 'Practice not found.'}
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => navigate('/practices')} className="text-body-sm text-[#1C8A93] font-semibold mb-4">
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
            className="px-4 py-2.5 rounded-[10px] text-white text-body-sm font-semibold"
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
        <button className={`range-btn ${tab === 'patients' ? 'active' : ''}`} onClick={() => setTab('patients')}>
          Patients
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
            <div className="table-scroll">
              <table className="w-full border-collapse">
              <thead>
              <tr>
              {['Payment terms', 'Credit limit', 'Start', 'End', 'Created'].map((h) => (
              <th
              key={h}
              className="text-left text-caption uppercase tracking-wider text-ink-soft pb-2.5 border-b border-border"
              >
              {h}
              </th>
              ))}
              </tr>
              </thead>
              <tbody>
              {contracts.map((c) => (
              <tr key={c.id}>
              <td className="p-3 border-b border-border text-body-sm font-semibold">{c.payment_terms}</td>
              <td className="p-3 border-b border-border text-body-sm">${Number(c.credit_limit).toFixed(2)}</td>
              <td className="p-3 border-b border-border text-body-sm text-ink-soft">
              {new Date(c.contract_start_date).toLocaleDateString()}
              </td>
              <td className="p-3 border-b border-border text-body-sm text-ink-soft">
              {c.contract_end_date ? new Date(c.contract_end_date).toLocaleDateString() : '—'}
              </td>
              <td className="p-3 border-b border-border text-body-sm text-ink-soft">
              {new Date(c.created_at).toLocaleDateString()}
              </td>
              </tr>
              ))}
              </tbody>
              </table>
            </div>
          )
        ) : tab === 'notes' ? (
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
                className="px-4 rounded-[10px] text-white text-body-sm font-semibold disabled:opacity-60"
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
                    <p className="text-body-sm text-ink">{n.body}</p>
                    <p className="text-caption text-ink-soft mt-1">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            {canEditPatients && (
              <div className="mb-4">
                {patientFormError && (
                  <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-2.5">
                    {patientFormError}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    className="form-input flex-1"
                    type="text"
                    placeholder="First name"
                    value={newPatientFirstName}
                    onChange={(e) => setNewPatientFirstName(e.target.value)}
                  />
                  <input
                    className="form-input flex-1"
                    type="text"
                    placeholder="Last name"
                    value={newPatientLastName}
                    onChange={(e) => setNewPatientLastName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddPatient()}
                  />
                  <button
                    onClick={handleAddPatient}
                    disabled={patientSubmitting || !newPatientFirstName.trim() || !newPatientLastName.trim()}
                    className="px-4 rounded-[10px] text-white text-body-sm font-semibold disabled:opacity-60 shrink-0"
                    style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
                  >
                    Add patient
                  </button>
                </div>
              </div>
            )}
            {patients.length === 0 ? (
              <div className="empty-state">
                <h4>No patients yet</h4>
                <p>Patients added here can be linked to cases for this practice.</p>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="w-full border-collapse">
                <thead>
                <tr>
                {['First name', 'Last name', 'Added', ''].map((h) => (
                <th
                key={h}
                className="text-left text-caption uppercase tracking-wider text-ink-soft pb-2.5 border-b border-border"
                >
                {h}
                </th>
                ))}
                </tr>
                </thead>
                <tbody>
                {patients.map((p) =>
                editingPatientId === p.id ? (
                <tr key={p.id}>
                <td className="p-3 border-b border-border">
                <input
                className="form-input"
                type="text"
                value={editFirstName}
                onChange={(e) => setEditFirstName(e.target.value)}
                />
                </td>
                <td className="p-3 border-b border-border">
                <input
                className="form-input"
                type="text"
                value={editLastName}
                onChange={(e) => setEditLastName(e.target.value)}
                />
                </td>
                <td className="p-3 border-b border-border text-body-sm text-ink-soft">
                {new Date(p.created_at).toLocaleDateString()}
                </td>
                <td className="p-3 border-b border-border text-right whitespace-nowrap">
                <button
                onClick={() => handleSavePatient(p.id)}
                disabled={editSubmitting || !editFirstName.trim() || !editLastName.trim()}
                className="text-caption font-semibold text-[#1C8A93] hover:underline mr-3 disabled:opacity-60"
                >
                Save
                </button>
                <button
                onClick={cancelEditPatient}
                className="text-caption font-semibold text-ink-soft hover:underline"
                >
                Cancel
                </button>
                </td>
                </tr>
                ) : (
                <tr key={p.id}>
                <td className="p-3 border-b border-border text-body-sm font-semibold">{p.first_name}</td>
                <td className="p-3 border-b border-border text-body-sm">{p.last_name}</td>
                <td className="p-3 border-b border-border text-body-sm text-ink-soft">
                {new Date(p.created_at).toLocaleDateString()}
                </td>
                <td className="p-3 border-b border-border text-right">
                {canEditPatients && (
                <button
                onClick={() => startEditPatient(p)}
                className="text-caption font-semibold text-[#1C8A93] hover:underline"
                >
                Edit
                </button>
                )}
                </td>
                </tr>
                )
                )}
                </tbody>
                </table>
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
