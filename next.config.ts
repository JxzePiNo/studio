import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.MARGINE_E2E === "true" ? process.env.STUDIO_E2E_READER === "true" ? ".next-e2e-reader" : ".next-e2e" : ".next",
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["pdf-lib"],
  rewrites() {
    if (process.env.NEXT_PUBLIC_FIREBASE_AUTH_PROXY !== "true") return [];
    const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
    // Restrict this fixed upstream to Firebase Hosting project domains. Never
    // accept a URL, port, path or request-controlled proxy destination.
    if (!authDomain || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:firebaseapp\.com|web\.app)$/i.test(authDomain)) {
      throw new Error("Firebase auth proxy requires NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN to be a project hostname ending in .firebaseapp.com or .web.app (without protocol or path).");
    }
    return [{
      source: "/__/auth/:path*",
      destination: `https://${authDomain}/__/auth/:path*`,
    }];
  },
};
export default nextConfig;
