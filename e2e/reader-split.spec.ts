import { test, expect, type Locator, type Page } from "@playwright/test";
import { createExam } from "./exam-helpers";

async function drag(page: Page, divider: Locator, x: number, y: number) {
  await divider.hover();
  const box = (await divider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.up();
}

test("chat divider resizes, closes and reopens without losing the draft on desktop and mobile", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.route("**/api/status", route => route.fulfill({ json: { configured: true } }));
  await page.goto("/");
  await createExam(page, "Divisore chat");
  const uploaded = page.waitForResponse(r => r.url().endsWith("/api/documents") && r.request().method() === "POST");
  await page.getByLabel("Carica un PDF", { exact: true }).setInputFiles("public/esempio.pdf");
  const doc = await (await uploaded).json();
  await page.getByRole("button", { name: `Apri ${doc.name.replace(/\.pdf$/i, "")}`, exact: true }).click();
  try {
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    const divider = page.getByRole("separator", { name: "Ridimensiona chat", exact: true });
    await expect(divider).toHaveAttribute("aria-orientation", "vertical");
    const chat = page.getByRole("complementary", { name: "Tutor della slide" });
    const initial = (await chat.boundingBox())!.width;
    const draft = page.getByRole("textbox", { name: "Domanda al tutor", exact: true });
    await draft.fill("Una domanda ancora da inviare");
    await drag(page, divider, 1000, 525);
    await expect.poll(async () => (await chat.boundingBox())!.width).toBeLessThan(initial - 100);
    const pdfBefore = (await page.locator(".slide-stage").boundingBox())!.width;
    await drag(page, divider, 1430, 525);
    await expect(divider).toHaveAttribute("aria-valuenow", "0");
    await expect(chat).toBeHidden();
    expect((await page.locator(".slide-stage").boundingBox())!.width).toBeGreaterThan(pdfBefore + 200);
    await drag(page, divider, 940, 525);
    await expect(chat).toBeVisible();
    await expect(draft).toHaveValue("Una domanda ancora da inviare");
    await page.getByRole("button", { name: "Chiudi chat", exact: true }).click();
    await expect(chat).toBeHidden();
    await page.getByRole("button", { name: "Apri chat", exact: true }).click();
    await expect(chat).toBeVisible();
    await divider.focus();
    await page.keyboard.press("Home");
    await expect(chat).toBeHidden();
    await page.keyboard.press("Enter");
    await expect(chat).toBeVisible();
    const saved = await divider.getAttribute("aria-valuenow");
    await page.reload();
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    await expect(divider).toHaveAttribute("aria-valuenow", saved!);
    await expect(chat).toBeVisible();
    await page.screenshot({ path: "test-results/chat-divider-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(divider).toHaveAttribute("aria-orientation", "horizontal");
    await drag(page, divider, 195, 833);
    await expect(chat).toBeHidden();
    await drag(page, divider, 195, 450);
    await expect(chat).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/chat-divider-mobile.png" });
  } finally { await request.delete(`/api/documents/${doc.id}`); }
});
