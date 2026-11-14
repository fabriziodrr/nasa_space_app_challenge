import type { CSSProperties } from "react";

import "./ShapeGrid.css";

type ShapeGridProps = {
  size?: number;
  lineColor?: string;
  accentColor?: string;
  opacity?: number;
  className?: string;
  style?: CSSProperties;
};

export function ShapeGrid({
  size = 34,
  lineColor = "rgba(98, 105, 112, .16)",
  accentColor = "rgba(59, 26, 189, .2)",
  opacity = 0.72,
  className = "",
  style,
}: ShapeGridProps) {
  const patternId = `shape-grid-${size}`;

  return (
    <div
      className={`shape-grid ${className}`.trim()}
      style={{ "--shape-grid-size": `${size}px`, "--shape-grid-line": lineColor, "--shape-grid-accent": accentColor, opacity, ...style } as CSSProperties}
      aria-hidden="true"
    >
      <svg className="shape-grid__svg" viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="none">
        <defs>
          <pattern id={patternId} width={size} height={size} patternUnits="userSpaceOnUse">
            <path className="shape-grid__line" d={`M ${size} 0 L 0 0 0 ${size}`} />
            <path className="shape-grid__shape" d={`M ${size / 2} ${size * 0.28} L ${size * 0.72} ${size / 2} L ${size / 2} ${size * 0.72} L ${size * 0.28} ${size / 2} Z`} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
}
