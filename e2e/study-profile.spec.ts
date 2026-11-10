import { expect, test } from "@playwright/test";

const field = "Corso di laurea o ambito di studio";
const defaultProfile = { studyProgram: "Ingegneria informatica", onboardingCompleted: true };

test("il primo accesso salva il percorso di studio e Account permette di modificarlo", async ({ page, request }) => {
  expect((await request.patch("/api/profile", { data: { studyProgram: "", onboardingCompleted: false } })).status()).toBe(200);
  try {
    await page.goto("/");
    const onboarding = page.getByRole("dialog", { name: "Cosa studi?", exact: true });
    await expect(onboarding).toBeVisible();
    await onboarding.getByRole("textbox", { name: field, exact: true }).fill("Laurea magistrale in matematica");
    await onboarding.getByRole("button", { name: "Inizia a studiare", exact: true }).click();
    await expect(onboarding).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "I tuoi esami", exact: true })).toBeVisible();
    expect(await (await request.get("/api/profile")).json()).toMatchObject({ studyProgram: "Laurea magistrale in matematica", onboardingCompleted: true });
    await page.reload();
    await expect(onboarding).toHaveCount(0);
    await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
    await page.getByRole("menuitem", { name: "Account", exact: true }).click();
    const account = page.getByRole("dialog", { name: "Il tuo account", exact: true });
    await expect(account.getByRole("textbox", { name: field, exact: true })).toHaveValue("Laurea magistrale in matematica");
    await account.getByRole("textbox", { name: field, exact: true }).fill("Laurea magistrale in fisica teorica");
    await account.getByRole("button", { name: "Salva profilo", exact: true }).click();
    await expect.poll(async () => (await (await request.get("/api/profile")).json()).studyProgram).toBe("Laurea magistrale in fisica teorica");
    await page.reload();
    await expect(onboarding).toHaveCount(0);
    await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
    await page.getByRole("menuitem", { name: "Account", exact: true }).click();
    await expect(account.getByRole("textbox", { name: field, exact: true })).toHaveValue("Laurea magistrale in fisica teorica");
  } finally { expect((await request.patch("/api/profile", { data: defaultProfile })).status()).toBe(200); }
});

test("il percorso di studio può essere impostato dopo senza ripetere l’onboarding", async ({ page, request }) => {
  expect((await request.patch("/api/profile", { data: { studyProgram: "", onboardingCompleted: false } })).status()).toBe(200);
  try {
    await page.goto("/");
    const onboarding = page.getByRole("dialog", { name: "Cosa studi?", exact: true });
    await expect(onboarding).toBeVisible();
    await onboarding.getByRole("button", { name: "Lo imposto dopo", exact: true }).click();
    await expect(onboarding).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "I tuoi esami", exact: true })).toBeVisible();
    expect(await (await request.get("/api/profile")).json()).toMatchObject({ studyProgram: "", onboardingCompleted: true });
    await page.reload();
    await expect(onboarding).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "I tuoi esami", exact: true })).toBeVisible();
  } finally { expect((await request.patch("/api/profile", { data: defaultProfile })).status()).toBe(200); }
});
