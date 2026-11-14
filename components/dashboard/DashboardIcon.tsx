type IconName = "grid" | "orbit" | "activity" | "crew" | "settings" | "arrow" | "chevron";

type DashboardIconProps = {
  name: IconName;
  size?: number;
};

export function DashboardIcon({ name, size = 18 }: DashboardIconProps) {
  const commonProps = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "grid") {
    return (
      <svg {...commonProps}>
        <rect x="3.5" y="3.5" width="6" height="6" rx="1" />
        <rect x="14.5" y="3.5" width="6" height="6" rx="1" />
        <rect x="3.5" y="14.5" width="6" height="6" rx="1" />
        <rect x="14.5" y="14.5" width="6" height="6" rx="1" />
      </svg>
    );
  }

  if (name === "orbit") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="2.3" />
        <path d="M4.2 12c0-3.2 3.5-5.8 7.8-5.8s7.8 2.6 7.8 5.8-3.5 5.8-7.8 5.8S4.2 15.2 4.2 12Z" />
        <path d="M12 4.2c3.2 0 5.8 3.5 5.8 7.8s-2.6 7.8-5.8 7.8-5.8-3.5-5.8-7.8S8.8 4.2 12 4.2Z" />
      </svg>
    );
  }

  if (name === "activity") {
    return (
      <svg {...commonProps}>
        <path d="M3.5 12h4l2.1-5.5 4.6 11 2.1-5.5h4.2" />
      </svg>
    );
  }

  if (name === "crew") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="8" r="3" />
        <path d="M5.5 20c.5-3.3 2.7-5 6.5-5s6 1.7 6.5 5" />
      </svg>
    );
  }

  if (name === "settings") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="3" />
        <path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3.1 1.3v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3.1-1.3l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-1.3-3.1h-.2a1.8 1.8 0 0 1 0-3.6h.2A1.8 1.8 0 0 0 4.5 5l-.1-.1a1.8 1.8 0 0 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3.1-1.3V1a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3.1 1.3l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 1.3 3.1h.2a1.8 1.8 0 0 1 0 3.6h-.2a1.8 1.8 0 0 0-1.3 3.3Z" />
      </svg>
    );
  }

  if (name === "chevron") {
    return (
      <svg {...commonProps}>
        <path d="m9 5 7 7-7 7" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M5 12h13" />
      <path d="m13 7 5 5-5 5" />
    </svg>
  );
}
