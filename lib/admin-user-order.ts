export const adminUserOrders = ["lastVisit", "oldestVisit", "name", "created"] as const;
export type AdminUserOrder = typeof adminUserOrders[number];

type SortableUser = { uid: string; name: string; createdAt: string; lastVisitAt: string | null };
const timestamp = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
export function compareAdminUsers(a: SortableUser, b: SortableUser, order: AdminUserOrder) {
  let difference = 0;
  if (order === "name") difference = a.name.localeCompare(b.name, "it", { sensitivity: "base" });
  else if (order === "created") difference = timestamp(b.createdAt) - timestamp(a.createdAt);
  else {
    const left = timestamp(a.lastVisitAt), right = timestamp(b.lastVisitAt);
    if (!left || !right) difference = Number(!left) - Number(!right);
    else difference = order === "oldestVisit" ? left - right : right - left;
  }
  return difference || a.uid.localeCompare(b.uid);
}

export function isAdminUserOnline(lastVisitAt: string | null, now = Date.now()) {
  const last = timestamp(lastVisitAt), elapsed = now - last;
  return last > 0 && elapsed >= 0 && elapsed < 90000;
}
