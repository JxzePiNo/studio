import { test, expect } from "@playwright/test";
import { createExam } from "./exam-helpers";

test("an empty startup response reports HTTP status and endpoint, then allows retry", async ({ page }) => {
  let failed = false;
  await page.route("**/api/profile", async route => {
    if (!failed) {
      failed = true;
      await route.fulfill({ status: 502, body: "" });
    } else await route.fulfill({ json: { studyProgram: "Ingegneria informatica", onboardingCompleted: true, nickname: "studio_test", university: "Roma" } });
  });
  await page.goto("/");
  const error = page.getByRole("main").getByRole("alert");
  await expect(error).toContainText("HTTP 502 - /api/profile");
  await expect(error).not.toContainText("Unexpected end of JSON");
  await page.getByRole("button", { name: "Riprova", exact: true }).click();
  await expect(page.getByRole("heading", { name: "I tuoi esami", exact: true })).toBeVisible();
});

test("a delayed initial refresh cannot hide a newly created exam", async ({ page }) => {
  let release!: () => void;
  let captured!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const capturedInitial = new Promise<void>(resolve => { captured = resolve; });
  let held = false;
  await page.route("**/api/folders", async route => {
    if (route.request().method() !== "GET" || held) return route.fallback();
    held = true;
    const result = await route.fetch();
    const snapshot = await result.json();
    captured(); await waiting;
    await route.fulfill({ json: snapshot, headers: { "x-test-stale": "true" } });
  });
  try {
    await page.goto("/");
    await capturedInitial;
    const exam = await createExam(page, "Esame appena creato");
    const delivered = page.waitForResponse(response => response.headers()["x-test-stale"] === "true");
    release(); await (await delivered).finished();
    await page.getByRole("button", { name: "Torna alla home", exact: true }).click();
    await expect(page.getByRole("button", { name: `Apri esame ${exam.name}`, exact: true })).toBeVisible();
  } finally { release(); }
});
