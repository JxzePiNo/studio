import { Storage } from "@google-cloud/storage";
import { Firestore } from "@google-cloud/firestore";
import { GoogleAuth, JWT } from "google-auth-library";

/** Construct a typed auth client instead of passing deprecated credentials JSON. */
export function createGoogleServices(options: { projectId?: string; email?: string; privateKey?: string }) {
  const authClient = options.privateKey ? new JWT({
    email: options.email,
    key: options.privateKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  }) : undefined;
  const auth = new GoogleAuth({ projectId: options.projectId, authClient });
  return {
    db: new Firestore({ projectId: options.projectId, auth }),
    storage: new Storage({ projectId: options.projectId, authClient: auth }),
  };
}
