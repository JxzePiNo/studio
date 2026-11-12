/** Record entries, not a continuous heartbeat or activity while the tab is hidden. */
export function reportPlatformVisits(send: () => Promise<boolean>, page: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener"> = document, browser: Pick<Window, "addEventListener" | "removeEventListener"> = window, now: () => number = Date.now) {
  let lastSent = -Infinity, pending = false, disposed = false;
  const enter = async () => {
    if (disposed || pending || page.visibilityState !== "visible" || now() - lastSent < 15_000) return;
    pending = true;
    try { if (await send()) lastSent = now(); }
    catch { /* Recording a visit must never prevent studying. */ }
    finally { pending = false; }
  };
  const onEnter = () => { void enter(); };
  onEnter(); browser.addEventListener("focus", onEnter); browser.addEventListener("pageshow", onEnter); page.addEventListener("visibilitychange", onEnter);
  return () => { disposed = true; browser.removeEventListener("focus", onEnter); browser.removeEventListener("pageshow", onEnter); page.removeEventListener("visibilitychange", onEnter); };
}
