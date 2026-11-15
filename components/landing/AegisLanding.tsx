"use client";

import { useRef, useState } from "react";
import { gsap } from "gsap";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { WelcomeDialog } from "@/components/dashboard/WelcomeDialog";
import { SlothLogo } from "@/components/branding/SlothLogo";
import CircularText from "@/components/reactbits/CircularText";
import MagicRings from "@/components/reactbits/MagicRings";

/**
 * The first interaction of the product is deliberately small: the S.L.O.T.H.
 * wordmark is the entry point for the two dashboards that will follow.
 */
export function AegisLanding() {
  const [isEntering, setIsEntering] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const landingRef = useRef<HTMLElement>(null);
  const wordmarkRef = useRef<HTMLButtonElement>(null);

  const enterDashboard = () => {
    if (isEntering || hasEntered) return;

    setIsEntering(true);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setHasEntered(true);
      setShowWelcome(true);
      return;
    }

    const timeline = gsap.timeline({
      onComplete: () => {
        setHasEntered(true);
        setShowWelcome(true);
      },
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

  if (hasEntered) return <><DashboardShell /><>{showWelcome && <WelcomeDialog onClose={() => setShowWelcome(false)} />}</></>;

  return (
    <main ref={landingRef} className="aegis-landing">
      <div className="aegis-orb" aria-hidden="true">
        <MagicRings
          color="#36e0ff"
          colorTwo="#5574ff"
          ringCount={7}
          motion="pulse"
          speed={0.72}
          lineThickness={2.2}
          glow={1.25}
          baseRadius={0.34}
          radiusStep={0.1}
          expansion={0.16}
          taper={1.4}
          dispersion={0.18}
          opacity={0.82}
          followMouse
          mouseInfluence={0.18}
          hoverScale={1.08}
          hoverIntensity={0.8}
          parallax={0.04}
          clickBurst
          intro
          theme="dark"
        />
      </div>
      <button
        ref={wordmarkRef}
        className="aegis-wordmark"
        type="button"
         aria-label="Enter S.L.O.T.H. mission dashboard — Space Mission Lucidity Observation & Tracking Hub"
         aria-busy={isEntering}
         onClick={enterDashboard}
      >
         <span className="aegis-wordmark__logo-wrap">
           <CircularText
              className="aegis-wordmark__circular-text"
              text="SPACE MISSION LUCIDITY OBSERVATION & TRACKING HUB  •  "
              repeat={2}
              spinDuration={34}
             onHover="slowDown"
             direction="clockwise"
             size={520}
              fontSize={21}
              fontWeight={700}
              textRadius={205}
             color="rgba(255, 255, 255, 0.92)"
             ring
             ringColor="rgba(54, 224, 255, 0.2)"
           >
             <SlothLogo className="aegis-wordmark__logo aegis-wordmark__intro-logo" src="/introduction-logo.jpeg" alt="S.L.O.T.H. mission logo" />
           </CircularText>
         </span>
      </button>
    </main>
  );
}
