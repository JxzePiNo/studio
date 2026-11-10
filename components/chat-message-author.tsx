"use client";

import { useNickname } from "./nicknames-provider";
import { useState } from "react";
import { TonyMascot } from "./mascot/tony-mascot";

export function ChatMessageAuthor({ role = "assistant", name = "Tu", photoURL }: { role?: "user" | "assistant"; name?: string; photoURL?: string | null }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const displayName = useNickname(name) || "Tu";
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "TU";
  return <header className="chat-message-author">
    <span className={`chat-author-avatar ${role}`} aria-hidden="true">
      {role === "assistant" ? <TonyMascot size={34} animated={false} showName={false} /> : photoURL && failedPhoto !== photoURL
        ? <img src={photoURL} alt="" referrerPolicy="no-referrer" onError={() => setFailedPhoto(photoURL)} />
        : <span className="chat-author-initials">{initials}</span>}
    </span>
    <span className="chat-author-identity"><strong>{role === "assistant" ? "Tony" : displayName}</strong><span className="chat-author-detail">{role === "assistant" ? "Assistente AI" : "Tu"}</span></span>
  </header>;
}
