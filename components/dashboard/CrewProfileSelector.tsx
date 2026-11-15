"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { type DemoCrewProfile } from "@/server/examples/crew_profiles";
import styles from "./CrewDataDashboard.module.css";

type CrewProfileSelectorProps = {
  profile: DemoCrewProfile;
  profiles: DemoCrewProfile[];
  onChange: (profileId: string) => void;
  placement?: "header";
};

export function CrewProfileSelector({ profile, profiles, onChange, placement }: CrewProfileSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  useEffect(() => {
    if (isOpen) optionRefs.current[Math.max(0, profiles.findIndex((item) => item.id === profile.id))]?.focus();
  }, [isOpen, profile.id, profiles]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) { setIsOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className={`${styles.crewSelector} ${placement === "header" ? styles.crewSelectorHeader : ""}`} ref={selectorRef}>
      <div className={styles.crewSelectorHeading}>
        <span>CREW PROFILE</span>
      </div>
      <div className={styles.profileControl}>
        <button ref={triggerRef} className={styles.profileTrigger} type="button" aria-haspopup="listbox" aria-expanded={isOpen} aria-controls={isOpen ? menuId : undefined} onClick={() => setIsOpen((open) => !open)} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setIsOpen(true); } }}>
          <span className={styles.profileAvatar} aria-hidden="true">{profile.name.split(" ").map((part) => part[0]).join("")}</span>
          <span className={styles.profileCopy}>
            <strong>{profile.name}</strong>
            <small>{profile.role}</small>
          </span>
          <ChevronDown className={styles.profileChevron} size={16} aria-hidden="true" />
        </button>
        {isOpen && (
          <div id={menuId} className={styles.profileMenu} role="listbox" aria-label="Crew profile">
            <div className={styles.profileMenuHeader} aria-hidden="true"><span>SELECT PROFILE</span><small>{profiles.length} AVAILABLE</small></div>
            {profiles.map((member, index) => (
              <button ref={(element) => { optionRefs.current[index] = element; }} className={`${styles.profileOption} ${member.id === profile.id ? styles.profileOptionActive : ""}`} type="button" role="option" tabIndex={-1} aria-selected={member.id === profile.id} key={member.id} onKeyDown={(event) => {
                let next = index;
                if (event.key === "ArrowDown") next = (index + 1) % profiles.length;
                else if (event.key === "ArrowUp") next = (index - 1 + profiles.length) % profiles.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = profiles.length - 1;
                else return;
                event.preventDefault(); optionRefs.current[next]?.focus();
              }} onClick={() => { onChange(member.id); setIsOpen(false); triggerRef.current?.focus(); }}>
                <span className={styles.profileAvatar} aria-hidden="true">{member.name.split(" ").map((part) => part[0]).join("")}</span>
                <span className={styles.profileCopy}><strong>{member.name}</strong><small>{member.role}</small></span>
                {member.id === profile.id && <Check size={15} aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
