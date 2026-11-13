"use client";
import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { createPortal } from "react-dom";
import { Users, X } from "lucide-react";
import { cachedFriends, friendsRequest } from "@/lib/friends-client";
import { BaristaLoading } from "./barista-loading";
import { FriendsLeaderboard } from "./friends-leaderboard";
import type { FriendsOverview, FriendsPeriod } from "@/lib/friends-types";
import type { FriendPerson } from "@/lib/friends-types";
import { friendsPresenceMessage } from "@/lib/friends-presence";
import { TonyMascot } from "./mascot/tony-mascot";
import styles from "./friends.module.css";

type Activity = { enabled: boolean; studying: FriendPerson[]; online?: FriendPerson[]; incoming: number };
export function FriendsActivity({ running, onOpen }: { running: boolean; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<FriendsPeriod>("day");
  const [ranking, setRanking] = useState<FriendsOverview | null>(null);
  const [rankingError, setRankingError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    const cached = cachedFriends(period); if (cached) setRanking(cached);
    const controller = new AbortController(); setRankingError("");
    void friendsRequest<FriendsOverview>(`?period=${period}`, undefined, controller.signal).then(result => { if (!controller.signal.aborted) setRanking(result); }).catch(cause => { if (!controller.signal.aborted) setRankingError((cause as Error).message); });
    return () => controller.abort();
  }, [open, period, retry]);
  const [data, setData] = useState<Activity | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const previouslyStudying = useRef(new Set<string>());
  const tabId = useRef("");
  const currentRunning = useRef(running); currentRunning.current = running;
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    tabId.current ||= crypto.randomUUID();
    const controller = new AbortController();
    let pending = false;
    let rerun = false;
    const update = async () => {
      if (controller.signal.aborted) return;
      if (pending) { rerun = true; return; }
      pending = true;
      try {
        const active = document.visibilityState === "visible";
        if (!active) {
          await friendsRequest("", { action: "presence", tabId: tabId.current, active: false, studying: false }, controller.signal);
          return;
        }
        await friendsRequest("", { action: "presence", tabId: tabId.current, active: true, studying: currentRunning.current }, controller.signal);
        const result = await friendsRequest<Activity>("?activity", undefined, controller.signal);
        if (!controller.signal.aborted) {
          if (!result.enabled) { setData(null); return; }
          setData(result);
          const started = result.studying.filter(person => !previouslyStudying.current.has(person.id));
          if (started.length) setAnnouncement(started.length === 1 ? `${started[0].name} sta studiando.` : `${started[0].name} e altre ${started.length - 1} persone stanno studiando.`);
          previouslyStudying.current = new Set(result.studying.map(person => person.id));
        }
      } catch { if (!controller.signal.aborted) setData(null); }
      finally { pending = false; if (rerun && !controller.signal.aborted) { rerun = false; void update(); } }
    };
    refresh.current = () => { void update(); };
    void update();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void update(); }, 30000);
    document.addEventListener("visibilitychange", refresh.current);
    window.addEventListener("studio-friends-changed", refresh.current);
    const listener = refresh.current;
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", listener); window.removeEventListener("studio-friends-changed", listener); };
  }, []);
  useEffect(() => { refresh.current(); }, [running]);
  useEffect(() => { if (!announcement) return; const timer = setTimeout(() => setAnnouncement(""), 8000); return () => clearTimeout(timer); }, [announcement]);
  if (!data?.enabled) return null;
  const online = data.online || data.studying;
  return <>{announcement && createPortal(<aside className={styles.studyNotice} role="status"><span className={styles.liveDot} /><span>{announcement}</span><button onClick={() => { setAnnouncement(""); onOpen(); }}>Apri</button><button aria-label="Chiudi aggiornamento amici" onClick={() => setAnnouncement("")}><X size={14} /></button></aside>, document.body)}<Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><button className={styles.activityTrigger} aria-label={`Amici online: ${online.length} online, ${data.incoming} richieste`} title="Amici online"><Users size={18} />{!!(online.length || data.incoming) && <span>{data.incoming || online.length}</span>}</button></Popover.Trigger><Popover.Portal><Popover.Content className={styles.activity} side="bottom" align="center" sideOffset={10} collisionPadding={12} aria-label="Amici online">
    <header className={styles.activityHeading}><div><h2>Amici online</h2>{online.length === 0 && <p className={styles.activityEmpty}>Nessun amico online</p>}</div><Popover.Close asChild><button aria-label="Chiudi amici online"><X size={18} /></button></Popover.Close></header>
    <section className={styles.activityTony} aria-label="Tony e gli amici online"><TonyMascot size={86} animated showName={false} /><div className={styles.activitySpeech}><strong>Tony del bar</strong><p aria-live="polite">{friendsPresenceMessage(online, data.studying)}</p></div></section>
    {online.length > 0 && <ul aria-label="Amici presenti">{online.map(person => <li key={person.id}><span className={styles.liveDot} /><span><strong>{person.nickname || person.name}</strong><small>{person.status === "studying" || data.studying.some(friend => friend.id === person.id) ? "Sta studiando" : "Online"}</small></span></li>)}</ul>}
    {!!data.incoming && <p>{data.incoming} {data.incoming === 1 ? "richiesta di amicizia ricevuta" : "richieste di amicizia ricevute"}.</p>}
    {rankingError ? <p role="alert">{rankingError} <button onClick={() => setRetry(value => value + 1)}>Riprova</button></p> : ranking?.available ? <FriendsLeaderboard data={ranking} period={period} onPeriodChange={setPeriod} compact /> : <BaristaLoading name="Classifica amici" statusText="Caricamento della classifica amici." hint="Tony sta facendo i conti." />}
  </Popover.Content></Popover.Portal></Popover.Root></>;
}
