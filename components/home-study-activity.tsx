"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cachedFriends, friendsRequest } from "@/lib/friends-client";
import type { FriendsOverview, FriendsPeriod } from "@/lib/friends-types";
import type { ReadingActivity } from "@/lib/study-session";
import { FriendsLeaderboard } from "./friends-leaderboard";
import { ReadingHeatmap } from "./reading-heatmap";
import { Button } from "./ui/button";
import styles from "./home-study-activity.module.css";

export function HomeStudyActivity({ activity, today, onDaySelect }: { activity: ReadingActivity; today: string; onDaySelect?: (day: string) => void }) {
  const [data, setData] = useState<FriendsOverview | null>(null);
  const [period, setPeriod] = useState<FriendsPeriod>("day");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    const ticket = ++sequence.current;
    setRefreshing(true);
    try {
      const result = await friendsRequest<FriendsOverview>(`?period=${period}`, undefined, signal);
      if (!signal?.aborted && ticket === sequence.current) { setData(result); setReady(true); setError(""); }
    } catch (cause) { if (!signal?.aborted && ticket === sequence.current) { setError((cause as Error).message); setReady(true); } }
    finally { if (!signal?.aborted && ticket === sequence.current) setRefreshing(false); }
  }, [period]);
  useLayoutEffect(() => {
    const cached = cachedFriends(period); if (cached) { setData(cached); setReady(true); }
  }, [period]);
  useEffect(() => {
    const controller = new AbortController(); void load(controller.signal);
    const refresh = () => { if (document.visibilityState === "visible") void load(controller.signal); };
    const timer = setInterval(refresh, 60000);
    window.addEventListener("studio-friends-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("studio-friends-changed", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);
  const calendar = <ReadingHeatmap activity={activity} today={today} onDaySelect={onDaySelect} />;
  if (!ready) return <div className={styles.row} role="status" aria-label="Caricamento attività e classifica" aria-busy="true"><div className={styles.placeholder} /><div className={styles.placeholder} /></div>;
  if (!data?.available || !data.friends.length) return calendar;
  return <div className={styles.row} aria-label="Classifica amici e attività di lettura">
    <section className={styles.leaderboard} aria-label="Classifica amici nella home">
      <FriendsLeaderboard data={data} period={period} onPeriodChange={setPeriod} home />
      {refreshing && <span className={styles.refreshing} role="status">Aggiornamento in corso…</span>}
      {error && <p className={styles.error} role="alert">{error} <Button variant="ghost" size="sm" onClick={() => void load()}>Riprova</Button></p>}
    </section>
    <div className={styles.calendar}>{calendar}</div>
  </div>;
}
