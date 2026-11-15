type Box = { left: number; top: number; width: number; height: number };
export function positionTourPanel(target: Box | null, panel: { width: number; height: number }, viewport: { width: number; height: number }) {
  const margin = 12, gap = 18;
  const clampX = (left: number) => Math.max(margin, Math.min(left, viewport.width - panel.width - margin));
  const clampY = (top: number) => Math.max(margin, Math.min(top, viewport.height - panel.height - margin));
  if (!target) return { left: clampX((viewport.width - panel.width) / 2), top: clampY((viewport.height - panel.height) / 2) };
  const right = target.left + target.width, bottom = target.top + target.height;
  if (right + gap + panel.width <= viewport.width - margin) return { left: right + gap, top: clampY(target.top) };
  if (bottom + gap + panel.height <= viewport.height - margin) return { left: clampX(target.left), top: bottom + gap };
  if (target.left - gap - panel.width >= margin) return { left: target.left - gap - panel.width, top: clampY(target.top) };
  if (target.top - gap - panel.height >= margin) return { left: clampX(target.left), top: target.top - gap - panel.height };
  return { left: clampX(target.left), top: clampY(viewport.height - panel.height - margin) };
}
