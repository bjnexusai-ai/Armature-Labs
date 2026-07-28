import type { AuthUser, Role } from './authTypes';

/** Matches the reference demo's three sidebar section headers
 * (Overview / Operations / Finance) — items are grouped and rendered
 * under a `.nav-section` label matching each item's `section`. */
export type NavSection = 'Overview' | 'Operations' | 'Finance';

/** Icon key -> looked up against ICONS in AppShell.tsx. Ported 1:1 from the
 * reference's per-item `.nav-icon` svg where a matching screen exists;
 * screens the reference demo doesn't have (Approvals, Messages) use a
 * same-style icon consistent with the rest of the set. */
export type NavIconKey =
  | 'dashboard'
  | 'queue'
  | 'approvals'
  | 'materials'
  | 'procurement'
  | 'practices'
  | 'equipment'
  | 'scheduling'
  | 'invoices'
  | 'reports'
  | 'messages'
  | 'qc'
  | 'manufacturers';

export interface NavItem {
  key: string;
  label: string;
  path: string;
  section: NavSection;
  icon: NavIconKey;
  /** Roles allowed to see this item at all. Empty = every authenticated role. */
  roles?: Role[];
  /**
   * Which backend/frontend session ships this screen for real. Anything not
   * "1" renders as a disabled "Coming soon" stub — same rule the Wiring
   * Prompt applied to the demo HTML. Don't wire ahead of the backend.
   */
  session: number;
  /**
   * Whether the real screen is built and wired. Defaults to true only for
   * session 1 unless explicitly set. Case Queue (session 2) was built in
   * commit ee0208b (CaseQueuePage.tsx, CaseDetailPage.tsx) but that commit
   * never flipped this on or added the routes — this was a real gap, not a
   * stylistic one. Fixed here.
   */
  live?: boolean;
}

// This is UI convenience only — every one of these is re-enforced server-side
// (requireRole / requireBillingAccess / requirePortalPermission / tenant
// isolation). Hiding a nav item here never becomes the only protection.
export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard', section: 'Overview', icon: 'dashboard', session: 1 },
  { key: 'cases', label: 'Case Queue', path: '/cases', section: 'Operations', icon: 'queue', session: 2, live: true },
  {
    key: 'approvals',
    label: 'Approvals',
    path: '/approvals',
    section: 'Operations',
    icon: 'approvals',
    session: 3,
    live: true,
  },
  {
    key: 'materials',
    label: 'Materials',
    path: '/materials',
    section: 'Operations',
    icon: 'materials',
    roles: ['owner', 'office_manager', 'assistant_technician', 'designer'],
    session: 6,
    live: true,
  },
  {
    key: 'procurement',
    label: 'Vendors & POs',
    path: '/purchase-orders',
    section: 'Operations',
    icon: 'procurement',
    // procurement.routes.js is requireManagerRole on every route including
    // reads, stricter than Materials above — gated accordingly.
    roles: ['owner', 'office_manager'],
    session: 6,
    live: true,
  },
  {
    key: 'practices',
    label: 'Practices',
    path: '/practices',
    section: 'Operations',
    icon: 'practices',
    // The list endpoint itself isn't requireInternal, but the CRM actions
    // on the detail page (contracts/notes) are requireManagerRole — gating
    // the nav item to match that reality rather than exposing a screen
    // whose write actions would 403 for other internal roles.
    roles: ['owner', 'office_manager'],
    session: 6,
    live: true,
  },
  {
    key: 'equipment',
    label: 'Equipment',
    path: '/equipment',
    section: 'Operations',
    icon: 'equipment',
    roles: ['owner', 'office_manager', 'assistant_technician', 'designer'],
    session: 7,
    live: true,
  },
  {
    key: 'scheduling',
    label: 'Scheduling',
    path: '/scheduling',
    section: 'Operations',
    icon: 'scheduling',
    // planning.routes.js is requireInternal only, no extra manager gate —
    // kept at that floor, matching the route file's own comment.
    roles: ['owner', 'office_manager', 'assistant_technician', 'designer'],
    session: 7,
    live: true,
  },
  {
    key: 'qc',
    label: 'Quality Control',
    path: '/qc',
    section: 'Operations',
    icon: 'qc',
    // Entire QC router is requireInternal server-side (qc.routes.js) — no
    // portal/dentist_client access at all, unlike Invoices below.
    roles: ['owner', 'office_manager', 'assistant_technician', 'designer'],
    session: 4,
    live: true,
  },
  { key: 'messages', label: 'Messages', path: '/messages', section: 'Operations', icon: 'messages', session: 5 },
  {
    key: 'invoices',
    label: 'Invoices',
    path: '/invoices',
    section: 'Finance',
    icon: 'invoices',
    roles: ['owner', 'office_manager', 'dentist_client'],
    session: 4,
    live: true,
  },
  {
    key: 'reports',
    label: 'Reports',
    path: '/reports',
    section: 'Finance',
    icon: 'reports',
    roles: ['owner', 'office_manager'],
    session: 7,
    live: true,
  },
  {
    key: 'manufacturers',
    label: 'Manufacturers',
    path: '/manufacturers',
    section: 'Finance',
    icon: 'manufacturers',
    // manufacturers.routes.js applies requireManagerRole once at the router
    // level to every route, including reads — no dentist_client or other
    // internal-role access at all, gated to match.
    roles: ['owner', 'office_manager'],
    session: 8,
    live: true,
  },
];

export function visibleNavItems(user: AuthUser): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role));
}
