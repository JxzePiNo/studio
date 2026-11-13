export const USERNAME_PATTERN = "[a-z0-9_][a-z0-9._]{1,22}[a-z0-9_]";
export function normalizeUsername(value: string) { return value.trim().replace(/^@+/, "").toLowerCase(); }
export function validUsername(value: string) { return new RegExp(`^${USERNAME_PATTERN}$`).test(value) && !value.includes(".."); }
export function suggestUsername(name: string) {
  const value = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 24).replace(/\.+$/g, "");
  return validUsername(value) ? value : "";
}
