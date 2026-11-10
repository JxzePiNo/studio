"use client";

import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { browserAuth, firebaseEnabled } from "@/lib/firebase-client";
import styles from "./home-greeting.module.css";
import { useStudyProfile } from "./study-profile-provider";

const phrases = ["i tuoi esami", "le tue sfide", "le tue scoperte", "i tuoi prossimi passi"];

export function HomeGreeting({ variant = "home" }: { variant?: "home" | "sessions" }) {
  const sessions = variant === "sessions";
  const displayedPhrases = sessions ? ["le tue sessioni"] : phrases;
  const [name, setName] = useState("");
  const { profile } = useStudyProfile();
  const greetingName = profile?.displayName?.trim().split(/\s+/)[0] || name;
  const [fontSize, setFontSize] = useState(32);
  const heading = useRef<HTMLHeadingElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const container = heading.current;
    const content = line.current;
    if (!container || !content) return;
    let disposed = false;
    const fit = () => {
      if (disposed) return;
      // Measure at a fixed size so font changes cannot create resize feedback.
      content.style.fontSize = "62px";
      const naturalWidth = content.getBoundingClientRect().width;
      const fitted = Math.min(62, 62 * container.clientWidth / Math.max(1, naturalWidth));
      content.style.fontSize = `${fitted}px`;
      setFontSize(fitted);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    fit();
    void document.fonts.ready.then(fit);
    return () => { disposed = true; observer.disconnect(); };
  }, [greetingName, variant]);
  useEffect(() => {
    if (!firebaseEnabled) return;
    return onAuthStateChanged(browserAuth(), user => setName(user?.displayName?.trim().split(/\s+/)[0] || user?.email?.split("@")[0] || ""));
  }, []);
  return <div className={styles.intro}>
    <h1 ref={heading} className={styles.greeting} aria-label={sessions ? "Le tue sessioni" : "I tuoi esami"}><span ref={line} className={styles.line} style={{ fontSize }}><span className={styles.hello} aria-hidden="true">Ciao{greetingName ? ` ${greetingName}` : ""},</span><span className={styles.phrases} aria-hidden="true">{displayedPhrases.map((phrase, index) => <span key={phrase} className={`${styles.phrase} ${sessions ? styles.staticPhrase : ""}`} style={{ animationDelay: `${index * 4}s` }}>{phrase}<span className={styles.period}>.</span></span>)}<span className={styles.measurePhrase}>{phrases[3]}.</span></span></span></h1>
    {greetingName && <span className="sr-only">Ciao {greetingName}.</span>}
    <p className={styles.description}>{sessions ? "Il tempo che dedichi a capire, una pagina alla volta." : "Ogni materia, il suo spazio. Organizza il materiale e trova il tuo ritmo."}</p>
  </div>;
}
