"use client";
import { useLayoutEffect, useRef } from "react";
import { BaristaLoading } from "./barista-loading";
import { Trophy } from "lucide-react";
import type { FriendsOverview, FriendsPeriod } from "@/lib/friends-types";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import styles from "./friends.module.css";

function duration(ms: number) { const minutes = Math.floor(ms / 60000); return `${Math.floor(minutes / 60)} h ${minutes % 60} min`; }
export function FriendsLeaderboard({ data, period, onPeriodChange, home = false, compact = false }: { data: FriendsOverview; period: FriendsPeriod; onPeriodChange: (period: FriendsPeriod) => void; home?: boolean; compact?: boolean }) {
  const ranked = data.period === period ? [...data.leaderboard].sort((a, b) => b.durationMs - a.durationMs || a.name.localeCompare(b.name, "it")) : [];
  const selfIndex = ranked.findIndex(person => person.self);
  const podium = compact && selfIndex >= 0 && selfIndex < 3;
  const visible = compact ? (selfIndex >= 3 ? ranked.slice(selfIndex - 1, selfIndex + 2) : ranked.slice(0, 3)) : ranked;
  const list = useRef<HTMLOListElement>(null);
  const signature = JSON.stringify(visible.map(person => [person.id, person.nickname || person.name, !!person.self, Math.floor(person.durationMs / 60000)]));
  const previous = useRef(signature);
  useLayoutEffect(() => {
    const changed = previous.current !== signature;
    previous.current = signature;
    if (!changed || !list.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = list.current.animate([{ opacity: .35 }, { opacity: 1 }], { duration: 240, easing: "ease-out" });
    return () => animation.cancel();
  }, [signature]);
  return <div className={compact ? styles.compactRanking : styles.card}><div className={styles.rankingHeading}><div><h2>Classifica amici</h2><p>Il tempo di studio, al tuo ritmo.</p></div><Trophy size={27} /></div><Tabs className={styles.tabs} value={period} onValueChange={value => onPeriodChange(value as FriendsPeriod)}><TabsList aria-label="Periodo della classifica"><TabsTrigger value="day">Oggi</TabsTrigger><TabsTrigger value="month">Mese</TabsTrigger><TabsTrigger value="all">Sempre</TabsTrigger></TabsList></Tabs>{data.period !== period ? <BaristaLoading name="Classifica amici" statusText="Aggiornamento della classifica." hint="Tony sta preparando questo periodo." /> : ranked.length ? <ol ref={list} className={`${styles.ranking} ${podium ? styles.podium : ""}`} aria-label="Classifica degli amici">{visible.map((person) => <li key={person.id} data-self={!!person.self} data-place={ranked.indexOf(person) + 1}><span className={styles.place}>{ranked.indexOf(person) + 1}</span><div><strong>{person.nickname || person.name}{person.self && <small> Tu</small>}</strong></div><div className={styles.score}><strong>{duration(person.durationMs)}</strong></div></li>)}</ol> : <p>La classifica apparirà quando tu o i tuoi amici condividerete le statistiche.</p>}{!compact && <small className={styles.footnote}>Il tempo conta le sessioni concluse e salvate. Oggi e Mese seguono il fuso orario italiano. Chi disattiva la condivisione non compare in classifica.</small>}</div>;
}
