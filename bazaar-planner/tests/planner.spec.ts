import { test, expect, type Page } from "@playwright/test";
const key = "bazaar-planner-v1";
async function state(page: Page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key);
}
async function drag(page: Page, name: string, slot: number) {
  await page
    .getByRole("button", { name, exact: true })
    .scrollIntoViewIfNeeded();
  const a = await page.getByRole("button", { name, exact: true }).boundingBox();
  const b = await page.getByTestId(`slot-${slot}`).boundingBox();
  if (!a || !b) throw Error("missing drag target");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 9, a.y + a.height / 2, {
    steps: 3,
  });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(100); // Let dnd-kit release its temporary click suppression.
}
test("drag, overlap and boundary validation, move, reload and remove", async ({
  page,
}) => {
  await page.goto("/");
  await drag(page, "갑판 대포", 0);
  await expect
    .poll(async () => (await state(page)).decks[0].items.length)
    .toBe(1);
  await drag(page, "황동 커틀러스", 1);
  await expect(page.locator(".toast")).toContainText("놓을 수 없습니다");
  expect((await state(page)).decks[0].items).toHaveLength(1);
  await drag(page, "황동 커틀러스", 9);
  expect((await state(page)).decks[0].items).toHaveLength(1);
  await drag(page, "황동 커틀러스", 3);
  await expect
    .poll(async () => (await state(page)).decks[0].items.length)
    .toBe(2);
  await drag(page, "갑판 대포 보드 아이템", 6);
  await expect
    .poll(async () => (await state(page)).decks[0].items[0].start)
    .toBe(6);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "갑판 대포 보드 아이템", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "갑판 대포 보드 아이템", exact: true })
    .click();
  await page
    .getByLabel("아이템 등급", { exact: true })
    .selectOption("다이아몬드");
  await page.getByLabel("마법부여", { exact: true }).selectOption("화염");
  await page.getByRole("button", { name: "툴팁 닫기" }).click();
  await page.reload();
  expect((await state(page)).decks[0].items[0]).toMatchObject({
    tier: "다이아몬드",
    enchant: "화염",
  });
  await page
    .getByRole("button", { name: "갑판 대포 보드 아이템", exact: true })
    .click();
  await page.getByRole("button", { name: "보드에서 제거" }).click();
  expect((await state(page)).decks[0].items).toHaveLength(1);
});
test("heroes, tags, clone, compare, export/import and invalid import", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("영웅 선택").locator("option")).toHaveCount(9);
  await page.getByLabel("아이템 검색").fill("회복");
  await expect(page.locator(".item-grid .item-card")).toHaveCount(1);
  await page.getByLabel("아이템 검색").fill("");
  await page
    .getByRole("button", { name: "선장의 나침반", exact: true })
    .click();
  await page.getByRole("button", { name: "빈 공간에 추가" }).click();
  await page.getByRole("button", { name: "덱 복제", exact: true }).click();
  expect((await state(page)).decks).toHaveLength(2);
  await page.getByRole("button", { name: "덱 비교", exact: true }).click();
  await expect(page.locator(".compare-card")).toHaveCount(2);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON 내보내기" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("bazaar-decks.json");
  const saved = await state(page);
  await page.getByRole("button", { name: "새 덱", exact: true }).click();
  await page.locator("input[data-testid=deck-import]").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.locator(".toast")).toContainText("성공적으로");
  expect((await state(page)).decks).toHaveLength(2);
  const bad = structuredClone(saved);
  bad.decks[0].items.push({ ...bad.decks[0].items[0], id: "bad" });
  await page.locator("input[data-testid=deck-import]").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(bad)),
  });
  await expect(page.locator(".toast")).toContainText("겹치거나");
  expect((await state(page)).decks).toHaveLength(2);
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
});
test("mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await expect(
    page.getByRole("heading", { name: "다음 승리를 설계하세요." }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});

test('desktop catalog is 555px with room for the board; mobile keeps stacked layout', async ({page}) => {
  for(const width of [1920,1440,1280]) {
    await page.setViewportSize({width,height:1100}); await page.goto('/');
    const sizes=await page.evaluate(()=>({catalog:document.querySelector('.catalog')!.getBoundingClientRect().width,workspace:document.querySelector('.workspace')!.getBoundingClientRect().width,board:document.querySelector('.board')!.getBoundingClientRect().width,art:document.querySelector('.catalog .art')!.getBoundingClientRect().height}));
    expect(sizes.catalog).toBe(555);expect(sizes.workspace).toBeGreaterThanOrEqual(880);expect(sizes.board).toBeGreaterThan(750);expect(sizes.art).toBe(150);
  }
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  const mobile=await page.evaluate(()=>({catalog:document.querySelector('.catalog')!.getBoundingClientRect(),workspace:document.querySelector('.workspace')!.getBoundingClientRect(),width:document.documentElement.scrollWidth,viewport:innerWidth}));
  expect(mobile.catalog.width).toBeLessThanOrEqual(390);expect(mobile.workspace.y).toBeLessThan(mobile.catalog.y);expect(mobile.width).toBeLessThanOrEqual(mobile.viewport);
});
