"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "./ui/input";
import styles from "./study-program-picker.module.css";

export function ProfileSuggestionInput({ id, value, onChange, options, label, listLabel, placeholder, maxLength, disabled, autoFocus }: { id?: string; value: string; onChange: (value: string) => void; options: { label: string; display: string }[]; label: string; listLabel: string; placeholder: string; maxLength: number; disabled?: boolean; autoFocus?: boolean }) {
  const generatedId = useId(), inputId = id || generatedId;
  const [open, setOpen] = useState(!!autoFocus), [active, setActive] = useState(-1);
  const list = useRef<HTMLDivElement>(null);
  const visible = open && !disabled && options.length > 0;
  useEffect(() => { if (active >= 0) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);
  function choose(label: string) { onChange(label); setOpen(false); setActive(-1); }
  return <div className={styles.picker}><div className={styles.search}><Search size={16} aria-hidden="true" /><Input id={inputId} role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={visible} aria-controls={`${inputId}-list`} aria-activedescendant={visible && active >= 0 ? `${inputId}-option-${active}` : undefined} value={value} maxLength={maxLength} disabled={disabled} autoFocus={autoFocus} autoComplete="off" placeholder={placeholder} onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }} onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1); }} onKeyDown={event => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive(previous => options.length ? event.key === "ArrowDown" ? Math.min(previous + 1, options.length - 1) : previous < 0 ? options.length - 1 : Math.max(previous - 1, 0) : -1); }
    else if (event.key === "Enter" && visible && active >= 0 && options[active]) { event.preventDefault(); choose(options[active].label); }
    else if (event.key === "Escape" && visible) { event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1); }
  }} /></div>{visible && <div className={styles.results}><div ref={list} id={`${inputId}-list`} role="listbox" aria-label={listLabel} className={styles.list}>{options.map((option, index) => <div key={option.label} role="option" id={`${inputId}-option-${index}`} data-index={index} aria-selected={option.label === value} className={`${styles.option} ${active === index ? styles.active : ""}`} onMouseDown={event => event.preventDefault()} onClick={() => choose(option.label)}><span>{option.display}</span>{option.label === value && <Check size={16} aria-hidden="true" />}</div>)}</div></div>}</div>;
}
