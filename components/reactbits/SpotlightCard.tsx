"use client";

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";

import "./SpotlightCard.css";

type SpotlightCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  spotlightColor?: string;
};

export function SpotlightCard({ children, className = "", spotlightColor = "rgba(59, 26, 189, 0.18)", ...props }: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const lightRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    const light = lightRef.current;
    if (!card || !light) return;

    const handleMove = (event: PointerEvent) => {
      const bounds = card.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const inside = x >= 0 && y >= 0 && x <= bounds.width && y <= bounds.height;

      light.style.opacity = inside ? "1" : "0";
      if (inside) light.style.background = `radial-gradient(circle 180px at ${x}px ${y}px, ${spotlightColor}, transparent 72%)`;
    };

    const handleLeave = () => { light.style.opacity = "0"; };
    window.addEventListener("pointermove", handleMove, { passive: true });
    card.addEventListener("pointerleave", handleLeave);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      card.removeEventListener("pointerleave", handleLeave);
    };
  }, [spotlightColor]);

  return (
    <div ref={cardRef} className={`spotlight-card ${className}`.trim()} {...props}>
      <span ref={lightRef} className="spotlight-card__light" aria-hidden="true" />
      <span className="spotlight-card__border" aria-hidden="true" />
      <div className="spotlight-card__content">{children}</div>
    </div>
  );
}
