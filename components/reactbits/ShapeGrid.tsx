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
  lineColor = "rgba(98, 105, 112, .24)",
  accentColor = "rgba(59, 26, 189, .3)",
  opacity = 0.9,
  className = "",
  style,
}: ShapeGridProps) {
  return (
    <div
      className={`shape-grid ${className}`.trim()}
      style={{ "--shape-grid-size": `${size}px`, "--shape-grid-line": lineColor, "--shape-grid-accent": accentColor, opacity, ...style } as CSSProperties}
      aria-hidden="true"
    >
    </div>
  );
}
