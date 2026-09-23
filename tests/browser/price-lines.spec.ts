import { test, expect, type Page } from "@playwright/test";

const line = (page: Page, id = "tp", part = "plot") => page.locator(`[data-price-line-id="${id}"][data-price-line-part="${part}"]`);
async function point(page: Page, id = "tp", part = "plot") {
    const target = line(page, id, part).locator(part === "plot" ? ":scope > line" : ":scope > rect").first();
    await expect(target).toBeAttached();
    // SVG horizontal lines have zero layout height even though their stroke is painted.
    const box = await target.evaluate((element) => element.getBoundingClientRect().toJSON());
    return { x: part === "plot" ? box.x + box.width * 0.65 : box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function startDrag(page: Page, part = "plot") {
    const p = await point(page, "tp", part);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    return p;
}
async function harness(page: Page, method: string, value: unknown) {
    await page.evaluate(({ method, value }) => (window as any).harness[method](value), { method, value });
}

test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(line(page)).toBeVisible();
});

test("static, live, and draggable levels share rendering and formatting", async ({ page }) => {
    await expect(line(page, "entry")).not.toHaveAttribute("role", "slider");
    await expect(line(page, "live-price")).not.toHaveAttribute("role", "slider");
    await expect(line(page, "live-price", "axis")).toContainText("102.00");
    await expect(line(page).locator(":scope > line").first()).toHaveAttribute("stroke-dasharray", "6 4");
    await expect(line(page)).toHaveAttribute("role", "slider");
});

test("controlled onChange updates both views while dragging and commits once", async ({ page }) => {
    const range = await page.locator("#range").textContent();
    const entry = await point(page, "entry");
    const p = await startDrag(page);
    await page.mouse.move(p.x + 30, p.y - 25, { steps: 5 });
    await expect(page.locator("#value")).not.toHaveText("108");
    await expect(page.locator("#commits")).toHaveText("[]");
    const value = Number(await page.locator("#value").textContent());
    expect(value * 2).toBe(Math.round(value * 2));
    await expect(line(page, "tp", "axis")).toHaveAttribute("data-price-line-value", String(value));
    expect(await point(page, "entry")).toEqual(entry);
    await expect(page.locator("#range")).toHaveText(range!);
    await page.mouse.up();
    await expect(page.locator("#commits")).toHaveText(JSON.stringify([value]));
    await expect(page.locator("#cancels")).toHaveText("0");
});

test("axis drag captures beyond the plot and clamps to a valid tick", async ({ page }) => {
    const entry = await point(page, "entry");
    const p = await startDrag(page, "axis");
    await page.mouse.move(p.x, p.y - 400, { steps: 6 });
    await expect(page.locator("#value")).toHaveText("115");
    expect(await point(page, "entry")).toEqual(entry);
    await page.mouse.move(p.x, p.y + 400, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator("#value")).toHaveText("101.5");
    await expect(page.locator("#commits")).toHaveText("[101.5]");
});

test("Escape restores controlled state and does not commit", async ({ page }) => {
    const p = await startDrag(page);
    await page.mouse.move(p.x, p.y - 20);
    await expect(page.locator("#value")).not.toHaveText("108");
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator("#value")).toHaveText("108");
    await expect(page.locator("#commits")).toHaveText("[]");
    await expect(page.locator("#cancels")).toHaveText("1");
});

test("keyboard edits and no-op click have consistent callbacks", async ({ page }) => {
    // A click should not snap an authoritative value that is between ticks.
    await harness(page, "setValue", 108.1);
    await expect(line(page)).toHaveAttribute("data-price-line-value", "108.1");
    await startDrag(page);
    await page.mouse.up();
    await expect(page.locator("#changes")).toHaveText("[]");
    await expect(page.locator("#commits")).toHaveText("[]");
    await harness(page, "setValue", 108);
    await line(page).focus();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator("#value")).toHaveText("108.5");
    await page.keyboard.press("End");
    await expect(page.locator("#value")).toHaveText("115");
    await page.keyboard.press("ArrowUp");
    await expect(page.locator("#commits")).toHaveText("[108.5,115]");
    await page.keyboard.press("Home");
    await expect(page.locator("#value")).toHaveText("101.5");
});

test("commit-only consumers get an internal preview", async ({ page }) => {
    await page.goto("/?commitOnly");
    const p = await startDrag(page);
    await page.mouse.move(p.x, p.y - 20);
    await expect(line(page)).not.toHaveAttribute("data-price-line-value", "108");
    await expect(page.locator("#value")).toHaveText("108");
    const preview = await line(page).getAttribute("data-price-line-value");
    await page.mouse.up();
    await expect(page.locator("#value")).toHaveText(preview!);
});

test("external value edits and removal cancel without overwriting caller state", async ({ page }) => {
    let p = await startDrag(page);
    await page.mouse.move(p.x, p.y - 20);
    await harness(page, "setValue", 106);
    await expect(page.locator("#cancels")).toHaveText("1");
    await page.mouse.up();
    await expect(page.locator("#value")).toHaveText("106");
    p = await startDrag(page);
    await page.mouse.move(p.x, p.y - 20);
    await harness(page, "setShow", false);
    await expect(page.locator("#cancels")).toHaveText("2");
    await page.mouse.up();
    await expect(line(page)).toHaveCount(0);
    await expect(page.locator("#commits")).toHaveText("[]");
});

test("wheel and live autoscaling cannot move the scale during a line drag", async ({ page }) => {
    const entry = await point(page, "entry");
    const range = await page.locator("#range").textContent();
    const p = await startDrag(page);
    await page.mouse.move(p.x, p.y - 20);
    await page.mouse.wheel(0, 150);
    await harness(page, "setRevision", 1);
    await expect(page.locator("#cancels")).toHaveText("0");
    expect(await point(page, "entry")).toEqual(entry);
    await expect(page.locator("#range")).toHaveText(range!);
    await page.mouse.up();
    await expect(page.locator("#commits")).not.toHaveText("[]");
    await expect.poll(async () => (await point(page, "entry")).y).not.toBe(entry.y);
});

test("touch dragging uses the same constraints and cancellation", async ({ page, context }) => {
    const client = await context.newCDPSession(page);
    const p = await point(page);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x, y: p.y - 25 }] });
    await expect(page.locator("#value")).not.toHaveText("108");
    await client.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await expect(page.locator("#value")).toHaveText("108");
    await expect(page.locator("#cancels")).toHaveText("1");
    await expect(page.locator("#commits")).toHaveText("[]");
});

test("disabled levels allow normal chart panning", async ({ page }) => {
    await harness(page, "setEditable", false);
    await expect(line(page)).not.toHaveAttribute("role", "slider");
    const range = await page.locator("#range").textContent();
    const p = await point(page);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x - 60, p.y + 20);
    await page.mouse.up();
    await expect(page.locator("#range")).not.toHaveText(range!);
    await expect(page.locator("#changes")).toHaveText("[]");
});

test("empty drag options reach the plot boundary without losing capture", async ({ page }) => {
    await harness(page, "setBounds", {});
    const p = await startDrag(page);
    const entry = await point(page, "entry");
    await page.mouse.move(p.x, 0);
    await expect(page.locator("#value")).toHaveText("121.6");
    expect(await point(page, "entry")).toEqual(entry);
    await page.mouse.up();
    await expect(page.locator("#commits")).toHaveText("[121.6]");
    await expect(page.locator("#cancels")).toHaveText("0");
});

test("name tags preserve grab offset and CSS scaling preserves price conversion", async ({ page }) => {
    await page.locator(".kwant-chart-frame").evaluate((element: HTMLElement) => {
        element.style.transform = "scale(0.75)";
        element.style.transformOrigin = "top left";
    });
    const tag = line(page).locator("rect").first();
    const box = (await tag.boundingBox())!;
    const plot = await line(page).evaluate((element) => element.ownerSVGElement!.getBoundingClientRect().toJSON());
    const x = box.x + box.width / 2;
    const y = box.y + 3; // deliberately grab above the actual line
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - plot.height * 2 / 43.2);
    await expect(page.locator("#value")).toHaveText("110");
    await page.mouse.up();
    await expect(page.locator("#commits")).toHaveText("[110]");
});

test("constraint changes, disabling, and resize cancel an active gesture", async ({ page }) => {
    let cancelled = 0;
    for (const [method, value] of [["setBounds", { min: 102, max: 115, step: 0.5 }], ["setEditable", false]] as const) {
        const p = await startDrag(page);
        await page.mouse.move(p.x, p.y - 20);
        await harness(page, method, value);
        await expect(page.locator("#cancels")).toHaveText(String(++cancelled));
        await page.mouse.up();
    }
    await expect(page.locator("#cancels")).toHaveText("2");
    await harness(page, "setEditable", true);
    const p = await startDrag(page);
    await page.mouse.move(p.x, p.y + 10);
    await page.locator(".kwant-chart-frame").evaluate((element: HTMLElement) => { element.style.width = "800px"; });
    await expect(page.locator("#cancels")).toHaveText("3");
    await page.mouse.up();
    await expect(page.locator("#commits")).toHaveText("[]");
});

test("pen input commits a level", async ({ page, context }) => {
    const client = await context.newCDPSession(page);
    const p = await point(page);
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", ...p, button: "left", buttons: 1, clickCount: 1, pointerType: "pen" });
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y - 20, button: "left", buttons: 1, pointerType: "pen" });
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y - 20, button: "left", buttons: 0, clickCount: 1, pointerType: "pen" });
    await expect(page.locator("#commits")).not.toHaveText("[]");
    await expect(page.locator("#cancels")).toHaveText("0");
});

test("reversing after overshooting a bound moves immediately", async ({ page }) => {
    const p = await startDrag(page);
    const y = p.y - 200;
    await page.mouse.move(p.x, y);
    await expect(page.locator("#value")).toHaveText("115");
    // The pointer remains beyond the limit, but moving back must not feel stuck.
    await page.mouse.move(p.x, y + 10);
    await expect(page.locator("#value")).not.toHaveText("115");
    await page.mouse.up();
    await expect(page.locator("#cancels")).toHaveText("0");
});

test("pointer bursts coalesce, release flushes, and cancel discards pending frames", async ({ page }) => {
    await line(page).evaluate((element) => element.addEventListener("pointerdown", (event) => {
        (window as any).capturedPointer = (event as PointerEvent).pointerId;
    }));
    const p = await startDrag(page);
    await line(page).evaluate((element, p) => {
        for (let i = 1; i <= 100; i++) {
            element.dispatchEvent(new PointerEvent("pointermove", {
                bubbles: true, pointerId: (window as any).capturedPointer,
                clientX: p.x, clientY: p.y - i / 5,
            }));
        }
    }, p);
    await expect(page.locator("#changes")).not.toHaveText("[]");
    expect(JSON.parse((await page.locator("#changes").textContent())!)).toHaveLength(1);
    // Release at a newer coordinate than the last rendered preview.
    await line(page).evaluate((element, p) => element.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true, pointerId: (window as any).capturedPointer,
        clientX: p.x, clientY: p.y - 25,
    })), p);
    await page.mouse.up();
    await expect(page.locator("#commits")).toHaveText("[111.5]");

    const next = await startDrag(page);
    await line(page).evaluate((element, p) => {
        element.dispatchEvent(new PointerEvent("pointermove", {
            bubbles: true, pointerId: (window as any).capturedPointer,
            clientX: p.x, clientY: p.y - 20,
        }));
        element.dispatchEvent(new PointerEvent("pointercancel", {
            bubbles: true, pointerId: (window as any).capturedPointer,
        }));
    }, next);
    await page.mouse.up();
    // Wait through the next paint to catch ghost updates from a cancelled frame.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.locator("#value")).toHaveText("111.5");
    await expect(page.locator("#cancels")).toHaveText("1");
    await expect(page.locator("#commits")).toHaveText("[111.5]");
});

test("release before React acknowledges a preview does not cancel the drag", async ({ page }) => {
    await line(page).evaluate((element) => element.addEventListener("pointerdown", (event) => {
        (window as any).capturedPointer = (event as PointerEvent).pointerId;
    }));
    const p = await startDrag(page);
    await page.mouse.move(p.x, p.y - 10);
    await expect(page.locator("#value")).toHaveText("109.5");
    await line(page).evaluate((element, p) => new Promise<void>((resolve) => {
        element.dispatchEvent(new PointerEvent("pointermove", {
            bubbles: true, pointerId: (window as any).capturedPointer,
            clientX: p.x, clientY: p.y - 20,
        }));
        requestAnimationFrame(() => {
            // Same frame as the queued onChange, before React must have committed it.
            element.dispatchEvent(new PointerEvent("pointerup", {
                bubbles: true, pointerId: (window as any).capturedPointer,
                clientX: p.x, clientY: p.y - 25,
            }));
            resolve();
        });
    }), p);
    await page.mouse.up();
    await expect(page.locator("#value")).toHaveText("111.5");
    await expect(page.locator("#commits")).toHaveText("[111.5]");
    await expect(page.locator("#cancels")).toHaveText("0");
});

test("priceDisplay hides only the requested price badges and dragging still works", async ({ page }) => {
    await expect(line(page, "tp", "axis")).toBeVisible();
    await harness(page, "setPriceDisplay", false);
    await expect(line(page, "tp", "axis")).toHaveCount(0);
    await expect(line(page, "entry", "axis")).toHaveCount(0);
    await expect(line(page, "live-price", "axis")).toBeVisible();
    await expect(line(page, "entry")).toBeVisible();
    const p = await startDrag(page);
    await page.mouse.move(p.x, p.y - 20);
    await page.mouse.up();
    await expect(page.locator("#commits")).not.toHaveText("[]");
    const value = await page.locator("#value").textContent();
    await harness(page, "setPriceDisplay", true);
    await expect(line(page, "tp", "axis")).toHaveAttribute("data-price-line-value", value!);
});

test("focused draggable lines have no focus decoration and remain keyboard editable", async ({ page }) => {
    await line(page).focus();
    await expect(line(page)).toBeFocused();
    await expect(line(page)).toHaveCSS("outline-style", "none");
    await expect(line(page)).toHaveCSS("filter", "none");
    await page.keyboard.press("ArrowUp");
    await expect(page.locator("#value")).toHaveText("108.5");
});

test("hiding a badge during an axis drag releases the gesture", async ({ page }) => {
    const p = await startDrag(page, "axis");
    await page.mouse.move(p.x, p.y - 20);
    await expect(page.locator("#value")).not.toHaveText("108");
    await harness(page, "setPriceDisplay", false);
    await expect(page.locator("#cancels")).toHaveText("1");
    await page.mouse.up();
    await expect(page.locator("#commits")).toHaveText("[]");
    const plot = await startDrag(page);
    await page.mouse.move(plot.x, plot.y + 10);
    await page.mouse.up();
    await expect(page.locator("#commits")).not.toHaveText("[]");
});

test("the small remove button removes both views once without dragging or panning", async ({ page }) => {
    const remove = page.getByRole("button", { name: "Remove Take profit", exact: true });
    await expect(remove).toHaveCount(0);
    await harness(page, "setRemovable", true);
    const range = await page.locator("#range").textContent();
    await remove.click();
    await expect(line(page)).toHaveCount(0);
    await expect(line(page, "tp", "axis")).toHaveCount(0);
    await expect(remove).toHaveCount(0);
    await expect(page.locator("#removals")).toHaveText("1");
    await expect(page.locator("#changes")).toHaveText("[]");
    await expect(page.locator("#commits")).toHaveText("[]");
    await expect(page.locator("#range")).toHaveText(range!);
    await expect(line(page, "entry")).toBeVisible();
    await harness(page, "setValue", 109);
    await harness(page, "setRevision", 1);
    await expect(line(page)).toHaveCount(0);
    await expect(page.locator("#removals")).toHaveText("1");
});

test("removal works without a callback or name and with hidden price badges", async ({ page }) => {
    await page.goto("/?noRemoveCallback");
    await harness(page, "setRemovable", true);
    await harness(page, "setLineName", undefined);
    await harness(page, "setPriceDisplay", false);
    await page.getByRole("button", { name: "Remove tp", exact: true }).tap();
    await expect(line(page)).toHaveCount(0);
    await expect(page.locator("#removals")).toHaveText("0");
    await expect(page.locator("#commits")).toHaveText("[]");
    // Explicitly remove the ID from props, then re-add it to restore the line.
    await harness(page, "setShow", false);
    await harness(page, "setShow", true);
    await expect(line(page)).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Remove tp", exact: true })).toBeVisible();
});

test("keyboard removal cancels pending drag frames and can update caller state", async ({ page }) => {
    await page.goto("/?controlledRemove");
    await harness(page, "setRemovable", true);
    const p = await startDrag(page);
    await page.mouse.move(p.x, p.y - 20);
    await expect(page.locator("#value")).not.toHaveText("108");
    const remove = page.getByRole("button", { name: "Remove Take profit", exact: true });
    await remove.focus();
    await page.keyboard.press("Enter");
    await page.mouse.up();
    await expect(line(page)).toHaveCount(0);
    await expect(page.locator("#removals")).toHaveText("1");
    await expect(page.locator("#cancels")).toHaveText("1");
    await expect(page.locator("#commits")).toHaveText("[]");
    await harness(page, "setShow", true);
    await expect(line(page)).toBeVisible();
    await remove.focus();
    await page.keyboard.press("Space");
    await expect(line(page)).toHaveCount(0);
    await expect(page.locator("#removals")).toHaveText("2");
});

test("swiping or cancelling on the remove button does not delete or pan", async ({ page, context }) => {
    await harness(page, "setRemovable", true);
    const button = page.getByRole("button", { name: "Remove Take profit", exact: true });
    const box = (await button.boundingBox())!;
    const p = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const range = await page.locator("#range").textContent();
    const client = await context.newCDPSession(page);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p] });
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x + 40, y: p.y + 30 }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(line(page)).toBeVisible();
    await expect(page.locator("#range")).toHaveText(range!);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p] });
    await client.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await expect(line(page)).toBeVisible();
    await expect(page.locator("#removals")).toHaveText("0");
    await expect(page.locator("#changes")).toHaveText("[]");
    await button.tap();
    await expect(line(page)).toHaveCount(0);
    await expect(page.locator("#removals")).toHaveText("1");
    await harness(page, "setAsset", "OTHER");
    await expect(line(page)).toBeVisible();
});
