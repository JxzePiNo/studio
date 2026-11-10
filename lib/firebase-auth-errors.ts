const sessionCodes = new Set([
  "auth/argument-error", "auth/invalid-argument", "auth/invalid-id-token",
  "auth/id-token-expired", "auth/id-token-revoked", "auth/user-disabled",
  "auth/user-not-found", "auth/tenant-id-mismatch", "auth/mismatching-tenant-id",
]);

/** Classify SDK failures without returning the original message or credentials. */
export function firebaseAuthFailure(error: unknown, stage: "initialize" | "verify" = "verify") {
  const rawCode = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "unknown";
  const code = /^[a-z0-9/_-]{1,80}$/i.test(rawCode) ? rawCode : "unknown";
  const message = error instanceof Error ? error.message : error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "";
  let reason = "unspecified";
  if (/invalid (?:jwt )?signature/i.test(message)) reason = "invalid-service-account-signature";
  else if (/could not load (?:the )?default credentials|metadata\.google|ENOENT/i.test(message)) reason = "default-credentials-unavailable";
  else if (/account.*(?:disabled|deleted|not found)|invalid email/i.test(message)) reason = "service-account-unavailable";
  else if (/invalid_grant/i.test(message)) reason = "service-account-token-rejected";
  else if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|fetch failed/i.test(message)) reason = "network-error";

  const isSessionFailure = stage === "verify" && sessionCodes.has(code);
  const status = isSessionFailure ? 401 : 503;
  const publicMessage = isSessionFailure ? "Sessione non valida. Accedi nuovamente."
    : stage === "initialize" ? "Configurazione Firebase del server non valida. Controlla le credenziali e il bucket nelle variabili del deployment."
    : code === "app/invalid-credential" || code === "auth/invalid-credential" ? "Firebase Admin non riesce ad autenticarsi con le credenziali del server. Controlla FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY nel deployment."
    : code === "auth/insufficient-permission" ? "Il server non dispone dei permessi Firebase necessari. Controlla l'account di servizio."
    : "Il servizio Firebase non è disponibile per il server. Controlla i log del deployment e riprova.";
  return { code, reason, status, error: publicMessage };
}

/** Only names/presence are logged, never environment values or file paths. */
export function firebaseCredentialDiagnostics(env: Record<string, string | undefined>) {
  const required = ["FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "NEXT_PUBLIC_FIREBASE_PROJECT_ID"];
  return {
    credentialSource: env.FIREBASE_PRIVATE_KEY?.trim() ? "environment-service-account" : "application-default",
    missingEnvironmentVariables: required.filter(name => !env[name]?.trim()),
  };
}
