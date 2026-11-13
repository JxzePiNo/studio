import { randomBytes, randomUUID } from "node:crypto";
import type { Firestore } from "@google-cloud/firestore";
import { z } from "zod";

export const referralCodeSchema = z.string().regex(/^[a-f0-9]{24}$/);
export const referralActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), label: z.string().trim().min(1).max(60) }).strict(),
  z.object({ action: z.literal("claim"), code: referralCodeSchema }).strict(),
  z.object({ action: z.literal("greet"), recipientId: z.string().min(1).max(128).regex(/^[^/]+$/), text: z.string().trim().min(1).max(280) }).strict(),
  z.object({ action: z.literal("read"), greetingId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("welcome-complete"), greetingId: z.string().uuid().optional() }).strict(),
]);
export interface ReferralLink { code: string; label: string; createdAt: string; count: number }
export interface ReferralInvitee { id: string; name: string; linkLabel: string; joinedAt: string; greeting?: { text: string; sentAt: string; readAt?: string } }
export interface ReferralOverview { available: boolean; links: ReferralLink[]; invitees: ReferralInvitee[] }
export interface ReferralGreeting { id: string; text: string; fromName: string; sentAt: string; readAt?: string }
export interface ReferralWelcome { welcome: boolean; greeting: ReferralGreeting | null }
interface Link { ownerId: string; label: string; createdAt: string }
interface Join { inviterId: string; name: string; code: string; linkLabel: string; joinedAt: string; greeting?: ReferralGreeting; welcomedAt?: string }
const fail = (message: string, status: number) => Object.assign(new Error(message), { status });

/** All identities come from the verified session, never from the request body. */
export class ReferralService {
  constructor(private db: Firestore, private uid: string) {}
  private joins() { return this.db.collection("referralJoins"); }
  async overview(): Promise<ReferralOverview> {
    const [links, joins] = await Promise.all([
      this.db.collection("referralLinks").where("ownerId", "==", this.uid).get(),
      this.joins().where("inviterId", "==", this.uid).get(),
    ]);
    return { available: true,
      links: links.docs.map(doc => { const data = doc.data() as Link; return { code: doc.id, label: data.label, createdAt: data.createdAt, count: joins.docs.filter(join => join.get("code") === doc.id).length }; }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      invitees: joins.docs.map(doc => { const data = doc.data() as Join; return { id: doc.id, name: data.name, linkLabel: data.linkLabel, joinedAt: data.joinedAt, ...(data.greeting ? { greeting: { text: data.greeting.text, sentAt: data.greeting.sentAt, ...(data.greeting.readAt ? { readAt: data.greeting.readAt } : {}) } } : {}) }; }).sort((a, b) => b.joinedAt.localeCompare(a.joinedAt)),
    };
  }
  async createLink(label: string) {
    const code = randomBytes(12).toString("hex");
    await this.db.runTransaction(async tx => {
      const links = await tx.get(this.db.collection("referralLinks").where("ownerId", "==", this.uid));
      if (links.size >= 20) throw fail("Puoi creare al massimo 20 link di invito.", 400);
      tx.create(this.db.collection("referralLinks").doc(code), { ownerId: this.uid, label, createdAt: new Date().toISOString() });
    });
    return { code };
  }
  async claim(code: string, name: string) {
    return this.db.runTransaction(async tx => {
      const [link, existing] = await Promise.all([
        tx.get(this.db.collection("referralLinks").doc(code)), tx.get(this.joins().doc(this.uid)),
      ]);
      if (!link.exists) throw fail("Link di invito non valido.", 404);
      const data = link.data() as Link;
      if (data.ownerId === this.uid) throw fail("Questo è il tuo link di invito.", 400);
      if (existing.exists) return { claimed: false };
      tx.create(this.joins().doc(this.uid), { inviterId: data.ownerId, code, name, linkLabel: data.label, joinedAt: new Date().toISOString() });
      return { claimed: true };
    });
  }
  async greet(recipientId: string, text: string, fromName: string) {
    const ref = this.joins().doc(recipientId);
    await this.db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists || snapshot.get("inviterId") !== this.uid) throw fail("Persona invitata non trovata.", 404);
      if (snapshot.get("greeting")) throw fail("Hai già inviato un saluto a questa persona.", 409);
      tx.update(ref, { greeting: { id: randomUUID(), text, fromName, sentAt: new Date().toISOString() } });
    });
    return { sent: true };
  }
  async pending(): Promise<ReferralGreeting | null> {
    const snapshot = await this.joins().doc(this.uid).get();
    const greeting = snapshot.get("greeting") as ReferralGreeting | undefined;
    return greeting && !greeting.readAt ? greeting : null;
  }
  async welcome(): Promise<ReferralWelcome> {
    const snapshot = await this.joins().doc(this.uid).get();
    const join = snapshot.data() as Join | undefined;
    return { welcome: !!join && !join.welcomedAt, greeting: join?.greeting && !join.greeting.readAt ? join.greeting : null };
  }
  async completeWelcome(greetingId?: string) {
    const ref = this.joins().doc(this.uid);
    await this.db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw fail("Invito non trovato.", 404);
      const greeting = snapshot.get("greeting") as ReferralGreeting | undefined;
      if (greetingId && greeting?.id !== greetingId) throw fail("Saluto non trovato.", 404);
      const now = new Date().toISOString();
      const change = { ...(!snapshot.get("welcomedAt") ? { welcomedAt: now } : {}), ...(greetingId && !greeting?.readAt ? { "greeting.readAt": now } : {}) };
      if (Object.keys(change).length) tx.update(ref, change);
    });
    return { completed: true };
  }
  async read(greetingId: string) {
    const ref = this.joins().doc(this.uid);
    await this.db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      const greeting = snapshot.get("greeting") as ReferralGreeting | undefined;
      if (!greeting || greeting.id !== greetingId) throw fail("Saluto non trovato.", 404);
      if (!greeting.readAt) tx.update(ref, { "greeting.readAt": new Date().toISOString() });
    });
    return { read: true };
  }
}
