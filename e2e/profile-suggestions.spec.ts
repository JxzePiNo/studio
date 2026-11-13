import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) test(`profile suggests degrees, universities and dotted usernames at ${width}px`, async ({ page, request }) => {
  const previous = await (await request.get("/api/profile")).json();
  const base = { studyProgram: "Informatica", onboardingCompleted: true, displayName: "Iacopo Paolucci", university: "", nickname: "" };
  await request.patch("/api/profile", { data: base });
  await page.setViewportSize({ width, height: 900 });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const onboarding = page.getByRole("dialog", { name: "Completa il tuo profilo", exact: true });
    const username = onboarding.getByRole("textbox", { name: "Username", exact: true });
    await expect(onboarding.getByRole("textbox", { name: "Città", exact: true })).toHaveCount(0);
    await expect(username).toHaveValue("iacopo.paolucci");
    const university = onboarding.getByRole("combobox", { name: "Università", exact: true });
    await university.fill("Firenze");
    await expect(onboarding.getByRole("option", { name: "Università degli Studi di Firenze", exact: true })).toBeVisible();
    await university.press("ArrowDown"); await university.press("Enter");
    await expect(university).toHaveValue("Università degli Studi di Firenze");
    await expect(onboarding).toBeVisible();
    await page.screenshot({ path: `test-results/profile-suggestions-${width}.png` });
    await onboarding.getByRole("button", { name: "Continua", exact: true }).click();
    await expect(onboarding).toHaveCount(0);
    expect(await (await request.get("/api/profile")).json()).toMatchObject({ nickname: "iacopo.paolucci", university: "Università degli Studi di Firenze" });
    await page.getByRole("button", { name: width === 390 ? "Account" : "Apri menu account", exact: true }).click();
    await page.getByRole("menuitem", { name: "Account", exact: true }).click();
    const account = page.getByRole("dialog", { name: "Il tuo account", exact: true });
    const degree = account.getByRole("combobox", { name: "Titolo o percorso di studio", exact: true });
    await degree.fill("triennale informatica");
    await account.getByRole("option", { name: "Laurea triennale in Informatica", exact: true }).click();
    const uni = account.getByRole("combobox", { name: "Università", exact: true });
    await uni.fill("polimi");
    await account.getByRole("option", { name: "Politecnico di Milano", exact: true }).click();
    await account.getByRole("textbox", { name: "Username", exact: true }).fill("@iacopo.paolucci2");
    await account.getByRole("button", { name: "Salva profilo", exact: true }).click();
    await expect(account.getByRole("status")).toHaveText("Profilo salvato.");
    expect(await (await request.get("/api/profile")).json()).toMatchObject({ studyProgram: "Laurea triennale in Informatica", university: "Politecnico di Milano", nickname: "iacopo.paolucci2" });
  } finally {
    await request.patch("/api/profile", { data: { studyProgram: previous.studyProgram, onboardingCompleted: previous.onboardingCompleted, displayName: previous.displayName || "", university: previous.university || "", nickname: previous.nickname || "studio_test" } });
  }
});
