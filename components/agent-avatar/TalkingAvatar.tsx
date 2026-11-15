"use client";

import styles from "./talking-avatar.module.css";

export interface TalkingAvatarProps {
  src?: string;
  alt?: string;
  speaking: boolean;
}

export function TalkingAvatar({ src = "/sloth.png", alt = "Onboard assistant", speaking }: TalkingAvatarProps) {
  return (
    <div className={styles.wrap}>
      <div className={`${styles.avatar} ${speaking ? styles.speaking : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={styles.image} draggable={false} />
      </div>
      <div className={`${styles.waves} ${speaking ? styles.wavesActive : ""}`} aria-hidden="true">
        <span /><span /><span /><span /><span />
      </div>
    </div>
  );
}
