import { type ReactNode, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { visibleNavItems } from '../lib/navConfig';

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
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EAF7F5" strokeWidth="1.5">
              <path d="M12 2C8 2 5 4.2 5 7.6c0 2.4.9 3.2 1.3 6.4.3 2.6.8 6 2.3 6 1.3 0 1.2-3.4 1.7-5.2.3-1 .8-1.4 1.7-1.4s1.4.4 1.7 1.4c.5 1.8.4 5.2 1.7 5.2 1.5 0 2-3.4 2.3-6C18.1 10.8 19 10 19 7.6 19 4.2 16 2 12 2Z" />
            </svg>
          </div>
          <div className="font-display font-bold text-lg leading-tight text-white">
            Armature Labs
            <small className="block font-body font-semibold text-[10.5px] tracking-[0.1em] text-[#CFE6E1] mt-0.5">
              ADMIN PORTAL
            </small>
          </div>
        </div>

        <nav className="relative z-[1] flex-1 px-3 space-y-0.5">
          {items.map((item) => {
            const isStub = item.session > 1;
            if (isStub) {
              return (
                <div
                  key={item.key}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-[13.5px] font-semibold text-white/50 cursor-not-allowed select-none"
                  title={`Coming soon — Frontend Session ${item.session}`}
                >
                  <span>{item.label}</span>
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
                  `nav-link block rounded-lg px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${
                    isActive ? 'active text-[#04302E]' : 'text-[#F2F8F5] hover:bg-white/10'
                  }`
                }
                style={({ isActive }) =>
                  isActive ? { background: 'linear-gradient(135deg,var(--color-nav-active),var(--color-nav-active-2))' } : undefined
                }
              >
                {item.label}
              </NavLink>
            );
          })}
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
