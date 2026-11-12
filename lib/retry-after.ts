export function retryAfterMilliseconds(value: string | null, now = Date.now()) {
  if (!value?.trim()) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

export function resetMilliseconds(value: string | null) {
  if (!value) return undefined;
  const parts = [...value.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g)];
  if (!parts.length || parts.map(part => part[0]).join("") !== value) return undefined;
  return parts.reduce((sum, part) => sum + Number(part[1]) * ({ ms: 1, s: 1000, m: 60000, h: 3600000 }[part[2]] ?? 0), 0);
}
