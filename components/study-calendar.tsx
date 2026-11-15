"use client";

import { useMemo, useRef, useState } from "react";
import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, Clock3, RefreshCw, TrendingUp } from "lucide-react";
import { buildStudyCalendar, studyTasksForDay, addStudyDays, type CourseCalendarPlan } from "@/lib/study-calendar";
import { DEFAULT_PAGES_PER_HOUR, localStudyDate } from "@/lib/study-plan";
import { formatCourseName } from "@/lib/course-name";
import { examAccentColor } from "@/lib/exam-colors";
import { trackedFetch } from "@/lib/browser-data-cache";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import type { DocumentSummary, ExamFolder } from "@/lib/types";
import type { SavedStudySession } from "@/lib/study-history";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { StudyAvailability } from "./study-availability";
import styles from "./study-calendar.module.css";

const number = (value: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(value);
function duration(hours: number) {
  if (!hours) return "0 min";
  const minutes = Math.max(1, Math.round(hours * 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
}
const label = (day: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("it-IT", options).format(new Date(`${day}T12:00:00`));

function CourseSettings({ course, folders, onSaved, onOpen }: { course: CourseCalendarPlan; folders: ExamFolder[]; onSaved: (folder: ExamFolder) => void; onOpen: (id: string) => void }) {
  const { folder, pace, plan, remainingPages, totalPages } = course;
  const [date, setDate] = useState(folder.examDate || "");
  const [initial, setInitial] = useState(String(folder.pagesPerHour || DEFAULT_PAGES_PER_HOUR));
  const [weekdays, setWeekdays] = useState(folder.nonStudyWeekdays || []);
  const [dates, setDates] = useState(folder.nonStudyDates || []);
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  const warning = remainingPages > 0 && (plan.state === "unscheduled" ? "Imposta una data per inserire questa materia nel calendario." : plan.state === "overdue" ? "La scadenza è trascorsa: scegli una nuova data." : !plan.daysAvailable ? "Nessun giorno di studio disponibile: modifica la data o le pause." : "");
  async function save() {
    if (lock.current) return;
    lock.current = true; setSaving(true); setError("");
    try {
      const response = await trackedFetch(`/api/folders/${folder.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...await authHeaders() }, body: JSON.stringify({ examDate: date || null, pagesPerHour: Number(initial), nonStudyWeekdays: weekdays, nonStudyDates: dates }) });
      onSaved(await readApiResponse<ExamFolder>(response));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Impossibile salvare. Riprova."); }
    finally { lock.current = false; setSaving(false); }
  }
  return <article className={styles.course} style={{ borderTopColor: examAccentColor(folder) }}>
    <header><div><h3>{formatCourseName(folder.name)}</h3><p>{remainingPages} pagine da studiare su {totalPages}</p></div><Button variant="ghost" size="sm" onClick={() => onOpen(folder.id)} aria-label={`Apri materia ${folder.name}`}>Apri</Button></header>
    <div className={styles.courseMetrics}><span><Clock3 size={15} /> {duration(plan.totalHours)} rimanenti</span><span><TrendingUp size={15} /> {number(pace.effective)} pagine/ora</span></div>
    <p className={styles.pace}>{pace.measured !== null ? `Ritmo adattato: ${pace.sessions} sessioni dedicate negli ultimi 30 giorni (${duration(pace.hours)}, ${pace.pages} pagine). Ritmo osservato: ${number(pace.measured)} pagine/ora.` : "Stima iniziale. Il ritmo si aggiorna quando salvi sessioni dedicate a questa materia."}</p>
    {warning && <p className={styles.warning}>{warning}</p>}
    {totalPages === 0 && <p className={styles.pace}>Carica i materiali dell’esame per calcolare il lavoro.</p>}
    {totalPages > 0 && !remainingPages && <p className={styles.complete}>Tutte le pagine sono segnate come studiate.</p>}
    <details><summary>Data, ritmo iniziale e giorni di pausa</summary><form onSubmit={event => { event.preventDefault(); void save(); }}>
      <label>Data entro cui finire<Input type="date" aria-label={`Scadenza ${folder.name}`} value={date} onChange={event => setDate(event.target.value)} disabled={saving} /></label>
      <label>Stima iniziale: pagine all’ora<Input type="number" min={1} max={200} step="any" required aria-label={`Pagine all’ora ${folder.name}`} value={initial} onChange={event => setInitial(event.target.value)} disabled={saving} /></label>
      <StudyAvailability folders={folders} currentFolderId={folder.id} nonStudyWeekdays={weekdays} nonStudyDates={dates} onWeekdaysChange={setWeekdays} onDatesChange={setDates} disabled={saving} />
      {error && <p role="alert">{error}</p>}
      <Button type="submit" disabled={saving} aria-label={`Salva piano ${folder.name}`}>{saving ? "Salvo…" : "Salva piano"}</Button>
    </form></details>
  </article>;
}

export function StudyCalendar({ folders, documents, sessions, loading, historyError, onRefresh, onSaved, onOpen }: { folders: ExamFolder[]; documents: DocumentSummary[]; sessions: SavedStudySession[]; loading?: boolean; historyError?: string; onRefresh: () => void; onSaved: (folder: ExamFolder) => void; onOpen: (id: string) => void }) {
  const today = localStudyDate();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const agenda = useRef<HTMLElement>(null);
  const plans = useMemo(() => buildStudyCalendar(folders, documents, sessions, today), [folders, documents, sessions, today]);
  const first = `${month}-01`;
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => {
    const day = addStudyDays(first, index - offset);
    const tasks = studyTasksForDay(plans, day);
    const exams = plans.filter(course => course.folder.examDate === day);
    return { day, tasks, exams, hours: tasks.reduce((sum, task) => sum + task.hours, 0) };
  }), [first, offset, plans]);
  const tasks = useMemo(() => studyTasksForDay(plans, selected), [plans, selected]);
  const total = tasks.reduce((sum, task) => sum + task.hours, 0);
  const todayHours = useMemo(() => studyTasksForDay(plans, today).reduce((sum, task) => sum + task.hours, 0), [plans, today]);
  const due = plans.filter(course => course.folder.examDate === selected);
  function changeMonth(amount: number) {
    const date = new Date(`${first}T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + amount);
    const next = date.toISOString().slice(0, 7); setMonth(next); setSelected(next === today.slice(0, 7) ? today : `${next}-01`);
  }
  function selectDay(day: string) {
    setSelected(day);
    if (window.matchMedia("(max-width:700px)").matches) agenda.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  return <section className={`overview-page ${styles.view}`} aria-label="Calendario di studio">
    <header className={styles.heading}><div><span className={styles.eyebrow}>IL TUO PIANO, GIORNO PER GIORNO</span><h1>Calendario di studio</h1><p>Quanto studiare ogni giorno per arrivare alle scadenze con tutte le pagine completate.</p></div><Button variant="outline" size="sm" disabled={loading} onClick={onRefresh}><RefreshCw size={15} /> Aggiorna piano</Button></header>
    <div className={styles.stats}><div><Clock3 size={18} /><strong>{duration(todayHours)}</strong><span>da studiare oggi</span></div><div><BookOpen size={18} /><strong>{duration(plans.reduce((sum, course) => sum + course.plan.totalHours, 0))}</strong><span>per tutte le pagine rimanenti</span></div><div><CalendarDays size={18} /><strong>{plans.filter(course => course.plan.daysAvailable && course.remainingPages > 0 && course.plan.state !== "overdue").length} / {plans.length}</strong><span>materie pianificate</span></div></div>
    {historyError && <p role="alert" className={styles.warning}>{historyError} Il ritmo potrebbe non includere le ultime sessioni. <button onClick={onRefresh}>Riprova</button></p>}
    {loading && <p role="status" className={styles.note}>Aggiornamento delle sessioni e delle stime…</p>}
    <div className={styles.layout}>
      <div className={styles.calendar}><header><h2>{label(first, { month: "long", year: "numeric" })}</h2><div><Button variant="ghost" size="icon" aria-label="Mese precedente" onClick={() => changeMonth(-1)} disabled={month === "0001-01"}><ChevronLeft size={18} /></Button><Button variant="outline" size="sm" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); }}>Oggi</Button><Button variant="ghost" size="icon" aria-label="Mese successivo" onClick={() => changeMonth(1)} disabled={month === "9999-12"}><ChevronRight size={18} /></Button></div></header>
        <table aria-label="Piano di studio mensile"><thead><tr>{["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(day => <th key={day} scope="col">{day}</th>)}</tr></thead><tbody>{Array.from({ length: 6 }, (_, week) => <tr key={week}>{days.slice(week * 7, week * 7 + 7).map(({ day, tasks: entries, exams, hours }) => <td key={day}><button className={styles.day} type="button" data-outside={!day.startsWith(month)} data-today={day === today} data-busy={hours > 8} aria-pressed={selected === day} aria-label={`${label(day, { day: "numeric", month: "long", year: "numeric" })}: ${duration(hours)} di studio${exams.length ? `, scadenza ${exams.map(course => course.folder.name).join(", ")}` : ""}`} onClick={() => selectDay(day)}>
          <span className={styles.dayNumber}>{Number(day.slice(-2))}{exams.length > 0 && <CalendarDays size={12} aria-hidden="true" />}</span><strong>{hours ? duration(hours) : ""}</strong><span className={styles.subjects}>{entries.slice(0, 3).map(({ course }) => <span key={course.folder.id} style={{ borderColor: examAccentColor(course.folder) }}>{formatCourseName(course.folder.name)}</span>)}{entries.length > 3 && <small>+{entries.length - 3}</small>}</span>
        </button></td>)}</tr>)}</tbody></table>
        <p className={styles.note}>Seleziona un giorno per vedere le materie. Le ore si sommano quando prepari più esami.</p>
      </div>
      <aside ref={agenda} className={styles.agenda} aria-label="Studio del giorno selezionato"><span className={styles.eyebrow}>{selected === today ? "OGGI" : "IL TUO GIORNO"}</span><h2>{label(selected, { weekday: "long", day: "numeric", month: "long" })}</h2><strong className={styles.dailyTotal}>{duration(total)}</strong><p>di studio previsto</p>
        {total > 8 && <p className={styles.warning}>Giornata impegnativa: oltre 8 ore. Valuta date, materiali e giorni di pausa nelle materie qui sotto.</p>}
        {tasks.length ? <ul>{tasks.map(({ course, pages, hours }) => <li key={course.folder.id} style={{ borderLeftColor: examAccentColor(course.folder) }}><button onClick={() => onOpen(course.folder.id)}>{formatCourseName(course.folder.name)}</button><span>{pages} {pages === 1 ? "pagina" : "pagine"} · {duration(hours)}</span><small>{number(course.pace.effective)} pagine/ora · {course.pace.measured === null ? "stima iniziale" : "ritmo adattato"}</small></li>)}</ul> : <p className={styles.empty}>{selected < today ? "Il piano si ricalcola da oggi. Le sessioni già svolte sono nella sezione Sessioni." : "Nessuna pagina da studiare prevista per questo giorno."}</p>}
        {due.length > 0 && <div className={styles.deadlines}><h3>Scadenze</h3>{due.map(course => <p key={course.folder.id}><CalendarDays size={14} />{formatCourseName(course.folder.name)}</p>)}</div>}
      </aside>
    </div>
    <div className={styles.explanation}><TrendingUp size={20} /><div><h2>Un piano che segue il tuo ritmo</h2><p>Imposta le pagine all’ora per ogni materia. Le sessioni salvate aggiornano gradualmente il ritmo, mentre le pagine che segni come studiate vengono sottratte dal piano. Il lavoro rimasto si distribuisce sui giorni disponibili prima della scadenza, rispettando le pause.</p><p>Il lettore registra il tempo automaticamente. Se usi il timer, termina la sessione per salvarla.</p><details><summary>Come vengono calcolate le stime</summary><p>Consideriamo le ultime 20 sessioni negli ultimi 30 giorni, dedicate a una sola materia e con pagine completate, dopo almeno 5 minuti complessivi. La stima iniziale pesa come 2 ore di studio per evitare sbalzi dopo sessioni brevi. Le ore delle diverse materie si sommano. Se la scadenza è oggi, il lavoro restante è previsto oggi.</p></details></div></div>
    <h2 className={styles.subjectHeading}>Le tue materie</h2>
    {!plans.length && <p className={styles.empty}>Crea un esame e carica i materiali per iniziare a pianificare lo studio.</p>}
    <div className={styles.courses}>{plans.map(course => <CourseSettings key={`${course.folder.id}:${course.folder.examDate}:${course.folder.pagesPerHour}:${JSON.stringify(course.folder.nonStudyWeekdays)}:${JSON.stringify(course.folder.nonStudyDates)}`} course={course} folders={folders} onSaved={onSaved} onOpen={onOpen} />)}</div>
  </section>;
}
