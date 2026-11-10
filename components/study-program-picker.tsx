"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { customStudyProgram, normalizeStudyProgram, searchStudyPrograms } from "@/lib/study-programs";
import { Input } from "./ui/input";
import styles from "./study-program-picker.module.css";

type Props = { id?: string; value: string; onChange: (value: string) => void; disabled?: boolean; autoFocus?: boolean };

export function StudyProgramPicker({ id, value, onChange, disabled, autoFocus }: Props) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(-1);
  const list = useRef<HTMLDivElement>(null);
  const results = searchStudyPrograms(value);
  const custom = customStudyProgram(value);
  const canAdd = custom && !results.some(item => normalizeStudyProgram(item.label) === normalizeStudyProgram(custom));
  const suggestions = value.trim() ? results : [...results.slice(0, 4), ...results.filter(item => item.level !== "triennale").slice(0, 2)];
  const options = [...suggestions.slice(0, canAdd ? 5 : 6).map(item => ({ label: item.label, display: item.label })), ...(canAdd ? [{ label: custom, display: `Usa “${custom}”` }] : [])];
  const visible = open && !disabled;

  useEffect(() => {
    if (active >= 0) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(label: string) { onChange(label); setOpen(false); setActive(-1); }

  return <div className={styles.picker}>
    <div className={styles.search}>
      <Search size={16} aria-hidden="true" />
      <Input id={inputId} role="combobox" aria-label="Corso di laurea o ambito di studio" aria-autocomplete="list" aria-expanded={visible} aria-controls={`${inputId}-list`} aria-activedescendant={visible && active >= 0 ? `${inputId}-option-${active}` : undefined} value={value} maxLength={300} disabled={disabled} autoFocus={autoFocus} autoComplete="off" placeholder="Cerca il tuo corso di laurea" onFocus={() => setOpen(true)} onBlur={() => setActive(-1)} onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1); }} onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setOpen(true);
          setActive(previous => options.length ? event.key === "ArrowDown" ? Math.min(previous + 1, options.length - 1) : previous < 0 ? options.length - 1 : Math.max(previous - 1, 0) : -1);
        } else if (event.key === "Enter" && visible && active >= 0 && options[active]) {
          event.preventDefault(); choose(options[active].label);
        } else if (event.key === "Escape" && visible) { event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1); }
      }} />
    </div>
    {visible && <div className={styles.results}>
      <div ref={list} id={`${inputId}-list`} role="listbox" aria-label="Suggerimenti dei corsi di laurea" className={styles.list}>
        {options.map((option, index) => <div key={option.label} role="option" id={`${inputId}-option-${index}`} data-index={index} aria-selected={option.label === value} className={`${styles.option} ${active === index ? styles.active : ""}`} onMouseDown={event => event.preventDefault()} onClick={() => choose(option.label)}>
          <span>{option.display}</span>{option.label === value && <Check size={16} aria-hidden="true" />}
        </div>)}
      </div>
    </div>}
  </div>;
}
