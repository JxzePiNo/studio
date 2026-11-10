"use client";

import { useEffect, useState } from "react";
import { createAvatar } from "@bible-strong/avatar-react";
import definition from "./tony.avatar.json";

const Tony = createAvatar(definition);

export function TonyMascot({ size = 48, animated = true, mood, showName = true }: { size?: number | string; animated?: boolean; mood?: "neutral" | "happy" | "wrong"; showName?: boolean }) {
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  return <span style={{ position: "relative", display: "inline-grid", width: size, aspectRatio: "1", flexShrink: 0 }}>
    {showName && <span style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", fontSize: typeof size === "number" && size < 70 ? 7 : 11, fontWeight: 550, letterSpacing: ".03em", color: "var(--muted-foreground, #64748b)", lineHeight: 1.2 }}>Tony del bar</span>}
    <Tony size="100%" {...(mood ? { expression: mood === "happy" ? "joyful-wide" as const : mood === "wrong" ? "eyes-closed" as const : "neutral" as const } : !animated || reducedMotion ? { expression: "neutral" as const } : { animation: "happy" as const })} />
  </span>;
}
