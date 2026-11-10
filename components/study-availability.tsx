"use client";

import { useId, useState } from "react";
import { CalendarDays, Check, ChevronDown, Copy, X } from "lucide-react";
import { validExamDate } from "@/lib/study-plan";
import type { ExamFolder } from "@/lib/types";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

interface StudyAvailabilityProps {
  nonStudyWeekdays: number[];
  nonStudyDates: string[];
  onWeekdaysChange: (days: number[]) => void;
  onDatesChange: (dates: string[]) => void;
  disabled?: boolean;
  folders?: ExamFolder[];
  currentFolderId?: string;
}

const weekdays = [
  { day: 1, label: "lunedì" },
  { day: 2, label: "martedì" },
  { day: 3, label: "mercoledì" },
  { day: 4, label: "giovedì" },
  { day: 5, label: "venerdì" },
  { day: 6, label: "sabato" },
  { day: 0, label: "domenica" },
];

function calendarDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

export function StudyAvailability({ nonStudyWeekdays, nonStudyDates, onWeekdaysChange, onDatesChange, disabled = false, folders = [], currentFolderId }: StudyAvailabilityProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [appliedSource, setAppliedSource] = useState("");
  const sourceLabel = useId();
  const savedSchedules = folders.filter(folder => folder.id !== currentFolderId && (folder.nonStudyWeekdays?.length || folder.nonStudyDates?.length)).sort((a, b) => a.name.localeCompare(b.name, "it"));
  const source = savedSchedules.find(folder => folder.id === sourceId);
  const selectedDates = nonStudyDates.filter(validExamDate).map(date => new Date(`${date}T12:00:00`));

  function applySavedSchedule() {
    if (!source || disabled) return;
    onWeekdaysChange([...(source.nonStudyWeekdays || [])]);
    onDatesChange([...(source.nonStudyDates || [])]);
    setAppliedSource(source.name);
  }

  function toggleWeekday(day: number) {
    if (disabled) return;
    onWeekdaysChange(nonStudyWeekdays.includes(day) ? nonStudyWeekdays.filter(value => value !== day) : [...nonStudyWeekdays, day].sort((a, b) => a - b));
  }

  return <details className="study-availability">
    <summary><span>Giorni in cui non studio</span><span className="study-availability-summary">{nonStudyWeekdays.length + nonStudyDates.length ? `${nonStudyWeekdays.length + nonStudyDates.length} esclusioni` : "Facoltativo"}<ChevronDown size={15} aria-hidden="true" /></span></summary>
    <div className="study-availability-content">
      {savedSchedules.length > 0 && <section className="study-availability-reuse" aria-label="Riutilizza giorni di pausa">
        <div className="study-availability-reuse-heading"><span className="study-availability-reuse-icon"><Copy size={17} aria-hidden="true" /></span><div><h3 id={sourceLabel}>Riusa le tue pause</h3><p>Copia i giorni liberi da un altro esame e adattali a questo piano.</p></div></div>
        <div className="study-availability-reuse-controls"><Select value={sourceId} onValueChange={value => { setSourceId(value); setAppliedSource(""); }} disabled={disabled}>
          <SelectTrigger aria-labelledby={sourceLabel}><SelectValue placeholder="Scegli un esame" /></SelectTrigger>
          <SelectContent className="study-availability-reuse-options">{savedSchedules.map(folder => <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>)}</SelectContent>
        </Select><Button variant="outline" size="sm" disabled={disabled || !source} onClick={applySavedSchedule}><Copy size={14} aria-hidden="true" /> Usa queste pause</Button></div>
        {source && <p className="study-availability-reuse-preview">{weekdays.filter(({ day }) => source.nonStudyWeekdays?.includes(day)).map(({ label }) => label).join(", ") || "Nessuna pausa settimanale"}{source.nonStudyDates?.length ? ` · ${source.nonStudyDates.length} ${source.nonStudyDates.length === 1 ? "data esclusa" : "date escluse"}` : ""}</p>}
        <p className="study-availability-reuse-note">Le pause attuali saranno sostituite. L’esame di origine resta invariato.</p>
        {appliedSource && <p className="study-availability-reuse-status" role="status"><Check size={14} aria-hidden="true" /> Pause di {appliedSource} applicate. Puoi modificarle qui.</p>}
      </section>}
      <p className="study-availability-hint">Seleziona i giorni da tenere liberi ogni settimana. Non saranno conteggiati nel piano di studio.</p>
      <div className="study-availability-weekdays" role="group" aria-label="Giorni settimanali esclusi">
        {weekdays.map(({ day, label }) => <Button key={day} variant="outline" size="sm" aria-label={label} aria-pressed={nonStudyWeekdays.includes(day)} disabled={disabled} onClick={() => toggleWeekday(day)}>{label}</Button>)}
      </div>
      <p className="study-availability-hint">Puoi escludere anche singole date, come Natale, un viaggio o altri impegni.</p>
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild><Button variant="outline" className="study-availability-dates-trigger" disabled={disabled}><CalendarDays size={16} /> Escludi singole date</Button></PopoverTrigger>
        <PopoverContent className="study-availability-calendar new-exam-calendar" align="start">
          <Calendar mode="multiple" selected={selectedDates} onSelect={dates => onDatesChange((dates || []).map(calendarDate).sort())} disabled={disabled} autoFocus labels={{ labelPrevious: () => "Vai al mese precedente", labelNext: () => "Vai al mese successivo" }} />
        </PopoverContent>
      </Popover>
      {nonStudyDates.length > 0 && <ul className="study-availability-dates" aria-label="Date escluse dallo studio">{nonStudyDates.filter(validExamDate).sort().map(date => <li key={date}><span>{dateLabel(date)}</span><Button variant="ghost" size="icon" aria-label={`Rimuovi pausa ${dateLabel(date)}`} disabled={disabled} onClick={() => onDatesChange(nonStudyDates.filter(value => value !== date))}><X size={14} /></Button></li>)}</ul>}
    </div>
  </details>;
}
