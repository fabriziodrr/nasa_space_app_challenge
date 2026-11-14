"use client";

import { useEffect, useState } from "react";

type TextTypeProps = {
  text: string;
  typingSpeed?: number;
  initialDelay?: number;
  showCursor?: boolean;
  className?: string;
};

export function TextType({
  text,
  typingSpeed = 34,
  initialDelay = 0,
  showCursor = false,
  className = "",
}: TextTypeProps) {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    let typingTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const complete = () => {
      if (!cancelled) setDisplayedText(text);
    };

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      complete();
      return;
    }

    let characterIndex = 0;
    const startTyping = () => {
      const typeNextCharacter = () => {
        if (cancelled) return;
        characterIndex += 1;
        setDisplayedText(text.slice(0, characterIndex));
        if (characterIndex < text.length) {
          typingTimer = setTimeout(typeNextCharacter, Math.max(16, typingSpeed));
        }
      };

      typeNextCharacter();
    };

    typingTimer = setTimeout(startTyping, Math.max(0, initialDelay));

    return () => {
      cancelled = true;
      if (typingTimer) clearTimeout(typingTimer);
    };
  }, [initialDelay, showCursor, text, typingSpeed]);

  return (
    <span className={`text-type ${className}`.trim()} aria-label={text}>
      {displayedText}
      {showCursor && <span className="text-type__cursor" aria-hidden="true">▋</span>}
    </span>
  );
}
