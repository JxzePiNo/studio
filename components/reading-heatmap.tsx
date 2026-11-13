"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { readingCalendar, readingMonthCalendar } from "@/lib/reading-activity";
import type { ReadingActivity } from "@/lib/study-session";
import styles from "./reading-heatmap.module.css";

const dateLabel = (date: string) => new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`));

export function ReadingHeatmap({ activity, today, onDaySelect, onSelectDay }: { activity: ReadingActivity; today: string; onDaySelect?: (day: string) => void; onSelectDay?: (day: string) => void }) {
  const weeks = useMemo(() => readingCalendar(activity, today), [activity, today]);
  const months = useMemo(() => readingMonthCalendar(activity, today), [activity, today]);
  const [visibleMonths, setVisibleMonths] = useState(3);
  const [atRecent, setAtRecent] = useState(true);
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
    let browsingHistory = false;
    const showRecent = () => { setVisibleMonths(window.matchMedia("(max-width: 700px)").matches ? 2 : area.clientWidth >= 640 ? 4 : 3); if (!browsingHistory) area.scrollLeft = area.scrollWidth; };
    const interact = () => { browsingHistory = true; };
    const onScroll = () => setAtRecent(area.scrollWidth - area.clientWidth - area.scrollLeft < 8);
    const observer = new ResizeObserver(showRecent);
    observer.observe(area); showRecent();
    area.addEventListener("pointerdown", interact); area.addEventListener("wheel", interact); area.addEventListener("keydown", interact); area.addEventListener("scroll", onScroll);
    return () => { observer.disconnect(); area.removeEventListener("pointerdown", interact); area.removeEventListener("wheel", interact); area.removeEventListener("keydown", interact); area.removeEventListener("scroll", onScroll); };
  }, [today, visibleMonths]);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const delta = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const index = days.findIndex(day => day.date === date);
    const next = days[Math.min(days.length - 1, Math.max(0, index + delta))];
    if (next) { setSelected(next.date); cells.current.get(next.date)?.focus(); }
  }

  function cell(day: (typeof days)[number] | null, row: number) {
    return day ? <button key={day.date} ref={element => { if (element) cells.current.set(day.date, element); else cells.current.delete(day.date); }} className={styles.cell} data-level={day.level} data-date={day.date} tabIndex={current?.date === day.date ? 0 : -1} aria-label={`${dateLabel(day.date)}: ${day.count} ${day.count === 1 ? "pagina letta" : "pagine lette"}`} title={`${dateLabel(day.date)} · ${day.count} pagine lette`} onClick={() => { setSelected(day.date); onDaySelect?.(day.date); onSelectDay?.(day.date); }} onFocus={() => setSelected(day.date)} onKeyDown={event => navigate(event, day.date)} /> : <span className={styles.empty} key={`empty-${row}`} />;
  }

  return <section className={styles.card} aria-label="Attività di lettura annuale">
    <div className={styles.heading}><div><h2>Un anno, una pagina alla volta.</h2><p><strong>{total}</strong> {total === 1 ? "pagina letta" : "pagine lette"} negli ultimi 365 giorni</p></div><span className={styles.active}>{activeDays} {activeDays === 1 ? "giorno" : "giorni"} di studio</span></div>
    <div className={styles.monthControls}><span>Scorri per vedere i mesi precedenti</span><button type="button" disabled={atRecent} onClick={() => { scroll.current?.scrollTo({ left: scroll.current.scrollWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }}>Ultimi {visibleMonths === 2 ? "due" : visibleMonths === 3 ? "tre" : "quattro"} mesi</button></div>
    <div className={`${styles.scroll} ${styles.mobileMonths}`} style={{ "--visible-months": visibleMonths } as CSSProperties} ref={scroll} aria-label="Calendario di lettura, scorri per vedere i mesi precedenti">
      <div className={styles.calendar}>
        <div className={styles.weekdays} aria-hidden="true"><span>Lun</span><span>Mer</span><span>Ven</span></div>
        <div className={styles.months}>{months.map(({ month, weeks }) => <section className={styles.monthGroup} data-month={month} key={month} aria-label={new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`))}>
          <h3>{new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`))}</h3>
          <div className={styles.monthWeeks}>{weeks.map((week, index) => <div className={styles.monthWeek} key={index}>{week.map(cell)}</div>)}</div>
        </section>)}</div>
      </div>
    </div>
    <div className={styles.footer}><span aria-live="polite">{current ? `${dateLabel(current.date)} · ${current.count} ${current.count === 1 ? "pagina letta" : "pagine lette"}` : "Il tuo ritmo, giorno dopo giorno."}</span><div className={styles.legend} aria-label="Intensità: 0, da 1 a 4, da 5 a 9, da 10 a 19, almeno 20 pagine"><span>Meno</span>{[0, 1, 2, 3, 4].map(level => <i key={level} data-level={level} />)}<span>Più</span></div></div>
  </section>;
}
