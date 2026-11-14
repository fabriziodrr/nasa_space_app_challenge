"use client";

import { useRef, useState } from "react";
import { gsap } from "gsap";

import StrokeText from "@/components/reactbits/StrokeText";
import WebThreads from "@/components/reactbits/WebThreads";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

/**
 * The first interaction of the product is deliberately small: the SOTERIA
 * wordmark is the entry point for the two dashboards that will follow.
 */
export function AegisLanding() {
  const [isEntering, setIsEntering] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  const landingRef = useRef<HTMLElement>(null);
  const wordmarkRef = useRef<HTMLButtonElement>(null);

  const enterDashboard = () => {
    if (isEntering || hasEntered) return;

    setIsEntering(true);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setHasEntered(true);
      return;
    }

    const timeline = gsap.timeline({
      onComplete: () => setHasEntered(true),
    });

    timeline
      .to(wordmarkRef.current, {
        scale: 1.08,
        duration: 0.35,
        ease: "power2.out",
      })
      .to(wordmarkRef.current, {
        scale: 1.3,
        opacity: 0,
        filter: "blur(12px)",
        duration: 0.65,
        ease: "power3.in",
      })
      .to(
        landingRef.current,
        {
          opacity: 0,
          duration: 0.35,
          ease: "power2.in",
        },
        "<0.15",
      );
  };

  if (hasEntered) return <DashboardShell />;

  return (
    <main ref={landingRef} className="aegis-landing">
      <div className="aegis-threads" aria-hidden="true">
        <WebThreads
          colors={["#3b1abd", "#6652d3", "#9b90ef"]}
          coreColor="#3b1abd"
          backgroundColor="transparent"
          threadCount={9}
          speed={0.12}
          frequency={5.5}
          spread={0.2}
          taper={0.65}
          glow={0.035}
          falloff={0.58}
          thickness={1.3}
          brightness={0.72}
          opacity={0.52}
          depth={0.15}
          mirror
          shimmer
          grain={0.025}
          intro
          mouseInteraction
          mouseStrength={0.35}
          pulseOnClick
        />
      </div>
      <button
        ref={wordmarkRef}
        className="aegis-wordmark"
        type="button"
        aria-label="Enter SOTERIA mission dashboard"
        aria-busy={isEntering}
        onClick={enterDashboard}
      >
        <span className="aegis-wordmark__stroke-stack" aria-hidden="true">
          <span className="aegis-wordmark__stroke-layer aegis-wordmark__stroke-layer--border">
            <StrokeText
              text="SOTERIA"
              strokeColor="#0d0630"
              fillColor="#0d0630"
              strokeWidth={6}
              fontSize={120}
              fontWeight={400}
              fontFamily="var(--font-bebas-neue)"
              letterSpacing={-2}
              drawDuration={2.8}
              fillDelay={0.18}
              fillMode="wipe"
              wipeFrom="left"
              trigger="mount"
            />
          </span>
          <span className="aegis-wordmark__stroke-layer aegis-wordmark__stroke-layer--blue">
            <StrokeText
              text="SOTERIA"
              strokeColor="#ffffff"
              fillColor="#ffffff"
              strokeWidth={1.4}
              fontSize={120}
              fontWeight={400}
              fontFamily="var(--font-bebas-neue)"
              letterSpacing={-2}
              drawDuration={2.8}
              fillDelay={0.18}
              fillMode="wipe"
              wipeFrom="left"
              trigger="mount"
            />
          </span>
        </span>
      </button>
      <p className="aegis-landing__hint">Click to enter mission control</p>
    </main>
  );
}
