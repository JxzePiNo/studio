"use client";
import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { firebaseEnabled } from "@/lib/firebase-client";
import { captureReferral, referralRequest, referralStorageKey } from "@/lib/referral-client";
import { ApiResponseError } from "@/lib/api-response";

export function useReferralCapture(user: User | null) {
  const [readyUser, setReadyUser] = useState<string | null>(null);
  const code = useRef<string | undefined>(undefined);
  useEffect(() => {
    const url = new URL(window.location.href);
    try { code.current = captureReferral(url, localStorage); }
    catch { const value = url.searchParams.get("ref"); if (value && /^[a-f0-9]{24}$/.test(value)) code.current = value; }
    if (url.searchParams.has("ref")) { url.searchParams.delete("ref"); history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`); }
  }, []);
  useEffect(() => {
    if (!firebaseEnabled || !user) return;
    if (!code.current) { setReadyUser(user.uid); return; }
    let busy = false;
    const controller = new AbortController();
    const clear = () => { code.current = undefined; try { localStorage.removeItem(referralStorageKey); } catch {} };
    const claim = async () => {
      if (!code.current || busy || document.visibilityState !== "visible") return;
      busy = true;
      try { await referralRequest({ action: "claim", code: code.current }, controller.signal); clear(); }
      catch (error) { if (error instanceof ApiResponseError && [400, 404, 409].includes(error.status)) clear(); }
      finally { busy = false; if (!controller.signal.aborted) setReadyUser(user.uid); }
    };
    void claim();
    const retry = () => { void claim(); };
    window.addEventListener("focus", retry);
    const timer = setInterval(retry, 30000);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", retry); };
  }, [user]);
  return !firebaseEnabled || (!!user && readyUser === user.uid);
}
