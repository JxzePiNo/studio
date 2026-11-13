import type { FriendPerson } from "./friends-types";

export function friendsPresenceMessage(online: FriendPerson[], studying: FriendPerson[]) {
  if (!online.length && !studying.length) return "Ci sono io con te";
  const people = studying.length ? studying : online;
  const names = new Intl.ListFormat("it", { style: "long", type: "conjunction" }).format(["Tony", ...people.map(person => person.nickname || person.name)]);
  return `${names} ${studying.length ? "stanno studiando" : "sono qui con te"}.`;
}
