import { expect, test } from "@playwright/test";

test("a shared profile link opens the intended person and sends a request only after a click", async ({ page }) => {
  let requested = false;
  const person = { id: "bob", name: "Bob Rossi", nickname: "bob", university: "Roma", studyProgram: "Informatica", relationship: "none" };
  await page.route("**/api/friends**", async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === "POST") {
      if (request.postDataJSON().action === "presence") return route.fulfill({ json: { enabled: false } });
      expect(request.postDataJSON()).toEqual({ action: "relationship", targetId: "bob", operation: "request" });
      requested = true;
      return route.fulfill({ json: { ok: true } });
    }
    if (url.searchParams.has("profile")) {
      expect(url.searchParams.get("profile")).toBe("bob");
      return route.fulfill({ json: { person: { ...person, relationship: requested ? "outgoing" : "none" } } });
    }
    if (url.searchParams.has("search")) return route.fulfill({ json: { people: [], truncated: false } });
    return route.fulfill({ json: { available: true, self: null, friends: [], incoming: [], outgoing: [], leaderboard: [], period: "day", enabled: false, online: [], studying: [] } });
  });
  await page.goto("/amici?profilo=bob", { waitUntil: "domcontentloaded" });
  const profile = page.getByLabel("Profilo condiviso", { exact: true });
  await expect(profile).toContainText("Bob Rossi");
  expect(requested).toBe(false);
  await profile.getByRole("button", { name: "Aggiungi agli amici" }).click();
  await expect(profile).toContainText("Richiesta inviata");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(profile).toContainText("Richiesta inviata");
});
