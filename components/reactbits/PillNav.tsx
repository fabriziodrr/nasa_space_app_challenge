import type { ReactNode } from "react";
import { TextType } from "@/components/reactbits/TextType";
import { SlothLogo } from "@/components/branding/SlothLogo";

export type PillNavItem = {
  label: string;
  active?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  ariaLabel?: string;
};

type PillNavProps = {
  brand?: ReactNode;
  items: PillNavItem[];
  trailing?: ReactNode;
  className?: string;
  ariaLabel?: string;
};

export function PillNav({ brand = "S.L.O.T.H.", items, trailing, className = "", ariaLabel = "Mission controls" }: PillNavProps) {
  return (
    <nav className={`pill-nav ${className}`.trim()} aria-label={ariaLabel}>
      <div className="pill-nav__brand">
        {typeof brand === "string" && brand === "S.L.O.T.H." ? <SlothLogo className="pill-nav__logo" alt="S.L.O.T.H." /> : typeof brand === "string" ? <TextType text={brand} /> : brand}
      </div>
      <div className="pill-nav__items">
        {items.map((item) => (
          <button
            className={item.active ? "pill-nav__item is-active" : "pill-nav__item"}
            type="button"
            aria-label={item.ariaLabel ?? item.label}
            aria-pressed={item.active}
            key={item.label}
            onClick={item.onClick}
          >
            {item.icon}
            <TextType text={item.label} />
          </button>
        ))}
      </div>
      {trailing && <div className="pill-nav__trailing">{trailing}</div>}
    </nav>
  );
}
