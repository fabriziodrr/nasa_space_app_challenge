"use client";

import { useEffect, useRef } from "react";
import { SlothLogo } from "@/components/branding/SlothLogo";

export function WelcomeDialog({ onClose }: { onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="welcome-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="welcome-dialog" role="alertdialog" aria-modal="true" aria-labelledby="welcome-dialog-title" aria-describedby="welcome-dialog-description">
        <div className="welcome-dialog__glow" aria-hidden="true" />
        <SlothLogo className="welcome-dialog__logo" alt="Smiling S.L.O.T.H. sloth" />
        <span className="welcome-dialog__eyebrow">S.L.O.T.H. / MISSION CONTROL</span>
        <h1 id="welcome-dialog-title">Welcome inside S.L.O.T.H.</h1>
        <p id="welcome-dialog-description">Your mission dashboard is ready. Take a breath, astronaut.</p>
        <button ref={closeButtonRef} className="welcome-dialog__continue" type="button" onClick={onClose}>Enter dashboard</button>
      </section>
    </div>
  );
}
