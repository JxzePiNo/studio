export const defaultNicknames: Readonly<Record<string, string>> = {
  antea: "Antee",
  giulio: "Zecchi",
  carlo: "Carletto",
  francesco: "Franci",
  elia: "Eli",
  valentina: "Vale",
  iacopo: "Pino",
};

/** Presentation only: preserve the account's original display name. */
export function userNickname(displayName: string | null | undefined, nicknames: Readonly<Record<string, string>> = defaultNicknames): string {
  const firstName = displayName?.trim().split(/\s+/)[0] || "";
  const key = firstName.toLocaleLowerCase("it-IT");
  return Object.hasOwn(nicknames, key) ? nicknames[key] : firstName;
}
