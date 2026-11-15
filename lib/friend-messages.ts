import { z } from "zod";

export const friendMessageActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), id: z.string().uuid(), targetId: z.string().min(1).max(128).regex(/^[^/]+$/), text: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ action: z.literal("read"), ids: z.array(z.string().uuid()).min(1).max(50) }).strict(),
]);
export type FriendMessage = { id: string; sender: { id: string; name: string; nickname: string; photoURL?: string }; text: string; sentAt: number };
