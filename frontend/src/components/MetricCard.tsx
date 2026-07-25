import type { ReactNode } from 'react';
import { useCountUp } from '../lib/useCountUp';

interface MetricCardProps {
  icon: ReactNode;
  iconBg: string;
  value: number;
  label: string;
  /** Renders skeleton bars instead of the real value/label while data is
   * still loading — replaces a spinner for this kind of card (item 1 of
   * the polish pass). Session 2 wires this to a real "cases loading" flag. */
  loading?: boolean;
}

export function MetricCard({ icon, iconBg, value, label, loading }: MetricCardProps) {
  const animated = useCountUp(value);

  if (loading) {
    return (
      <div className="metric-card surface-card fade-in rounded-[18px] p-[18px_20px] flex items-center gap-3.5">
        <div className="skeleton w-11 h-11 rounded-[10px] shrink-0" />
        <div className="flex-1">
          <div className="skeleton h-[22px] w-14 rounded-md mb-2" />
          <div className="skeleton h-[12px] w-20 rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="metric-card surface-card fade-in rounded-[18px] p-[18px_20px] flex items-center gap-3.5">
      <div
        className="w-11 h-11 rounded-[10px] flex items-center justify-center shrink-0"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <div>
        <div className="font-display font-bold text-[22px] leading-none tracking-[-0.01em] text-ink">
          {animated}
        </div>
        <div className="text-[12.5px] text-ink-soft mt-[3px] font-medium">{label}</div>
      </div>
    </div>
  );
}
