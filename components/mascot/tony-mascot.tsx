"use client";

import { useEffect, useState } from "react";
import { createAvatar } from "@bible-strong/avatar-react";
import definition from "./tony.avatar.json";

const Tony = createAvatar(definition);

export function TonyMascot({ size = 48, animated = true }: { size?: number | string; animated?: boolean }) {
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  return <Tony size={size} {...(!animated || reducedMotion ? { expression: "neutral" as const } : { animation: "happy" as const })} />;
}
