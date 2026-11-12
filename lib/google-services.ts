import { Storage } from "@google-cloud/storage";
import { Firestore } from "@google-cloud/firestore";
import { GoogleAuth, JWT } from "google-auth-library";

/** Construct a typed auth client instead of passing deprecated credentials JSON. */
export function createGoogleServices(options: { projectId?: string; email?: string; privateKey?: string }) {
  const scopes = ["https://www.googleapis.com/auth/cloud-platform"];
  const authClient = options.privateKey ? new JWT({
    email: options.email,
    key: options.privateKey.replace(/\\n/g, "\n"),
    scopes,
  }) : undefined;
  // ADC loaded from GOOGLE_APPLICATION_CREDENTIALS also needs explicit scopes.
  // Without them JWT.authorizeRequest({ uri }) can return no Authorization header.
  const auth = new GoogleAuth({ projectId: options.projectId, authClient, scopes });
  return {
    db: new Firestore({ projectId: options.projectId, auth }),
    storage: new Storage({ projectId: options.projectId, authClient: auth }),
  };
}
