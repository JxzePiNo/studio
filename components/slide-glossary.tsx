"use client";

import { BookOpen } from "lucide-react";
import type { Explanation } from "@/lib/types";
import { MarkdownContent } from "./markdown-content";
import styles from "./slide-glossary.module.css";

export function SlideGlossary({ explanation }: { explanation?: Explanation }) {
  return <section className={`glossary ${styles.glossary}`} aria-label="Glossario della slide">
    <div className="glossary-heading"><span><BookOpen size={17} /> Glossario della slide</span></div>
    {explanation?.glossary.length ? <dl className={styles.entries}>
      {explanation.glossary.map((entry, index) => <div className={styles.entry} key={`${entry.word}:${index}`}>
        <dt><MarkdownContent>{entry.word}</MarkdownContent></dt>
        <dd><MarkdownContent>{entry.translation}</MarkdownContent>{entry.context && <MarkdownContent className={styles.context}>{entry.context}</MarkdownContent>}</dd>
      </div>)}
    </dl> : <p>{explanation ? "Non ci sono ancora voci nel glossario. Rigenera l’analisi per includere termini, formule e concetti utili a capire questa slide." : "Analizza la slide per trovare qui termini, simboli, formule e concetti di base utili a comprenderla."}</p>}
  </section>;
}
