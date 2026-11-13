"use client";
import { useEffect, useState } from "react";
import styles from "./friends.module.css";

export function FriendAvatar({ name, photoURL, large = false }: { name: string; photoURL?: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoURL]);
  return <span className={`${styles.avatar} ${large ? styles.profileAvatar : ""}`}>
    {photoURL && !failed ? <img src={photoURL} alt={`Foto di ${name}`} referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "IO"}
  </span>;
}
