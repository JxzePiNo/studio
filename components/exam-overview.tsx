"use client";
import { trackedFetch } from "@/lib/browser-data-cache";

import { readApiResponse } from "@/lib/api-response";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CalendarDays, Check, ChevronDown, FolderOpen, LoaderCircle, Plus, Search, Settings2, X } from "lucide-react";
import { authHeaders } from "@/lib/firebase-client";
import { examColors, type ExamColor, examColor } from "@/lib/exam-colors";
import { visibleExams, type ExamSort } from "@/lib/exam-list";
import { validExamCfu } from "@/lib/exam-cfu";
import { formatCourseName } from "@/lib/course-name";
import { calculateStudyPlan, DEFAULT_PAGES_PER_HOUR, localStudyDate, validExamDate } from "@/lib/study-plan";
import type { DocumentSummary, ExamFolder } from "@/lib/types";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { StudyAvailability } from "./study-availability";
import { HomeGreeting } from "./home-greeting";
import { CourseContextMenu, type CourseAction } from "./course-context-menu";
import greetingStyles from "./home-greeting.module.css";
import folderStyles from "./exam-overview.module.css";
import { ReadingHeatmap } from "./reading-heatmap";
import type { ReadingActivity } from "@/lib/study-session";

interface ExamOverviewProps {
  dialogOnly?: boolean;
  folders: ExamFolder[];
  documents: DocumentSummary[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onUpdated: (folder: ExamFolder) => void;
  onDeleted?: (id: string) => void;
  isCourseBusy?: (id: string) => boolean;
  activity?: ReadingActivity;
  today?: string;
  onActivityDaySelect?: (day: string) => void;
  requestedCourseAction?: { folderId: string; action: Exclude<CourseAction, "open">; requestId: number };
  onCourseActionHandled?: () => void;
}

function duration(hours: number): string {
  if (hours === 0) return "0 min";
  const minutes = Math.max(1, Math.ceil(hours * 60 / 5) * 5);
  const wholeHours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [wholeHours ? `${wholeHours} h` : "", remainder ? `${remainder} min` : ""].filter(Boolean).join(" ");
}

function dateLabel(date: string): string {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

// Recreates the layered folder used in ArchAIve's ui/folder-components.tsx
// with the original palette and CSS motion.
const archiveColors = ["blue", "orange", "yellow", "red", "grey", "black"] as const;
const archiveColorLabels = ["Blu", "Arancione", "Giallo", "Rosso", "Grigio", "Nero"];

function ExamFolderVisual() {
  return <span className={folderStyles.folder} aria-hidden="true">
    <span className={`${folderStyles.paper} ${folderStyles.paperBack}`} />
    <span className={`${folderStyles.paper} ${folderStyles.paperMiddle}`} />
    <span className={`${folderStyles.paper} ${folderStyles.paperFront}`}><i /><i /><i /></span>
    <span className={folderStyles.flap}><span className={folderStyles.tab} /><span className={folderStyles.flapBody} /></span>
  </span>;
}

export function ExamOverview({ dialogOnly = false, folders, documents, onOpen, onCreate, onUpdated, onDeleted, isCourseBusy, activity, today, onActivityDaySelect, requestedCourseAction, onCourseActionHandled }: ExamOverviewProps) {
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ExamSort>("deadline");
  const [editing, setEditing] = useState<ExamFolder | null>(null);
  const [name, setName] = useState("");
  const [cfu, setCfu] = useState("");
  const [optional, setOptional] = useState(false);
  const [color, setColor] = useState<ExamColor>("lavender");
  const [examDate, setExamDate] = useState("");
  const [pace, setPace] = useState(String(DEFAULT_PAGES_PER_HOUR));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [nonStudyWeekdays, setNonStudyWeekdays] = useState<number[]>([]);
  const [nonStudyDates, setNonStudyDates] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const formId = useId();
  const opener = useRef<HTMLElement | null>(null);

  const nameInput = useRef<HTMLInputElement>(null);
  const renameRequested = useRef(false);
  const consumedRequest = useRef<number | null>(null);
  const mutation = useRef(false);

  const edit = useCallback((folder: ExamFolder) => {
    setConfirmDelete(false);
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditing(folder); setName(folder.name); setColor(examColor(folder));
    setCfu(folder.cfu === undefined ? "" : String(folder.cfu));
    setOptional(folder.optional === true);
    setExamDate(folder.examDate || "");
    setPace(String(folder.pagesPerHour || DEFAULT_PAGES_PER_HOUR));
    setCalendarOpen(false);
    setNonStudyWeekdays([...(folder.nonStudyWeekdays || [])]);
    setNonStudyDates([...(folder.nonStudyDates || [])]);
    setError("");
  }, []);

  async function save() {
    if (!editing || busy || !name.trim()) return;
    if (cfu.trim() && !validExamCfu(Number(cfu))) { setError("Indica CFU tra 0,5 e 120, a incrementi di 0,5."); return; }
    const pagesPerHour = Number(pace);
    if ((examDate && !validExamDate(examDate)) || !Number.isFinite(pagesPerHour) || pagesPerHour < 1 || pagesPerHour > 200) {
      setError("Indica una data valida e un ritmo tra 1 e 200 pagine all’ora.");
      return;
    }
    setBusy(true); setError("");
    try {
      const response = await trackedFetch(`/api/folders/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...await authHeaders() },
        body: JSON.stringify({ name: name.trim(), color, optional, cfu: cfu.trim() ? Number(cfu) : null, examDate: examDate || null, pagesPerHour, nonStudyWeekdays, nonStudyDates }),
      });
      const folder = await readApiResponse<ExamFolder>(response, "Impossibile salvare il piano. Riprova.");
      onUpdated(folder);
      setEditing(null);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  const archive = useCallback(async (folder: ExamFolder) => {
    if (busy || mutation.current) return;
    mutation.current = true;
    setBusy(true); setError("");
    try {
      const response = await trackedFetch(`/api/folders/${folder.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...await authHeaders() }, body: JSON.stringify({ archived: !folder.archived }) });
      onUpdated(await readApiResponse<ExamFolder>(response, "Impossibile aggiornare l’esame. Riprova."));
      setEditing(null);
    } catch (error) { setError((error as Error).message); }
    finally { mutation.current = false; setBusy(false); }
  }, [busy, onUpdated]);

  const courseAction = useCallback((folder: ExamFolder, action: CourseAction) => {
    if (busy || mutation.current) return;
    if (action === "open") { onOpen(folder.id); return; }
    renameRequested.current = action === "rename";
    edit(folder);
    if (action === "delete") setConfirmDelete(true);
    if (action === "archive") void archive(folder);
  }, [archive, busy, edit, onOpen]);

  useEffect(() => {
    if (!requestedCourseAction || consumedRequest.current === requestedCourseAction.requestId || busy || mutation.current) return;
    const folder = folders.find(item => item.id === requestedCourseAction.folderId);
    if (!folder) return;
    consumedRequest.current = requestedCourseAction.requestId;
    courseAction(folder, requestedCourseAction.action);
    onCourseActionHandled?.();
  }, [requestedCourseAction, folders, courseAction, onCourseActionHandled, busy]);

  async function remove() {
    if (!editing || busy || isCourseBusy?.(editing.id) || !confirmDelete) return;
    setBusy(true); setError("");
    try {
      const response = await trackedFetch(`/api/folders/${editing.id}`, { method: "DELETE", headers: await authHeaders() });
      await readApiResponse(response, "Impossibile eliminare tutti i materiali. Riprova per completare l’eliminazione.");
      onDeleted?.(editing.id);
      setEditing(null);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  const draftPages = editing ? documents.filter(document => document.folderId === editing.id).reduce((sum, document) => sum + document.pages, 0) : 0;
  const draftPlan = calculateStudyPlan(draftPages, examDate, Number(pace), undefined, { nonStudyWeekdays, nonStudyDates });
  const selectedDate = validExamDate(examDate) ? new Date(`${examDate}T12:00:00`) : undefined;
  const displayedFolders = visibleExams(folders.filter(folder => showArchived ? folder.archived : !folder.archived), search, sort, today);

  return <>{!dialogOnly && <div className="overview-page">
    <header className={`exam-overview-heading ${greetingStyles.header}`}><HomeGreeting /><Button className={greetingStyles.action} onClick={onCreate}><Plus size={17} /> Nuovo esame</Button></header>
    {activity && today && <ReadingHeatmap activity={activity} today={today} onDaySelect={onActivityDaySelect} />}
    <div className={folderStyles.sectionHeading}><h2>{showArchived ? "I tuoi esami archiviati" : "I tuoi prossimi esami"}</h2>{(showArchived || folders.some(folder => folder.archived)) && <Button variant="ghost" onClick={() => setShowArchived(value => !value)} aria-pressed={showArchived}>{showArchived ? "Mostra prossimi esami" : "Mostra archiviati"}</Button>}</div>
    {folders.length > 0 && <div className={folderStyles.toolbar}>
      <label className="form-field exam-search-field"><span className="form-field-label">Cerca un esame</span><div className={folderStyles.search}><Search size={17} aria-hidden="true" /><Input type="search" aria-label="Cerca un esame" placeholder="Cerca un esame" value={search} onChange={event => setSearch(event.target.value)} /></div></label>
      <label className={`${folderStyles.sort} exam-sort-field`}><span className="form-field-label">Ordina per</span><span className="select-field-control"><select aria-label="Ordina esami" value={sort} onChange={event => setSort(event.target.value as ExamSort)}><option value="deadline">Data più vicina</option><option value="name">Nome A–Z</option><option value="newest">Più recenti</option></select><ChevronDown size={16} aria-hidden="true" /></span></label>
    </div>}
    <div className="exam-overview-grid">
      {displayedFolders.map(folder => {
        const materials = documents.filter(document => document.folderId === folder.id);
        const pages = materials.reduce((sum, document) => sum + document.pages, 0);
        const plan = calculateStudyPlan(pages, folder.examDate, folder.pagesPerHour, today, { nonStudyWeekdays: folder.nonStudyWeekdays, nonStudyDates: folder.nonStudyDates });
        const remainingDays = folder.examDate && validExamDate(folder.examDate) ? Math.round((Date.parse(`${folder.examDate}T00:00:00Z`) - Date.parse(`${today || localStudyDate()}T00:00:00Z`)) / 86400000) : null;
        const metadata = [
          folder.cfu !== undefined && validExamCfu(folder.cfu) ? `${new Intl.NumberFormat("it-IT").format(folder.cfu)} CFU` : "",
          !pages ? "Aggiungi materiali" : plan.state !== "overdue" && plan.state !== "unscheduled" ? plan.daysAvailable === 0 ? "Nessun giorno disponibile" : plan.hoursPerDay !== null ? `${duration(plan.hoursPerDay)} al giorno` : "" : "",
        ].filter(Boolean).join(" \u2022 ");
        const urgency = remainingDays !== null && remainingDays <= 7 ? "urgent" : remainingDays !== null && remainingDays <= 21 ? "soon" : "later";
        return <CourseContextMenu key={folder.id} folder={folder} disabled={busy} deleteDisabled={isCourseBusy?.(folder.id)} onAction={action => courseAction(folder, action)}><Card className={`exam-overview-card ${folderStyles.card}`} onClick={event => { if (!(event.target as HTMLElement).closest("button, a, input")) onOpen(folder.id); }} data-folder-color={archiveColors[examColors.indexOf(examColor(folder))]} key={folder.id}>
          <CardHeader className={`exam-overview-card-top ${folderStyles.top}`}><ExamFolderVisual /><div><CardTitle><button className={`exam-card-title ${folderStyles.openButton}`} aria-label={`Apri esame ${folder.name}`} onClick={() => onOpen(folder.id)}>{formatCourseName(folder.name)}</button></CardTitle><div className={folderStyles.examDate}><span>{folder.examDate && validExamDate(folder.examDate) ? dateLabel(folder.examDate) : "Data da definire"}</span>{remainingDays !== null && <span className={folderStyles.urgency} data-urgency={urgency}>{remainingDays < 0 ? "Data trascorsa" : remainingDays === 0 ? "Oggi" : `Tra ${remainingDays} ${remainingDays === 1 ? "giorno" : "giorni"}`}</span>}</div>{metadata && <p className={folderStyles.metadata}>{metadata}</p>}</div><Button className={folderStyles.planButton} variant="ghost" size="icon" aria-label={`Impostazioni ${folder.name}`} onClick={() => courseAction(folder, "settings")}><Settings2 size={18} /></Button></CardHeader>
          {(folder.archived || folder.optional) && <CardContent className={folderStyles.body}>
            <div className={folderStyles.tags}>
              {folder.archived && <span className={folderStyles.tag}>Archiviato</span>}
              {folder.optional && <span className={folderStyles.tag}>Facoltativo</span>}
            </div>
          </CardContent>}
        </Card></CourseContextMenu>;
      })}
      {folders.length > 0 && !displayedFolders.length && <Card className={`exam-overview-empty ${folderStyles.noResults}`}><Search size={25} aria-hidden="true" /><h2>{search ? "Nessun esame trovato" : showArchived ? "Nessun esame archiviato" : "Nessun esame in programma"}</h2><p>{search ? "Prova con un altro nome." : showArchived ? "Gli esami che archivi saranno visibili qui." : "Crea un nuovo esame o ripristinane uno dall’archivio."}</p>{search && <Button variant="outline" onClick={() => setSearch("")}>Cancella ricerca</Button>}</Card>}
      {!folders.length && <Card className="exam-overview-empty"><span className="exam-overview-card-icon"><FolderOpen size={30} strokeWidth={1.5} /></span><h2>Il tuo primo esame inizia qui.</h2><p>Crea una cartella, aggiungi le slide e scegli quando prepararti.</p><Button variant="outline" onClick={onCreate}><Plus size={17} /> Crea il primo esame</Button></Card>}
    </div>

    </div>}
    <Dialog.Root open={!!editing} onOpenChange={open => { if (!open && !busy) setEditing(null); }}>
      <Dialog.Portal><Dialog.Overlay className="plan-overlay" /><Dialog.Content className={`plan-dialog ${folderStyles.settingsDialog}`} onOpenAutoFocus={event => { if (renameRequested.current) { event.preventDefault(); nameInput.current?.focus(); nameInput.current?.select(); renameRequested.current = false; } }} onCloseAutoFocus={event => { event.preventDefault(); opener.current?.focus(); }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
        <Dialog.Title>Impostazioni {editing ? formatCourseName(editing.name) : ""}</Dialog.Title>
        <Dialog.Description>La stima considera tutte le pagine caricate e i giorni di studio prima dell’esame, escludendo le tue pause. Scegli un ritmo adatto alla materia.</Dialog.Description>
        <Dialog.Close asChild><Button variant="ghost" size="icon" className="plan-dialog-close" aria-label="Chiudi pianificazione" disabled={busy}><X size={18} /></Button></Dialog.Close>
        <form className="plan-form" onSubmit={event => { event.preventDefault(); void save(); }}>
          <label><span className="form-field-label">Nome del corso</span><Input aria-label="Nome esame" ref={nameInput} className="course-title-input" placeholder="Es. Fundamentals of Machine Learning" value={name} onChange={event => setName(event.target.value)} maxLength={100} disabled={busy} required /></label>
          <div className={folderStyles.optionalSetting}>
            <div><label htmlFor={`${formId}-optional`}>Corso obbligatorio</label><p id={`${formId}-optional-hint`}>{optional ? "A scelta nel tuo piano di studi." : "Obbligatorio nel tuo piano di studi."}</p></div>
            <input id={`${formId}-optional`} className={folderStyles.optionalSwitch} type="checkbox" role="switch" aria-describedby={`${formId}-optional-hint`} checked={!optional} onChange={event => setOptional(!event.target.checked)} disabled={busy} />
          </div>
          <label><span className="form-field-label">CFU <span className="form-field-optional">(facoltativi)</span></span><Input type="number" min={0.5} max={120} step={0.5} value={cfu} onChange={event => setCfu(event.target.value)} disabled={busy} placeholder="Es. 6" /><small>Lascia vuoto se non indicati.</small></label>
          <fieldset className="exam-color-options"><legend>Colore della cartella</legend>{examColors.map((option, index) => <button key={option} type="button" data-folder-color={archiveColors[index]} className={`exam-color-option folder-icon ${folderStyles.swatch}`} aria-label={archiveColorLabels[index]} aria-pressed={color === option} onClick={() => setColor(option)} disabled={busy}><FolderOpen size={20} />{color === option && <Check size={12} aria-hidden="true" />}</button>)}</fieldset>
          <div className="plan-date-field"><span>Data dell’esame</span><Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild><Button variant="outline" className="new-exam-date-trigger" aria-label="Data dell’esame" disabled={busy}><CalendarDays size={18} /><span>{selectedDate ? dateLabel(examDate) : "Scegli una data"}</span></Button></PopoverTrigger>
            <PopoverContent className="new-exam-calendar" align="start"><Calendar mode="single" selected={selectedDate} defaultMonth={selectedDate} onSelect={selected => { setExamDate(selected ? `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}` : ""); setCalendarOpen(false); }} autoFocus labels={{ labelPrevious: () => "Vai al mese precedente", labelNext: () => "Vai al mese successivo" }} /></PopoverContent>
          </Popover></div>
          <label htmlFor={`${formId}-pace`}>Pagine all’ora<Input id={`${formId}-pace`} type="number" min={1} max={200} step="any" value={pace} onChange={event => setPace(event.target.value)} disabled={busy} required /><small>Il valore iniziale di 10 pagine/ora è modificabile: includi lettura, appunti e ripasso.</small></label>
          <StudyAvailability key={editing?.id || "planning"} folders={folders} currentFolderId={editing?.id} nonStudyWeekdays={nonStudyWeekdays} nonStudyDates={nonStudyDates} onWeekdaysChange={setNonStudyWeekdays} onDatesChange={setNonStudyDates} disabled={busy} />
          <div className="plan-preview" aria-live="polite"><strong>{draftPages} pagine caricate</strong><p>{draftPlan.state === "overdue" ? "La data è trascorsa: scegli un nuovo giorno." : !draftPages ? "La stima si aggiornerà quando caricherai i materiali." : draftPlan.daysAvailable === 0 ? `Nessun giorno di studio disponibile. Modifica le pause o la data dell’esame per distribuire ${duration(draftPlan.totalHours)} di studio.` : draftPlan.hoursPerDay !== null ? `Circa ${duration(draftPlan.hoursPerDay)} al giorno · ${duration(draftPlan.totalHours)} totali · ${draftPlan.daysAvailable} giorni disponibili` : `Circa ${duration(draftPlan.totalHours)} totali. Aggiungi una data per distribuirli sui giorni disponibili.`}</p></div>
          {error && <p className="plan-error" role="alert">{error}</p>}
          <div className={folderStyles.courseActions}>
            <div className={folderStyles.courseActionRow}>
            <Button type="button" variant="outline" disabled={busy} onClick={() => { if (editing) void archive(editing); }}>{editing?.archived ? "Ripristina esame" : "Archivia esame"}</Button>
            <Button type="button" variant="ghost" className={folderStyles.deleteButton} disabled={busy || !!(editing && isCourseBusy?.(editing.id))} onClick={() => setConfirmDelete(true)}>Elimina esame</Button>
            <Button type="submit" className={folderStyles.saveButton} disabled={busy}>{busy && <LoaderCircle size={16} className="spin" />}{busy ? "Salvataggio…" : "Salva impostazioni"}</Button>
            </div>
            <p>{editing?.archived ? "Ripristina l’esame tra i prossimi esami." : "Conserva tutti i PDF e i progressi nell’archivio."}</p>
            {confirmDelete && <div role="group" aria-label="Conferma eliminazione esame"><p>Eliminare definitivamente {editing ? formatCourseName(editing.name) : ""} e tutti i suoi PDF, appunti e progressi? Questa operazione è irreversibile.</p><div className={folderStyles.confirmActions}><Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmDelete(false)}>Annulla</Button><Button type="button" className={folderStyles.deleteButton} disabled={busy || !!(editing && isCourseBusy?.(editing.id))} onClick={() => void remove()}>Conferma eliminazione</Button></div></div>}

            {editing && isCourseBusy?.(editing.id) && <p>Attendi il termine dell’analisi prima di eliminare l’esame.</p>}
          </div>
        </form>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </>;
}
