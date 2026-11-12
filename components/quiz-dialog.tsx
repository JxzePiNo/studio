"use client";

import { useEffect, useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { BookOpen, ClipboardList, SlidersHorizontal, X } from "lucide-react";
import { quickQuizConfig, quizConfigSchema, type QuizConfig } from "@/lib/quiz";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import styles from "./quiz.module.css";
import { QuizTimingControls, configuredQuizTiming, defaultQuizTiming } from "./quiz-timing-controls";
import { useStudyProfile } from "./study-profile-provider";
import { isStemQuizContext } from "@/lib/quiz-difficulty";
import { TonyMascot } from "./mascot/tony-mascot";

export function QuizDialog({ id, name, courseName, page, onClose, onGenerate }: { page: number; id: string; name: string; courseName?: string; onClose: () => void; onGenerate: (config: QuizConfig) => void }) {
  const formId = useId();
  const [step, setStep] = useState<"choice" | "quick" | "custom">("choice");
  const customizing = step === "custom";
  const [timing, setTiming] = useState(defaultQuizTiming);
  const { profile } = useStudyProfile();
  const stem = isStemQuizContext(`${profile?.studyProgram || ""} ${courseName || ""} ${name}`);
  const [count, setCount] = useState("10");
  const [mode, setMode] = useState("multiple-choice");
  const [open, setOpen] = useState("3");
  const [trueFalse, setTrueFalse] = useState("2");
  const [difficulty, setDifficulty] = useState<QuizConfig["difficulty"]>("avanzata");
  const [topics, setTopics] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(true);
  const [topicError, setTopicError] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!customizing) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/documents/${id}/quiz`, { headers: await authHeaders(), signal: controller.signal });
        const result = await readApiResponse<{ topics: string[] }>(response);
        if (!controller.signal.aborted) setTopics(result.topics);
      } catch { if (!controller.signal.aborted) setTopicError("Non riesco a caricare gli argomenti salvati. Puoi indicarli qui sotto oppure usare tutto il PDF."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [id, customizing]);
  function submit(quick = false) {
    const duration = configuredQuizTiming(timing, quick ? 10 : Number(count));
    const result = quizConfigSchema.safeParse(quick ? { ...quickQuizConfig(page), ...(duration ? { timing: duration } : {}) } : { count: Number(count), openCount: mode === "open" ? Number(count) : mode === "mixed" ? Number(open) : 0, trueFalseCount: mode === "true-false" ? Number(count) : mode === "mixed" ? Number(trueFalse) : 0, difficulty: stem ? "avanzata" : difficulty, ...(duration ? { timing: duration } : {}), topics: [...new Set([...selected, ...custom.split(/[,;\n]/).map(topic => topic.trim()).filter(Boolean)])] });
    if (!result.success) { setError("Controlla il numero e i tipi di domande, gli argomenti e la durata del timer (da 1 secondo a 24 ore)."); return; }
    onGenerate(result.data); onClose();
  }
  return <Dialog.Root open onOpenChange={value => { if (!value) onClose(); }}><Dialog.Portal><Dialog.Overlay className="plan-overlay" /><Dialog.Content className={`plan-dialog ${styles.dialog}`}>
    <Dialog.Close className={styles.close} aria-label="Chiudi creazione quiz"><X size={18} /></Dialog.Close>
    <div className={styles.creationHeader}><div><span className={styles.kicker}><ClipboardList size={15} /> RIPASSO CON TONY</span>
    <Dialog.Title>Crea un quiz</Dialog.Title><Dialog.Description>Scegli come metterti alla prova su {name}.</Dialog.Description></div><span aria-hidden="true"><TonyMascot size={64} showName={false} /></span></div>
    {step === "choice" ? <div className={styles.quickChoices}>
      <button className={styles.quickChoice} onClick={() => setStep("quick")}><BookOpen size={29} /><strong>Fino a dove sei arrivato</strong><span>Da pagina 1 a pagina {page}, inclusa quella aperta.</span><small>10 domande · Difficoltà alta</small></button>
      <button className={styles.quickChoice} onClick={() => setStep("custom")}><SlidersHorizontal size={29} /><strong>Personalizza</strong><span>Scegli domande, difficoltà e argomenti.</span><small>Tutte le impostazioni</small></button>
    </div> : step === "quick" ? <><form onSubmit={event => { event.preventDefault(); submit(true); }}>
      <p className={styles.hint}>10 domande a scelta multipla, dalla pagina 1 alla {page}. Difficoltà alta, calibrata sul tuo percorso di studi.</p>
      <QuizTimingControls value={timing} onChange={setTiming} count={10} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className="plan-form-actions"><Button variant="outline" onClick={onClose}>Annulla</Button><Button type="submit">Genera quiz rapido</Button></div>
    </form></> : <><form onSubmit={event => { event.preventDefault(); submit(); }}>
      <div className={styles.fields}>
        <label className="form-field" htmlFor={`${formId}-count`}><span className="form-field-label">Numero di domande</span><Input id={`${formId}-count`} type="number" min={1} max={30} value={count} onChange={event => setCount(event.target.value)} required /></label>
        <label className="form-field" htmlFor={`${formId}-mode`}><span className="form-field-label">Tipo di domande</span><Select value={mode} onValueChange={setMode}><SelectTrigger id={`${formId}-mode`}><SelectValue /></SelectTrigger><SelectContent className={styles.selectContent}><SelectItem value="multiple-choice">Scelta multipla</SelectItem><SelectItem value="open">Aperte</SelectItem><SelectItem value="true-false">Vero / falso</SelectItem><SelectItem value="mixed">Miste</SelectItem></SelectContent></Select></label>
        {mode === "mixed" && <><label className="form-field" htmlFor={`${formId}-open`}><span className="form-field-label">Domande aperte</span><Input id={`${formId}-open`} type="number" min={0} max={Number(count)} value={open} onChange={event => setOpen(event.target.value)} required /></label><label className="form-field" htmlFor={`${formId}-tf`}><span className="form-field-label">Domande vero / falso</span><Input id={`${formId}-tf`} type="number" min={0} max={Number(count)} value={trueFalse} onChange={event => setTrueFalse(event.target.value)} required /></label></>}
        <label className={`form-field ${styles.wide}`} htmlFor={`${formId}-difficulty`}><span className="form-field-label">Difficoltà</span><Select value={stem ? "avanzata" : difficulty} disabled={stem} onValueChange={value => setDifficulty(value as QuizConfig["difficulty"])}><SelectTrigger id={`${formId}-difficulty`}><SelectValue /></SelectTrigger><SelectContent className={styles.selectContent}><SelectItem value="base">Base · definizioni e fondamenti</SelectItem><SelectItem value="intermedia">Intermedia · comprensione e applicazione</SelectItem><SelectItem value="avanzata">Alta · problemi e ragionamento da esame</SelectItem></SelectContent></Select></label>
      </div>
      {stem && <p className={styles.hint}>Per le materie STEM manteniamo sempre una difficoltà alta.</p>}
      <QuizTimingControls value={timing} onChange={setTiming} count={Math.max(1, Number(count) || 10)} />
      {mode === "mixed" && <p className={styles.hint}>{Math.max(0, Number(count) - Number(open) - Number(trueFalse))} {Number(count) - Number(open) - Number(trueFalse) === 1 ? "domanda sarà" : "domande saranno"} a scelta multipla.</p>}
      <div className={styles.topicsHeading}><h3>Quali argomenti?</h3><button className={styles.allTopics} type="button" aria-pressed={selected.length === 0 && !custom.trim()} onClick={() => { setSelected([]); setCustom(""); }}>Tutto il PDF</button></div>
      {loading ? <p className={styles.hint} role="status">Cerco gli argomenti già analizzati…</p> : topics.length ? <div className={styles.topics}>{topics.map(topic => <label key={topic}><input type="checkbox" checked={selected.includes(topic)} onChange={event => setSelected(value => event.target.checked ? [...value, topic] : value.filter(item => item !== topic))} /><span>{topic}</span></label>)}</div> : <p className={styles.hint}>Puoi indicare gli argomenti anche senza analisi salvate.</p>}
      {topicError && <p className={styles.hint}>{topicError}</p>}
      <label className={`form-field ${styles.custom}`} htmlFor={`${formId}-topics`}><span className="form-field-label">Altri argomenti, separati da virgole</span><Textarea id={`${formId}-topics`} value={custom} onChange={event => setCustom(event.target.value)} maxLength={3000} rows={2} placeholder="Es. reti neurali, backpropagation" /></label>
      <p className={styles.hint}>{selected.length || custom.trim() ? "Il quiz si concentrerà sugli argomenti indicati." : "Nessun filtro: il quiz coprirà tutto il PDF."} La generazione continua anche se cambi schermata.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className="plan-form-actions"><Button variant="outline" onClick={onClose}>Annulla</Button><Button type="submit"><ClipboardList size={16} /> Genera quiz</Button></div>
    </form></>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
