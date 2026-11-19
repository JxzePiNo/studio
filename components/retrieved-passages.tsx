import type { RetrievedPassage } from "@/lib/types";

export function RetrievedPassages({ passages, documentId, onNavigatePage }: { passages?: RetrievedPassage[]; documentId: string; onNavigatePage?: (page: number) => void }) {
  if (!passages) return null;
  if (!passages.length) return <p className="chat-retrieval-empty">Nessun passaggio pertinente trovato nel PDF.</p>;
  return <details className="chat-retrieval">
    <summary>Passaggi PDF più rilevanti ({passages.length})</summary>
    <ol>{passages.map((passage, index) => <li key={`${passage.documentId}:${passage.page}:${index}`}>
      <div className="chat-retrieval-source"><span>{index + 1}. {passage.documentName}</span>{passage.documentId === documentId && onNavigatePage ? <button type="button" onClick={() => onNavigatePage(passage.page)}>Pagina {passage.page}</button> : <span>Pagina {passage.page}</span>}</div>
      <blockquote>{passage.text}</blockquote>
    </li>)}</ol>
    <small>Estratti recuperati per questa domanda, ordinati per rilevanza. Non tutti sono necessariamente usati nella risposta.</small>
  </details>;
}
