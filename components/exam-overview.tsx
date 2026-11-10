"use client";

import { readApiResponse } from "@/lib/api-response";

import { useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, CalendarDays, Check, Clock3, FolderOpen, LoaderCircle, Plus, X } from "lucide-react";
import { authHeaders } from "@/lib/firebase-client";
import { examColors, type ExamColor, examColor } from "@/lib/exam-colors";
import { calculateStudyPlan, DEFAULT_PAGES_PER_HOUR, validExamDate } from "@/lib/study-plan";
import type { DocumentSummary, ExamFolder } from "@/lib/types";
import { Button } from "./ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { StudyAvailability } from "./study-availability";

interface ExamOverviewProps {
  folders: ExamFolder[];
  documents: DocumentSummary[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onUpdated: (folder: ExamFolder) => void;
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

export function ExamOverview({ folders, documents, onOpen, onCreate, onUpdated }: ExamOverviewProps) {
  const [editing, setEditing] = useState<ExamFolder | null>(null);
  const [name, setName] = useState("");
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

  function edit(folder: ExamFolder) {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditing(folder); setName(folder.name); setColor(examColor(folder));
    setExamDate(folder.examDate || "");
    setPace(String(folder.pagesPerHour || DEFAULT_PAGES_PER_HOUR));
    setCalendarOpen(false);
    setNonStudyWeekdays([...(folder.nonStudyWeekdays || [])]);
    setNonStudyDates([...(folder.nonStudyDates || [])]);
    setError("");
  }

  async function save() {
    if (!editing || busy || !name.trim()) return;
    const pagesPerHour = Number(pace);
    if ((examDate && !validExamDate(examDate)) || !Number.isFinite(pagesPerHour) || pagesPerHour < 1 || pagesPerHour > 200) {
      setError("Indica una data valida e un ritmo tra 1 e 200 pagine all’ora.");
      return;
    }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/folders/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...await authHeaders() },
        body: JSON.stringify({ name: name.trim(), color, examDate: examDate || null, pagesPerHour, nonStudyWeekdays, nonStudyDates }),
      });
      const folder = await readApiResponse<ExamFolder>(response, "Impossibile salvare il piano. Riprova.");
      onUpdated(folder);
      setEditing(null);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  const draftPages = editing ? documents.filter(document => document.folderId === editing.id).reduce((sum, document) => sum + document.pages, 0) : 0;
  const draftPlan = calculateStudyPlan(draftPages, examDate, Number(pace), undefined, { nonStudyWeekdays, nonStudyDates });
  const selectedDate = validExamDate(examDate) ? new Date(`${examDate}T12:00:00`) : undefined;

  return <div className="overview-page">
    <header className="exam-overview-heading"><div><h1>I tuoi esami</h1><p>Ogni materia, il suo spazio. Organizza il materiale e trova il tuo ritmo.</p></div><Button onClick={onCreate}><Plus size={17} /> Nuovo esame</Button></header>
    <div className="exam-overview-grid">
      {folders.map(folder => {
        const materials = documents.filter(document => document.folderId === folder.id);
        const pages = materials.reduce((sum, document) => sum + document.pages, 0);
        const plan = calculateStudyPlan(pages, folder.examDate, folder.pagesPerHour, undefined, { nonStudyWeekdays: folder.nonStudyWeekdays, nonStudyDates: folder.nonStudyDates });
        return <Card className="exam-overview-card" onClick={event => { if (!(event.target as HTMLElement).closest("button, a, input")) onOpen(folder.id); }} data-exam-color={examColor(folder)} key={folder.id}>
          <CardHeader className="exam-overview-card-top"><span className="exam-overview-card-icon"><FolderOpen size={24} strokeWidth={1.6} /></span><div><CardTitle><button className="exam-card-title" onClick={() => onOpen(folder.id)}>{folder.name}</button></CardTitle><p>{materials.length} {materials.length === 1 ? "materiale" : "materiali"} · {pages} pagine</p></div><Button variant="ghost" size="icon" aria-label={`Pianifica ${folder.name}`} onClick={() => edit(folder)}><CalendarDays size={18} /></Button></CardHeader>
          <CardContent className="exam-overview-card-body">
            <div className="exam-overview-card-date"><CalendarDays size={15} /><span>{folder.examDate && validExamDate(folder.examDate) ? dateLabel(folder.examDate) : "Data da definire"}</span>{plan.state === "today" && <small className="exam-plan-status">Oggi</small>}{plan.state === "overdue" && <small className="exam-plan-status is-overdue">Data trascorsa</small>}</div>
            <div className="exam-overview-card-planning">
              {plan.state === "overdue" ? <p>Imposta la prossima data per aggiornare il piano.</p> : !pages ? <p>Carica i materiali per stimare il tempo di studio.</p> : plan.daysAvailable === 0 ? <><p>Nessun giorno di studio disponibile.</p><small>Modifica le pause o la data dell’esame per distribuire {duration(plan.totalHours)} di studio.</small></> : plan.hoursPerDay !== null ? <><span className="exam-daily-time"><Clock3 size={18} /><strong>{duration(plan.hoursPerDay)}</strong><span>/ giorno</span></span><p>{duration(plan.totalHours)} totali · {plan.daysAvailable} {plan.daysAvailable === 1 ? "giorno disponibile" : "giorni disponibili"}</p><small>Stima con {plan.pagesPerHour} pagine/ora</small></> : <><p>{duration(plan.totalHours)} di studio stimato</p><small>Imposta la data per calcolare il carico giornaliero.</small></>}
            </div>
          </CardContent>
          <CardFooter className="exam-overview-card-actions"><Button variant="ghost" onClick={() => edit(folder)}>{folder.examDate ? "Modifica piano" : "Imposta la data"}</Button><Button variant="outline" aria-label={`Apri esame ${folder.name}`} onClick={() => onOpen(folder.id)}>Apri esame <ArrowRight size={15} /></Button></CardFooter>
        </Card>;
      })}
      {!folders.length && <Card className="exam-overview-empty"><span className="exam-overview-card-icon"><FolderOpen size={30} strokeWidth={1.5} /></span><h2>Il tuo primo esame inizia qui.</h2><p>Crea una cartella, aggiungi le slide e scegli quando prepararti.</p><Button variant="outline" onClick={onCreate}><Plus size={17} /> Crea il primo esame</Button></Card>}
    </div>

    <Dialog.Root open={!!editing} onOpenChange={open => { if (!open && !busy) setEditing(null); }}>
      <Dialog.Portal><Dialog.Overlay className="plan-overlay" /><Dialog.Content className="plan-dialog" onCloseAutoFocus={event => { event.preventDefault(); opener.current?.focus(); }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
        <Dialog.Title>Pianifica {editing?.name}</Dialog.Title>
        <Dialog.Description>La stima considera tutte le pagine caricate e i giorni di studio prima dell’esame, escludendo le tue pause. Scegli un ritmo adatto alla materia.</Dialog.Description>
        <Dialog.Close asChild><Button variant="ghost" size="icon" className="plan-dialog-close" aria-label="Chiudi pianificazione" disabled={busy}><X size={18} /></Button></Dialog.Close>
        <form className="plan-form" onSubmit={event => { event.preventDefault(); void save(); }}>
          <label>Nome esame<Input value={name} onChange={event => setName(event.target.value)} maxLength={100} disabled={busy} required /></label>
          <fieldset className="exam-color-options"><legend>Colore della cartella</legend>{examColors.map((option, index) => <button key={option} type="button" data-exam-color={option} className="exam-color-option folder-icon" aria-label={["Lavanda", "Menta", "Pesca", "Cielo", "Rosa", "Sabbia"][index]} aria-pressed={color === option} onClick={() => setColor(option)} disabled={busy}><FolderOpen size={20} />{color === option && <Check size={12} aria-hidden="true" />}</button>)}</fieldset>
          <div className="plan-date-field"><span>Data dell’esame</span><Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild><Button variant="outline" className="new-exam-date-trigger" aria-label="Data dell’esame" disabled={busy}><CalendarDays size={18} /><span>{selectedDate ? dateLabel(examDate) : "Scegli una data"}</span></Button></PopoverTrigger>
            <PopoverContent className="new-exam-calendar" align="start"><Calendar mode="single" selected={selectedDate} defaultMonth={selectedDate} onSelect={selected => { setExamDate(selected ? `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}` : ""); setCalendarOpen(false); }} autoFocus labels={{ labelPrevious: () => "Vai al mese precedente", labelNext: () => "Vai al mese successivo" }} /></PopoverContent>
          </Popover></div>
          <label htmlFor={`${formId}-pace`}>Pagine all’ora<Input id={`${formId}-pace`} type="number" min={1} max={200} step="any" value={pace} onChange={event => setPace(event.target.value)} disabled={busy} required /><small>Il valore iniziale di 10 pagine/ora è modificabile: includi lettura, appunti e ripasso.</small></label>
          <StudyAvailability key={editing?.id || "planning"} folders={folders} currentFolderId={editing?.id} nonStudyWeekdays={nonStudyWeekdays} nonStudyDates={nonStudyDates} onWeekdaysChange={setNonStudyWeekdays} onDatesChange={setNonStudyDates} disabled={busy} />
          <div className="plan-preview" aria-live="polite"><strong>{draftPages} pagine caricate</strong><p>{draftPlan.state === "overdue" ? "La data è trascorsa: scegli un nuovo giorno." : !draftPages ? "La stima si aggiornerà quando caricherai i materiali." : draftPlan.daysAvailable === 0 ? `Nessun giorno di studio disponibile. Modifica le pause o la data dell’esame per distribuire ${duration(draftPlan.totalHours)} di studio.` : draftPlan.hoursPerDay !== null ? `Circa ${duration(draftPlan.hoursPerDay)} al giorno · ${duration(draftPlan.totalHours)} totali · ${draftPlan.daysAvailable} giorni disponibili` : `Circa ${duration(draftPlan.totalHours)} totali. Aggiungi una data per distribuirli sui giorni disponibili.`}</p></div>
          {error && <p className="plan-error" role="alert">{error}</p>}
          <div className="plan-form-actions"><Button variant="ghost" disabled={busy || !examDate} onClick={() => setExamDate("")}>Rimuovi data</Button><Button type="submit" disabled={busy}>{busy && <LoaderCircle size={16} className="spin" />}{busy ? "Salvataggio…" : "Salva piano"}</Button></div>
        </form>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </div>;
}
