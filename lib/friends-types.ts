export type FriendsPeriod = "day" | "month" | "all";
export type SocialSettings = { photoURL?: string; enabled: boolean; discoverable: boolean; shareActivity: boolean; name: string; nickname: string; university: string; city?: string };
export type FriendPerson = { photoURL?: string; requestedAt?: number; id: string; name: string; studyProgram: string; nickname: string; university: string; city?: string; status?: "studying" | "online" | "offline"; relationship?: "none" | "incoming" | "outgoing" | "friend" };
export type FriendScore = FriendPerson & { durationMs: number; pages: number; self?: boolean };
export type FriendsOverview = { available: boolean; self: SocialSettings | null; friends: FriendPerson[]; incoming: FriendPerson[]; outgoing: FriendPerson[]; leaderboard: FriendScore[]; period: FriendsPeriod; blocked?: FriendPerson[] };
