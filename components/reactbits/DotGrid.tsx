"use client";

import { useEffect, useRef, type CSSProperties } from "react";

import "./DotGrid.css";

type DotGridProps = {
  dotSize?: number;
  gap?: number;
  baseColor?: string;
  activeColor?: string;
  opacity?: number;
  uniform?: boolean;
  className?: string;
  style?: CSSProperties;
};

function parseColor(value: string) {
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return "59, 26, 189";

  const hex = match[1].length === 3
    ? match[1].split("").map((digit) => `${digit}${digit}`).join("")
    : match[1];

  return `${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}`;
}

export function DotGrid({
  dotSize = 2,
  gap = 26,
  baseColor = "#d5d9e0",
  activeColor = "#3b1abd",
  opacity = 0.28,
  uniform = false,
  className = "",
  style,
}: DotGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const draw = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));

      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const base = parseColor(baseColor);
       const active = parseColor(activeColor);
      const radius = Math.max(0.5, dotSize / 2);
      const spacing = Math.max(dotSize + 8, gap);

      for (let y = spacing / 2; y < height; y += spacing) {
        for (let x = spacing / 2; x < width; x += spacing) {
           const distance = Math.hypot(x - width * 0.78, y - height * 0.12);
           const accent = uniform ? 0 : Math.max(0, 1 - distance / Math.max(width, height) * 2.2);
           const color = accent > 0.08 ? active : base;
           const alpha = uniform ? opacity : opacity * (0.55 + accent * 0.45);

          context.beginPath();
          context.fillStyle = `rgba(${color}, ${alpha})`;
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fill();
        }
      }
    };

    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvas);
    draw();

    return () => resizeObserver.disconnect();
  }, [activeColor, baseColor, dotSize, gap, opacity, uniform]);

  return (
    <div className={`dot-grid ${className}`.trim()} style={style} aria-hidden="true">
      <canvas ref={canvasRef} className="dot-grid__canvas" />
    </div>
  );
}
