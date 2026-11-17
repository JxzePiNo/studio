import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-server";
import { services } from "@/lib/firebase-server";
import { platformConfig } from "@/lib/platform-server";
import { apiError } from "@/lib/http";
import { addMonthlyEvent, currentCostMonth, emptyMonthlyUser, type MonthlyUserCost } from "@/lib/admin-monthly-costs";
import type { UsageEvent } from "@/lib/admin-types";
import type { UserRecord } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const identity = await adminGuard(request); if (identity instanceof Response) return identity;
  try {
    const period = currentCostMonth();
    const { auth, db } = services();
    const config = await platformConfig();
    const accounts: UserRecord[] = [];
    let next: string | undefined;
    do {
      request.signal.throwIfAborted();
      const page = await auth.listUsers(1000, next);
      accounts.push(...page.users); next = page.pageToken;
    } while (next);
    const users: MonthlyUserCost[] = [];
    // Bound concurrency; paginate ALL monthly events, not just the last 50 calls.
    for (let offset = 0; offset < accounts.length; offset += 8) {
      users.push(...await Promise.all(accounts.slice(offset, offset + 8).map(async user => {
        let row = emptyMonthlyUser({ uid: user.uid, name: user.displayName || "", email: user.email || "", createdAt: user.metadata?.creationTime || null });
        const query = db.collection("users").doc(user.uid).collection("usageEvents").where("at", ">=", period.start).where("at", "<", period.end).orderBy("at").limit(500);
        let page = await query.get();
        for (;;) {
          request.signal.throwIfAborted();
          for (const doc of page.docs) row = addMonthlyEvent(row, { ...doc.data(), id: doc.id } as UsageEvent, config.rates, period);
          if (page.size < 500) break;
          page = await query.startAfter(page.docs.at(-1)!).get();
        }
        return row;
      })));
    }
    users.sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1) || a.email.localeCompare(b.email));
    return NextResponse.json({ ...period, users, usd: users.reduce((sum, user) => sum + (user.usd || 0), 0), incompleteUsers: users.filter(user => !user.complete).length, calls: users.reduce((sum, user) => sum + user.calls, 0) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
