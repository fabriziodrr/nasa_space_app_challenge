"use client";

import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className={`${styles.crewSelector} ${placement === "header" ? styles.crewSelectorHeader : ""}`} ref={selectorRef}>
      <div className={styles.crewSelectorHeading}>
        <span>CREW PROFILE</span>
      </div>
      <div className={styles.profileControl}>
        <button className={styles.profileTrigger} type="button" aria-haspopup="listbox" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
          <span className={styles.profileAvatar} aria-hidden="true">{profile.name.split(" ").map((part) => part[0]).join("")}</span>
          <span className={styles.profileCopy}>
            <strong>{profile.name}</strong>
            <small>{profile.role}</small>
          </span>
          <ChevronDown className={styles.profileChevron} size={16} aria-hidden="true" />
        </button>
        {isOpen && (
          <div className={styles.profileMenu} role="listbox" aria-label="Crew profile">
            <div className={styles.profileMenuHeader}><span>SELECT PROFILE</span><small>{profiles.length} AVAILABLE</small></div>
            {profiles.map((member) => (
              <button className={`${styles.profileOption} ${member.id === profile.id ? styles.profileOptionActive : ""}`} type="button" role="option" aria-selected={member.id === profile.id} key={member.id} onClick={() => { onChange(member.id); setIsOpen(false); }}>
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
