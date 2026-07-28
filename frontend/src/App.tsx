import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { AppShell } from './layouts/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CaseQueuePage } from './pages/CaseQueuePage';
import { CaseDetailPage } from './pages/CaseDetailPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { InvoiceDetailPage } from './pages/InvoiceDetailPage';
import { QcPage } from './pages/QcPage';
import { MaterialsPage } from './pages/MaterialsPage';
import { MaterialDetailPage } from './pages/MaterialDetailPage';
import { PurchaseOrdersPage } from './pages/PurchaseOrdersPage';
import { PurchaseOrderDetailPage } from './pages/PurchaseOrderDetailPage';
import { PracticesPage } from './pages/PracticesPage';
import { PracticeDetailPage } from './pages/PracticeDetailPage';
import { ReportsPage } from './pages/ReportsPage';
import { EquipmentPage } from './pages/EquipmentPage';
import { EquipmentDetailPage } from './pages/EquipmentDetailPage';
import { SchedulingPage } from './pages/SchedulingPage';
import { ComingSoon } from './pages/stubs/ComingSoon';
import { NAV_ITEMS } from './lib/navConfig';

function LoginRoute() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppShell>
                <DashboardPage />
              </AppShell>
            </ProtectedRoute>
          }
        />

        {/* Session 2 — real case queue + case detail, built in commit
            ee0208b but never routed. Wired here. */}
        <Route
          path="/cases"
          element={
            <ProtectedRoute>
              <AppShell>
                <CaseQueuePage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/cases/:id"
          element={
            <ProtectedRoute>
              <AppShell>
                <CaseDetailPage />
              </AppShell>
            </ProtectedRoute>
          }
        />

        {/* Session 3 — real approvals queue, backend GET /api/approvals
            confirmed live against approvals.controller.js. */}
        <Route
          path="/approvals"
          element={
            <ProtectedRoute>
              <AppShell>
                <ApprovalsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />

        {/* Session 4 — invoice list/detail (manual mark-paid only, no
            Stripe yet) and QC checklist UI, confirmed live against
            billing.controller.js / qc.controller.js. */}
        <Route
          path="/invoices"
          element={
            <ProtectedRoute>
              <AppShell>
                <InvoicesPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices/:id"
          element={
            <ProtectedRoute>
              <AppShell>
                <InvoiceDetailPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/qc"
          element={
            <ProtectedRoute>
              <AppShell>
                <QcPage />
              </AppShell>
            </ProtectedRoute>
          }
        />

        {/* Session 6 — Materials/inventory, procurement (vendors + POs),
            practice CRM (contracts/notes), confirmed live against
            inventory.controller.js / procurement.controller.js /
            accounts.controller.js (mounted on practices.routes.js). */}
        <Route
          path="/materials"
          element={
            <ProtectedRoute>
              <AppShell>
                <MaterialsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/materials/:id"
          element={
            <ProtectedRoute>
              <AppShell>
                <MaterialDetailPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchase-orders"
          element={
            <ProtectedRoute>
              <AppShell>
                <PurchaseOrdersPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchase-orders/:id"
          element={
            <ProtectedRoute>
              <AppShell>
                <PurchaseOrderDetailPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/practices"
          element={
            <ProtectedRoute>
              <AppShell>
                <PracticesPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/practices/:id"
          element={
            <ProtectedRoute>
              <AppShell>
                <PracticeDetailPage />
              </AppShell>
            </ProtectedRoute>
          }
        />

        {/* Session 7 Chunk 2 — saved reports + charts, real endpoint
            (GET/POST/DELETE /api/reports/saved-reports) confirmed against
            reports.controller.js before building. */}
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <AppShell>
                <ReportsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />

        {/* Session 7 Chunk 3 — equipment catalog/maintenance + technician
            scheduling, real endpoints (GET/POST /api/equipment,
            /api/equipment/:id/maintenance-logs, /api/planning/shifts,
            /api/planning/bookings) confirmed against their controllers
            before building. */}
        <Route
          path="/equipment"
          element={
            <ProtectedRoute>
              <AppShell>
                <EquipmentPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/equipment/:id"
          element={
            <ProtectedRoute>
              <AppShell>
                <EquipmentDetailPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/scheduling"
          element={
            <ProtectedRoute>
              <AppShell>
                <SchedulingPage />
              </AppShell>
            </ProtectedRoute>
          }
        />

        {/* Every remaining nav item beyond Session 1 renders as a stub route
            so the URL exists and doesn't 404, but the screen itself is built
            in its matching future session -- never ahead of the backend. */}
        {NAV_ITEMS.filter((item) => item.session > 1 && !item.live).map((item) => (
          <Route
            key={item.key}
            path={item.path}
            element={
              <ProtectedRoute>
                <AppShell>
                  <ComingSoon label={item.label} session={item.session} />
                </AppShell>
              </ProtectedRoute>
            }
          />
        ))}

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
