import { useState } from 'react';
import type { CaseRecord } from '../lib/caseTypes';
import { useAuth } from '../context/AuthContext';
import { NotesPanel } from './NotesPanel';
import { ProgressPhotosPanel } from './ProgressPhotosPanel';
import { ShipmentsPanel } from './ShipmentsPanel';
import { WarrantyClaimsPanel } from './WarrantyClaimsPanel';

type Tab = 'messages' | 'photos' | 'shipments' | 'warranty';

// Frontend Session 5 — Messages/notes, progress photo gallery, shipment
// tracking, and warranty claims. All four backend resources
// (case_notes, progress_photos, shipments, warranty_claims) are
// case-scoped (POST/GET /api/cases/:id/...), so — unlike Approvals, which
// got its own top-level nav item backed by a real GET /api/approvals list
// endpoint — these render as tabs inside the case detail view instead of a
// standalone page. There is no global "list all notes/shipments/etc across
// every case" endpoint to build a Messages nav screen against (confirmed
// against fulfillment.routes.js/notes routes — only two fulfillment
// actions aren't case-scoped, and neither is a list), so the "Messages"
// nav item stays a Session 5 stub for now rather than being wired to a
// guessed endpoint. Documented decision, see FRONTEND_LOG.md.
export function CaseActivityPanel({ caseRecord }: { caseRecord: CaseRecord }) {
  const { user } = useAuth();
  const isInternal = user?.role !== 'dentist_client';
  const [tab, setTab] = useState<Tab>('messages');

  return (
    <div className="surface-card rounded-[18px] p-5 mt-4">
      <div className="range-toggle mb-4 flex-wrap">
        <button className={`range-btn ${tab === 'messages' ? 'active' : ''}`} onClick={() => setTab('messages')}>
          Messages
        </button>
        {isInternal && (
          <button className={`range-btn ${tab === 'photos' ? 'active' : ''}`} onClick={() => setTab('photos')}>
            Progress photos
          </button>
        )}
        <button className={`range-btn ${tab === 'shipments' ? 'active' : ''}`} onClick={() => setTab('shipments')}>
          Shipments
        </button>
        <button className={`range-btn ${tab === 'warranty' ? 'active' : ''}`} onClick={() => setTab('warranty')}>
          Warranty
        </button>
      </div>

      {tab === 'messages' && <NotesPanel caseId={caseRecord.id} />}
      {tab === 'photos' && isInternal && <ProgressPhotosPanel caseId={caseRecord.id} />}
      {tab === 'shipments' && <ShipmentsPanel caseId={caseRecord.id} isInternal={isInternal} />}
      {tab === 'warranty' && (
        <WarrantyClaimsPanel caseId={caseRecord.id} caseStatus={caseRecord.current_status} isInternal={isInternal} />
      )}
    </div>
  );
}
