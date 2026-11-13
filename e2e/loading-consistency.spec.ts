import { expect, test } from "@playwright/test";

test("profile, welcome checks and friends reuse the PDF loading style", async ({ page }) => {
  let releaseProfile!: () => void, releaseWelcome!: () => void, releaseFriends!: () => void;
  const profileGate = new Promise<void>(resolve => { releaseProfile = resolve; });
  const welcomeGate = new Promise<void>(resolve => { releaseWelcome = resolve; });
  const friendsGate = new Promise<void>(resolve => { releaseFriends = resolve; });
  await page.route("**/api/profile", async route => { await profileGate; await route.continue(); });
  await page.route("**/api/referrals/greetings", async route => { await welcomeGate; await route.fulfill({ json: { welcome: false, greeting: null } }); });
  await page.route("**/api/friends**", async route => {
    await friendsGate;
    const url = new URL(route.request().url());
    return route.fulfill({ json: url.searchParams.has("search") ? { people: [], truncated: false } : { available: true, self: null, friends: [], incoming: [], outgoing: [], leaderboard: [], period: "day" } });
  });
  try {
    await page.goto("/amici", { waitUntil: "domcontentloaded" });
    const loader = page.locator('[data-loading="tony"]').first();
    await expect(loader).toBeVisible();
    const cssClass = (await loader.getAttribute("class"))!.split(" ")[0];
    const background = await loader.evaluate(element => getComputedStyle(element).backgroundImage);
    expect(background).toContain("radial-gradient");
    releaseProfile();
    await expect(page.getByRole("status").filter({ hasText: "Caricamento del tuo spazio." })).toBeAttached();
    await expect(loader).toHaveClass(new RegExp(cssClass));
    expect(await loader.evaluate(element => getComputedStyle(element).backgroundImage)).toBe(background);
    releaseWelcome();
    await expect(page.getByRole("status").filter({ hasText: "Caricamento amici." })).toBeAttached();
    await expect(loader).toHaveClass(new RegExp(cssClass));
    expect(await loader.evaluate(element => getComputedStyle(element).backgroundImage)).toBe(background);
    await page.screenshot({ path: "test-results/friends-standard-loading.png", animations: "disabled" });
    releaseFriends();
    await expect(page.getByRole("region", { name: "Il tuo profilo amici", exact: true })).toBeVisible();
  } finally { releaseProfile(); releaseWelcome(); releaseFriends(); }
});
