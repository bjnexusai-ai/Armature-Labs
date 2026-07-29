import { useEffect, useState } from 'react';
import { ApiError, createCase, listCaseTypes, listPractices } from '../lib/api';
import type { CasePriority, CaseType, Practice } from '../lib/caseTypes';
import { useToast } from '../context/ToastContext';

interface NewCaseModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const PRIORITIES: CasePriority[] = ['Standard', 'Rush', 'Urgent'];

export function NewCaseModal({ open, onClose, onCreated }: NewCaseModalProps) {
  const { showToast } = useToast();

  const [practices, setPractices] = useState<Practice[]>([]);
  const [caseTypes, setCaseTypes] = useState<CaseType[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [patientName, setPatientName] = useState('');
  const [patientReferenceId, setPatientReferenceId] = useState('');
  const [practiceId, setPracticeId] = useState('');
  const [dentistId, setDentistId] = useState('');
  const [caseTypeId, setCaseTypeId] = useState('');
  const [priority, setPriority] = useState<CasePriority>('Standard');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    setLoadingOptions(true);
    setOptionsError(null);
    Promise.all([listPractices(), listCaseTypes()])
      .then(([p, c]) => {
        setPractices(p.practices);
        setCaseTypes(c.caseTypes);
      })
      .catch((err) => {
        setOptionsError(
          err instanceof ApiError ? err.message : 'Could not load practices / case types.'
        );
      })
      .finally(() => setLoadingOptions(false));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPatientName('');
      setPatientReferenceId('');
      setPracticeId('');
      setDentistId('');
      setCaseTypeId('');
      setPriority('Standard');
      setDueDate('');
      setNotes('');
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!practiceId || !caseTypeId || !dentistId || !dueDate) {
      setSubmitError('Practice, case type, dentist, and due date are required.');
      return;
    }

    setSubmitting(true);
    try {
      await createCase({
        practiceId: Number(practiceId),
        dentistId: Number(dentistId),
        caseTypeId: Number(caseTypeId),
        patientName: patientName || undefined,
        patientReferenceId: patientReferenceId || undefined,
        priority,
        dueDate,
        notes: notes || undefined,
      });
      showToast('Case created');
      onCreated();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not create the case.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`modal-overlay ${open ? 'open' : ''}`}
      aria-hidden={!open}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box w-full max-w-[460px] bg-card-bg rounded-[18px] p-[26px_26px_22px] shadow-[0_30px_70px_rgba(10,30,30,0.28)] max-h-[86vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-display text-title-sm font-bold text-ink m-0">New case</h3>
            <p className="text-xs text-ink-soft mt-0.5">Create a case record</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-page-bg-top border-0 cursor-pointer flex items-center justify-center shrink-0 hover:bg-border"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {optionsError && (
          <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
            {optionsError}
          </div>
        )}
        {submitError && (
          <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <FormRow label="Patient name">
            <input
              className="form-input"
              type="text"
              placeholder="e.g. Alvarez, M."
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
            />
          </FormRow>

          <FormRow label="Patient reference ID">
            <input
              className="form-input"
              type="text"
              placeholder="optional"
              value={patientReferenceId}
              onChange={(e) => setPatientReferenceId(e.target.value)}
            />
          </FormRow>

          <FormRow label="Practice">
            <select
              className="form-input"
              value={practiceId}
              onChange={(e) => setPracticeId(e.target.value)}
              disabled={loadingOptions}
              required
            >
              <option value="">Select a practice…</option>
              {practices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.practice_name}
                </option>
              ))}
            </select>
          </FormRow>

          <FormRow
            label="Dentist ID"
            hint="No dentist-by-practice directory endpoint exists yet (confirmed against users.controller.js) — enter the dentist_client user's numeric ID manually. This stays a documented gap until a backend session adds one."
          >
            <input
              className="form-input"
              type="number"
              min={1}
              placeholder="e.g. 14"
              value={dentistId}
              onChange={(e) => setDentistId(e.target.value)}
              required
            />
          </FormRow>

          <FormRow label="Case type">
            <select
              className="form-input"
              value={caseTypeId}
              onChange={(e) => setCaseTypeId(e.target.value)}
              disabled={loadingOptions}
              required
            >
              <option value="">Select a case type…</option>
              {caseTypes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormRow>

          <FormRow label="Priority">
            <select
              className="form-input"
              value={priority}
              onChange={(e) => setPriority(e.target.value as CasePriority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </FormRow>

          <FormRow label="Due date">
            <input
              className="form-input"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </FormRow>

          <FormRow label="Notes">
            <textarea
              className="form-input h-20 resize-none py-2"
              placeholder="optional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormRow>

          <div className="flex gap-2.5 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 rounded-[10px] border border-border bg-white font-semibold text-body-sm cursor-pointer hover:bg-page-bg-top"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loadingOptions}
              className="flex-1 h-10 rounded-[10px] text-white font-semibold text-body-sm cursor-pointer disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
            >
              {submitting ? 'Creating…' : 'Create case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3.5">
      <label className="block text-body-sm font-semibold text-ink mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-caption text-ink-soft mt-1 leading-snug">{hint}</p>}
    </div>
  );
}
