import { useCallback, useEffect, useState } from 'react';
import { ApiError, deleteSavedReport, listPractices, listSavedReports } from '../lib/api';
import type { CaseRecord, Practice } from '../lib/caseTypes';
import type { SavedReport } from '../lib/reportTypes';
import { fetchAllCasesForDashboard } from '../lib/dashboardMetrics';
import {
  approvalResponseTimeSeries,
  casesByStatus,
  fetchApprovalsForRange,
  topPracticesByVolume,
  type RangeKey,
} from '../lib/reportMetrics';
import { STATUS_COLORS } from '../lib/statusColors';
import { DonutChart } from '../components/DonutChart';
import { LineChart } from '../components/LineChart';
import { BarChart } from '../components/BarChart';
import { SavedReportModal } from '../components/SavedReportModal';
import { useToast } from '../context/ToastContext';

/**
 * Session 7 Chunk 2 — Reports page. Backend Session 7 confirmed:
 * saved_reports is a plain CRUD preset resource with no "generate" verb
 * (reports.controller.js), so the three charts below are computed
 * client-side from GET /api/cases, GET /api/approvals, GET /api/practices
 * — the exact fallback the Master Frontend Plan's §1.1 instruction names
 * when no dedicated aggregate endpoint exists. Gated to Owner/Office
 * Manager per navConfig.ts (mirrors requireInternal + the controller's own
 * extra Revenue-type restriction).
 */
export function ReportsPage() {
  const { showToast } = useToast();

  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [practices, setPractices] = useState<Practice[]>([]);
  const [range, setRange] = useState<RangeKey>('7D');
  const [responseSeries, setResponseSeries] = useState<ReturnType<typeof approvalResponseTimeSeries>>([]);
  const [isolatedStatus, setIsolatedStatus] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [lineLoading, setLineLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const loadCore = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([listSavedReports(), fetchAllCasesForDashboard(), listPractices()])
      .then(([reportsRes, caseRows, practicesRes]) => {
        setSavedReports(reportsRes.savedReports);
        setCases(caseRows);
        setPractices(practicesRes.practices);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load report data.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  useEffect(() => {
    setLineLoading(true);
    fetchApprovalsForRange(range)
      .then((approvals) => setResponseSeries(approvalResponseTimeSeries(approvals, range)))
      .catch(() => setResponseSeries([]))
      .finally(() => setLineLoading(false));
  }, [range]);

  async function handleDelete(id: number) {
    if (!window.confirm('Delete this saved report?')) return;
    try {
      await deleteSavedReport(id);
      setSavedReports((prev) => prev.filter((r) => r.id !== id));
      showToast('Saved report deleted.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not delete this saved report.');
    }
  }

  const statusSlices = casesByStatus(cases).map((s) => ({
    key: s.status,
    label: s.status,
    value: s.count,
    color: STATUS_COLORS[s.status].text,
  }));
  const practiceVolume = topPracticesByVolume(cases, practices, 30);

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-ink-soft">Saved report presets and live operational charts.</p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="btn-primary h-10 px-4 rounded-[10px] font-semibold text-body-sm shrink-0"
        >
          + New saved report
        </button>
      </div>

      {error && (
        <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
          {error}
        </div>
      )}

      {/* Saved report presets */}
      <div className="surface-card rounded-[18px] p-5 mb-5">
        <h3 className="font-display text-body-lg font-bold text-ink mb-3">Saved reports</h3>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-11 rounded-lg" />
            ))}
          </div>
        ) : savedReports.length === 0 ? (
          <div className="empty-state">
            <h4>No saved reports yet</h4>
            <p>Save a report preset to quickly get back to it later.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full border-collapse">
            <thead>
            <tr>
            {['Name', 'Type', 'Last updated', ''].map((h) => (
            <th key={h} className="text-left text-caption uppercase tracking-wider text-ink pb-2.5 border-b border-border">
            {h}
            </th>
            ))}
            </tr>
            </thead>
            <tbody>
            {savedReports.map((r) => (
            <tr key={r.id} className="hover:bg-page-bg-top transition-colors">
            <td className="p-3 border-b border-border text-body-sm font-semibold">{r.name}</td>
            <td className="p-3 border-b border-border text-body-sm text-ink-soft">{r.report_type}</td>
            <td className="p-3 border-b border-border text-body-sm text-ink-soft">
            {new Date(r.updated_at).toLocaleDateString()}
            </td>
            <td className="p-3 border-b border-border text-right">
            <button
            type="button"
            onClick={() => handleDelete(r.id)}
            className="text-caption text-[#9C4326] font-semibold cursor-pointer bg-transparent border-0"
            >
            Delete
            </button>
            </td>
            </tr>
            ))}
            </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Donut — cases by status */}
      <div className="surface-card rounded-[18px] p-5 mb-5">
        <h3 className="font-display text-body-lg font-bold text-ink mb-1">Cases by status</h3>
        <p className="text-xs text-ink-soft mb-4">Click a segment (or the legend) to isolate it.</p>
        {loading ? (
          <div className="skeleton h-[180px] rounded-lg" />
        ) : (
          <DonutChart slices={statusSlices} isolatedKey={isolatedStatus} onToggleIsolate={setIsolatedStatus} centerLabel="Cases" />
        )}
      </div>

      {/* Line — approval response time */}
      <div className="surface-card rounded-[18px] p-5 mb-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
          <h3 className="font-display text-body-lg font-bold text-ink">Approval response time</h3>
          <div className="range-toggle">
            {(['7D', '6W', '90D'] as RangeKey[]).map((r) => (
              <button key={r} type="button" className={`range-btn ${range === r ? 'active' : ''}`} onClick={() => setRange(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-ink-soft mb-4">Average hours between an approval being requested and responded to.</p>
        {lineLoading ? (
          <div className="skeleton h-[220px] rounded-lg" />
        ) : (
          <LineChart
            points={responseSeries.map((p) => ({ label: p.label, value: p.avgHours, sampleSize: p.sampleSize }))}
            valueSuffix="h"
          />
        )}
      </div>

      {/* Bar — top practices by volume */}
      <div className="surface-card rounded-[18px] p-5">
        <h3 className="font-display text-body-lg font-bold text-ink mb-1">Top practices by volume</h3>
        <p className="text-xs text-ink-soft mb-4">Cases submitted in the last 30 days, top 8 practices.</p>
        {loading ? (
          <div className="skeleton h-[200px] rounded-lg" />
        ) : (
          <BarChart
            data={practiceVolume.map((p) => ({ key: String(p.practiceId), label: p.practiceName, value: p.count }))}
            emptyTitle="No submissions in the last 30 days"
            emptyBody="Cases created in this window will show up here by practice."
          />
        )}
      </div>

      <SavedReportModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() =>
          listSavedReports()
            .then((res) => setSavedReports(res.savedReports))
            .catch(() => {})
        }
      />
    </div>
  );
}
