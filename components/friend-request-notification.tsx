"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { friendsChanged, friendsRequest } from "@/lib/friends-client";
import type { FriendPerson } from "@/lib/friends-types";
import { FriendAvatar } from "./friend-avatar";
import { Button } from "./ui/button";
import styles from "./friend-messages.module.css";
import notificationStyles from "./notification-center.module.css";

export function FriendRequestNotification({ person, onResolved }: { person: FriendPerson; onResolved: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function respond(operation: "accept" | "reject") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await friendsRequest("", { action: "relationship", targetId: person.id, operation });
      onResolved(person.id);
      friendsChanged();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <article className={styles.message} aria-label={`Richiesta di amicizia di ${person.name}`}>
    <FriendAvatar name={person.name} photoURL={person.photoURL} />
    <div className={`${notificationStyles.speechBubble} ${styles.messageBubble}`}>
      <strong>{person.name}</strong>
      <p>{person.nickname ? `@${person.nickname} ti ha inviato una richiesta di amicizia.` : "Ti ha inviato una richiesta di amicizia."}</p>
      <div className={styles.requestActions}>
        <Button size="sm" disabled={busy} aria-label={`Accetta richiesta di ${person.name}`} onClick={() => void respond("accept")}><Check size={15} /> Accetta</Button>
        <Button size="sm" variant="ghost" disabled={busy} aria-label={`Rifiuta richiesta di ${person.name}`} onClick={() => void respond("reject")}><X size={15} /> Rifiuta</Button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  </article>;
}
