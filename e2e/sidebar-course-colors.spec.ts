import { expect, test } from "@playwright/test";
import { formatCourseName } from "../lib/course-name";

test("sidebar course names use their own palette in both themes, including hover and selection", async ({ page, request }) => {
  const courses = await Promise.all(["sky", "peach"].map(async color => {
    const response = await request.post("/api/folders", { data: { name: `Colore ${color} ${Date.now()}` } });
    expect(response.status()).toBe(201);
    const course = await response.json();
    const updated = await request.patch(`/api/folders/${course.id}`, { data: { color } });
    expect(updated.ok()).toBe(true);
    return updated.json();
  }));
  try {
    await page.goto(`/esami/${courses[0].id}`);
    for (const dark of [false, true]) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value ? "dark" : "light"; }, dark);
      const colors: string[] = [];
      for (const course of courses) {
        const item = page.locator(".sidebar .folder-item").filter({ hasText: formatCourseName(course.name) });
        await expect(item).toBeVisible();
        const expected = await item.evaluate(element => {
          const style = getComputedStyle(element), sample = document.createElement("span");
          sample.style.color = style.getPropertyValue("--course-label-color");
          element.append(sample); const color = getComputedStyle(sample).color; sample.remove(); return color;
        });
        colors.push(expected);
        await expect(item.locator(".folder-name")).toHaveCSS("color", expected);
        await expect(item.locator(".folder-icon")).toHaveCSS("color", expected);
        await item.hover();
        await expect(item.locator(".folder-name")).toHaveCSS("color", expected);
        await item.click();
        await expect(item).toHaveAttribute("aria-current", "page");
        await expect(item.locator(".folder-name")).toHaveCSS("color", expected);
      }
      expect(colors[0]).not.toBe(colors[1]);
    }
  } finally { for (const course of courses) await request.delete(`/api/folders/${course.id}`); }
});
