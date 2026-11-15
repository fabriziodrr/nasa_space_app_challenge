import type { ReactNode } from "react";
import { TextType } from "@/components/reactbits/TextType";
import { SlothLogo } from "@/components/branding/SlothLogo";

export type PillNavItem = {
  label: string;
  active?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  ariaLabel?: string;
  menu?: ReactNode;
};

type PillNavProps = {
  brand?: ReactNode;
  onBrandClick?: () => void;
  items: PillNavItem[];
  trailing?: ReactNode;
  className?: string;
  ariaLabel?: string;
};

export function PillNav({ brand = "S.L.O.T.H.", onBrandClick, items, trailing, className = "", ariaLabel = "Mission controls" }: PillNavProps) {
  return (
    <nav className={`pill-nav ${className}`.trim()} aria-label={ariaLabel}>
      {onBrandClick ? (
        <button className="pill-nav__brand pill-nav__brand-button" type="button" aria-label="Return to dashboard home" onClick={onBrandClick}>
          {typeof brand === "string" && brand === "S.L.O.T.H." ? <SlothLogo className="pill-nav__logo" alt="S.L.O.T.H. home" /> : typeof brand === "string" ? <TextType text={brand} /> : brand}
        </button>
      ) : (
        <div className="pill-nav__brand">
          {typeof brand === "string" && brand === "S.L.O.T.H." ? <SlothLogo className="pill-nav__logo" alt="S.L.O.T.H." /> : typeof brand === "string" ? <TextType text={brand} /> : brand}
        </div>
      )}
      <div className="pill-nav__items">
        {items.map((item) => (
          <div className={item.menu ? "pill-nav__item-wrap has-menu" : "pill-nav__item-wrap"} key={item.label}>
            <button
              className={item.active ? "pill-nav__item is-active" : "pill-nav__item"}
              type="button"
              aria-label={item.ariaLabel ?? item.label}
              aria-pressed={item.active}
              aria-haspopup={item.menu ? "menu" : undefined}
              onClick={item.onClick}
            >
              <span className={item.menu ? "pill-nav__icon-hit" : "pill-nav__icon"} aria-hidden="true">
                {item.icon}
              </span>
              <TextType text={item.label} />
            </button>
            {item.menu && <div className="pill-nav__submenu" role="menu">{item.menu}</div>}
          </div>
        ))}
      </div>
      {trailing && <div className="pill-nav__trailing">{trailing}</div>}
    </nav>
  );
}
