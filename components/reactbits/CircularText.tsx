'use client';

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import './CircularText.css';

type HoverMode = 'slowDown' | 'speedUp' | 'pause' | 'goBonkers' | 'none';

interface CircularTextProps {
  text: string;
  spinDuration?: number;
  onHover?: HoverMode;
  direction?: 'clockwise' | 'counterclockwise';
  size?: number;
  fontSize?: number;
  fontWeight?: number;
  letterSpacing?: number;
  textRadius?: number;
  color?: string;
  startAngle?: number;
  repeat?: number;
  ring?: boolean;
  ringColor?: string;
  tilt?: number;
  hoverTilt?: number;
  draggable?: boolean;
  children?: ReactNode;
  className?: string;
}

const CircularText = ({
  text,
  spinDuration = 20,
  onHover = 'speedUp',
  direction = 'clockwise',
  size = 200,
  fontSize = 24,
  fontWeight = 900,
  letterSpacing = 0,
  textRadius,
  color = '',
  startAngle = 0,
  repeat = 1,
  ring = false,
  ringColor = '',
  tilt = 0,
  hoverTilt = 0,
  draggable = false,
  children,
  className = '',
}: CircularTextProps) => {
  const [hovering, setHovering] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setReducedMotion(mediaQuery.matches);
    updateMotionPreference();
    mediaQuery.addEventListener('change', updateMotionPreference);
    return () => mediaQuery.removeEventListener('change', updateMotionPreference);
  }, []);

  const glyphs = useMemo(() => Array.from(text ?? ''), [text]);
  const copies = Math.max(1, Math.round(repeat) || 1);
  const letters = useMemo(() => Array.from({ length: copies }, () => glyphs).flat(), [copies, glyphs]);
  const angleStep = letters.length ? 360 / letters.length : 0;
  const radius = Math.max(1, textRadius ?? size / 2 - fontSize * 0.5);
  const hoverMultiplier = onHover === 'slowDown' ? 2.4 : onHover === 'speedUp' ? 0.35 : onHover === 'goBonkers' ? 0.12 : 1;
  const animationDuration = Math.max(0.1, spinDuration * (hovering ? hoverMultiplier : 1));
  const animationPlayState = reducedMotion || (hovering && onHover === 'pause') ? 'paused' : 'running';

  const style = {
    width: size,
    height: size,
    color: color || undefined,
    fontSize,
    fontWeight,
    perspective: size * 2.5,
    cursor: draggable ? 'grab' : undefined,
    '--circular-letter-spacing': `${letterSpacing}px`,
    '--circular-tilt': `${tilt}deg`,
    '--circular-hover-tilt': `${hoverTilt}deg`,
  } as CSSProperties;

  return (
    <div
      className={`circular-text${hovering ? ' is-hovering' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      role="img"
      aria-label={text}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
    >
      <div className="circular-text__tilt">
        <div className="circular-text__plane">
          <span
            className="circular-text__line"
            style={{
              inset: `${Math.max(0, size / 2 - radius)}px`,
              borderWidth: Math.max(1, fontSize / 16),
              borderColor: ringColor || undefined,
              opacity: ring ? 1 : 0,
            }}
          />
          <div
            className="circular-text__ring"
            style={{
              animationDuration: `${animationDuration}s`,
              animationPlayState,
              animationDirection: direction === 'counterclockwise' ? 'reverse' : 'normal',
            }}
          >
            {letters.map((letter, index) => (
              <span
                key={`${letter}-${index}`}
                className="circular-text__letter"
                style={{
                  transform: `translate(-50%, -50%) rotate(${startAngle + angleStep * index}deg) translateY(-${radius}px)`,
                }}
              >
                {letter === ' ' ? '\u00a0' : letter}
              </span>
            ))}
          </div>
        </div>
        {children != null && children !== false ? <div className="circular-text__center">{children}</div> : null}
      </div>
    </div>
  );
};

export default CircularText;
