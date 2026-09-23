import { test, expect, type Page } from "@playwright/test";

const grid = (page: Page) => page.locator('line[stroke="var(--kwant-axis-grid-color, #444)"]');

async function openBackground(page: Page) {
    await page.getByRole("button", { name: "Toggle chart settings" }).click();
    await page.getByRole("tab", { name: "Background", exact: true }).click();
}

async function setColor(page: Page, label: string, color: string) {
    await page.getByRole("button", { name: `Edit ${label.toLowerCase()} color`, exact: true }).click();
    await page.getByRole("textbox", { name: `${label} hex color`, exact: true }).fill(color);
    await page.getByRole("button", { name: "Apply", exact: true }).click();
}

test("settings independently edit plot background and both grid directions, save, and reset", async ({ page }) => {
    await page.goto("/");
    await expect(grid(page).first()).toHaveCSS("stroke", "rgb(68, 85, 102)");
    await expect(page.locator(".kwant-chart-plot")).toHaveCSS("background-color", "rgb(16, 24, 32)");
    await openBackground(page);
    await expect(page.getByRole("button", { name: "Edit plot background color", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit grid color", exact: true })).toHaveCount(0);
    await setColor(page, "Grid lines", "#abcdef80");
    await expect(grid(page).first()).toHaveCSS("stroke", "rgba(171, 205, 239, 0.5)");
    const strokes = await grid(page).evaluateAll((lines) => lines.map((line) => ({
        stroke: getComputedStyle(line).stroke,
        vertical: line.getAttribute("x1") === line.getAttribute("x2"),
    })));
    expect(strokes.some((line) => line.vertical)).toBe(true);
    expect(strokes.some((line) => !line.vertical)).toBe(true);
    expect(strokes.every((line) => line.stroke === "rgba(171, 205, 239, 0.5)")).toBe(true);
    await expect(page.locator(".kwant-chart-plot")).toHaveCSS("background-color", "rgb(16, 24, 32)");
    await setColor(page, "Plot background", "#123456");
    await expect(page.locator(".kwant-chart-plot")).toHaveCSS("background-color", "rgb(18, 52, 86)");
    await expect(grid(page).first()).toHaveCSS("stroke", "rgba(171, 205, 239, 0.5)");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.reload();
    await expect(grid(page).first()).toHaveCSS("stroke", "rgba(171, 205, 239, 0.5)");
    await expect(page.locator(".kwant-chart-plot")).toHaveCSS("background-color", "rgb(18, 52, 86)");
    await openBackground(page);
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(grid(page).first()).toHaveCSS("stroke", "rgb(68, 85, 102)");
    await expect(page.locator(".kwant-chart-plot")).toHaveCSS("background-color", "rgb(16, 24, 32)");
    expect(await page.evaluate(() => localStorage.getItem("kwant:v3:settings:TEST"))).toBeNull();
});

test("legacy saved grid color remains the plot background", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("kwant:v3:settings:TEST", JSON.stringify({
        candles: { up: "#00ff00", down: "#ff0000" },
        appearance: {
            backgroundColor: "#070809", gridColor: "#223344", secondaryColor: "#f97316",
            crosshairColor: "#ffffff", crosshairLineStyle: "dashed",
        },
    })));
    await page.goto("/");
    await expect(page.locator(".kwant-chart-plot")).toHaveCSS("background-color", "rgb(34, 51, 68)");
    await expect(grid(page).first()).toHaveCSS("stroke", "rgb(68, 85, 102)");
    await openBackground(page);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("kwant:v3:settings:TEST")!));
    expect(stored.appearance.plotBackgroundColor).toBe("#223344");
    expect(stored.appearance.gridColor).toBe("#445566");
});
