"use client";
import { useMemo, useState } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Node, type NodeProps } from "@xyflow/react";
import type { GraphArtifact } from "@/lib/study-artifact";
import { graphPositions } from "@/lib/artifact-layout";
import { Button } from "./ui/button";
import { MarkdownContent } from "./markdown-content";
import styles from "./study-artifact.module.css";

type ConceptNode = Node<{ label: string; color: string; sourcePage?: number | null; collapsed: boolean; hasChildren: boolean; toggle: () => void }, "concept">;
function Concept({ data }: NodeProps<ConceptNode>) {
  return <div className={styles.node} style={{ background: data.color }}>
    <Handle type="target" position={Position.Left} id="in-left" /><Handle type="source" position={Position.Left} id="out-left" />
    <strong>{data.label}{data.sourcePage && <small className={styles.nodePage}>p. {data.sourcePage}</small>}</strong>{data.hasChildren && <button className="nodrag nopan" aria-label={`${data.collapsed ? "Espandi" : "Riduci"} ${data.label}`} onClick={event => { event.stopPropagation(); data.toggle(); }}>{data.collapsed ? "+" : "−"}</button>}
    <Handle type="target" position={Position.Right} id="in-right" /><Handle type="source" position={Position.Right} id="out-right" />
  </div>;
}
const nodeTypes = { concept: Concept };

export function ArtifactGraph({ graph, onChange, editing = false, onNavigatePage }: { graph: GraphArtifact; onChange: (graph: GraphArtifact) => void; editing?: boolean; onNavigatePage?: (page: number) => void }) {
  const [selected, setSelected] = useState(graph.rootId);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const positions = useMemo(() => graphPositions(graph), [graph]);
  const hidden = new Set<string>();
  if (graph.kind === "map") for (const parent of collapsed) {
    const pending = graph.edges.filter(edge => edge.source === parent).map(edge => edge.target);
    while (pending.length) { const id = pending.pop()!; if (hidden.has(id)) continue; hidden.add(id); pending.push(...graph.edges.filter(edge => edge.source === id).map(edge => edge.target)); }
  }
  const visible = graph.nodes.filter(node => !hidden.has(node.id));
  const nodes: ConceptNode[] = visible.map(node => ({ id: node.id, type: "concept", position: drag?.id === node.id ? drag : positions.get(node.id)!, selected: selected === node.id,
    data: { label: node.label, color: node.color, sourcePage: node.sourcePage, collapsed: collapsed.has(node.id), hasChildren: graph.kind === "map" && graph.edges.some(edge => edge.source === node.id), toggle: () => setCollapsed(current => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; }) },
  }));
  const edges = graph.edges.filter(edge => !hidden.has(edge.source) && !hidden.has(edge.target)).map(edge => {
    const right = graph.kind === "diagram" || positions.get(edge.target)!.x > positions.get(edge.source)!.x;
    return { ...edge, type: "default", sourceHandle: right ? "out-right" : "out-left", targetHandle: right ? "in-left" : "in-right", label: edge.label, style: { stroke: "#94a3b8", strokeWidth: 2 }, markerEnd: graph.kind === "diagram" ? { type: MarkerType.ArrowClosed } : undefined };
  });
  const active = graph.nodes.find(node => node.id === selected) || graph.nodes[0];
  function selectConcept(id: string) { setSelected(id); const node = graph.nodes.find(item => item.id === id); if (!editing && node?.sourcePage) onNavigatePage?.(node.sourcePage); }
  function updateNode(fields: Partial<typeof active>) { onChange({ ...graph, nodes: graph.nodes.map(node => node.id === active.id ? { ...node, ...fields } : node) }); }
  function addChild() {
    const id = crypto.randomUUID();
    const point = positions.get(active.id)!;
    onChange({ ...graph, nodes: [...graph.nodes, { id, label: "Nuovo concetto", description: "", color: active.color }], edges: [...graph.edges, { id: crypto.randomUUID(), source: active.id, target: id, label: "" }], layout: [...positions].map(([id, point]) => ({ id, ...point })).concat({ id, x: point.x + 290, y: point.y + 100 }) });
    setCollapsed(current => { const next = new Set(current); next.delete(active.id); return next; }); setSelected(id);
  }
  function removeBranch() {
    const removed = new Set([active.id]);
    let changed = true;
    while (changed) { changed = false; for (const edge of graph.edges) if (removed.has(edge.source) && !removed.has(edge.target)) { removed.add(edge.target); changed = true; } }
    onChange({ ...graph, nodes: graph.nodes.filter(node => !removed.has(node.id)), edges: graph.edges.filter(edge => !removed.has(edge.source) && !removed.has(edge.target)), layout: graph.layout?.filter(point => !removed.has(point.id)) }); setSelected(graph.rootId);
  }
  return <div>
    <div className={styles.graph} aria-label={`Mappa interattiva: ${graph.title}`}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.15} maxZoom={2.5} nodesConnectable={false} nodesDraggable={editing} elementsSelectable deleteKeyCode={null} onNodeClick={(_, node) => selectConcept(node.id)} onNodesChange={changes => { const change = changes.find(item => item.type === "position" && item.position); if (change?.type === "position" && change.position) setDrag({ id: change.id, ...change.position }); }} onNodeDragStop={(_, node) => { onChange({ ...graph, layout: [...positions].map(([id, point]) => ({ id, ...(id === node.id ? node.position : point) })) }); setDrag(null); }} proOptions={{ hideAttribution: false }}>
        <Background gap={22} color="#cbd5e1" /><Controls showInteractive={false} />
      </ReactFlow>
    </div>
    <div className={styles.parts} aria-label="Concetti della mappa">{visible.map(node => <button key={node.id} aria-pressed={active.id === node.id} onClick={() => selectConcept(node.id)} title={node.sourcePage ? `Apri pagina ${node.sourcePage} nel PDF` : undefined}>{node.label}</button>)}</div>
    <section className={styles.detail} aria-label="Spiegazione del concetto" aria-live="polite">
      {editing ? <><label>Nome<input value={active.label} maxLength={100} onChange={event => updateNode({ label: event.target.value })} /></label><label>Spiegazione<textarea value={active.description} rows={3} maxLength={1200} onChange={event => updateNode({ description: event.target.value })} /></label><div className={styles.actions}><Button variant="outline" size="sm" disabled={graph.nodes.length >= 60} onClick={addChild}>Aggiungi concetto</Button>{graph.kind === "map" && active.id !== graph.rootId && <Button variant="ghost" size="sm" disabled={graph.nodes.length - countBranch(graph, active.id) < 2} onClick={removeBranch}>Elimina ramo</Button>}</div></> : <><strong>{active.label}</strong><MarkdownContent>{active.description || "Nessuna spiegazione aggiunta."}</MarkdownContent></>}
      {active.sourcePage && onNavigatePage && <Button variant="outline" size="sm" onClick={() => onNavigatePage(active.sourcePage!)}>Apri pagina {active.sourcePage} nel PDF</Button>}
      {active.sourcePage === null && <p className={styles.note}>Concetto di sintesi, senza una pagina specifica.</p>}
    </section>
  </div>;
}
function countBranch(graph: GraphArtifact, id: string): number { return 1 + graph.edges.filter(edge => edge.source === id).reduce((sum, edge) => sum + countBranch(graph, edge.target), 0); }
