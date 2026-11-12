import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("wheel turns PDF pages at the boundaries and leaves chat scrolling independent", async ({ page, request }) => {
  const folder = await (await request.post("/api/folders", { data: { name: `Rotella ${Date.now()}` } })).json();
  const doc = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Scroll.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") } } })).json();
  try {
    await page.goto(`/esami/${folder.id}/documenti/${doc.id}`);
    const number = page.getByRole("spinbutton", { name: "Numero della slide", exact: true });
    await expect(number).toHaveValue("1");
    await page.locator(".slide-stage").hover(); await page.mouse.wheel(0, 160);
    await expect(number).toHaveValue("2");
    await page.mouse.wheel(0, 160); await expect(number).toHaveValue("2");
    await page.waitForTimeout(650);
    await page.mouse.wheel(0, 160); await expect(number).toHaveValue("3");
    await page.waitForTimeout(650);
    await page.mouse.wheel(0, 160); await expect(number).toHaveValue("3");
    await page.locator(".chat-scroll-area").hover(); await page.mouse.wheel(0, -200);
    await expect(number).toHaveValue("3");
    await page.locator(".slide-stage").hover(); await page.mouse.wheel(0, -160);
    await expect(number).toHaveValue("2");
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});

test.describe("touch page browsing", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("a vertical swipe changes the page without opening Tony's chat", async ({ page, request }) => {
    const folder = await (await request.post("/api/folders", { data: { name: `Scorri mobile ${Date.now()}` } })).json();
    const doc = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Scroll.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") } } })).json();
    try {
      await page.goto(`/esami/${folder.id}/documenti/${doc.id}`);
      await expect(page.locator(".slide-stage canvas")).toBeVisible();
      const touch = await page.context().newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 160, y: 580 }] });
      for (let step = 1; step <= 8; step++) await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 160, y: 580 - step * 30 }] });
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await touch.detach();
      await expect(page.getByRole("spinbutton", { name: "Numero della slide", exact: true })).toHaveValue("2");
      await expect(page.getByRole("complementary", { name: "Tutor della slide", exact: true })).toBeHidden();
    } finally { await request.delete(`/api/folders/${folder.id}`); }
  });
});
