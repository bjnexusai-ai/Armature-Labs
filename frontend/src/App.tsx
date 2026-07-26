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
