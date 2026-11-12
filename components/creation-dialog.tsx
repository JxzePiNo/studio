"use client";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, GitBranch, Image, Network, Sparkles, X } from "lucide-react";
import type { ArtifactKind } from "@/lib/study-artifact";
import { creationPrompt, type CreationGoal, type CreationDepth } from "@/lib/creation-prompts";
import { heartMap } from "@/lib/artifact-example";
import { StudyArtifactView } from "./study-artifact-view";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import styles from "./study-artifact.module.css";

const choices = [
  { kind: "map" as const, name: "Mappe", subtitle: "Collega le idee", icon: Network },
  { kind: "image" as const, name: "Immagini", subtitle: "Esplora ogni parte", icon: Image },
  { kind: "diagram" as const, name: "Schemi", subtitle: "Segui i passaggi", icon: GitBranch },
];
const examples = {
  map: "Una mappa mentale del cuore umano: camere, valvole, vasi principali e percorso del sangue.",
  image: "Un'illustrazione interattiva del cuore umano in sezione: selezionando camere, valvole e vasi voglio leggere nome e funzione.",
  diagram: "Uno schema del percorso del sangue: circolazione polmonare e sistemica, con tutti i passaggi attraverso il cuore.",
};
export function CreationDialog({ onClose, onGenerate, wholeDocument, configured, documentName }: { onClose: () => void; onGenerate: (question: string, kind: ArtifactKind, scope: "slide" | "document") => void; wholeDocument: boolean; configured: boolean; documentName?: string }) {
  const [kind, setKind] = useState<ArtifactKind | null>(null);
  const [question, setQuestion] = useState("");
  const [preview, setPreview] = useState(false);
  const [scope, setScope] = useState<"slide" | "document">(wholeDocument ? "document" : "slide");
  const [goal, setGoal] = useState<CreationGoal>("understand");
  const [depth, setDepth] = useState<CreationDepth>("overview");
  const [guided, setGuided] = useState(false);
  function suggest(nextKind: ArtifactKind, nextScope = scope, nextGoal = goal, nextDepth = depth) {
    setKind(nextKind); setScope(nextScope); setGoal(nextGoal); setDepth(nextDepth); setPreview(false);
    setQuestion(creationPrompt({ kind: nextKind, documentName, scope: nextScope, goal: nextGoal, depth: nextDepth }));
  }
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal><Dialog.Overlay className={styles.overlay} /><Dialog.Content className={styles.dialog}>
    <header className={styles.heading}><span className={styles.sparkle}><Sparkles size={25} /></span><div><Dialog.Title>Cosa vuoi creare?</Dialog.Title><Dialog.Description>Un altro modo per capire quello che studi.</Dialog.Description></div><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Chiudi Crea"><X size={18} /></Button></Dialog.Close></header>
    <div className={styles.choices}>{choices.map(choice => <button key={choice.kind} className={styles.choice} data-kind={choice.kind} aria-pressed={kind === choice.kind} onClick={() => suggest(choice.kind)}><choice.icon size={30} strokeWidth={1.8} /><strong>{choice.name}</strong><span>{choice.subtitle}</span>{kind === choice.kind && <Check className={styles.check} size={18} />}</button>)}</div>
    <section className={styles.suggestion} aria-label="Suggerimento per il PDF"><strong>Da dove iniziare? Una mappa di tutto il PDF.</strong><p>Collega i concetti principali e apri la pagina della definizione cliccando ogni nodo.</p><Button variant="outline" size="sm" onClick={() => suggest("map", "document", "understand", "overview")}>Usa questo suggerimento</Button></section>
    {kind && <form className={styles.form} onSubmit={event => { event.preventDefault(); if (configured && question.trim()) onGenerate(question.trim(), kind, scope); }}>
      <div className={styles.actions} aria-label="Ambito della creazione"><Button variant="outline" size="sm" aria-pressed={scope === "document"} onClick={() => suggest(kind, "document")}>Tutto il PDF</Button><Button variant="outline" size="sm" aria-pressed={scope === "slide"} onClick={() => suggest(kind, "slide")}>Pagina aperta</Button></div>
      <div className={styles.guideIntro}><p>Ho preparato una richiesta per te. Puoi usarla subito o adattarla insieme.</p><Button variant="ghost" size="sm" aria-expanded={guided} onClick={() => setGuided(value => !value)}>{guided ? "Chiudi guida" : "Non so cosa chiedere: guidami"}</Button></div>
      {guided && <section className={styles.guide} aria-label="Guida alla creazione"><p><strong>Tony</strong> · Che cosa vuoi ottenere?</p><div className={styles.actions}>{([["understand", "Capire i concetti"], ["revise", "Ripassare per l'esame"], ["connect", "Collegare le idee"]] as const).map(([value, label]) => <Button key={value} variant="outline" size="sm" aria-pressed={goal === value} onClick={() => suggest(kind, scope, value)}>{label}</Button>)}</div><p><strong>Tony</strong> · Quanto vuoi approfondire?</p><div className={styles.actions}>{([["overview", "Panoramica"], ["detailed", "Approfondita"], ["definitions", "Definizioni"]] as const).map(([value, label]) => <Button key={value} variant="outline" size="sm" aria-pressed={depth === value} onClick={() => suggest(kind, scope, goal, value)}>{label}</Button>)}</div><p>La richiesta qui sotto si aggiorna con le tue scelte. Genero soltanto quando premi il pulsante.</p></section>}
      <label htmlFor="creation-question">Che cosa vuoi creare?</label><Textarea id="creation-question" value={question} onChange={event => setQuestion(event.target.value)} rows={5} maxLength={2000} required placeholder={examples[kind]} />
      <p className={styles.note}>Parto dal tuo corso, {scope === "document" ? "dall'intero PDF" : "dalla pagina aperta"} e dalle domande già fatte. La richiesta è modificabile.</p>
      <div className={styles.actions}><Button type="submit" disabled={!configured || !question.trim()}><Sparkles size={16} />Genera {kind === "map" ? "mappa" : kind === "image" ? "immagine" : "schema"}</Button><Button variant="ghost" type="button" onClick={() => setQuestion(examples[kind])}>Esempio: il cuore</Button></div>
      {!configured && <p className={styles.note}>Configura OpenAI nelle impostazioni per generare il materiale.</p>}
    </form>}
    <div className={styles.example}><span>Vuoi vedere come funziona?</span><Button variant="outline" size="sm" aria-expanded={preview} onClick={() => setPreview(value => !value)}>{preview ? "Chiudi esempio" : "Prova una mappa"}</Button></div>
    {preview && <StudyArtifactView artifact={heartMap} documentId="example" page={1} preview />}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
