import type { ChatMessage } from "./types";

/** Analyses are common; an invite can exclude conversations before joining. */
export function sharedChatView(messages: ChatMessage[], uid: string, ownerId: string, since: number): ChatMessage[] {
  return messages.filter(message => (!message.privateOwnerId || message.privateOwnerId === uid) && (message.source === "analysis" || (message.sharedAt || 0) >= since)).map(message => {
    if (uid === ownerId || !message.quiz) return message;
    const { latestResult: _personal, ...quiz } = message.quiz;
    return { ...message, quiz };
  });
}
