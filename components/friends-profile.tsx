"use client";
import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import * as Dialog from "@radix-ui/react-dialog";
import { Camera, Pencil, X } from "lucide-react";
import { browserAuth, firebaseEnabled } from "@/lib/firebase-client";
import { useStudyProfile } from "./study-profile-provider";
import { FriendAvatar } from "./friend-avatar";
import { StudyProgramPicker } from "./study-program-picker";
import { UniversityPicker } from "./university-picker";
import { UsernameInput } from "./username-input";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import styles from "./friends.module.css";

async function profilePhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) throw new Error("Scegli un’immagine fino a 15 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 256;
    const context = canvas.getContext("2d"); if (!context) throw new Error("Impossibile leggere l’immagine.");
    const side = Math.min(bitmap.width, bitmap.height);
    context.fillStyle = "#fff"; context.fillRect(0, 0, 256, 256);
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
    return canvas.toDataURL("image/jpeg", .8);
  } finally { bitmap.close(); }
}

export function FriendsProfile({ count, name }: { count: number; name?: string }) {
  const { profile, saveProfile } = useStudyProfile();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const [displayName, setName] = useState(""), [program, setProgram] = useState(""), [university, setUniversity] = useState(""), [nickname, setNickname] = useState(""), [photo, setPhoto] = useState("");
  useEffect(() => { if (firebaseEnabled) return onAuthStateChanged(browserAuth(), setUser); }, []);
  function edit(value: boolean) {
    if (value) { setName(profile?.displayName || name || user?.displayName || ""); setProgram(profile?.studyProgram || ""); setUniversity(profile?.university || ""); setNickname(profile?.nickname || ""); setPhoto(profile?.photoURL || ""); setError(""); }
    setOpen(value);
  }
  const fullName = profile?.displayName || name || user?.displayName || "Il tuo profilo";
  return <Dialog.Root open={open} onOpenChange={edit}>
    <section className={styles.profileHero} aria-label="Il tuo profilo amici">
      <button className={styles.editAvatar} onClick={() => edit(true)} aria-label="Modifica foto e profilo"><FriendAvatar large name={fullName} photoURL={profile?.photoURL || user?.photoURL || ""} /><span><Camera size={15} /></span></button>
      <h1>{fullName}</h1><span className={styles.profileUsername}>@{profile?.nickname}</span>
      <p>{profile?.studyProgram}</p><p>{profile?.university}</p><strong>{count} {count === 1 ? "amico" : "amici"}</strong>
      <Button variant="ghost" size="sm" onClick={() => edit(true)}><Pencil size={14} /> Modifica profilo</Button>
    </section>
    <Dialog.Portal><Dialog.Overlay className="account-profile-overlay" /><Dialog.Content className="account-profile-dialog">
      <Dialog.Close className="account-profile-close icon-button" aria-label="Chiudi modifica profilo"><X size={18} /></Dialog.Close>
      <Dialog.Title>Modifica profilo</Dialog.Title><Dialog.Description>La tua foto e le informazioni che vedono gli amici.</Dialog.Description>
      <form className={styles.profileForm} onSubmit={async event => { event.preventDefault(); if (saving) return; setSaving(true); setError(""); try { await saveProfile(program, undefined, displayName, { university, nickname, photoURL: photo }); setOpen(false); } catch (cause) { setError((cause as Error).message); } finally { setSaving(false); } }}>
        <FriendAvatar large name={displayName} photoURL={photo || user?.photoURL || ""} />
        <label className={styles.photoUpload}>Cambia foto<input aria-label="Cambia foto profilo" type="file" accept="image/*" disabled={saving} onChange={async event => { const file = event.target.files?.[0]; if (!file) return; setSaving(true); try { setPhoto(await profilePhoto(file)); setError(""); } catch (cause) { setError((cause as Error).message); } finally { setSaving(false); } }} /></label>
        <label>Nome e cognome<Input value={displayName} onChange={event => setName(event.target.value)} maxLength={80} required /></label>
        <label htmlFor="friends-program">Corso di studi</label><StudyProgramPicker id="friends-program" value={program} onChange={setProgram} />
        <label htmlFor="friends-university">Università</label><UniversityPicker id="friends-university" value={university} onChange={setUniversity} />
        <label htmlFor="friends-username">Username</label><UsernameInput id="friends-username" value={nickname} onChange={setNickname} name={displayName} />
        {error && <p role="alert">{error}</p>}<Button type="submit" disabled={saving || !program.trim() || !university.trim() || !nickname.trim()}>{saving ? "Salvataggio…" : "Salva profilo"}</Button>
      </form>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
