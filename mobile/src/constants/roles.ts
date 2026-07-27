/**
 * Role model shared with the backend/web portal. Mobile is dental-office-
 * facing only (plan §5) — lab-internal roles are included here for
 * completeness of the auth response type, but the nav in (app)/_layout.tsx
 * only builds tabs for the office-facing roles. If a lab-internal role
 * somehow logs into mobile, they see a "not available on mobile" screen
 * rather than a broken/empty tab bar.
 */
export type Role =
  | 'dentist'
  | 'office_manager'
  | 'office_staff'
  // Lab-internal — not part of mobile's tab set, see note above
  | 'technician'
  | 'admin'
  | 'lab_manager';

export const OFFICE_FACING_ROLES: Role[] = ['dentist', 'office_manager', 'office_staff'];

export function isOfficeFacingRole(role: Role): boolean {
  return OFFICE_FACING_ROLES.includes(role);
}
