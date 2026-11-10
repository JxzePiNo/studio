"use client";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { CalendarDays, FolderOpen } from "lucide-react";
import { browserAuth, firebaseEnabled } from "@/lib/firebase-client";
import { examColor } from "@/lib/exam-colors";
import { calculateStudyPlan, localStudyDate, validExamDate } from "@/lib/study-plan";
import type { ExamFolder } from "@/lib/types";

const encouragements = [
  "una lezione alla volta: il prossimo «questa la so!» è più vicino.",
  "anche i programmi più lunghi si affrontano una pagina alla volta. Caffè pronto?",
  "oggi un concetto in più, domani una preoccupazione in meno. Si parte!",
  "non serve sapere tutto oggi. Una pagina, una pausa, e si riparte.",
];
export function CourseHeader({ folder }: { folder: ExamFolder }) {
  const [name, setName] = useState("");
  const [today, setToday] = useState(localStudyDate);
  useEffect(() => {
    const timer = setInterval(() => setToday(localStudyDate()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!firebaseEnabled) return;
    return onAuthStateChanged(browserAuth(), user => setName(user?.displayName?.trim().split(/\s+/)[0] || user?.email?.split("@")[0] || ""));
  }, []);
  const scheduled = !!folder.examDate && validExamDate(folder.examDate);
  const plan = calculateStudyPlan(0, folder.examDate, 10, today);
  const index = Array.from(folder.id + today).reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % encouragements.length;
  return <header className="course-header"><div className="selected-exam" data-exam-color={examColor(folder)}><span className="folder-icon"><FolderOpen size={22} /></span><h1>{folder.name}</h1></div>{scheduled ? <><div className="course-countdown"><CalendarDays size={16} /><strong>{plan.state === "overdue" ? "La data dell’esame è trascorsa" : plan.state === "today" ? "Oggi è il giorno dell’esame" : `Mancano ${plan.daysAvailable} ${plan.daysAvailable === 1 ? "giorno" : "giorni"} all’esame`}</strong><span>{new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${folder.examDate}T12:00:00`))}</span></div><p className="course-motivation">{name ? `${name}, ` : ""}{plan.state === "overdue" ? "il percorso continua: scegli la prossima data e riparti con il tuo ritmo." : encouragements[index]}</p></> : <p className="course-motivation">Le tue lezioni, i tuoi appunti e le spiegazioni. Un passo alla volta.</p>}</header>;
}
