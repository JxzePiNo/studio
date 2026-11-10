"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { browserAuth, firebaseEnabled } from "@/lib/firebase-client";
import styles from "./home-greeting.module.css";

const phrases = ["i tuoi esami", "le tue sfide", "le tue scoperte", "i tuoi prossimi passi"];

export function HomeGreeting() {
  const [name, setName] = useState("");
  useEffect(() => {
    if (!firebaseEnabled) return;
    return onAuthStateChanged(browserAuth(), user => setName(user?.displayName?.trim().split(/\s+/)[0] || user?.email?.split("@")[0] || ""));
  }, []);
  return <div className={styles.intro}>
    <h1 className={styles.greeting} aria-label="I tuoi esami"><span className={styles.hello} aria-hidden="true">Ciao{name ? ` ${name}` : ""},</span><span className={styles.phrases} aria-hidden="true">{phrases.map((phrase, index) => <span key={phrase} className={styles.phrase} style={{ animationDelay: `${index * 4}s` }}>{phrase}<span className={styles.period}>.</span></span>)}</span></h1>
    {name && <span className="sr-only">Ciao {name}.</span>}
    <p className={styles.description}>Ogni materia, il suo spazio. Organizza il materiale e trova il tuo ritmo.</p>
  </div>;
}
