import { useState } from 'react';
import { ApiError, updateCaseStatus } from '../lib/api';
import { LINEAR_STATUSES, EXCEPTION_STATUSES } from '../lib/caseTypes';
import type { CaseRecord, CaseStatus } from '../lib/caseTypes';

// Mirrors backend/src/utils/caseStatus.js's nextLinearStatus/isException
// exactly — this is presentation logic only (which buttons to show), the
// backend's evaluateTransition is still the source of truth and re-checks
// everything server-side on the PATCH.
function nextLinearStatus(status: CaseStatus): CaseStatus | null {
  const idx = (LINEAR_STATUSES as readonly string[]).indexOf(status);
  if (idx === -1 || idx === LINEAR_STATUSES.length - 1) return null;
  return LINEAR_STATUSES[idx + 1];
}

function isException(status: CaseStatus): boolean {
  return (EXCEPTION_STATUSES as readonly string[]).includes(status);
}

interface Props {
  caseRecord: CaseRecord;
  onUpdated: () => void;
}

export function CaseStatusControl({ caseRecord, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [exceptionTarget, setExceptionTarget] = useState<'Case on Hold' | 'Delayed'>('Case on Hold');
  const [remarks, setRemarks] = useState('');

  const current = caseRecord.current_status;
  const terminal = current === 'Delivered';
  const suspended = isException(current);
  const next = !suspended && !terminal ? nextLinearStatus(current) : null;

  async function submit(newStatus: CaseStatus, remarksValue?: string) {
    setBusy(true);
    setError(null);
    try {
      await updateCaseStatus(caseRecord.id, { newStatus, remarks: remarksValue || undefined });
      setExceptionOpen(false);
      setRemarks('');
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update status.');
    } finally {
      setBusy(false);
    }
  }

  if (terminal) {
    return (
      <p className="text-body-sm text-ink-soft m-0">
        Delivered — this case is complete and cannot be moved further.
      </p>
    );
  }

  // Currently on Hold / Delayed: the only legal move is clearing back to
  // whatever status it was suspended from (evaluateTransition rejects
  // anything else), so this is the only action offered.
  if (suspended) {
    return (
      <div className="bg-page-bg-top rounded-[10px] p-3">
        <p className="text-body-sm text-ink mb-2">
          Currently <b>{current}</b>. Clearing returns it to <b>{caseRecord.prior_status}</b>.
        </p>
        <textarea
          className="form-input w-full text-body-sm mb-2"
          rows={2}
          placeholder="Remarks (required to clear)"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />
        {error && <p className="text-body-sm text-[#9C4326] mb-2">{error}</p>}
        <button
          disabled={busy || !remarks.trim()}
          onClick={() => caseRecord.prior_status && submit(caseRecord.prior_status, remarks)}
          className="rounded-lg text-white font-semibold text-sm px-4 py-2 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
        >
          {busy ? 'Clearing…' : `Clear to ${caseRecord.prior_status}`}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      {next && (
        <button
          disabled={busy}
          onClick={() => submit(next)}
          className="rounded-lg text-white font-semibold text-sm px-4 py-2 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
        >
          {busy ? 'Updating…' : `Advance to ${next}`}
        </button>
      )}
      <button
        disabled={busy}
        onClick={() => setExceptionOpen((o) => !o)}
        className="rounded-lg text-body-sm font-semibold px-3.5 py-2 border border-border hover:bg-page-bg-top"
      >
        Put on hold / delay
      </button>
      {error && <p className="text-body-sm text-[#9C4326] w-full m-0">{error}</p>}
      {exceptionOpen && (
        <div className="w-full bg-page-bg-top rounded-[10px] p-3 mt-1">
          <div className="flex gap-2 mb-2">
            {(['Case on Hold', 'Delayed'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setExceptionTarget(s)}
                className="text-body-sm font-semibold px-3 py-1.5 rounded-md border"
                style={{
                  borderColor: 'var(--color-border)',
                  background: exceptionTarget === s ? 'var(--color-badge-amber-bg)' : 'white',
                  color: exceptionTarget === s ? 'var(--color-badge-amber)' : 'var(--color-ink)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <textarea
            className="form-input w-full text-body-sm mb-2"
            rows={2}
            placeholder="Remarks (required)"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
          <button
            disabled={busy || !remarks.trim()}
            onClick={() => submit(exceptionTarget, remarks)}
            className="rounded-lg text-white font-semibold text-sm px-4 py-2 disabled:opacity-50"
            style={{ background: 'var(--color-badge-amber)' }}
          >
            {busy ? 'Saving…' : `Mark ${exceptionTarget}`}
          </button>
        </div>
      )}
    </div>
  );
}
