"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { readingCalendar } from "@/lib/reading-activity";
import type { ReadingActivity } from "@/lib/study-session";
import styles from "./reading-heatmap.module.css";

const dateLabel = (date: string) => new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`));

export function ReadingHeatmap({ activity, today, onDaySelect, onSelectDay }: { activity: ReadingActivity; today: string; onDaySelect?: (day: string) => void; onSelectDay?: (day: string) => void }) {
  const weeks = useMemo(() => readingCalendar(activity, today), [activity, today]);
  const days = weeks.flat().filter(day => day !== null);
  const [selected, setSelected] = useState(today);
  const scroll = useRef<HTMLDivElement>(null);
  const cells = useRef(new Map<string, HTMLButtonElement>());
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const activeDays = days.filter(day => day.count > 0).length;
  const current = days.find(day => day.date === selected) || days.at(-1);
  useEffect(() => {
    const area = scroll.current;
    if (!area) return;
    const showRecent = () => { area.scrollLeft = area.scrollWidth; };
    const observer = new ResizeObserver(showRecent);
    observer.observe(area); showRecent();
    return () => observer.disconnect();
  }, [today]);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const delta = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const index = days.findIndex(day => day.date === date);
    const next = days[Math.min(days.length - 1, Math.max(0, index + delta))];
    if (next) { setSelected(next.date); cells.current.get(next.date)?.focus(); }
  }

  return <section className={styles.card} aria-label="Attività di lettura annuale">
    <div className={styles.heading}><div><h2>Un anno, una pagina alla volta.</h2><p><strong>{total}</strong> {total === 1 ? "pagina letta" : "pagine lette"} negli ultimi 365 giorni</p></div><span className={styles.active}>{activeDays} {activeDays === 1 ? "giorno" : "giorni"} di studio</span></div>
    <div className={styles.scroll} ref={scroll}>
      <div className={styles.calendar}>
        <div className={styles.weekdays} aria-hidden="true"><span>Lun</span><span>Mer</span><span>Ven</span></div>
        <div className={styles.weeks}>
          {weeks.map((week, index) => {
            const first = week.find(day => day && day.date.endsWith("-01"));
            const month = first ? new Intl.DateTimeFormat("it-IT", { month: "short" }).format(new Date(`${first.date}T12:00:00`)) : index === 0 ? new Intl.DateTimeFormat("it-IT", { month: "short" }).format(new Date(`${days[0]?.date}T12:00:00`)) : "";
            return <div className={styles.week} key={index}><span className={styles.month} aria-hidden="true">{month}</span>{week.map((day, row) => day ? <button key={day.date} ref={element => { if (element) cells.current.set(day.date, element); else cells.current.delete(day.date); }} className={styles.cell} data-level={day.level} data-date={day.date} tabIndex={current?.date === day.date ? 0 : -1} aria-label={`${dateLabel(day.date)}: ${day.count} ${day.count === 1 ? "pagina letta" : "pagine lette"}`} title={`${dateLabel(day.date)} · ${day.count} pagine lette`} onClick={() => { setSelected(day.date); onDaySelect?.(day.date); onSelectDay?.(day.date); }} onFocus={() => setSelected(day.date)} onKeyDown={event => navigate(event, day.date)} /> : <span className={styles.empty} key={`empty-${row}`} />)}</div>;
          })}
        </div>
      </div>
    </div>
    <div className={styles.footer}><span aria-live="polite">{current ? `${dateLabel(current.date)} · ${current.count} ${current.count === 1 ? "pagina letta" : "pagine lette"}` : "Il tuo ritmo, giorno dopo giorno."}</span><div className={styles.legend} aria-label="Intensità: 0, da 1 a 4, da 5 a 9, da 10 a 19, almeno 20 pagine"><span>Meno</span>{[0, 1, 2, 3, 4].map(level => <i key={level} data-level={level} />)}<span>Più</span></div></div>
  </section>;
}
