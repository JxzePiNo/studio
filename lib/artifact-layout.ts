import dagre from "@dagrejs/dagre";
import type { GraphArtifact } from "./study-artifact";

export function graphPositions(graph: GraphArtifact): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (graph.kind === "diagram") {
    const layout = new dagre.graphlib.Graph().setGraph({ rankdir: "LR", nodesep: 55, ranksep: 100 }).setDefaultEdgeLabel(() => ({}));
    for (const node of graph.nodes) layout.setNode(node.id, { width: 200, height: 70 });
    for (const edge of graph.edges) layout.setEdge(edge.source, edge.target);
    dagre.layout(layout);
    for (const node of graph.nodes) { const point = layout.node(node.id); positions.set(node.id, { x: point.x - 100, y: point.y - 35 }); }
  } else {
    const children = (id: string) => graph.edges.filter(edge => edge.source === id).map(edge => edge.target);
    const weight = (id: string): number => Math.max(1, children(id).reduce((sum, child) => sum + weight(child), 0));
    positions.set(graph.rootId, { x: 0, y: 0 });
    const branches = children(graph.rootId);
    for (const side of [-1, 1]) {
      const roots = branches.filter((_, index) => (index % 2 ? -1 : 1) === side);
      let cursor = -roots.reduce((sum, id) => sum + weight(id), 0) * 55;
      const place = (id: string, depth: number, top: number) => {
        positions.set(id, { x: side * depth * 290, y: top + weight(id) * 55 });
        let offset = top;
        for (const child of children(id)) { place(child, depth + 1, offset); offset += weight(child) * 110; }
      };
      for (const id of roots) { place(id, 1, cursor); cursor += weight(id) * 110; }
    }
  }
  for (const point of graph.layout || []) positions.set(point.id, { x: point.x, y: point.y });
  return positions;
}

export function graphSvg(graph: GraphArtifact): string {
  const positions = graphPositions(graph);
  const escape = (text: string) => text.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
  const points = [...positions.values()];
  const minX = Math.min(...points.map(point => point.x)) - 40, minY = Math.min(...points.map(point => point.y)) - 80;
  const width = Math.max(...points.map(point => point.x)) - minX + 240, height = Math.max(...points.map(point => point.y)) - minY + 110;
  const edges = graph.edges.map(edge => { const a = positions.get(edge.source)!, b = positions.get(edge.target)!; return `<path d="M${a.x + 100},${a.y + 35} C${(a.x + b.x) / 2 + 100},${a.y + 35} ${(a.x + b.x) / 2 + 100},${b.y + 35} ${b.x + 100},${b.y + 35}" fill="none" stroke="#94a3b8" stroke-width="2"/>`; }).join("");
  const nodes = graph.nodes.map(node => { const point = positions.get(node.id)!; const words = node.label.match(/.{1,24}(?:\s|$)|.{1,24}/g) || [node.label]; return `<g><title>${escape(node.description)}</title><rect x="${point.x}" y="${point.y}" width="200" height="70" rx="16" fill="${node.color}" stroke="#64748b"/><text x="${point.x + 100}" y="${point.y + 27}" text-anchor="middle" fill="#172033" font-family="sans-serif" font-size="13">${words.slice(0, 3).map((line, index) => `<tspan x="${point.x + 100}" dy="${index ? 16 : 0}">${escape(line)}</tspan>`).join("")}</text></g>`; }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}"><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="white"/><text x="${minX + 24}" y="${minY + 30}" font-family="sans-serif" font-size="20">${escape(graph.title)}</text>${edges}${nodes}</svg>`;
}
