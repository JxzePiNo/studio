"use client";
import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { browserAuth, firebaseEnabled } from "@/lib/firebase-client";
import { normalizeUsername, suggestUsername, USERNAME_PATTERN } from "@/lib/username";
import { Input } from "./ui/input";
import styles from "./username-input.module.css";

export function UsernameInput({ id, value, onChange, name = "", disabled, autoSuggest = false }: { id: string; value: string; onChange: (value: string) => void; name?: string; disabled?: boolean; autoSuggest?: boolean }) {
  const [accountName, setAccountName] = useState("");
  const edited = useRef(false);
  useEffect(() => { if (!firebaseEnabled) return; return onAuthStateChanged(browserAuth(), user => setAccountName(user?.displayName || "")); }, []);
  const suggestion = suggestUsername(name || accountName);
  useEffect(() => { if (autoSuggest && !edited.current && !value && suggestion) onChange(suggestion); }, [autoSuggest, suggestion, value, onChange]);
  return <div><div className={styles.field}><span aria-hidden="true">@</span><Input id={id} value={value} onChange={event => { edited.current = true; onChange(normalizeUsername(event.target.value)); }} minLength={3} maxLength={24} pattern={USERNAME_PATTERN} placeholder="nome.cognome" disabled={disabled} required autoComplete="username" autoCapitalize="none" spellCheck={false} /></div>{suggestion && value !== suggestion && <button className={styles.suggestion} type="button" disabled={disabled} onClick={() => { edited.current = true; onChange(suggestion); }}>Usa @{suggestion}</button>}</div>;
}
