import { createHash } from "node:crypto";
import type { Firestore } from "@google-cloud/firestore";
import { z } from "zod";
import type { FriendPerson, FriendsOverview, FriendsPeriod, SocialSettings } from "./friends-types";
import { canonicalUniversity, normalizeUniversity } from "./universities";
import { lastKnownPlatformVisit } from "./platform-visits";
import type { ChatMessage, FriendMessage } from "./friend-messages";

const uidSchema = z.string().min(1).max(128).regex(/^[^/]+$/);
export const friendsActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("block"), targetId: uidSchema, blocked: z.boolean() }).strict(),
  z.object({ action: z.literal("report"), targetId: uidSchema, reason: z.enum(["spam", "harassment", "inappropriate", "other"]), details: z.string().trim().max(1000) }).strict(),
  z.object({ action: z.literal("settings"), enabled: z.boolean().optional(), discoverable: z.boolean(), shareActivity: z.boolean() }).strict(),
  z.object({ action: z.literal("relationship"), targetId: uidSchema, operation: z.enum(["request", "accept", "reject", "cancel", "remove"]) }).strict(),
  z.object({ action: z.literal("presence"), tabId: z.string().uuid(), active: z.boolean(), studying: z.boolean() }).strict(),
]);
export const friendsPeriodSchema = z.enum(["day", "month", "all"]);
type Profile = { photoURL?: string; enabled: boolean; discoverable: boolean; shareActivity: boolean; name: string; studyProgram: string; nickname: string; university: string; universityKey: string; searchName: string; lastRequestAt?: number };
type SocialIdentity = { photoURL?: string; name: string; studyProgram: string; nickname: string; university: string; city?: string };
type Edge = { members: string[]; requester: string; status: "pending" | "accepted"; createdAt: number };
type SettingsInput = Extract<z.infer<typeof friendsActionSchema>, { action: "settings" }>;
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
const pairId = (a: string, b: string) => createHash("sha256").update(JSON.stringify([a, b].sort())).digest("hex");
const dayInRome = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

export function periodStart(period: FriendsPeriod, now = new Date()) {
  if (period === "all") return "0000-01-01";
  const day = dayInRome(now);
  if (period === "month") return `${day.slice(0, 7)}-01`;
  return day;
}
function midnight(day: string) {
  const offset = new Intl.DateTimeFormat("en", { timeZone: "Europe/Rome", timeZoneName: "shortOffset" }).formatToParts(new Date(`${day}T12:00:00Z`)).find(part => part.type === "timeZoneName")?.value;
  const hours = Number(offset?.replace("GMT", "") || 0);
  return Date.parse(`${day}T00:00:00Z`) - hours * 3600000;
}
export function studyScore(sessions: { startedAt: string; endedAt: string; durationMs: number; timeRanges?: [number, number][] }[], activity: { day: string; pages: unknown[]; importedCount?: number }[], period: FriendsPeriod, now = new Date()) {
  const start = periodStart(period, now);
  const lower = period === "all" ? 0 : midnight(start);
  // Merge overlapping ranges so simultaneous timers never inflate the ranking.
  const ranges = sessions.flatMap(session => session.timeRanges || [[Date.parse(session.startedAt), Math.min(Date.parse(session.endedAt), Date.parse(session.startedAt) + session.durationMs)] as [number, number]]).map(([a, b]) => [Math.max(a, lower), Math.min(b, now.getTime())] as [number, number]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of ranges) { const last = merged.at(-1); if (last && a <= last[1]) last[1] = Math.max(last[1], b); else merged.push([a, b]); }
  const today = dayInRome(now);
  return { durationMs: merged.reduce((sum, [a, b]) => sum + b - a, 0), pages: activity.filter(entry => entry.day >= start && entry.day <= today).reduce((sum, entry) => sum + Math.max(entry.pages.length, entry.importedCount || 0), 0) };
}
export function normalizeSocial(value: string) { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("it").replace(/\s+/g, " "); }
export function makeSocialProfile(identity: SocialIdentity, previous?: Partial<Profile>): Profile {
  return { photoURL: identity.photoURL || "", enabled: true, discoverable: previous?.discoverable ?? true, shareActivity: previous?.shareActivity ?? true, name: identity.name, studyProgram: identity.studyProgram, nickname: identity.nickname, university: identity.university, universityKey: normalizeUniversity(canonicalUniversity(identity.university)), searchName: normalizeSocial(identity.name), ...(previous?.lastRequestAt ? { lastRequestAt: previous.lastRequestAt } : {}) };
}
function settings(profile: Profile): SocialSettings {
  return { photoURL: profile.photoURL || "", enabled: true, discoverable: profile.discoverable, shareActivity: profile.shareActivity, name: profile.name, nickname: profile.nickname, university: profile.university };
}

/** Only this server service reads presence and private study records. */
export class FriendsService {
  constructor(private db: Firestore, private uid: string, private now = Date.now()) {}
  async sendMessage(id: string, targetId: string, text: string) {
    if (targetId === this.uid) throw fail("Scegli un amico a cui scrivere.");
    const inbox = this.db.collection("users").doc(targetId).collection("friendMessages").doc(id);
    const limit = this.db.collection("socialMessageLimits").doc(this.uid);
    await this.db.runTransaction(async tx => {
      const [edge, block, me, target, previous, rate] = await Promise.all([
        tx.get(this.edges().doc(pairId(this.uid, targetId))), tx.get(this.db.collection("socialBlocks").doc(pairId(this.uid, targetId))),
        tx.get(this.profiles().doc(this.uid)), tx.get(this.profiles().doc(targetId)),
        tx.get(inbox), tx.get(limit),
      ]);
      if (edge.get("status") !== "accepted" || block.get("blockers")?.length || !me.get("enabled") || !target.get("enabled")) throw fail("Puoi scrivere solo ai tuoi amici disponibili.", 403);
      if (previous.exists) {
        if (previous.get("senderId") !== this.uid) throw fail("Messaggio non valido.", 409);
        return;
      }
      if (this.now - (Number(rate.get("sentAt")) || 0) < 2000) throw fail("Attendi un momento prima di inviare un altro messaggio.", 409);
      tx.set(inbox, { senderId: this.uid, text, sentAt: this.now, read: false });
      tx.set(limit, { sentAt: this.now });
    });
    return { ok: true };
  }
  async conversation(targetId: string): Promise<ChatMessage[]> {
    if (!uidSchema.safeParse(targetId).success || targetId === this.uid) throw fail("Scegli un amico a cui scrivere.");
    const [edge, blocked, me, target] = await Promise.all([
      this.edges().doc(pairId(this.uid, targetId)).get(), this.blockedIds(), this.profile(), this.profile(targetId),
    ]);
    if (edge.get("status") !== "accepted" || blocked.has(targetId) || !me?.enabled || !target?.enabled) throw fail("Puoi leggere solo le chat con i tuoi amici disponibili.", 403);
    // Read the existing inboxes so messages sent before chats were introduced remain visible.
    const [incoming, outgoing] = await Promise.all([
      this.db.collection("users").doc(this.uid).collection("friendMessages").where("senderId", "==", targetId).get(),
      this.db.collection("users").doc(targetId).collection("friendMessages").where("senderId", "==", this.uid).get(),
    ]);
    return [
      ...incoming.docs.map(doc => ({ id: doc.id, text: doc.get("text") as string, sentAt: doc.get("sentAt") as number, outgoing: false, read: doc.get("read") === true })),
      ...outgoing.docs.map(doc => ({ id: doc.id, text: doc.get("text") as string, sentAt: doc.get("sentAt") as number, outgoing: true, read: doc.get("read") === true })),
    ].sort((a, b) => a.sentAt - b.sentAt || a.id.localeCompare(b.id));
  }
  async incomingMessages(): Promise<FriendMessage[]> {
    const [inbox, edges, blocked, me] = await Promise.all([
      this.db.collection("users").doc(this.uid).collection("friendMessages").where("read", "==", false).limit(50).get(),
      this.edges().where("members", "array-contains", this.uid).get(), this.blockedIds(), this.profile(),
    ]);
    if (!me?.enabled) return [];
    const friends = new Set(edges.docs.filter(doc => doc.get("status") === "accepted").flatMap(doc => (doc.get("members") as string[]).filter(id => id !== this.uid)));
    const messages = await Promise.all(inbox.docs.map(async (record): Promise<FriendMessage | null> => {
      const senderId = record.get("senderId") as string;
      if (!friends.has(senderId) || blocked.has(senderId)) return null;
      const sender = await this.profile(senderId);
      if (!sender?.enabled) return null;
      return { id: record.id, sender: { id: senderId, name: sender.name, nickname: sender.nickname, photoURL: sender.photoURL || "" }, text: record.get("text") as string, sentAt: record.get("sentAt") as number };
    }));
    return messages.filter((message): message is FriendMessage => !!message).sort((a, b) => b.sentAt - a.sentAt);
  }
  async readMessages(ids: string[]) {
    const inbox = this.db.collection("users").doc(this.uid).collection("friendMessages");
    await this.db.runTransaction(async tx => {
      const records = await Promise.all(ids.map(id => tx.get(inbox.doc(id))));
      for (const record of records) if (record.exists) tx.update(record.ref, { read: true });
    });
    return { ok: true };
  }
  private profiles() { return this.db.collection("socialProfiles"); }
  private edges() { return this.db.collection("friendships"); }
  private async blockedIds() {
    const records = await this.db.collection("socialBlocks").where("members", "array-contains", this.uid).get();
    return new Set(records.docs.filter(doc => doc.get("blockers")?.length).map(doc => (doc.get("members") as string[]).find(id => id !== this.uid)!));
  }
  async block(targetId: string, blocked: boolean) {
    if (targetId === this.uid) throw fail("Non puoi bloccare te stesso.");
    const ref = this.db.collection("socialBlocks").doc(pairId(this.uid, targetId));
    await this.db.runTransaction(async tx => {
      const [record, target] = await Promise.all([tx.get(ref), tx.get(this.profiles().doc(targetId))]);
      if (!target.exists) throw fail("Utente non trovato.", 404);
      const blockers = new Set<string>(record.get("blockers") || []);
      if (blocked) blockers.add(this.uid); else blockers.delete(this.uid);
      if (blockers.size) tx.set(ref, { members: [this.uid, targetId].sort(), blockers: [...blockers] }); else tx.delete(ref);
      if (blocked) tx.delete(this.edges().doc(pairId(this.uid, targetId)));
    });
    return { ok: true };
  }
  async report(targetId: string, reason: string, details: string) {
    if (targetId === this.uid) throw fail("Non puoi segnalare te stesso.");
    if (!(await this.profiles().doc(targetId).get()).exists) throw fail("Utente non trovato.", 404);
    await this.db.collection("socialReports").doc(createHash("sha256").update(JSON.stringify([this.uid, targetId])).digest("hex")).set({ reporterId: this.uid, targetId, reason, details, createdAt: this.now, status: "pending" });
    return { ok: true };
  }
  private async profile(id = this.uid) { return (await this.profiles().doc(id).get()).data() as Profile | undefined; }
  private person(id: string, profile: Profile): FriendPerson { return { id, photoURL: profile.photoURL || "", name: profile.name, studyProgram: profile.studyProgram, nickname: profile.nickname, university: profile.university }; }
  async ensureProfile(identity: SocialIdentity) {
    const ref = this.profiles().doc(this.uid);
    await this.db.runTransaction(async tx => {
      const [current, saved] = await Promise.all([tx.get(ref), tx.get(this.db.collection("users").doc(this.uid).collection("settings").doc("profile"))]);
      const previous = current.data() as Profile | undefined;
      const personal = saved.data();
      const value = makeSocialProfile(personal ? { photoURL: personal.photoURL || identity.photoURL || previous?.photoURL || "", name: personal.displayName || previous?.name || identity.name, nickname: personal.nickname || "", city: personal.city || "", university: personal.university || "", studyProgram: personal.studyProgram || "" } : identity, previous);
      if (previous && Object.entries(value).every(([key, field]) => previous[key as keyof Profile] === field)) return;
      tx.set(ref, value);
      const directory = this.db.collection("socialDirectory").doc(this.uid);
      if (value.discoverable) tx.set(directory, value); else tx.delete(directory);
    });
  }
  async self() { const profile = await this.profile(); return { self: profile ? settings(profile) : null }; }
  async activity() {
    const me = await this.profile();
    if (!me?.enabled) return { enabled: false, studying: [], online: [], incoming: 0 };
    const edges = await this.edges().where("members", "array-contains", this.uid).get();
    const blocked = await this.blockedIds();
    const studying: FriendPerson[] = [];
    const online: FriendPerson[] = [];
    let incoming = 0;
    let incomingRequest: FriendPerson | undefined;
    for (let offset = 0; offset < edges.docs.length; offset += 10) await Promise.all(edges.docs.slice(offset, offset + 10).map(async doc => {
      const edge = doc.data() as Edge;
      const id = edge.members.find(value => value !== this.uid)!;
      if (blocked.has(id)) return;
      const profile = await this.profile(id); if (!profile?.enabled) return;
      if (edge.status === "pending") {
        if (edge.requester !== this.uid) {
          incoming++;
          if (incoming === 1) incomingRequest = this.person(id, profile);
        }
        return;
      }
      const status = await this.status(id, profile);
      if (status === "studying" || status === "online") {
        const person = { ...this.person(id, profile), status };
        online.push(person);
        if (status === "studying") studying.push(person);
      }
    }));
    for (const people of [online, studying]) people.sort((a, b) => (a.nickname || a.name).localeCompare(b.nickname || b.name, "it"));
    return { enabled: true, studying, online, incoming, ...(incoming === 1 && incomingRequest ? { incomingRequest } : {}) };
  }
  async saveSettings(input: SettingsInput, identity: SocialIdentity) {
    const ref = this.profiles().doc(this.uid);
    await this.db.runTransaction(async tx => {
      const [current, saved] = await Promise.all([tx.get(ref), tx.get(this.db.collection("users").doc(this.uid).collection("settings").doc("profile"))]);
      const previous = current.data() as Profile | undefined;
      const personal = saved.data();
      const resolved = personal ? { photoURL: personal.photoURL || identity.photoURL || previous?.photoURL || "", name: personal.displayName || previous?.name || identity.name, nickname: personal.nickname || "", city: personal.city || "", university: personal.university || "", studyProgram: personal.studyProgram || "" } : identity;
      const profile = { ...makeSocialProfile(resolved, previous), discoverable: input.discoverable, shareActivity: input.shareActivity };
      tx.set(ref, profile);
      const directory = this.db.collection("socialDirectory").doc(this.uid);
      if (profile.enabled && profile.discoverable) tx.set(directory, profile);
      else tx.delete(directory);
    });
    return { ok: true };
  }
  async relationship(targetId: string, operation: "request" | "accept" | "reject" | "cancel" | "remove") {
    if (targetId === this.uid) throw fail("Non puoi inviare una richiesta a te stesso.");
    const ref = this.edges().doc(pairId(this.uid, targetId));
    await this.db.runTransaction(async tx => {
      const [edgeDoc, meDoc, otherDoc, blockDoc] = await Promise.all([tx.get(ref), tx.get(this.profiles().doc(this.uid)), tx.get(this.profiles().doc(targetId)), tx.get(this.db.collection("socialBlocks").doc(pairId(this.uid, targetId)))]);
      if ((operation === "request" || operation === "accept") && blockDoc.get("blockers")?.length) throw fail("Questa persona non è disponibile per nuove richieste.", 404);
      const edge = edgeDoc.data() as Edge | undefined;
      const me = meDoc.data() as Profile | undefined, other = otherDoc.data() as Profile | undefined;
      if (operation === "request") {
        if (!me?.enabled || !other?.enabled || !other.discoverable) throw fail("Questa persona non è disponibile per nuove richieste.", 404);
        if (edge) return;
        if (me.lastRequestAt && this.now - me.lastRequestAt < 10000) throw fail("Attendi qualche secondo prima di inviare un’altra richiesta.", 409);
        const [mine, theirs] = await Promise.all([tx.get(this.edges().where("members", "array-contains", this.uid)), tx.get(this.edges().where("members", "array-contains", targetId))]);
        if (mine.size >= 200 || theirs.size >= 200) throw fail("È stato raggiunto il limite di 200 amicizie e richieste.", 409);
        tx.set(ref, { members: [this.uid, targetId].sort(), requester: this.uid, status: "pending", createdAt: this.now } satisfies Edge);
        tx.update(this.profiles().doc(this.uid), { lastRequestAt: this.now });
        return;
      }
      if (!edge || !edge.members.includes(this.uid)) throw fail("Richiesta non trovata.", 404);
      if (operation === "accept" || operation === "reject") {
        if (edge.status !== "pending" || edge.requester === this.uid) throw fail("Puoi rispondere solo alle richieste ricevute.", 403);
        if (operation === "accept") {
          if (!me?.enabled || !other?.enabled) throw fail("L’account non è disponibile.", 409);
          tx.update(ref, { status: "accepted" });
        } else tx.delete(ref);
      } else {
        if (operation === "cancel" ? edge.status !== "pending" || edge.requester !== this.uid : edge.status !== "accepted") throw fail("Operazione non consentita.", 403);
        tx.delete(ref);
      }
    });
    return { ok: true };
  }
  async presence(tabId: string, active: boolean, studying: boolean) {
    const profile = await this.profile();
    if (!profile?.enabled || !profile.shareActivity) return { enabled: false };
    const ref = this.profiles().doc(this.uid).collection("presence").doc(tabId);
    if (active) {
      // Expired tabs never show online; clean them on the next heartbeat too.
      const stale = await ref.parent.where("lastSeen", "<", this.now - 90000).limit(20).get();
      await Promise.all(stale.docs.map(doc => doc.ref.delete()));
    }
    const history = this.profiles().doc(this.uid).collection("presenceHistory").doc("latest");
    await this.db.runTransaction(async tx => {
      const saved = await tx.get(history);
      tx.set(history, { lastSeen: Math.max(this.now, Number(saved.get("lastSeen")) || 0) });
      if (!active) { tx.delete(ref); return; }
      tx.set(ref, { lastSeen: this.now, studying });
    });
    return { enabled: true };
  }
  private async status(id: string, profile: Profile): Promise<FriendPerson["status"]> {
    if (!profile.enabled || !profile.shareActivity) return undefined;
    const tabs = await this.profiles().doc(id).collection("presence").where("lastSeen", ">=", this.now - 90000).get();
    return tabs.empty ? "offline" : tabs.docs.some(doc => doc.get("studying") === true) ? "studying" : "online";
  }
  private async score(id: string, period: FriendsPeriod) {
    const root = this.db.collection("users").doc(id);
    const [sessions, days] = await Promise.all([root.collection("studySessions").select("startedAt", "endedAt", "durationMs", "timeRanges").get(), root.collection("readingActivity").select("pages", "importedCount").get()]);
    return studyScore(sessions.docs.map(doc => doc.data() as { startedAt: string; endedAt: string; durationMs: number; timeRanges?: [number, number][] }), days.docs.map(doc => ({ day: doc.id, pages: doc.get("pages") || [], importedCount: doc.get("importedCount") || 0 })), period, new Date(this.now));
  }
  async overview(period: FriendsPeriod): Promise<FriendsOverview> {
    const me = await this.profile();
    const result: FriendsOverview = { available: true, self: me ? settings(me) : null, friends: [], incoming: [], outgoing: [], leaderboard: [], period };
    if (!me?.enabled) return result;
    const blocked = await this.blockedIds();
    const myBlocks = await this.db.collection("socialBlocks").where("blockers", "array-contains", this.uid).get();
    result.blocked = (await Promise.all(myBlocks.docs.map(async doc => {
      const id = (doc.get("members") as string[]).find(value => value !== this.uid)!;
      const profile = await this.profile(id); return profile ? this.person(id, profile) : null;
    }))).filter((person): person is FriendPerson => !!person);
    const edges = await this.edges().where("members", "array-contains", this.uid).get();
    // Process in small groups to bound simultaneous reads for large friend lists.
    for (let offset = 0; offset < edges.docs.length; offset += 10) await Promise.all(edges.docs.slice(offset, offset + 10).map(async doc => {
      const edge = doc.data() as Edge, id = edge.members.find(value => value !== this.uid)!;
      if (blocked.has(id)) return;
      const profile = await this.profile(id); if (!profile?.enabled) return;
      const person = { ...this.person(id, profile), requestedAt: edge.createdAt };
      if (edge.status === "pending") { (edge.requester === this.uid ? result.outgoing : result.incoming).push(person); return; }
      person.status = await this.status(id, profile);
      if (person.status === "offline") {
        const history = await this.profiles().doc(id).collection("presenceHistory").doc("latest").get();
        let lastSeen = history.get("lastSeen");
        if (typeof lastSeen !== "number" || !Number.isFinite(lastSeen)) {
          const activity = await this.db.collection("users").doc(id).collection("metrics").doc("activity").get();
          const visit = lastKnownPlatformVisit(activity.data());
          lastSeen = visit ? Date.parse(visit) : undefined;
        }
        if (typeof lastSeen === "number" && Number.isFinite(lastSeen)) Object.assign(person, { lastSeen });
      }
      result.friends.push(person);
      if (profile.shareActivity) result.leaderboard.push({ ...person, ...await this.score(id, period) });
    }));
    if (me.shareActivity) result.leaderboard.push({ ...this.person(this.uid, me), ...await this.score(this.uid, period), self: true });
    result.friends.sort((a, b) => a.name.localeCompare(b.name, "it"));
    for (const list of [result.incoming, result.outgoing]) list.sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));
    result.leaderboard.sort((a, b) => b.durationMs - a.durationMs || b.pages - a.pages || a.name.localeCompare(b.name, "it"));
    return result;
  }
  async sharedProfile(targetId: string): Promise<{ person: FriendPerson | null; self?: boolean }> {
    if (!uidSchema.safeParse(targetId).success) throw fail("Link del profilo non valido.");
    if (targetId === this.uid) return { person: null, self: true };
    const [target, blocked, edgeDoc] = await Promise.all([this.profile(targetId), this.blockedIds(), this.edges().doc(pairId(this.uid, targetId)).get()]);
    if (!target?.enabled || !target.discoverable || blocked.has(targetId)) return { person: null };
    const edge = edgeDoc.data() as Edge | undefined;
    return { person: { ...this.person(targetId, target), relationship: !edge ? "none" : edge.status === "accepted" ? "friend" : edge.requester === this.uid ? "outgoing" : "incoming" } };
  }
  async search(name: string) {
    const me = await this.profile();
    const blocked = await this.blockedIds();
    if (!me?.enabled) throw fail("Completa il profilo per cercare altre persone.");
    const term = normalizeSocial(name.replace(/^@/, ""));
    if (!term && !me.universityKey) return { people: [], truncated: false };
    const queries = term ? [
      this.db.collection("socialDirectory").where("searchName", ">=", term).where("searchName", "<=", `${term}\uf8ff`).limit(101).get(),
      this.db.collection("socialDirectory").where("nickname", ">=", term).where("nickname", "<=", `${term}\uf8ff`).limit(101).get(),
    ] : [this.db.collection("socialDirectory").where("universityKey", "==", me.universityKey).limit(101).get()];
    const candidates = await Promise.all(queries);
    const edges = await this.edges().where("members", "array-contains", this.uid).get();
    const relations = new Map(edges.docs.map(doc => { const edge = doc.data() as Edge; return [edge.members.find(id => id !== this.uid)!, edge.status === "accepted" ? "friend" : edge.requester === this.uid ? "outgoing" : "incoming"] as const; }));
    const docs = [...new Map(candidates.flatMap(result => result.docs).map(doc => [doc.id, doc])).values()];
    const people = docs.flatMap(doc => {
      const profile = doc.data() as Profile;
      if (doc.id === this.uid || blocked.has(doc.id) || !profile.enabled || !profile.discoverable) return [];
      const relationship = relations.get(doc.id) || "none";
      if (!term && relationship !== "none") return [];
      return [{ ...this.person(doc.id, profile), relationship } satisfies FriendPerson];
    }).sort((a, b) => a.name.localeCompare(b.name, "it"));
    return { people: people.slice(0, 100), truncated: candidates.some(result => result.size > 100) || people.length > 100 };
  }
}
