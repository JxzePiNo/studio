"use client";

import { Children, isValidElement, memo, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { checkedMarkdown } from "@/lib/math-validation";
import { SelectionNotesContext, noteSource } from "@/lib/selection-notes-context";
import { annotateTerms } from "@/lib/markdown-notes";
import type { Root } from "hast";

function CodeBlock({ children }: { children: ReactNode }) {
  const code = useRef<HTMLPreElement>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const child = Children.toArray(children).find(item => isValidElement(item));
  const language = isValidElement<{ className?: string }>(child) ? /language-([\w+-]+)/.exec(child.props.className || "")?.[1] : undefined;
  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 2500);
    return () => clearTimeout(timer);
  }, [status]);
  async function copy() {
    try { await navigator.clipboard.writeText(code.current?.textContent || ""); setStatus("copied"); }
    catch { setStatus("error"); }
  }
  return <div className="markdown-code-block">
    <div className="markdown-code-header"><span>{language || "Codice"}</span><button type="button" onClick={() => void copy()} aria-label={status === "copied" ? "Codice copiato" : "Copia codice"}>{status === "copied" ? <Check size={13} /> : <Copy size={13} />}<span aria-live="polite">{status === "copied" ? "Copiato" : status === "error" ? "Riprova" : "Copia"}</span></button></div>
    <pre ref={code}>{children}</pre>
  </div>;
}

const components: Components = {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  table: ({ children }) => <div className="markdown-table-scroll" role="region" aria-label="Tabella nella risposta" tabIndex={0}><table>{children}</table></div>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  img: ({ src, alt }) => typeof src === "string" ? <a href={src} target="_blank" rel="noopener noreferrer">{alt || "Apri immagine"}</a> : null,
};
const remarkPlugins: Options["remarkPlugins"] = [remarkGfm, remarkMath];
const rehypePlugins: Options["rehypePlugins"] = [[rehypeKatex, { strict: "ignore", trust: false }], [rehypeHighlight, { detect: false }]];

export const MarkdownContent = memo(function MarkdownContent({ children, className = "", inline = false }: { children: string; className?: string; inline?: boolean }) {
  const annotations = useContext(SelectionNotesContext);
  const prepared = useMemo(() => {
    try { return { markdown: checkedMarkdown(children) }; }
    catch { return { error: "Questa risposta contiene una formula non visualizzabile. Chiedi al tutor di riformularla." }; }
  }, [children]);
  const source = noteSource(children);
  const plugins = useMemo<Options["rehypePlugins"]>(() => {
    const notes = annotations?.notes.filter(note => note.source === source) || [];
    return notes.length ? [...rehypePlugins!, () => (tree: Root) => annotateTerms(tree, notes)] : rehypePlugins;
  }, [annotations?.notes, source]);
  const renderers = useMemo<Components>(() => ({ ...components, span: ({ node, children, ...props }) => {
    const id = node?.properties["data-note-id"];
    return typeof id === "string" && annotations ? <button type="button" className="chat-term-chip" onClick={() => annotations.open(id)} aria-label={`Spiega ${String(children)}`}>{children}</button> : <span {...props}>{children}</span>;
  } }), [annotations]);
  const Wrapper = inline ? "span" : "div";
  const selected = annotations ? renderers : components;
  return <Wrapper className={`markdown-content ${inline ? "markdown-inline" : ""} ${className}`} data-note-source={annotations ? source : undefined}>{prepared.error ? <span role="status">{prepared.error}</span> : <ReactMarkdown skipHtml remarkPlugins={remarkPlugins} rehypePlugins={plugins} components={inline ? { ...selected, p: ({ children }) => <span>{children}</span> } : selected}>{prepared.markdown}</ReactMarkdown>}</Wrapper>;
});
