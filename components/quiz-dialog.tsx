"use client";

import { useEffect, useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ClipboardList, X } from "lucide-react";
import { quizConfigSchema, type QuizConfig } from "@/lib/quiz";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import styles from "./quiz.module.css";

export function QuizDialog({ id, name, onClose, onGenerate }: { id: string; name: string; onClose: () => void; onGenerate: (config: QuizConfig) => void }) {
  const formId = useId();
  const [count, setCount] = useState("10");
  const [mode, setMode] = useState("multiple-choice");
  const [open, setOpen] = useState("3");
  const [trueFalse, setTrueFalse] = useState("2");
  const [difficulty, setDifficulty] = useState<QuizConfig["difficulty"]>("intermedia");
  const [topics, setTopics] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(true);
  const [topicError, setTopicError] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
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
  }, [id]);
  function submit() {
    const result = quizConfigSchema.safeParse({ count: Number(count), openCount: mode === "open" ? Number(count) : mode === "mixed" ? Number(open) : 0, trueFalseCount: mode === "true-false" ? Number(count) : mode === "mixed" ? Number(trueFalse) : 0, difficulty, topics: [...new Set([...selected, ...custom.split(/[,;\n]/).map(topic => topic.trim()).filter(Boolean)])] });
    if (!result.success) { setError("Scegli da 1 a 30 domande; la somma delle tipologie non deve superare il totale. Puoi indicare fino a 30 argomenti."); return; }
    onGenerate(result.data); onClose();
  }
  return <Dialog.Root open onOpenChange={value => { if (!value) onClose(); }}><Dialog.Portal><Dialog.Overlay className="plan-overlay" /><Dialog.Content className={`plan-dialog ${styles.dialog}`}>
    <Dialog.Close className={styles.close} aria-label="Chiudi creazione quiz"><X size={18} /></Dialog.Close>
    <span className={styles.kicker}><ClipboardList size={15} /> RIPASSO CON TONY</span>
    <Dialog.Title>Crea un quiz</Dialog.Title><Dialog.Description>Scegli come metterti alla prova su {name}.</Dialog.Description>
    <form onSubmit={event => { event.preventDefault(); submit(); }}>
      <div className={styles.fields}>
        <label htmlFor={`${formId}-count`}>Numero di domande<Input id={`${formId}-count`} type="number" min={1} max={30} value={count} onChange={event => setCount(event.target.value)} required /></label>
        <label htmlFor={`${formId}-mode`}>Tipo di domande<select id={`${formId}-mode`} value={mode} onChange={event => setMode(event.target.value)}><option value="multiple-choice">Scelta multipla</option><option value="open">Aperte</option><option value="true-false">Vero / falso</option><option value="mixed">Miste</option></select></label>
        {mode === "mixed" && <><label htmlFor={`${formId}-open`}>Domande aperte<Input id={`${formId}-open`} type="number" min={0} max={Number(count)} value={open} onChange={event => setOpen(event.target.value)} required /></label><label htmlFor={`${formId}-tf`}>Domande vero / falso<Input id={`${formId}-tf`} type="number" min={0} max={Number(count)} value={trueFalse} onChange={event => setTrueFalse(event.target.value)} required /></label></>}
        <label className={styles.wide} htmlFor={`${formId}-difficulty`}>Difficoltà<select id={`${formId}-difficulty`} value={difficulty} onChange={event => setDifficulty(event.target.value as QuizConfig["difficulty"])}><option value="base">Base · definizioni e fondamenti</option><option value="intermedia">Intermedia · comprensione e applicazione</option><option value="avanzata">Avanzata · collegamenti e ragionamento</option></select></label>
      </div>
      {mode === "mixed" && <p className={styles.hint}>{Math.max(0, Number(count) - Number(open) - Number(trueFalse))} {Number(count) - Number(open) - Number(trueFalse) === 1 ? "domanda sarà" : "domande saranno"} a scelta multipla.</p>}
      <div className={styles.topicsHeading}><h3>Quali argomenti?</h3><button type="button" onClick={() => { setSelected([]); setCustom(""); }}>Tutto il PDF</button></div>
      {loading ? <p className={styles.hint} role="status">Cerco gli argomenti già analizzati…</p> : topics.length ? <div className={styles.topics}>{topics.map(topic => <label key={topic}><input type="checkbox" checked={selected.includes(topic)} onChange={event => setSelected(value => event.target.checked ? [...value, topic] : value.filter(item => item !== topic))} /><span>{topic}</span></label>)}</div> : <p className={styles.hint}>Puoi indicare gli argomenti anche senza analisi salvate.</p>}
      {topicError && <p className={styles.hint}>{topicError}</p>}
      <label className={styles.custom} htmlFor={`${formId}-topics`}>Altri argomenti, separati da virgole<textarea id={`${formId}-topics`} value={custom} onChange={event => setCustom(event.target.value)} maxLength={3000} rows={2} placeholder="Es. reti neurali, backpropagation" /></label>
      <p className={styles.hint}>{selected.length || custom.trim() ? "Il quiz si concentrerà sugli argomenti indicati." : "Nessun filtro: il quiz coprirà tutto il PDF."} La generazione continua anche se cambi schermata.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className="plan-form-actions"><Button variant="outline" onClick={onClose}>Annulla</Button><Button type="submit"><ClipboardList size={16} /> Genera quiz</Button></div>
    </form>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
