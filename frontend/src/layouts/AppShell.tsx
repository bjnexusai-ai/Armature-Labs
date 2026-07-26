import { type ReactNode, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { visibleNavItems, type NavIconKey, type NavItem } from '../lib/navConfig';

// Ported verbatim from the reference index.html's per-item `.nav-icon` svgs
// (viewBox 0 0 24 24, stroke currentColor, 1.8 stroke-width). Approvals and
// Messages don't exist in the reference demo, so those two are drawn in the
// same stroke-icon style rather than left blank.
const NAV_ICON_PATHS: Record<NavIconKey, ReactNode> = {
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  queue: (
    <path d="M12 3.5c-3 0-5.2 2-5.2 4.6 0 1.7.5 2.9 1 4.3.6 1.7 1.2 4.2 2.6 4.2 1.4 0 1.5-2.6 2-3.9.3-.6 1-.6 1.3 0 .5 1.3.6 3.9 2 3.9 1.4 0 2-2.5 2.6-4.2.5-1.4 1-2.6 1-4.3 0-2.6-2.2-4.6-5.3-4.6z" />
  ),
  approvals: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.3l2.3 2.3 4.7-5" />
    </>
  ),
  materials: (
    <>
      <path d="M3.5 8 12 3.5 20.5 8 12 12.5 3.5 8Z" />
      <path d="M3.5 8v8L12 20.5 20.5 16V8" />
      <path d="M12 12.5V20.5" />
    </>
  ),
  equipment: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V19.5a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H4.5a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5V4.5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.5 1H19.5a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  invoices: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M7 14h4" />
    </>
  ),
  reports: (
    <>
      <path d="M5 3.5h9L20 8.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5V8.5h6" />
      <path d="M8.5 13h7M8.5 16.5h5" />
    </>
  ),
  messages: (
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H10l-4.5 4V16H6.5A2.5 2.5 0 0 1 4 13.5v-7Z" />
  ),
};

function NavIcon({ icon }: { icon: NavIconKey }) {
  return (
    <span className="nav-icon w-4 h-4 shrink-0 inline-flex">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {NAV_ICON_PATHS[icon]}
      </svg>
    </span>
  );
}

/** Groups the already-ordered, already-role-filtered nav items into
 * consecutive runs by `section`, matching the reference's Overview /
 * Operations / Finance `.nav-section` headers. */
function groupBySection(items: NavItem[]): { section: string; items: NavItem[] }[] {
  const groups: { section: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.section === item.section) last.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups;
}

function initials(fullName: string): string {
  return fullName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}
function roleLabel(role: string): string {
  return role.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

// Static preview items -- real notification triggers land in Backend/Frontend
// Session 3. Kept here, clearly non-live, so the visual/interaction pattern
// (bell, dot, dropdown, open/close) exists and is ready to wire later rather
// than being invented from scratch in Session 3.
const DEMO_NOTIFS = [
  { icon: '🦷', title: 'Design approval requested', time: '12m ago' },
  { icon: '📦', title: 'Case shipped', time: '1h ago' },
  { icon: '⏰', title: 'Due date approaching', time: '3h ago' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [notifOpen, setNotifOpen] = useState(false);
  if (!user) return null;

  const items = visibleNavItems(user);

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 relative mesh-gradient text-white flex flex-col py-6 isolate">
        <div className="sidebar-scrim absolute inset-0 pointer-events-none z-0" />

        <div className="relative z-[1] flex items-center gap-3 px-6 mb-6">
          <div
            className="w-[46px] h-[46px] shrink-0 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg,#0D6B72 0%,#0C6249 100%)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.18) inset, 0 4px 14px rgba(6,30,26,0.4), 0 0 20px rgba(95,232,206,0.4)',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M24 6C16.8 6 11 11 11 17.8C11 22 12.2 25.3 13.3 29.2C14.6 33.7 16 40 18.7 40C21.2 40 21.4 32.8 22.7 29.4C23.3 27.9 24.7 27.9 25.3 29.4C26.6 32.8 26.8 40 29.3 40C32 40 33.4 33.7 34.7 29.2C35.8 25.3 37 22 37 17.8C37 11 31.2 6 24 6Z" fill="#FFFFFF" stroke="#0D4A45" strokeWidth="1.6" />
              <path d="M17.5 12C19 10.6 21.3 10 24 10" stroke="#0D4A45" strokeOpacity="0.35" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            </svg>
          </div>
          <div className="font-display font-bold text-lg leading-tight text-white">
            Armature Labs
            <small className="block font-body font-semibold text-[10.5px] tracking-[0.1em] text-[#CFE6E1] mt-0.5">
              ADMIN PORTAL
            </small>
          </div>
        </div>

        <nav className="relative z-[1] flex-1">
          {groupBySection(items).map((group) => (
            <div key={group.section}>
              <div className="nav-section px-6 pt-4 pb-1.5 text-[10.5px] font-bold tracking-[0.1em] uppercase text-[#9FD8CE]">
                {group.section}
              </div>
              <div className="px-3 space-y-0.5">
                {group.items.map((item) => {
                  // FIX (was: `item.session > 1`, which ignored whether a
                  // screen was actually built and permanently stubbed out
                  // Case Queue even though it shipped for real in commit
                  // ee0208b). A nav item is a stub only if it's beyond
                  // Session 1 AND not explicitly marked live in navConfig.ts.
                  const isStub = item.session > 1 && !item.live;
                  if (isStub) {
                    return (
                      <div
                        key={item.key}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] font-semibold text-white/50 cursor-not-allowed select-none"
                        title={`Coming soon — Frontend Session ${item.session}`}
                      >
                        <NavIcon icon={item.icon} />
                        <span className="flex-1">{item.label}</span>
                        <span className="text-[10px] font-mono uppercase tracking-wide bg-white/10 rounded px-1.5 py-0.5">
                          soon
                        </span>
                      </div>
                    );
                  }
                  return (
                    <NavLink
                      key={item.key}
                      to={item.path}
                      className={({ isActive }) =>
                        `nav-link flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${
                          isActive ? 'active text-[#04302E]' : 'text-[#F2F8F5] hover:bg-white/10'
                        }`
                      }
                      style={({ isActive }) =>
                        isActive ? { background: 'linear-gradient(135deg,var(--color-nav-active),var(--color-nav-active-2))' } : undefined
                      }
                    >
                      <NavIcon icon={item.icon} />
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="relative z-[1] px-3 mt-4">
          <button
            onClick={logout}
            className="w-full text-left rounded-lg px-3 py-2.5 text-[13.5px] font-semibold text-[#F2F8F5] hover:bg-white/10 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div
        className="flex-1 flex flex-col"
        style={{ background: 'linear-gradient(180deg, var(--color-page-bg-top), var(--color-page-bg-bot) 260px)' }}
      >
        <header className="topbar-glass mx-8 mt-5 mb-1 px-6.5 py-4 rounded-[18px] flex items-center justify-between">
          <div>
            <h1 className="font-display text-[23px] font-bold m-0 tracking-[-0.015em]">Dashboard</h1>
            <p className="m-0 mt-0.5 text-[13px] text-ink-soft">Welcome back, {user.fullName.split(' ')[0]}</p>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="relative hidden sm:block">
              <svg className="absolute left-[11px] top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-ink-soft pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                placeholder="Search cases…"
                disabled
                title="Search wires up once the Case Queue (Frontend Session 2) is live"
                className="w-[220px] h-[38px] rounded-[10px] pl-9 pr-3.5 text-[13px] bg-white opacity-60 cursor-not-allowed"
                style={{ border: '1px solid var(--color-border)' }}
              />
            </div>

            <div className="relative">
              <button
                onClick={() => setNotifOpen((o) => !o)}
                className="w-[38px] h-[38px] rounded-[10px] bg-white flex items-center justify-center relative hover:bg-page-bg-top transition-colors"
                style={{ border: '1px solid var(--color-border)' }}
                aria-label="Notifications"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" strokeWidth="1.8">
                  <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
                  <path d="M10 20a2 2 0 0 0 4 0" />
                </svg>
                <span className="absolute top-[7px] right-[7px] w-2 h-2 rounded-full bg-badge-coral border-2 border-white" />
              </button>
              <div
                className={`notif-dropdown ${notifOpen ? 'open' : ''} absolute top-[46px] right-0 w-[300px] bg-white rounded-[14px] p-2 z-[80]`}
                style={{ border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)' }}
              >
                <h4 className="text-[12.5px] font-bold px-2.5 pt-2 pb-1.5 text-ink">Notifications</h4>
                {DEMO_NOTIFS.map((n, i) => (
                  <div key={i} className="flex gap-2.5 px-2.5 py-2.5 rounded-[9px] hover:bg-page-bg-top cursor-default">
                    <div className="w-[30px] h-[30px] rounded-lg flex items-center justify-center text-[13px] bg-badge-teal-bg shrink-0">
                      {n.icon}
                    </div>
                    <div>
                      <p className="text-[12.5px] font-semibold m-0 text-ink">{n.title}</p>
                      <span className="text-[11px] text-ink-soft">{n.time}</span>
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-ink-soft px-2.5 pt-1 pb-1.5">
                  Preview only — real triggers land in Session 3.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right hidden md:block">
                <div className="text-sm font-medium text-ink leading-tight">{user.fullName}</div>
                <div className="text-xs text-ink-soft leading-tight">{roleLabel(user.role)}</div>
              </div>
              <div className="h-9 w-9 rounded-full bg-badge-teal-bg text-badge-teal flex items-center justify-center font-semibold text-sm shrink-0">
                {initials(user.fullName)}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-8 pb-10">{children}</main>
      </div>
    </div>
  );
}
