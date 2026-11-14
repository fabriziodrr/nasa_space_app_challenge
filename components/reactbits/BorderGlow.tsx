"use client";

import { useCallback, useRef, type ReactNode } from "react";

import "./BorderGlow.css";

type BorderGlowProps = {
  children: ReactNode;
  className?: string;
  glowColor?: string;
};

export function BorderGlow({ children, className = "", glowColor = "59, 26, 189" }: BorderGlowProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;

    const bounds = card.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const centerX = bounds.width / 2;
    const centerY = bounds.height / 2;
    const distanceToEdge = Math.min(x, y, bounds.width - x, bounds.height - y);
    const proximity = Math.max(0, Math.min(1, 1 - distanceToEdge / Math.max(1, Math.min(centerX, centerY))));
    const angle = (Math.atan2(y - centerY, x - centerX) * 180) / Math.PI + 90;

    card.style.setProperty("--border-glow-proximity", proximity.toFixed(3));
    card.style.setProperty("--border-glow-angle", `${angle}deg`);
  }, []);

  return (
    <div
      ref={cardRef}
      className={`border-glow-card ${className}`.trim()}
      style={{ "--border-glow-color": `rgb(${glowColor})` } as React.CSSProperties}
      onPointerMove={handlePointerMove}
    >
      <span className="border-glow-card__edge" aria-hidden="true" />
      <div className="border-glow-card__inner">{children}</div>
    </div>
  );
}
