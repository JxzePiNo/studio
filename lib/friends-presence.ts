import type { FriendPerson } from "./friends-types";

export function friendPresenceLabel(person: Pick<FriendPerson, "status" | "lastSeen">, now = Date.now()) {
  if (person.status === "studying") return "Sta studiando";
  if (person.status === "online") return "Online";
  if (!person.lastSeen || !Number.isFinite(person.lastSeen)) return "Ultimo accesso non disponibile";
  const minutes = Math.floor(Math.max(0, now - person.lastSeen) / 60000);
  if (minutes < 1) return "Online poco fa";
  if (minutes < 60) return `Online ${minutes}min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Online ${hours}h fa`;
  return `Online ${Math.floor(hours / 24)}gg fa`;
}

export function friendsPresenceMessage(online: FriendPerson[], studying: FriendPerson[]) {
  if (!online.length && !studying.length) return "Ci sono io con te";
  const people = studying.length ? studying : online;
  const names = new Intl.ListFormat("it", { style: "long", type: "conjunction" }).format(["Tony", ...people.map(person => person.nickname || person.name)]);
  return `${names} ${studying.length ? "stanno studiando" : "sono qui con te"}.`;
}
