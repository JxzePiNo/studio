"use client";
import { trackedFetch } from "@/lib/browser-data-cache";

import { useRef, useState } from "react";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import { useNicknames } from "./nicknames-provider";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

export function NicknameSettings() {
  const { entries, update } = useNicknames();
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  async function save() {
    if (lock.current) return;
    lock.current = true; setSaving(true); setError(""); setMessage("");
    try {
      const response = await trackedFetch("/api/nicknames", { method: "PATCH", headers: { "Content-Type": "application/json", ...await authHeaders() }, body: JSON.stringify({ name, nickname }) });
      update(await readApiResponse<Record<string, string>>(response));
      setName(""); setNickname(""); setMessage("Soprannome salvato.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Impossibile salvare il soprannome."); }
    finally { lock.current = false; setSaving(false); }
  }
  return <section className="nickname-settings" aria-label="Gestione soprannomi">
    <h3>Soprannomi</h3><p>Usati nei saluti e in chat per tutti gli utenti con quel nome.</p>
    <div className="nickname-catalogue">{Object.entries(entries).sort(([a], [b]) => a.localeCompare(b, "it")).map(([name, nickname]) => <button type="button" className="nickname-entry" key={name} disabled={saving} onClick={() => { setName(name[0].toLocaleUpperCase("it") + name.slice(1)); setNickname(nickname); setMessage(""); setError(""); }} aria-label={`Modifica soprannome di ${name}`}><span>{name[0].toLocaleUpperCase("it") + name.slice(1)}</span><strong>{nickname}</strong></button>)}</div>
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <label className="form-field"><span className="form-field-label">Nome</span><Input value={name} onChange={event => { setName(event.target.value); setMessage(""); }} placeholder="Es. Andrea" maxLength={80} required disabled={saving} /></label>
      <label className="form-field"><span className="form-field-label">Soprannome</span><Input value={nickname} onChange={event => { setNickname(event.target.value); setMessage(""); }} placeholder="Es. Andre" maxLength={40} required disabled={saving} /></label>
      <Button type="submit" disabled={saving || !name.trim() || !nickname.trim()}>{saving ? "Salvataggio…" : "Salva soprannome"}</Button>
    </form>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
