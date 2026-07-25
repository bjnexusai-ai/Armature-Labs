import { useNavigate } from 'react-router-dom';

export function ComingSoon({ label, session }: { label: string; session: number }) {
  const navigate = useNavigate();
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card-bg">
      <div className="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 4v2M16 4v2" />
        </svg>
        <h4>{label}</h4>
        <p>
          Coming in Frontend Session {session}, once Backend Session {session}{' '}
          is confirmed live.
        </p>
        <button onClick={() => navigate('/dashboard')}>Back to dashboard</button>
      </div>
    </div>
  );
}
