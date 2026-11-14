"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type CountUpProps = {
  value: string;
  duration?: number;
  className?: string;
};

type NumericValue = {
  amount: number;
  decimals: number;
  sign: string;
  minimumIntegerDigits: number;
};

function parseNumericValue(value: string): NumericValue | null {
  const match = value.trim().match(/^([+-]?)(\d[\d,]*(?:\.\d+)?)$/);

  if (!match) {
    return null;
  }

  const [, sign, rawNumber] = match;
  const normalizedNumber = rawNumber.replace(/,/g, "");
  const amount = Number(normalizedNumber);

  if (!Number.isFinite(amount)) {
    return null;
  }

  const [integerPart, decimalPart = ""] = normalizedNumber.split(".");

  return {
    amount: Math.abs(amount),
    decimals: decimalPart.length,
    sign,
    minimumIntegerDigits: integerPart.length > 1 && integerPart.startsWith("0") ? integerPart.length : 1,
  };
}

function formatValue(value: number, numericValue: NumericValue) {
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: numericValue.decimals,
    maximumFractionDigits: numericValue.decimals,
    minimumIntegerDigits: numericValue.minimumIntegerDigits,
    useGrouping: true,
  });

  return `${numericValue.sign}${formatted}`;
}

export function CountUp({ value, duration = 420, className }: CountUpProps) {
  const numericValue = useMemo(() => parseNumericValue(value), [value]);
  const [displayValue, setDisplayValue] = useState(value);
  const animationFrame = useRef<number | null>(null);

  useEffect(() => {
    if (!numericValue) {
      setDisplayValue(value);
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (mediaQuery.matches) {
      setDisplayValue(value);
      return;
    }

    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(formatValue(numericValue.amount * easedProgress, numericValue));

      if (progress < 1) {
        animationFrame.current = window.requestAnimationFrame(animate);
      }
    };

    animationFrame.current = window.requestAnimationFrame(animate);

    return () => {
      if (animationFrame.current !== null) {
        window.cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [duration, numericValue, value]);

  return <span className={className}>{displayValue}</span>;
}
