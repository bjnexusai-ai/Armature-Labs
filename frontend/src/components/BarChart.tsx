export interface BarDatum {
  key: string;
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarDatum[];
  emptyTitle: string;
  emptyBody: string;
}

const ROW_H = 30;
const GAP = 10;
const WIDTH = 560;
const LABEL_W = 150;

export function BarChart({ data, emptyTitle, emptyBody }: BarChartProps) {
  if (data.length === 0) {
    return (
      <div className="empty-state">
        <h4>{emptyTitle}</h4>
        <p>{emptyBody}</p>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const barAreaW = WIDTH - LABEL_W - 44;
  const height = data.length * (ROW_H + GAP);

  return (
    <svg width="100%" viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="xMidYMin meet">
      {data.map((d, i) => {
        const y = i * (ROW_H + GAP);
        const barW = Math.max((d.value / max) * barAreaW, 3);
        return (
          <g key={d.key}>
            <text
              x={LABEL_W - 10}
              y={y + ROW_H / 2 + 4}
              textAnchor="end"
              style={{ fontSize: 12, fill: 'var(--color-ink)' }}
            >
              {d.label.length > 22 ? `${d.label.slice(0, 21)}…` : d.label}
            </text>
            <rect x={LABEL_W} y={y + 3} width={barAreaW} height={ROW_H - 6} rx={6} fill="var(--color-page-bg-top)" />
            <rect x={LABEL_W} y={y + 3} width={barW} height={ROW_H - 6} rx={6} fill="#1C8A93">
              <title>
                {d.label}: {d.value} case{d.value === 1 ? '' : 's'}
              </title>
            </rect>
            <text x={LABEL_W + barW + 8} y={y + ROW_H / 2 + 4} style={{ fontSize: 11.5, fontWeight: 700, fill: 'var(--color-ink)' }}>
              {d.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
