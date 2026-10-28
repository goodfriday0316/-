import {
  test,
  expect,
  type Page,
  type Locator,
  type CDPSession,
} from "@playwright/test";
import { readFile } from "node:fs/promises";
const key = "bazaar-planner-v1";
async function saved(page: Page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key);
}
async function mouseDrag(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  const a = await source.boundingBox();
  const b = await target.boundingBox();
  if (!a || !b) throw Error("Drag target unavailable");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2, {
    steps: 4,
  });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 24 });
  await page.mouse.up();
  await page.waitForTimeout(100); // Let dnd-kit release its temporary click suppression.
}
const card = (page: Page, name: string, placed = false) =>
  page.getByRole("button", {
    name: name + (placed ? " 보드 아이템" : ""),
    exact: true,
  });
async function touchPath(
  cdp: CDPSession,
  from: { x: number; y: number },
  to: { x: number; y: number },
  hold = 0,
) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [from],
  });
  if (hold) await new Promise((r) => setTimeout(r, hold));
  for (let n = 1; n <= 20; n++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: from.x + ((to.x - from.x) * n) / 20,
          y: from.y + ((to.y - from.y) * n) / 20,
        },
      ],
    });
    await new Promise((r) => setTimeout(r, 16));
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}
async function touchDrag(
  page: Page,
  cdp: CDPSession,
  source: Locator,
  target: Locator,
) {
  const a = await source.boundingBox();
  if (!a) throw Error("Touch source unavailable");
  let cursor = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [cursor],
  });
  await page.waitForTimeout(300);
  for (let n = 1; n <= 25; n++) {
    const b = await target.boundingBox();
    if (!b) throw Error("Touch target unavailable");
    const remaining = 26 - n;
    cursor = {
      x: cursor.x + (b.x + b.width / 2 - cursor.x) / remaining,
      y: cursor.y + (b.y + b.height / 2 - cursor.y) / remaining,
    };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [cursor],
    });
    await page.waitForTimeout(16);
  }
  const final = await target.boundingBox();
  if (!final) throw Error("Touch target unavailable");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: final.x + final.width / 2, y: final.y + final.height / 2 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}
test("small/medium/large occupy exact physical 1/2/3 cells; full board rejects overflow; drag removes", async ({
  page,
}) => {
  await page.goto("/");
  const cases = [
    { name: "선장의 나침반", start: 0, size: 1 },
    { name: "황동 커틀러스", start: 1, size: 2 },
    { name: "갑판 대포", start: 3, size: 3 },
  ];
  for (const c of cases) {
    await mouseDrag(
      page,
      card(page, c.name),
      page.getByTestId(`slot-${c.start}`),
    );
    const wrap = card(page, c.name, true).locator("..");
    const box = await wrap.boundingBox();
    const first = await page.getByTestId(`slot-${c.start}`).boundingBox();
    const last = await page
      .getByTestId(`slot-${c.start + c.size - 1}`)
      .boundingBox();
    expect(box && first && last).toBeTruthy();
    expect(Math.abs(box!.x - first!.x)).toBeLessThan(1);
    expect(
      Math.abs(box!.width - (last!.x + last!.width - first!.x)),
    ).toBeLessThan(1);
  }
  expect(
    (await saved(page)).decks[0].items.map((p: { start: number }) => p.start),
  ).toEqual([0, 1, 3]);
  await mouseDrag(page, card(page, "갑판 대포"), page.getByTestId("slot-6"));
  await mouseDrag(
    page,
    card(page, "선장의 나침반"),
    page.getByTestId("slot-9"),
  );
  expect((await saved(page)).decks[0].items).toHaveLength(5);
  await card(page, "진주 조개").click();
  await page.getByRole("button", { name: "빈 공간에 추가" }).click();
  await expect(page.locator(".toast")).toContainText("놓을 수 없습니다");
  expect((await saved(page)).decks[0].items).toHaveLength(5);
  await mouseDrag(
    page,
    card(page, "황동 커틀러스", true),
    page.locator(".trash-target"),
  );
  await expect(card(page, "황동 커틀러스", true)).toHaveCount(0);
  expect((await saved(page)).decks[0].items).toHaveLength(4);
});
test("actual downloaded JSON imports into a fresh browser and survives reload; 3 clones remain independent", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByLabel("덱 이름", { exact: true }).fill("원본 항해");
  await card(page, "선장의 나침반").click();
  await page.getByRole("button", { name: "빈 공간에 추가" }).click();
  await page.getByRole("button", { name: "덱 복제", exact: true }).click();
  await page.getByLabel("덱 이름", { exact: true }).fill("화염 항해");
  await card(page, "선장의 나침반", true).click();
  await page.getByLabel("마법부여", { exact: true }).selectOption("화염");
  await page.getByLabel("아이템 등급", { exact: true }).selectOption("골드");
  await page.getByRole("button", { name: "툴팁 닫기" }).click();
  await page.getByRole("button", { name: "덱 복제", exact: true }).click();
  await page.getByLabel("덱 이름", { exact: true }).fill("수정 항해");
  await page.getByLabel("영웅 선택").selectOption("중립");
  await card(page, "여행자의 수정").click();
  await page.getByRole("button", { name: "빈 공간에 추가" }).click();
  await page.getByRole("button", { name: "덱 비교", exact: true }).click();
  await expect(page.locator(".compare-card")).toHaveCount(3);
  const deckState = await saved(page);
  expect(
    deckState.decks.map((d: { items: unknown[] }) => d.items.length),
  ).toEqual([1, 1, 2]);
  expect(deckState.decks[0].items[0].enchant).toBe("없음");
  expect(deckState.decks[1].items[0].enchant).toBe("화염");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "JSON 내보내기" }).click(),
  ]);
  const payload = await readFile((await download.path())!);
  expect(JSON.parse(payload.toString())).toEqual(deckState);
  const context = await browser.newContext();
  const fresh = await context.newPage();
  await fresh.goto("/");
  await fresh.locator("input[data-testid=deck-import]").setInputFiles({
    name: download.suggestedFilename(),
    mimeType: "application/json",
    buffer: payload,
  });
  await expect(fresh.locator(".toast")).toContainText("성공적으로");
  expect(await saved(fresh)).toEqual(deckState);
  await fresh.reload();
  expect(await saved(fresh)).toEqual(deckState);
  await fresh.getByRole("button", { name: "덱 비교", exact: true }).click();
  await expect(fresh.locator(".compare-card")).toHaveCount(3);
  await fresh.screenshot({
    path: "test-results/verified-desktop.png",
    fullPage: true,
  });
  await context.close();
});
test("unreadable stored data is not overwritten on startup", async ({
  page,
}) => {
  await page.addInitScript(
    (k) =>
      localStorage.setItem(
        k,
        '{"schemaVersion":1,"dataVersion":"older-patch","decks":[]}',
      ),
    key,
  );
  await page.goto("/");
  await expect(page.locator(".toast")).toContainText(
    "저장 데이터를 읽지 못했습니다",
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toContain(
    "older-patch",
  );
});
test.describe("mobile touch", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  test("finger swipe on item scrolls catalog instead of dragging", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.locator(".item-grid").scrollIntoViewIfNeeded();
    const grid = page.locator(".item-grid");
    const b = await grid.boundingBox();
    if (!b) throw Error("no grid");
    const before = await grid.evaluate((el) => el.scrollTop);
    const cdp = await context.newCDPSession(page);
    await touchPath(
      cdp,
      { x: b.x + 40, y: b.y + Math.min(250, b.height - 20) },
      { x: b.x + 40, y: b.y + 35 },
    );
    await expect
      .poll(() => grid.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(before + 30);
    expect((await saved(page)).decks[0].items).toHaveLength(0);
  });
  test("long press drags catalog item onto board with page auto-scroll", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    const source = card(page, "선장의 나침반");
    await source.scrollIntoViewIfNeeded();
    const a = await source.boundingBox();
    if (!a) throw Error("no touch source");
    const cdp = await context.newCDPSession(page);
    const from = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [from],
    });
    await page.waitForTimeout(300);
    for (let n = 1; n <= 24; n++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 100, y: from.y + ((8 - from.y) * n) / 24 }],
      });
      await page.waitForTimeout(16);
    }
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 8000 })
      .toBeLessThan(30);
    let cursor = { x: 100, y: 8 };
    for (let n = 1; n <= 25; n++) {
      const target = await page.getByTestId("slot-0").boundingBox();
      if (!target) throw Error("no board slot");
      const remaining = 26 - n;
      cursor = {
        x: cursor.x + (target.x + target.width / 2 - cursor.x) / remaining,
        y: cursor.y + (target.y + target.height / 2 - cursor.y) / remaining,
      };
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [cursor],
      });
      await page.waitForTimeout(16);
    }
    const finalTarget = await page.getByTestId("slot-0").boundingBox();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: finalTarget!.x + finalTarget!.width / 2,
          y: finalTarget!.y + finalTarget!.height / 2,
        },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(async () => (await saved(page)).decks[0].items.length)
      .toBe(1);
    expect((await saved(page)).decks[0].items[0]).toMatchObject({
      itemId: "compass",
      start: 0,
    });
  });
  test("tap adds item; touch drag moves and deletes; reload persists", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    const source = card(page, "선장의 나침반");
    await source.scrollIntoViewIfNeeded();
    await source.tap();
    await page.getByRole("button", { name: "빈 공간에 추가" }).tap();
    await card(page, "선장의 나침반", true).scrollIntoViewIfNeeded();
    const cdp = await context.newCDPSession(page);
    await touchDrag(
      page,
      cdp,
      card(page, "선장의 나침반", true),
      page.getByTestId("slot-3"),
    );
    await expect
      .poll(async () => (await saved(page)).decks[0].items[0].start)
      .toBe(3);
    await page.reload();
    expect((await saved(page)).decks[0].items[0].start).toBe(3);
    await page.locator(".board-bottom").scrollIntoViewIfNeeded();
    await touchDrag(
      page,
      cdp,
      card(page, "선장의 나침반", true),
      page.locator(".trash-target"),
    );
    await expect
      .poll(async () => (await saved(page)).decks[0].items.length)
      .toBe(0);
    await page.screenshot({
      path: "test-results/verified-mobile.png",
      fullPage: true,
    });
  });
});
test("keyboard sensor moves to a neighboring slot", async ({ page }) => {
  await page.goto("/");
  await card(page, "선장의 나침반").click();
  await page.getByRole("button", { name: "빈 공간에 추가" }).click();
  const placed = card(page, "선장의 나침반", true);
  await placed.focus();
  await page.keyboard.press("Space");
  // KeyboardSensor moves in pixels; stop on the neighboring cell rather than
  // assuming a fixed number of presses for every responsive board width.
  for (let n = 0; n < 10; n++) {
    await page.keyboard.press("ArrowRight");
    if ((await page.getByTestId("slot-1").getAttribute("class"))?.includes("over")) break;
  }
  await expect(page.getByTestId("slot-1")).toHaveClass(/over/);
  await page.keyboard.press("Space");
  await expect
    .poll(async () => (await saved(page)).decks[0].items[0].start)
    .toBe(1);
});
test("editing after a load failure keeps a recovery copy and resumes autosave", async ({
  page,
}) => {
  await page.goto("/");
  const original = '{"schemaVersion":1,"dataVersion":"older-patch","decks":[]}';
  await page.evaluate(
    ({ key, original }) => localStorage.setItem(key, original),
    { key, original },
  );
  await page.reload();
  await page.getByLabel("덱 이름", { exact: true }).fill("복구 후 새 덱");
  await expect
    .poll(() =>
      page.evaluate((k) => localStorage.getItem(`${k}-recovery`), key),
    )
    .toBe(original);
  expect((await saved(page)).decks[0].name).toBe("복구 후 새 덱");
  await page.reload();
  expect((await saved(page)).decks[0].name).toBe("복구 후 새 덱");
});

test.describe("mobile horizontal board access", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  test("finger swipe exposes all ten board slots without dragging", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    const board = page.locator(".board-scroll");
    await board.scrollIntoViewIfNeeded();
    const b = await board.boundingBox();
    if (!b) throw Error("No board");
    const cdp = await context.newCDPSession(page);
    await touchPath(
      cdp,
      { x: b.x + b.width - 20, y: b.y + b.height / 2 },
      { x: b.x + 20, y: b.y + b.height / 2 },
    );
    await expect
      .poll(() => board.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(100);
    const last = await page.getByTestId("slot-9").boundingBox();
    expect(last!.x + last!.width).toBeLessThanOrEqual(391);
    expect((await saved(page)).decks[0].items).toHaveLength(0);
  });
});

test("catalog searches English, renders source image, and previews tier-specific source effects", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("아이템 검색").fill("Test compass");
  await expect(page.locator(".item-grid .item-card")).toHaveCount(1);
  await expect(page.locator(".item-grid img")).toHaveAttribute(
    "src",
    "/images/items/test-only.png",
  );
  await expect
    .poll(() =>
      page
        .locator(".item-grid img")
        .evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "선장의 나침반", exact: true })
    .click();
  await page.getByLabel("효과 미리보기 등급").selectOption("다이아몬드");
  await expect(page.getByRole("dialog")).toContainText(
    "TEST ONLY diamond effect 4",
  );
  await page.getByRole("button", { name: "빈 공간에 추가" }).click();
  expect((await saved(page)).decks[0].items[0].tier).toBe("다이아몬드");
  await page
    .getByRole("button", { name: "선장의 나침반 보드 아이템", exact: true })
    .click();
  await page.getByLabel("아이템 등급", { exact: true }).selectOption("실버");
  await expect(page.getByRole("dialog")).toContainText(
    "TEST ONLY silver effect 2",
  );
});
