"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./Dropdown.module.css";

export type DropdownOption = { value: string; label: string; description?: string; initials?: string; disabled?: boolean };
type Props = { id?: string; label: string; value: string; options: DropdownOption[]; onChange(value: string): void; disabled?: boolean };

/** Shared crew-profile dropdown, also used for non-profile selections. */
export function Dropdown({ id, label, value, options, onChange, disabled = false }: Props) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const menuId = `${controlId}-options`;
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 280 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const search = useRef({ text: "", at: 0 });
  const selected = options.find((option) => option.value === value);
  const expanded = open && !disabled;

  useEffect(() => {
    if (!expanded) return;
    function locate() {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12;
      const height = Math.min(280, Math.max(below, rect.top - 12));
      const width = Math.min(Math.max(rect.width, 240), window.innerWidth - 24);
      setPosition({ top: below >= Math.min(200, height) ? rect.bottom + 6 : Math.max(12, rect.top - height - 6), left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width, maxHeight: height });
    }
    locate();
    const outside = (event: PointerEvent) => { if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("resize", locate);
    window.addEventListener("scroll", locate, true);
    document.addEventListener("pointerdown", outside);
    optionRefs.current[Math.max(0, options.findIndex((option) => option.value === value && !option.disabled))]?.focus();
    return () => { window.removeEventListener("resize", locate); window.removeEventListener("scroll", locate, true); document.removeEventListener("pointerdown", outside); };
  }, [expanded, options, value]);

  function close() { setOpen(false); trigger.current?.focus(); }
  const copy = (option: DropdownOption | undefined) => <>{option?.initials && <span className={styles.avatar} aria-hidden="true">{option.initials}</span>}<span className={styles.copy}><strong>{option?.label ?? "Select an option"}</strong>{option?.description && <small>{option.description}</small>}</span></>;
  return <div className={styles.root}>
    <button id={controlId} ref={trigger} className={styles.trigger} type="button" disabled={disabled || !options.length} aria-label={`${label}: ${selected?.label ?? "Select an option"}`} aria-haspopup="listbox" aria-expanded={expanded} aria-controls={expanded ? menuId : undefined} onClick={() => setOpen(!expanded)} onKeyDown={(event) => { if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); setOpen(true); } }}>
      {copy(selected)}<svg className={styles.chevron} viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m5 7 5 5 5-5" strokeWidth="1.8" /></svg>
    </button>
    {expanded && createPortal(<div ref={menu} id={menuId} role="listbox" aria-label={label} className={styles.menu} style={position}>
      <div className={styles.heading} aria-hidden="true">{label}<small>{options.length} AVAILABLE</small></div>
      {options.map((option, index) => <button ref={(element) => { optionRefs.current[index] = element; }} key={option.value} className={styles.option} role="option" type="button" tabIndex={-1} disabled={option.disabled} aria-selected={value === option.value} onClick={() => { onChange(option.value); close(); }} onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); close(); return; }
        if (event.key === "Tab") { close(); return; }
        const available = options.map((item, i) => item.disabled ? -1 : i).filter((i) => i >= 0);
        const at = available.indexOf(index);
        let next: number | undefined;
        if (event.key === "ArrowDown") next = available[(at + 1) % available.length];
        else if (event.key === "ArrowUp") next = available[(at - 1 + available.length) % available.length];
        else if (event.key === "Home") next = available[0];
        else if (event.key === "End") next = available.at(-1);
        else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== " ") {
          search.current = { text: Date.now() - search.current.at < 700 ? search.current.text + event.key.toLowerCase() : event.key.toLowerCase(), at: Date.now() };
          next = available.find((i) => options[i]?.label.toLowerCase().startsWith(search.current.text));
        } else return;
        event.preventDefault(); if (next !== undefined) optionRefs.current[next]?.focus();
      }}>{copy(option)}{option.value === value && <span className={styles.check} aria-hidden="true">✓</span>}</button>)}
    </div>, document.body)}
  </div>;
}
