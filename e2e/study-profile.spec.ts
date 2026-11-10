import { expect, test } from "@playwright/test";

const field = "Corso di laurea o ambito di studio";
const defaultProfile = { studyProgram: "Ingegneria informatica", onboardingCompleted: true };

test("il primo accesso salva il percorso di studio e Account permette di modificarlo", async ({ page, request }) => {
  expect((await request.patch("/api/profile", { data: { studyProgram: "", onboardingCompleted: false } })).status()).toBe(200);
  try {
    await page.goto("/");
    const onboarding = page.getByRole("dialog", { name: "Cosa studi?", exact: true });
    await expect(onboarding).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/degree-onboarding-clean.png" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await onboarding.getByRole("combobox", { name: field, exact: true }).fill("Laurea magistrale in matematica");
    await onboarding.getByRole("button", { name: "Continua", exact: true }).click();
    await expect(onboarding).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "I tuoi esami", exact: true })).toBeVisible();
    expect(await (await request.get("/api/profile")).json()).toMatchObject({ studyProgram: "Laurea magistrale in matematica", onboardingCompleted: true });
    await page.reload();
    await expect(onboarding).toHaveCount(0);
    await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
    await page.getByRole("menuitem", { name: "Account", exact: true }).click();
    const account = page.getByRole("dialog", { name: "Il tuo account", exact: true });
    await expect(account.getByRole("textbox", { name: "Titolo o percorso di studio", exact: true })).toHaveValue("Laurea magistrale in matematica");
    await account.getByRole("textbox", { name: "Titolo o percorso di studio", exact: true }).fill("Laurea magistrale in fisica teorica");
    await account.getByRole("button", { name: "Salva profilo", exact: true }).click();
    await expect.poll(async () => (await (await request.get("/api/profile")).json()).studyProgram).toBe("Laurea magistrale in fisica teorica");
    await page.reload();
    await expect(onboarding).toHaveCount(0);
    await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
    await page.getByRole("menuitem", { name: "Account", exact: true }).click();
    await expect(account.getByRole("textbox", { name: "Titolo o percorso di studio", exact: true })).toHaveValue("Laurea magistrale in fisica teorica");
  } finally { expect((await request.patch("/api/profile", { data: defaultProfile })).status()).toBe(200); }
});

test("an empty saved program always asks again and accepts custom programs", async ({ page, request }) => {
  expect((await request.patch("/api/profile", { data: { studyProgram: "", onboardingCompleted: true } })).status()).toBe(200);
  try {
    await page.goto("/");
    const onboarding = page.getByRole("dialog", { name: "Cosa studi?", exact: true });
    await expect(onboarding).toBeVisible();
    await expect(onboarding.getByRole("button", { name: "Continua", exact: true })).toBeDisabled();
    await expect(onboarding.getByRole("combobox")).toHaveCount(1);
    await onboarding.getByRole("combobox").fill("Laurea personalizzata in Robotica cognitiva");
    await onboarding.getByRole("button", { name: "Continua", exact: true }).click();
    await expect(onboarding).toHaveCount(0);
    await page.reload();
    await expect(onboarding).toHaveCount(0);
    expect(await (await request.get("/api/profile")).json()).toMatchObject({ studyProgram: "Laurea personalizzata in Robotica cognitiva", onboardingCompleted: true });
  } finally { await request.patch("/api/profile", { data: defaultProfile }); }
});
