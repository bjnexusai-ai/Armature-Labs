import { useState } from 'react';

/**
 * Session 7 Chunk 2 — generic SVG donut chart.
 *
 * No charting library added: `frontend/package.json` has no `recharts` (or
 * any chart lib) installed — confirmed by reading it directly, not assumed
 * from the reference demo's Chart.js, per the Session 7 prompt's explicit
 * instruction to check before adding a new dependency. This codebase's own
 * convention is hand-rolled inline SVG for icons/marks (LoginPage.tsx's
 * tooth mark, icons.svg) — a small dependency-free SVG chart matches that
 * convention rather than pulling in a ~500KB library for three charts.
 */

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string; // hex or css var()
}

interface DonutChartProps {
  slices: DonutSlice[];
  isolatedKey: string | null;
  onToggleIsolate: (key: string | null) => void;
  centerLabel?: string;
}

const SIZE = 180;
const STROKE = 26;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

export function DonutChart({ slices, isolatedKey, onToggleIsolate, centerLabel }: DonutChartProps) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const total = slices.reduce((s, sl) => s + sl.value, 0);

  if (total === 0) {
    return (
      <div className="empty-state">
        <h4>No case data yet</h4>
        <p>Once cases exist, their status breakdown shows here.</p>
      </div>
    );
  }

  const visible = isolatedKey ? slices.filter((s) => s.key === isolatedKey) : slices;
  const visibleTotal = visible.reduce((s, sl) => s + sl.value, 0);

  let offset = 0;
  const arcs = visible.map((slice) => {
    const fraction = slice.value / visibleTotal;
    const dash = fraction * CIRC;
    const arc = { ...slice, dash, gap: CIRC - dash, offset };
    offset += dash;
    return arc;
  });

  const activeLabel = isolatedKey
    ? (slices.find((s) => s.key === isolatedKey)?.label ?? centerLabel ?? 'Total')
    : (centerLabel ?? 'Total');
  const activeValue = isolatedKey ? visibleTotal : total;

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--color-page-bg-top)" strokeWidth={STROKE} />
        {arcs.map((arc) => (
          <circle
            key={arc.key}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={arc.color}
            strokeWidth={hoverKey === arc.key ? STROKE + 4 : STROKE}
            strokeDasharray={`${arc.dash} ${arc.gap}`}
            strokeDashoffset={-arc.offset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={{ cursor: 'pointer', transition: 'stroke-width 120ms ease, opacity 120ms ease' }}
            opacity={hoverKey && hoverKey !== arc.key ? 0.55 : 1}
            onMouseEnter={() => setHoverKey(arc.key)}
            onMouseLeave={() => setHoverKey(null)}
            onClick={() => onToggleIsolate(isolatedKey === arc.key ? null : arc.key)}
          >
            <title>
              {arc.label}: {arc.value}
            </title>
          </circle>
        ))}
        <text
          x={SIZE / 2}
          y={SIZE / 2 - 6}
          textAnchor="middle"
          className="font-display"
          style={{ fontSize: 22, fontWeight: 700, fill: 'var(--color-ink)' }}
        >
          {activeValue}
        </text>
        <text x={SIZE / 2} y={SIZE / 2 + 14} textAnchor="middle" style={{ fontSize: 10.5, fill: 'var(--color-ink-soft)' }}>
          {activeLabel.length > 16 ? `${activeLabel.slice(0, 15)}…` : activeLabel}
        </text>
      </svg>

      <div className="flex flex-col gap-1.5 min-w-[180px]">
        {slices
          .filter((s) => s.value > 0)
          .map((s) => {
            const isIsolated = isolatedKey === s.key;
            const isDimmed = isolatedKey !== null && !isIsolated;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => onToggleIsolate(isIsolated ? null : s.key)}
                onMouseEnter={() => setHoverKey(s.key)}
                onMouseLeave={() => setHoverKey(null)}
                className="flex items-center gap-2 text-left px-1.5 py-1 rounded-md transition-colors hover:bg-page-bg-top"
                style={{ opacity: isDimmed ? 0.45 : 1 }}
              >
                <span
                  className="inline-block rounded-full shrink-0"
                  style={{ width: 9, height: 9, background: s.color }}
                />
                <span className="text-[12.5px] text-ink flex-1">{s.label}</span>
                <span className="text-[12.5px] font-semibold text-ink-soft">{s.value}</span>
              </button>
            );
          })}
        {isolatedKey && (
          <button
            type="button"
            onClick={() => onToggleIsolate(null)}
            className="text-[11.5px] text-[#1C8A93] font-semibold mt-1 text-left px-1.5"
          >
            ← Show all statuses
          </button>
        )}
      </div>
    </div>
  );
}
