"use client";

import { useRef, useState } from "react";
import { gsap } from "gsap";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SlothLogo } from "@/components/branding/SlothLogo";
import Orb from "@/components/reactbits/Orb";

/**
 * The first interaction of the product is deliberately small: the S.L.O.T.H.
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
        scale: 1.5,
        opacity: 0,
        filter: "blur(8px)",
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
      <div className="aegis-orb" aria-hidden="true">
        <Orb colors={["#36e0ff", "#5574ff", "#101499"]} backgroundColor="#0d0630" glow={1.35} bleed={0.75} trail={0.8} speed={0.7} opacity={0.8} intro hoverIntensity={0.8} followCursor />
      </div>
      <button
        ref={wordmarkRef}
        className="aegis-wordmark"
        type="button"
         aria-label="Enter S.L.O.T.H. mission dashboard"
        aria-busy={isEntering}
        onClick={enterDashboard}
      >
         <span className="aegis-wordmark__logo-wrap" aria-hidden="true">
           <SlothLogo className="aegis-wordmark__logo aegis-wordmark__intro-logo" src="/introduction-logo.jpeg" alt="S.L.O.T.H. mission logo" />
           <span className="aegis-wordmark__acronym">S.L.O.T.H.</span>
         </span>
      </button>
    </main>
  );
}
