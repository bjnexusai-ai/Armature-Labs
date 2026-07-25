import type { AuthUser, Role } from './authTypes';

export interface NavItem {
  key: string;
  label: string;
  path: string;
  /** Roles allowed to see this item at all. Empty = every authenticated role. */
  roles?: Role[];
  /**
   * Which backend/frontend session ships this screen for real. Anything not
   * "1" renders as a disabled "Coming soon" stub — same rule the Wiring
   * Prompt applied to the demo HTML. Don't wire ahead of the backend.
   */
  session: number;
}

// This is UI convenience only — every one of these is re-enforced server-side
// (requireRole / requireBillingAccess / requirePortalPermission / tenant
// isolation). Hiding a nav item here never becomes the only protection.
export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard', session: 1 },
  { key: 'cases', label: 'Case Queue', path: '/cases', session: 2 },
  { key: 'approvals', label: 'Approvals', path: '/approvals', session: 3 },
  {
    key: 'invoices',
    label: 'Invoices',
    path: '/invoices',
    roles: ['owner', 'office_manager', 'dentist_client'],
    session: 4,
  },
  { key: 'messages', label: 'Messages', path: '/messages', session: 5 },
  {
    key: 'materials',
    label: 'Materials',
    path: '/materials',
    roles: ['owner', 'office_manager', 'assistant_technician', 'designer'],
    session: 6,
  },
  {
    key: 'reports',
    label: 'Reports',
    path: '/reports',
    roles: ['owner', 'office_manager'],
    session: 7,
  },
  {
    key: 'equipment',
    label: 'Equipment',
    path: '/equipment',
    roles: ['owner', 'office_manager', 'assistant_technician', 'designer'],
    session: 7,
  },
];

export function visibleNavItems(user: AuthUser): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role));
}
