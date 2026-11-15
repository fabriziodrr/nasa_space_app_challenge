"use client";

import type { DemoCrewProfile } from "@/server/examples/crew_profiles";
import { Dropdown } from "../ui/Dropdown";
import styles from "./CrewDataDashboard.module.css";

type CrewProfileSelectorProps = { profile: DemoCrewProfile; profiles: DemoCrewProfile[]; onChange(profileId: string): void; placement?: "header" };
export function CrewProfileSelector({ profile, profiles, onChange, placement }: CrewProfileSelectorProps) {
  return <div className={`${styles.crewSelector} ${placement === "header" ? styles.crewSelectorHeader : ""}`}>
    <div className={styles.crewSelectorHeading}><span>CREW PROFILE</span></div>
    <div className={styles.profileControl}><Dropdown label="Crew profile" value={profile.id} onChange={onChange} options={profiles.map((member) => ({ value: member.id, label: member.name, description: member.role, initials: member.name.split(" ").map((part) => part[0]).join("") }))} /></div>
  </div>;
}
