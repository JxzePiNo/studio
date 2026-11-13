import { expect, test } from "@playwright/test";

const field = "Corso di laurea o ambito di studio";
const defaultProfile = { studyProgram: "Ingegneria informatica", onboardingCompleted: true, university: "Universit\u00e0 degli Studi di Roma La Sapienza" };

test("an existing profile asks only for missing social information and keeps it after reload", async ({ page, request }) => {
  await request.patch("/api/profile", { data: { ...defaultProfile, nickname: "existing_user", university: "" } });
  try {
    await page.goto("/amici", { waitUntil: "domcontentloaded" });
    const onboarding = page.getByRole("dialog", { name: "Completa il tuo profilo", exact: true });
    await expect(onboarding).toBeVisible();
    await expect(onboarding.getByRole("textbox", { name: "Username", exact: true })).toHaveValue("existing_user");
    await expect(onboarding.getByRole("button", { name: "Continua", exact: true })).toBeDisabled();
    await expect(onboarding.getByRole("textbox", { name: "Città", exact: true })).toHaveCount(0);
    await onboarding.getByRole("combobox", { name: "Università", exact: true }).fill("Università degli Studi di Milano");
    const saved = page.waitForResponse(response => new URL(response.url()).pathname === "/api/profile" && response.request().method() === "PATCH");
    await onboarding.getByRole("button", { name: "Continua", exact: true }).click();
    expect((await saved).ok()).toBe(true);
    await expect(onboarding).toHaveCount(0);
    expect(await (await request.get("/api/profile")).json()).toMatchObject({ nickname: "existing_user", university: "Universit\u00e0 degli Studi di Milano" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(onboarding).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Il tuo profilo amici", exact: true })).toBeVisible();
  } finally { await request.patch("/api/profile", { data: { ...defaultProfile, nickname: "studio_test" } }); }
});

test("il primo accesso salva il percorso di studio e Account permette di modificarlo", async ({ page, request }) => {
  expect((await request.patch("/api/profile", { data: { studyProgram: "", onboardingCompleted: false, nickname: "" } })).status()).toBe(200);
  try {
    await page.goto("/");
    const onboarding = page.getByRole("dialog", { name: "Cosa studi?", exact: true });
    await expect(onboarding).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/degree-onboarding-clean.png" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await onboarding.getByRole("combobox", { name: field, exact: true }).fill("Laurea magistrale in matematica");
    await expect(onboarding.getByRole("button", { name: "Continua", exact: true })).toBeDisabled();
    await onboarding.getByRole("textbox", { name: "Username", exact: true }).fill("alice_test");
    await expect(onboarding.getByRole("textbox", { name: "Città", exact: true })).toHaveCount(0);
    await onboarding.getByRole("button", { name: "Continua", exact: true }).click();
    await expect(onboarding).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "I tuoi esami", exact: true })).toBeVisible();
    expect(await (await request.get("/api/profile")).json()).toMatchObject({ studyProgram: "Laurea magistrale in matematica", onboardingCompleted: true, nickname: "alice_test" });
    await page.reload();
    await expect(onboarding).toHaveCount(0);
    await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
    await page.getByRole("menuitem", { name: "Account", exact: true }).click();
    const account = page.getByRole("dialog", { name: "Il tuo account", exact: true });
    await expect(account.getByRole("combobox", { name: "Titolo o percorso di studio", exact: true })).toHaveValue("Laurea magistrale in matematica");
    await account.getByRole("combobox", { name: "Titolo o percorso di studio", exact: true }).fill("Laurea magistrale in fisica teorica");
    await account.getByRole("button", { name: "Salva profilo", exact: true }).click();
    await expect.poll(async () => (await (await request.get("/api/profile")).json()).studyProgram).toBe("Laurea magistrale in fisica teorica");
    await page.reload();
    await expect(onboarding).toHaveCount(0);
    await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
    await page.getByRole("menuitem", { name: "Account", exact: true }).click();
    await expect(account.getByRole("combobox", { name: "Titolo o percorso di studio", exact: true })).toHaveValue("Laurea magistrale in fisica teorica");
  } finally { expect((await request.patch("/api/profile", { data: defaultProfile })).status()).toBe(200); }
});

test("an empty saved program always asks again and accepts custom programs", async ({ page, request }) => {
  expect((await request.patch("/api/profile", { data: { studyProgram: "", onboardingCompleted: true } })).status()).toBe(200);
  try {
    await page.goto("/");
    const onboarding = page.getByRole("dialog", { name: "Cosa studi?", exact: true });
    await expect(onboarding).toBeVisible();
    await expect(onboarding.getByRole("button", { name: "Continua", exact: true })).toBeDisabled();
    await expect(onboarding.getByRole("combobox", { name: field, exact: true })).toHaveCount(1);
    await expect(onboarding.getByRole("combobox", { name: "Università", exact: true })).toHaveCount(1);
    await onboarding.getByRole("combobox", { name: field, exact: true }).fill("Laurea personalizzata in Robotica cognitiva");
    await onboarding.getByRole("button", { name: "Continua", exact: true }).click();
    await expect(onboarding).toHaveCount(0);
    await page.reload();
    await expect(onboarding).toHaveCount(0);
    expect(await (await request.get("/api/profile")).json()).toMatchObject({ studyProgram: "Laurea personalizzata in Robotica cognitiva", onboardingCompleted: true });
  } finally { await request.patch("/api/profile", { data: defaultProfile }); }
});
