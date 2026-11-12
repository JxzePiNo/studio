"use client";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { Check, GitBranch, Image, Network, Sparkles, X } from "lucide-react";
import type { ArtifactKind } from "@/lib/study-artifact";
import { creationPrompt, type CreationScope } from "@/lib/creation-prompts";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import styles from "./study-artifact.module.css";
import { TonyMascot } from "./mascot/tony-mascot";

const choices = [
  { kind: "map" as const, name: "Mappe", subtitle: "Collega le idee", icon: Network },
  { kind: "image" as const, name: "Immagini", subtitle: "Esplora ogni parte", icon: Image },
  { kind: "diagram" as const, name: "Schemi", subtitle: "Segui i passaggi", icon: GitBranch },
];
const extras = [
  { id: "definitions", label: "Definizioni chiave", imageLabel: "Nomi e funzioni", instruction: "Evidenzia le definizioni fondamentali e le funzioni delle parti, distinguendo i termini simili." },
  { id: "examples", label: "Esempi pratici", instruction: "Aggiungi esempi pratici brevi che aiutino a capire i concetti, distinguendoli dai dati del PDF." },
  { id: "connections", label: "Collegamenti", instruction: "Evidenzia i collegamenti, le cause, le conseguenze e le differenze fra i concetti." },
  { id: "exam", label: "Ripasso per l’esame", instruction: "Aiutami a ripassare per l'esame: evidenzia ciò che devo saper definire, spiegare e collegare." },
];
export function CreationDialog({ onClose, onGenerate, page, configured, documentName }: { onClose: () => void; onGenerate: (question: string, kind: ArtifactKind, scope: CreationScope) => void; page: number; configured: boolean; documentName?: string }) {
  const [kind, setKind] = useState<ArtifactKind | null>(null);
  const [details, setDetails] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [customizing, setCustomizing] = useState(false);
  const [scope, setScope] = useState<CreationScope>("studied");
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal><Dialog.Overlay className={styles.overlay} /><Dialog.Content className={styles.dialog}>
    <header className={styles.heading}><div><Dialog.Title>Cosa vuoi creare?</Dialog.Title><Dialog.Description>Un altro modo per capire quello che studi.</Dialog.Description></div><span className={styles.headingTony} aria-hidden="true"><TonyMascot size={64} showName={false} /></span><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Chiudi Crea"><X size={18} /></Button></Dialog.Close></header>
    <div className={styles.choices}>{choices.map(choice => <button key={choice.kind} className={styles.choice} data-kind={choice.kind} aria-pressed={kind === choice.kind} onClick={() => setKind(choice.kind)}><choice.icon size={30} strokeWidth={1.8} /><strong>{choice.name}</strong><span>{choice.subtitle}</span>{kind === choice.kind && <Check className={styles.check} size={18} />}</button>)}</div>
    <Tabs.Root value={scope} onValueChange={value => setScope(value as CreationScope)} className={styles.scopeTabs}><Tabs.List aria-label="Ambito della creazione"><Tabs.Trigger value="studied">Materiale studiato</Tabs.Trigger><Tabs.Trigger value="document">Tutto il PDF</Tabs.Trigger><Tabs.Trigger value="slide">Slide corrente</Tabs.Trigger></Tabs.List></Tabs.Root>
    {kind && <form className={styles.creationForm} onSubmit={event => {
      event.preventDefault();
      if (!configured) return;
      const prompt = [creationPrompt({ kind, documentName, scope, page }), ...extras.filter(extra => selected.includes(extra.id)).map(extra => extra.instruction), details.trim() ? `Richiesta aggiuntiva dello studente: ${details.trim()}` : ""].filter(Boolean).join("\n");
      onGenerate(prompt, kind, scope);
    }}>
      <div className={styles.extraChips} role="group" aria-label="Personalizza il materiale">{extras.map(extra => <button key={extra.id} type="button" aria-pressed={selected.includes(extra.id)} onClick={() => setSelected(current => current.includes(extra.id) ? current.filter(id => id !== extra.id) : [...current, extra.id])}><Check size={17} aria-hidden="true" />{kind === "image" && extra.imageLabel ? extra.imageLabel : extra.label}</button>)}</div>
      <Button type="button" variant="ghost" className={styles.customizeToggle} aria-expanded={customizing} onClick={() => setCustomizing(value => !value)}>{customizing ? "Chiudi dettagli" : "Aggiungi un dettaglio"}</Button>
      {customizing && <div className={styles.customDetails}><label className="form-field-label" htmlFor="creation-details">Cosa vuoi aggiungere?</label><Textarea id="creation-details" value={details} onChange={event => setDetails(event.target.value)} rows={3} maxLength={500} placeholder="Un argomento specifico, un confronto o qualcosa da approfondire..." /></div>}
      <div className={styles.generateAction}><Button type="submit" disabled={!configured}><Sparkles size={16} />Genera {kind === "map" ? "mappa" : kind === "image" ? "immagine" : "schema"}</Button></div>
      {!configured && <p className={styles.note}>Configura OpenAI nelle impostazioni per generare il materiale.</p>}
    </form>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
