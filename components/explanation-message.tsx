import { BookOpen, Sparkles } from "lucide-react";
import { ChatMessageAuthor } from "./chat-message-author";
import { MarkdownContent } from "./markdown-content";
import { Button } from "./ui/button";
import type { Explanation } from "@/lib/types";
import { introductoryPageKind, pageKindLabels } from "@/lib/page-kind";

type ExplanationMessageProps = { explanation: Explanation; page?: number; onDeepen?: (topic: string) => void; disabled?: boolean };

export function ExplanationMessage(props: ExplanationMessageProps) {
  const { explanation, page } = props;
  const kind = introductoryPageKind(explanation);
  if (!kind) return <ExpandedExplanation {...props} />;
  const hasDetails = explanation.concepts.length > 0 || !!explanation.example.trim() || !!explanation.takeaway.trim() || (!explanation.pageKind && !!explanation.overview.trim());
  return <article className="chat-message assistant chat-analysis-message chat-analysis-summary" data-source="analysis" aria-label={page ? `Analisi della slide ${page}` : "Analisi della slide"}>
    <h2>{explanation.title}</h2><p className="chat-analysis-kind">{pageKindLabels[kind]}</p>
    {hasDetails && <details className="chat-analysis-details"><summary>Vedi di più</summary><ExpandedExplanation {...props} /></details>}
  </article>;
}

function ExpandedExplanation({ explanation, page, onDeepen, disabled }: ExplanationMessageProps) {
  const deepen = (topic: string) => onDeepen && <Button variant="ghost" size="sm" className="deepen-button" disabled={disabled} onClick={() => onDeepen(topic)}><Sparkles size={14} /> Approfondisci</Button>;
  return <article className="chat-message assistant chat-analysis-message" data-source="analysis" aria-label={page ? `Analisi della slide ${page}` : "Analisi della slide"}>
    <ChatMessageAuthor />
    <div className="explanation-content">
      <div className="explanation-kicker"><span className="eyebrow">FACCIAMO CHIAREZZA</span></div>
      <h2>{explanation.title}</h2>
      <div className="explanation-topic"><MarkdownContent className="overview">{explanation.overview}</MarkdownContent>{deepen(explanation.overview)}</div>
      <div className="concepts-heading">I CONCETTI CHIAVE</div>
      {explanation.concepts.map((concept, index) => <div className="concept" key={index}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{concept.title}</h3><MarkdownContent>{concept.explanation}</MarkdownContent>{deepen(`${concept.title}: ${concept.explanation}`)}</div></div>)}
      {explanation.example && <div className="example-box"><span><BookOpen size={15} /> UN ESEMPIO CONCRETO</span><MarkdownContent>{explanation.example}</MarkdownContent>{deepen(explanation.example)}</div>}
      {explanation.takeaway && <div className="takeaway"><Sparkles size={19} aria-hidden="true" /><div><span>Da ricordare</span><MarkdownContent>{explanation.takeaway}</MarkdownContent>{deepen(explanation.takeaway)}</div></div>}
    </div>
  </article>;
}
