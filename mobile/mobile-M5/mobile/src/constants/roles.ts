/**
 * Role model — confirmed against the live backend
 * (migrations/0001_roles.js + auth.controller.js), not assumed. Real
 * roles: owner, office_manager, assistant_technician, designer,
 * dentist_client. NOTE: 'office_manager' here is a LAB-internal role
 * (full internal access incl. billing) — not a dental office role.
 * Confusing name, but that's what the backend seeds. The only
 * office-facing/portal role is 'dentist_client'.
 */
export type Role = 'owner' | 'office_manager' | 'assistant_technician' | 'designer' | 'dentist_client';

export const OFFICE_FACING_ROLES: Role[] = ['dentist_client'];

export function isOfficeFacingRole(role: Role): boolean {
  return OFFICE_FACING_ROLES.includes(role);
}
