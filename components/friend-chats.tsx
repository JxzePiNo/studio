"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Send } from "lucide-react";
import { friendsRequest } from "@/lib/friends-client";
import type { FriendPerson, FriendsOverview } from "@/lib/friends-types";
import type { ChatMessage, FriendMessage } from "@/lib/friend-messages";
import { friendPresenceLabel } from "@/lib/friends-presence";
import { messageRequest } from "./friend-messages";
import { FriendAvatar } from "./friend-avatar";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import styles from "./friend-messages.module.css";

function Conversation({ friend, onBack }: { friend: FriendPerson; onBack: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false), [error, setError] = useState("");
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [sendError, setSendError] = useState("");
  const messageId = useRef(crypto.randomUUID()), pending = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const refresh = useRef(() => {});
  useEffect(() => {
    const controller = new AbortController();
    let loading = false, rerun = false;
    const load = async () => {
      if (controller.signal.aborted || document.visibilityState !== "visible") return;
      if (loading) { rerun = true; return; }
      loading = true;
      try {
        const result = await messageRequest<{ messages: ChatMessage[] }>(undefined, controller.signal, friend.id);
        if (controller.signal.aborted) return;
        setMessages(result.messages); setLoaded(true); setError("");
        const unread = result.messages.filter(message => !message.outgoing && !message.read).map(message => message.id);
        for (let offset = 0; offset < unread.length; offset += 50) {
          await messageRequest({ action: "read", ids: unread.slice(offset, offset + 50) }, controller.signal);
        }
        if (unread.length && !controller.signal.aborted) window.dispatchEvent(new Event("studio-messages-changed"));
      } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
      finally { loading = false; if (rerun && !controller.signal.aborted) { rerun = false; void load(); } }
    };
    const update = () => { void load(); };
    refresh.current = update;
    update();
    const timer = setInterval(update, 5000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("online", update);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", update); window.removeEventListener("online", update); };
  }, [friend.id]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);
  return <section className={styles.conversation} aria-label={`Chat con ${friend.nickname || friend.name}`}>
    <header className={styles.chatHeader}><Button className={styles.chatBack} variant="ghost" size="icon" onClick={onBack} aria-label="Torna alle chat"><ArrowLeft size={18} /></Button><FriendAvatar name={friend.name} photoURL={friend.photoURL} /><div><h2>{friend.nickname ? `@${friend.nickname}` : friend.name}</h2>{friend.status && <small>{friendPresenceLabel(friend)}</small>}</div></header>
    <div className={styles.history} role="log" aria-label="Messaggi della conversazione" aria-live="polite" aria-busy={!loaded && !error}>
      {!loaded && !error && <p className={styles.empty}>Caricamento messaggi…</p>}
      {loaded && !messages.length && <p className={styles.empty}>Inizia la conversazione. Puoi scrivere anche quando il tuo amico è offline.</p>}
      {messages.map(message => <article className={styles.bubble} data-outgoing={message.outgoing} key={`${message.outgoing}:${message.id}`} aria-label={message.outgoing ? "Messaggio inviato" : "Messaggio ricevuto"}><p>{message.text}</p><time dateTime={new Date(message.sentAt).toISOString()}>{new Date(message.sentAt).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time></article>)}
      <div ref={end} />
    </div>
    {error && <p className={styles.chatError} role="alert">{error} <Button variant="ghost" size="sm" onClick={() => refresh.current()}>Riprova</Button></p>}
    <form className={styles.chatForm} onSubmit={async event => {
      event.preventDefault(); if (pending.current || !text.trim()) return;
      pending.current = true; setBusy(true); setSendError("");
      try {
        await messageRequest({ action: "send", id: messageId.current, targetId: friend.id, text: text.trim() });
        setText(""); messageId.current = crypto.randomUUID(); refresh.current();
        window.dispatchEvent(new Event("studio-messages-changed"));
      } catch (cause) { setSendError((cause as Error).message); }
      finally { pending.current = false; setBusy(false); }
    }}><label className="sr-only" htmlFor="chat-message">Messaggio</label><Textarea id="chat-message" placeholder="Scrivi un messaggio…" rows={2} maxLength={2000} required disabled={busy} value={text} onChange={event => { setText(event.target.value); messageId.current = crypto.randomUUID(); }} /><Button type="submit" disabled={busy || !text.trim()}><Send size={16} />{busy ? "Invio…" : "Invia"}</Button>{sendError && <p role="alert">{sendError}</p>}</form>
  </section>;
}

export function FriendChats({ selectedId, onSelect, unread, onOpenFriends }: { selectedId: string; onSelect: (id: string) => void; unread: FriendMessage[]; onOpenFriends: () => void }) {
  const [friends, setFriends] = useState<FriendPerson[]>([]), [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(""), [query, setQuery] = useState("");
  useEffect(() => {
    const controller = new AbortController(); let pending = false;
    const load = async () => {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      try { const result = await friendsRequest<FriendsOverview>("?period=day", undefined, controller.signal); if (!controller.signal.aborted) { setFriends(result.friends); setLoaded(true); setError(""); } }
      catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
      finally { pending = false; }
    };
    const update = () => { void load(); };
    update(); const timer = setInterval(update, 30000);
    window.addEventListener("studio-friends-changed", update); window.addEventListener("online", update);
    document.addEventListener("visibilitychange", update);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("studio-friends-changed", update); window.removeEventListener("online", update); document.removeEventListener("visibilitychange", update); };
  }, []);
  const selected = friends.find(friend => friend.id === selectedId);
  const visible = friends.filter(friend => `${friend.name} ${friend.nickname}`.toLocaleLowerCase("it").includes(query.toLocaleLowerCase("it")));
  const latest = (id: string) => unread.find(message => message.sender.id === id);
  visible.sort((a, b) => (latest(b.id)?.sentAt || 0) - (latest(a.id)?.sentAt || 0) || a.name.localeCompare(b.name, "it"));
  return <div className={styles.chats}>
    <header className={styles.pageHeader}><MessageCircle size={24} /><div><h1>Chat</h1><p>Le conversazioni con i tuoi amici, anche offline.</p></div></header>
    {error && <p role="alert">{error}</p>}
    <div className={styles.chatLayout} data-selected={!!selected}>
      <aside className={styles.chatList} aria-label="Chat con gli amici"><label className="sr-only" htmlFor="chat-search">Cerca un amico</label><Input id="chat-search" placeholder="Cerca un amico…" value={query} onChange={event => setQuery(event.target.value)} />
        {!loaded && !error && <p className={styles.empty}>Caricamento amici…</p>}
        {loaded && !friends.length && <div className={styles.empty}><p>Aggiungi un amico per iniziare a scrivere.</p><Button variant="outline" onClick={onOpenFriends}>Trova amici</Button></div>}
        {loaded && friends.length > 0 && !visible.length && <p className={styles.empty}>Nessun amico trovato.</p>}
        <ul>{visible.map(friend => { const count = unread.filter(message => message.sender.id === friend.id).length; return <li key={friend.id}><button type="button" aria-current={selectedId === friend.id ? "true" : undefined} onClick={() => onSelect(friend.id)}><FriendAvatar name={friend.name} photoURL={friend.photoURL} /><span><strong>{friend.nickname ? `@${friend.nickname}` : friend.name}</strong><small>{latest(friend.id)?.text || (friend.status ? friendPresenceLabel(friend) : friend.name)}</small></span>{count > 0 && <b aria-label={`${count} messaggi non letti`}>{count}</b>}</button></li>; })}</ul>
      </aside>
      {selected ? <Conversation key={selected.id} friend={selected} onBack={() => onSelect("")} /> : <div className={styles.chatPlaceholder}><MessageCircle size={36} /><p>{selectedId && loaded ? "Questa chat non è disponibile. Scegli un amico dall’elenco." : "Scegli un amico per aprire la conversazione."}</p></div>}
    </div>
  </div>;
}
