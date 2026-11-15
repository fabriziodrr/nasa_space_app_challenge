import type { LivePoint } from '../app/live-session';

export function LiveChart({ points }: { points: readonly LivePoint[] }) {
  if (points.length < 2) return <p>In attesa di intervalli osservati.</p>;
  const first = points[0]!.timestampMs;
  const duration = Math.max(1, points[points.length - 1]!.timestampMs - first);
  const x = (time: number) => 40 + (time - first) / duration * 720;
  const y = (value: number) => 160 - Math.max(0, Math.min(1, value)) * 120;
  return <>
    <p className="field-hint">Sinistro verde, right blu; grigio: dati non valutabili o intervalli mancanti. Scala grafica 0–1.</p>
    <svg className="replay-chart" viewBox="0 0 800 200" role="img" aria-label="Apertura degli occhi e intervalli non valutabili nella misura webcam">
      <line x1="40" y1="40" x2="760" y2="40" stroke="#ccd8d1" /><line x1="40" y1="160" x2="760" y2="160" stroke="#ccd8d1" />
      <text x="8" y="45">1</text><text x="8" y="165">0</text>
      {points.slice(1).map((point, index) => {
        const prev = points[index]!;
        return point.gap || prev.left === null || prev.right === null ? <rect key={`gap-${index}`} x={x(prev.timestampMs)} y="40" width={Math.max(1, x(point.timestampMs) - x(prev.timestampMs))} height="120" fill="#d9dedb" /> : null;
      })}
      {(['left', 'right'] as const).flatMap((side) => points.slice(1).map((point, index) => {
        const prev = points[index]!;
        const a = prev[side], b = point[side];
        if (point.gap || a === null) return null;
        return <path key={`${side}-${index}`} d={`M ${x(prev.timestampMs)} ${y(a)} H ${x(point.timestampMs)}${b === null ? '' : ` V ${y(b)}`}`} fill="none" stroke={side === 'left' ? '#287a55' : '#346caa'} strokeWidth="3" />;
      }))}
      <text x="40" y="190">0 ms</text><text x="675" y="190">{duration.toFixed(0)} ms</text>
    </svg>
  </>;
}
