import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import type { FriendPerson, FriendsOverview } from "../lib/friends-types";
import type { SharingOverview } from "../lib/sharing-types";

test("friends profile edits photo and identity, with Tony first and privacy in settings", async ({ page, request }) => {
  const old = await (await request.get("/api/profile")).json();
  const preferences = { discoverable: true, shareActivity: true };
  await page.route("**/api/friends**", route => {
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      if (input.action === "settings") Object.assign(preferences, { discoverable: input.discoverable, shareActivity: input.shareActivity });
      return route.fulfill({ json: { ok: true } });
    }
    if (new URL(route.request().url()).searchParams.has("search")) return route.fulfill({ json: { people: [], truncated: false } });
    return route.fulfill({ json: { available: true, self: { enabled: true, ...preferences, name: "Alice" }, friends: [], incoming: [], outgoing: [], leaderboard: [], period: "day" } });
  });
  try {
    await page.goto("/amici", { waitUntil: "domcontentloaded" });
    const tabs = page.getByRole("tablist", { name: "Sezioni amici", exact: true });
    await expect(tabs.getByRole("tab")).toHaveCount(2);
    await expect(page.getByText("Non ti preoccupare, saremo per sempre amici.", { exact: true })).toBeVisible();
    const hero = page.getByRole("region", { name: "Il tuo profilo amici", exact: true });
    await hero.getByRole("button", { name: "Modifica profilo", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Modifica profilo", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Chiudi modifica profilo", exact: true }).click();
    await page.getByRole("button", { name: "Impostazioni amici", exact: true }).click();
    await expect(page.locator('[data-radix-popper-content-wrapper]').getByRole("button", { name: "Modifica profilo", exact: true })).toHaveCount(0);
    for (const name of ["Visibilità del profilo", "Stato e statistiche"]) {
      const toggle = page.getByRole("switch", { name, exact: true });
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await expect(toggle).toBeEnabled();
      await toggle.focus(); await toggle.press("Space");
      await expect(toggle).toHaveAttribute("aria-checked", "true");
    }
    await page.getByRole("button", { name: "Chiudi impostazioni amici", exact: true }).click();
    await hero.getByRole("button", { name: "Modifica profilo", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Modifica profilo", exact: true });
    const image = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = canvas.height = 10; const context = canvas.getContext("2d")!; context.fillStyle = "red"; context.fillRect(0, 0, 10, 10); return canvas.toDataURL("image/png").split(",")[1]; });
    await dialog.getByLabel("Cambia foto profilo", { exact: true }).setInputFiles({ name: "profilo.png", mimeType: "image/png", buffer: Buffer.from(image, "base64") });
    await dialog.getByRole("textbox", { name: "Nome e cognome", exact: true }).fill("Alice Foto");
    const saved = page.waitForResponse(response => response.url().endsWith("/api/profile") && response.request().method() === "PATCH");
    await dialog.getByRole("button", { name: "Salva profilo", exact: true }).click();
    expect((await saved).ok()).toBe(true);
    await expect(dialog).not.toBeVisible();
    const profile = page.getByRole("region", { name: "Il tuo profilo amici", exact: true });
    await expect(profile.getByRole("heading", { name: "Alice Foto", exact: true })).toBeVisible();
    await expect(profile.getByRole("img", { name: "Foto di Alice Foto", exact: true })).toHaveAttribute("src", /^data:image\/jpeg;base64,/);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(profile.getByRole("img", { name: "Foto di Alice Foto", exact: true })).toHaveAttribute("src", /^data:image\/jpeg;base64,/);
  } finally { await request.patch("/api/profile", { data: { studyProgram: old.studyProgram, onboardingCompleted: old.onboardingCompleted, displayName: old.displayName || "", university: old.university, nickname: old.nickname, photoURL: old.photoURL || "" } }); }
});

for (const width of [1280, 390]) test(`friends, search, daily ranking and multiple recipients at ${width}px`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 900 });
  const bob: FriendPerson = { id: "bob", name: "Bob Rossi", nickname: "bob", university: "Università di Roma", studyProgram: "Informatica", status: "studying" };
  const carol: FriendPerson = { ...bob, id: "carol", name: "Carol Bianchi", nickname: "carol", status: "online" };
  const state: FriendsOverview = { available: true, self: { enabled: true, discoverable: true, shareActivity: true, name: "Alice", nickname: "alice", university: "Università di Roma" }, friends: [bob], incoming: [carol], outgoing: [], leaderboard: [{ ...bob, durationMs: 3600000, pages: 3 }, { ...carol, durationMs: 1800000, pages: 9 }], period: "day" };
  const shares: SharingOverview = { available: true, received: [], sent: [], publicCourses: [] };
  const mutations: any[] = [];
  const periods: string[] = [];
  await page.route("**/api/friends**", async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET") {
      if (url.searchParams.has("search")) return route.fulfill({ json: { people: [{ ...carol, id: "dave", name: "Davide Verdi", nickname: "davide", relationship: "none" }], truncated: false } });
      state.period = (url.searchParams.get("period") || "day") as FriendsOverview["period"]; periods.push(state.period);
      return route.fulfill({ json: state });
    }
    const input = route.request().postDataJSON();
    if (input.action === "relationship" && input.operation === "accept") { state.incoming = []; state.friends.push(carol); }
    if (input.action === "relationship" && input.operation === "request") state.outgoing.push({ ...carol, id: input.targetId, name: "Davide Verdi" });
    if (input.action === "relationship" && input.operation === "cancel") state.outgoing = state.outgoing.filter(person => person.id !== input.targetId);
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/sharing**", async route => {
    if (new URL(route.request().url()).searchParams.has("workspace")) return route.fulfill({ json: { owner: true, members: [] } });
    if (route.request().method() === "POST") { mutations.push(route.request().postDataJSON()); return route.fulfill({ json: { id: crypto.randomUUID() } }); }
    return route.fulfill({ json: shares });
  });
  const folder = await (await request.post("/api/folders", { data: { name: `Condivisione ${width} ${Date.now()}` } })).json();
  try {
    await page.goto("/amici", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("region", { name: "Il tuo profilo amici", exact: true })).toBeVisible();
    const incoming = page.getByRole("region", { name: "Richieste ricevute", exact: true });
    const toggle = incoming.getByRole("button", { name: /Richieste ricevute/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(incoming.getByRole("button", { name: "Accetta richiesta di Carol Bianchi", exact: true })).toHaveCount(0);
    await incoming.screenshot({ path: `test-results/requests-collapsed-${width}.png` });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await incoming.screenshot({ path: `test-results/requests-expanded-${width}.png` });
    await expect(page.getByRole("button", { name: /(?:Attiva|Disattiva) Amici/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Accetta richiesta di Carol Bianchi", exact: true }).click();
    await expect(page.getByText("Ora tu e Carol Bianchi siete amici.", { exact: true })).toBeVisible();
    await expect(page.getByText("Sta studiando", { exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Nome o username", exact: true }).fill("@davide");
    await page.getByRole("button", { name: "Cerca", exact: true }).click();
    await expect(page.getByText("Davide Verdi", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Invia richiesta a Davide Verdi", exact: true }).click();
    await expect(page.getByText("Richiesta inviata.", { exact: true })).toBeVisible();
    const outgoing = page.getByRole("region", { name: "Richieste inviate", exact: true });
    await outgoing.getByRole("button", { name: /Richieste inviate/ }).click();
    await outgoing.getByRole("button", { name: "Annulla richiesta a Davide Verdi", exact: true }).click();
    await expect(outgoing).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/friends-ranking-${width}.png`, fullPage: true });
    if (width === 390) {
      const nav = page.getByRole("navigation", { name: "Navigazione principale", exact: true });
      await expect(nav.getByRole("button", { name: "Amici", exact: true })).toHaveAttribute("aria-current", "page");
    } else await expect(page.getByRole("button", { name: "Amici", exact: true })).toHaveAttribute("aria-current", "page");
    await page.goto(`/esami/${folder.id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Condividi", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Condividi corso", exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Bob Rossi").check(); await dialog.getByLabel("Carol Bianchi").check();
    await dialog.getByRole("checkbox", { name: /Invita come coautori/ }).check();
    await page.screenshot({ path: `test-results/share-multiple-${width}.png`, fullPage: true });
    await dialog.getByRole("button", { name: "Invita coautori", exact: true }).click();
    await expect.poll(() => mutations.length).toBe(1);
    expect(mutations[0]).toMatchObject({ action: "create", kind: "course", sourceId: folder.id, recipientIds: ["bob", "carol"], mode: "coauthor", includeChat: false, includeResults: false });
    await expect(dialog.getByRole("status")).toContainText("Condivisione inviata a 2 persone.");
    await dialog.getByRole("radio", { name: /Pubblico/ }).check();
    await expect(dialog.getByText("Un punto di partenza pulito.", { exact: true })).toBeVisible();
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});

test("upload provenance remains fixed when the student's university changes", async ({ page, request }) => {
  const old = await (await request.get("/api/profile")).json();
  const folder = await (await request.post("/api/folders", { data: { name: `Provenienza ${Date.now()}` } })).json();
  const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = Buffer.from(await pdf.save());
  try {
    await request.patch("/api/profile", { data: { studyProgram: "Informatica", onboardingCompleted: true, university: "Università di Roma", nickname: "alice_test" } });
    const upload = async (name: string) => (await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name, mimeType: "application/pdf", buffer: bytes } } })).json());
    const rome = await upload("Roma.pdf");
    await request.patch("/api/profile", { data: { studyProgram: "Informatica", onboardingCompleted: true, university: "Università di Milano" } });
    const milan = await upload("Milano.pdf");
    expect(rome.provenance.university).toBe("Università di Roma"); expect(milan.provenance.university).toBe("Università degli Studi di Milano");
    expect((await (await request.get(`/api/documents/${rome.id}`)).json()).provenance.university).toBe("Università di Roma");
    await page.goto(`/esami/${folder.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Università di Roma", { exact: true })).toBeVisible();
    await expect(page.getByText("Università degli Studi di Milano", { exact: true })).toBeVisible();
  } finally {
    await request.delete(`/api/folders/${folder.id}`);
    await request.patch("/api/profile", { data: { studyProgram: old.studyProgram, onboardingCompleted: old.onboardingCompleted, ...(old.displayName ? { displayName: old.displayName } : {}), university: old.university || "", nickname: old.nickname || "" } });
  }
});

test("a public course displays its original university and opens the imported personal space", async ({ page, request }) => {
  const folder = await (await request.post("/api/folders", { data: { name: `Corso importato ${Date.now()}` } })).json();
  const shareId = crypto.randomUUID();
  let imported = false;
  await page.route("**/api/sharing**", async route => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({ action: "import", shareId }); imported = true;
      return route.fulfill({ json: { folderId: folder.id } });
    }
    return route.fulfill({ json: { available: true, received: [], sent: [], publicCourses: [{ id: shareId, kind: "course", title: "Appunti di algoritmi", ownerId: "bob", ownerName: "Bob Rossi", sourceId: crypto.randomUUID(), visibility: "public", mode: "copy", includeChat: false, includeResults: false, recipientIds: [], active: true, ready: true, documentCount: 3, createdAt: new Date().toISOString(), provenance: { university: "Università di Roma", studyProgram: "Informatica", authorName: "Bob Rossi" } }] } });
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const publicCourses = page.getByRole("region", { name: "Corsi pubblici", exact: true });
    await expect(publicCourses.getByText("Università di Roma", { exact: true })).toBeVisible();
    await publicCourses.getByRole("button", { name: "Usa nel mio spazio", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/esami/${folder.id}$`));
    expect(imported).toBe(true);
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});
