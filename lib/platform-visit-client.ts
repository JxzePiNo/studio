/** Refresh visible presence; failed sends are retried without requiring a reload. */
export function reportPlatformVisits(send: () => Promise<boolean>, page: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener"> = document, browser: Pick<Window, "addEventListener" | "removeEventListener"> = window, now: () => number = Date.now, schedule = (tick: () => void) => { const timer = setInterval(tick, 60_000); return () => clearInterval(timer); }) {
  let lastSent = -Infinity, pending = false, disposed = false;
  const enter = async () => {
    if (disposed || pending || page.visibilityState !== "visible" || now() - lastSent < 15_000) return;
    pending = true;
    try { if (await send()) lastSent = now(); }
    catch { /* Recording a visit must never prevent studying. */ }
    finally { pending = false; }
  };
  const onEnter = () => { void enter(); };
  const stopTimer = schedule(onEnter);
  onEnter(); browser.addEventListener("focus", onEnter); browser.addEventListener("pageshow", onEnter); browser.addEventListener("online", onEnter); page.addEventListener("visibilitychange", onEnter);
  return () => { disposed = true; stopTimer(); browser.removeEventListener("focus", onEnter); browser.removeEventListener("pageshow", onEnter); browser.removeEventListener("online", onEnter); page.removeEventListener("visibilitychange", onEnter); };
}
