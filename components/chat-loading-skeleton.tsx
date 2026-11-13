import { ArrowUp, ClipboardList, FileText, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import styles from "./chat-loading-skeleton.module.css";

function Paragraph({ short = false }: { short?: boolean }) {
  return <div className={styles.paragraph}><Skeleton className={styles.line} /><Skeleton className={styles.line} /><Skeleton className={short ? styles.shortLine : styles.lastLine} /></div>;
}

export function ChatLoadingSkeleton({ response = false, label = "Caricamento della chat in corso." }: { response?: boolean; label?: string }) {
  const message = <div className={styles.message}>
    <div className={styles.author}><Skeleton className={styles.avatar} /><div className={styles.identity}><Skeleton className={styles.name} /><Skeleton className={styles.detail} /></div></div>
    {!response && <div className={styles.heading}><Skeleton className={styles.kicker} /><Skeleton className={styles.title} /><Skeleton className={styles.titleEnd} /></div>}
    <Paragraph />
    {!response && <><Skeleton className={styles.sectionTitle} /><Paragraph short /><Paragraph /></>}
  </div>;

  return <section className={`${styles.skeleton}${response ? ` ${styles.response}` : ""}`} role="status" aria-label={label} aria-busy="true" data-chat-skeleton={response ? "response" : "conversation"}>
    <span className="sr-only">{label}</span>
    {response ? <div aria-hidden="true">{message}</div> : <div className="chat-pane" aria-hidden="true">
      <div className={`chat-reader-header ${styles.header}`}><div className="chat-reader-actions"><Button variant="outline" size="sm" disabled><ClipboardList size={15} /> Quiz</Button><Button variant="outline" size="sm" disabled><FileText size={15} /> Tutto PDF</Button><Button variant="outline" size="sm" disabled><Sparkles size={16} /> Crea</Button></div></div>
      <div className="chat-scroll-area">{message}</div>
      <div className="chat-composer-area"><div className="form-field-label chat-question-label">Domanda al tutor</div><div className={`chat-composer ${styles.composer}`}><span>Caricamento della chat…</span><Button className="chat-send" variant="ghost" size="icon" disabled aria-label="Invia domanda"><ArrowUp size={20} /></Button></div><small className="chat-composer-note">Il tutor può commettere errori. Verifica i passaggi importanti.</small></div>
    </div>}
  </section>;
}
