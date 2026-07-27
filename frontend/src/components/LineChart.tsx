import { useState } from 'react';

export interface LinePoint {
  label: string;
  value: number | null; // null = no data that bucket, rendered as a gap
  sampleSize?: number;
}

interface LineChartProps {
  points: LinePoint[];
  valueSuffix?: string; // e.g. "h" for hours
}

const WIDTH = 560;
const HEIGHT = 220;
const PAD_L = 36;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 30;

export function LineChart({ points, valueSuffix = '' }: LineChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const values = points.map((p) => p.value).filter((v): v is number => v != null);
  if (values.length === 0) {
    return (
      <div className="empty-state">
        <h4>No responses in this range</h4>
        <p>No approvals were responded to in the selected window yet.</p>
      </div>
    );
  }

  const max = Math.max(...values, 1);
  const min = 0; // hours always start at 0 — avoids a misleading truncated axis
  const innerW = WIDTH - PAD_L - PAD_R;
  const innerH = HEIGHT - PAD_T - PAD_B;

  const xFor = (i: number) => PAD_L + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yFor = (v: number) => PAD_T + innerH - ((v - min) / (max - min || 1)) * innerH;

  // Build path, breaking into separate segments across null gaps.
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    if (p.value == null) {
      if (current.length) segments.push(current.join(' '));
      current = [];
      return;
    }
    current.push(`${i === 0 || current.length === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.value)}`);
  });
  if (current.length) segments.push(current.join(' '));

  const yTicks = [0, 0.5, 1].map((f) => Math.round(max * f));

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid meet">
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={PAD_L}
              x2={WIDTH - PAD_R}
              y1={yFor(t)}
              y2={yFor(t)}
              stroke="var(--color-border, #E4E9E8)"
              strokeDasharray="3 4"
            />
            <text x={PAD_L - 8} y={yFor(t) + 3} textAnchor="end" style={{ fontSize: 9.5, fill: 'var(--color-ink-soft)' }}>
              {t}
            </text>
          </g>
        ))}

        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#1C8A93" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {points.map((p, i) =>
          p.value == null ? null : (
            <g key={i}>
              <circle
                cx={xFor(i)}
                cy={yFor(p.value)}
                r={hoverIdx === i ? 5 : 3.5}
                fill="#fff"
                stroke="#1C8A93"
                strokeWidth={2}
                style={{ cursor: 'pointer', transition: 'r 100ms ease' }}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
              >
                <title>
                  {p.label}: {p.value}
                  {valueSuffix} avg ({p.sampleSize ?? 0} response{p.sampleSize === 1 ? '' : 's'})
                </title>
              </circle>
              {hoverIdx === i && (
                <text x={xFor(i)} y={yFor(p.value) - 10} textAnchor="middle" style={{ fontSize: 10.5, fontWeight: 700, fill: 'var(--color-ink)' }}>
                  {p.value}
                  {valueSuffix}
                </text>
              )}
            </g>
          )
        )}

        {points.map((p, i) => (
          <text
            key={i}
            x={xFor(i)}
            y={HEIGHT - 8}
            textAnchor="middle"
            style={{ fontSize: 9.5, fill: 'var(--color-ink-soft)' }}
          >
            {p.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
