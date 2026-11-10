"use client";

import { readApiResponse } from "@/lib/api-response";

import { useEffect, useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CalendarDays, FolderPlus, LoaderCircle, X } from "lucide-react";
import { authHeaders } from "@/lib/firebase-client";
import { validExamCfu } from "@/lib/exam-cfu";
import type { ExamFolder } from "@/lib/types";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { StudyAvailability } from "./study-availability";

interface NewExamDialogProps {
  folders?: ExamFolder[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (folder: ExamFolder) => Promise<void> | void;
}

function calendarDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function NewExamDialog({ open, onOpenChange, onCreated, folders = [] }: NewExamDialogProps) {
  const [name, setName] = useState("");
  const [cfu, setCfu] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [nonStudyWeekdays, setNonStudyWeekdays] = useState<number[]>([]);
  const [nonStudyDates, setNonStudyDates] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleInput = useRef<HTMLInputElement>(null);
  const previouslyOpen = useRef(false);
  const created = useRef<ExamFolder | null>(null);
  const requestRunning = useRef(false);
  const dateLabelId = useId();

  useEffect(() => {
    if (open && !previouslyOpen.current) {
      setName(""); setCfu(""); setDate(undefined); setCalendarOpen(false); setError("");
      setNonStudyWeekdays([]); setNonStudyDates([]);
      created.current = null;
    }
    previouslyOpen.current = open;
  }, [open]);

  async function create() {
    if (requestRunning.current || !name.trim()) return;
    if (cfu.trim() && !validExamCfu(Number(cfu))) { setError("Indica CFU tra 0,5 e 120, a incrementi di 0,5."); return; }
    requestRunning.current = true; setBusy(true); setError("");
    try {
      let folder = created.current;
      if (!folder) {
        const response = await fetch("/api/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...await authHeaders() },
          body: JSON.stringify({ name: name.trim(), ...(cfu.trim() ? { cfu: Number(cfu) } : {}), ...(date ? { examDate: calendarDate(date) } : {}), nonStudyWeekdays, nonStudyDates }),
        });
        folder = await readApiResponse<ExamFolder>(response, "Impossibile creare l'esame. Riprova.");
        created.current = folder;
      }
      await onCreated(folder);
      onOpenChange(false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Operazione non riuscita. Riprova.";
      setError(created.current ? `L’esame è stato creato. Riprova ad aggiornare l’elenco. ${message}` : message);
    } finally { setBusy(false); requestRunning.current = false; }
  }

  return <Dialog.Root open={open} onOpenChange={next => { if (!busy) onOpenChange(next); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="new-exam-overlay plan-overlay" />
      <Dialog.Content className="new-exam-dialog plan-dialog" onOpenAutoFocus={event => { event.preventDefault(); titleInput.current?.focus(); }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
        <Dialog.Close asChild><Button variant="ghost" size="icon" className="plan-dialog-close" aria-label="Chiudi nuovo esame" disabled={busy}><X size={18} /></Button></Dialog.Close>
        <div className="new-exam-heading"><span className="new-exam-icon"><FolderPlus size={23} /></span><Dialog.Title>Nuovo esame</Dialog.Title></div>
        <Dialog.Description className="new-exam-description">Dai un nome al corso e scegli quando sostenere l’esame.</Dialog.Description>
        <form className="new-exam-form" onSubmit={event => { event.preventDefault(); void create(); }}>
          <label className="form-field"><span className="form-field-label">Nome del corso</span><Input ref={titleInput} className="new-exam-title course-title-input" aria-label="Nome esame" placeholder="Nome del corso" maxLength={100} value={name} onChange={event => setName(event.target.value)} disabled={busy || !!created.current} required /></label>
          <label className="form-field"><span className="form-field-label">CFU <span className="form-field-optional">(facoltativi)</span></span><Input type="number" min={0.5} max={120} step={0.5} aria-label="CFU" placeholder="Es. 6" value={cfu} onChange={event => setCfu(event.target.value)} disabled={busy || !!created.current} /></label>
          <div className="new-exam-date"><div id={dateLabelId} className="new-exam-date-label">Data dell’esame <span>Facoltativa</span></div>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild><Button variant="outline" className="new-exam-date-trigger" aria-labelledby={dateLabelId} disabled={busy || !!created.current}><CalendarDays size={18} /><span>{date ? new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(date) : "Scegli una data"}</span></Button></PopoverTrigger>
              <PopoverContent className="new-exam-calendar" align="start"><Calendar mode="single" selected={date} defaultMonth={date} onSelect={selected => { setDate(selected); setCalendarOpen(false); }} autoFocus labels={{ labelPrevious: () => "Vai al mese precedente", labelNext: () => "Vai al mese successivo" }} /></PopoverContent>
            </Popover>
            {date && <Button variant="ghost" size="sm" className="new-exam-remove-date" disabled={busy || !!created.current} onClick={() => setDate(undefined)}>Rimuovi data</Button>}
          </div>
          <StudyAvailability key={String(open)} folders={folders} nonStudyWeekdays={nonStudyWeekdays} nonStudyDates={nonStudyDates} onWeekdaysChange={setNonStudyWeekdays} onDatesChange={setNonStudyDates} disabled={busy || !!created.current} />
          {error && <p className="plan-error" role="alert">{error}</p>}
          <div className="new-exam-actions"><Dialog.Close asChild><Button variant="outline" disabled={busy}>Annulla</Button></Dialog.Close><Button type="submit" disabled={busy || !name.trim()}>{busy && <LoaderCircle className="spin" size={16} />}{busy ? "Creazione…" : created.current ? "Riprova" : "Crea"}</Button></div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
