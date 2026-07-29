import type { AuthUser } from './authTypes';

// Frontend Session 9 §3.3 — this exact condition
// (`user?.role === 'owner' || user?.role === 'office_manager'`) was
// duplicated independently in 7 places (StockTransactionModal,
// SavedReportModal, InvoiceDetailPage, EquipmentDetailPage, InvoicesPage,
// EquipmentPage, MaterialsPage — confirmed by grepping `user?.role ===`
// across src/ before writing this, not assumed from memory). Each one is
// UI convenience only, mirroring a real server-side `requireManagerRole`
// check on the corresponding write route — this helper doesn't change
// what's enforced, it just gives the 7 copies one place to stay in sync
// instead of drifting independently over time.
export function isManagerRole(user: AuthUser | null | undefined): boolean {
  return user?.role === 'owner' || user?.role === 'office_manager';
}
