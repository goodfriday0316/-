import { test, expect } from "@playwright/test";
const key = "bazaar-planner-v1";
test("production states zero real catalog honestly and preserves legacy deck through migration/reload/export", async ({
  page,
}) => {
  const old = {
    schemaVersion: 1,
    dataVersion: "1.0.0-sample",
    activeId: "old",
    decks: [
      {
        id: "old",
        name: "오래된 항해",
        hero: "바네사",
        items: [
          {
            id: "old-item",
            itemId: "cannon",
            start: 4,
            tier: "골드",
            enchant: "화염",
          },
        ],
      },
    ],
  };
  await page.goto("/");
  await page.evaluate(
    ({ key, old }) => localStorage.setItem(key, JSON.stringify(old)),
    { key, old },
  );
  await page.reload();
  await expect(page.getByRole("note")).toContainText(
    "실제 아이템 데이터 연결 대기",
  );
  await expect(page.locator(".item-grid .item-card")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "갑판 대포 보드 아이템", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("덱 이름", { exact: true })).toHaveValue(
    "오래된 항해",
  );
  const state = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!),
    key,
  );
  expect(state.decks[0].items[0]).toMatchObject(old.decks[0].items[0]);
  expect(state.decks[0].items[0].snapshot.legacy).toBe(true);
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(`${k}-before-catalog-update`)!),
      key,
    ),
  ).toEqual(old);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "갑판 대포 보드 아이템", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "덱 복제", exact: true }).click();
  await page.getByRole("button", { name: "덱 비교", exact: true }).click();
  await expect(page.locator(".compare-card")).toHaveCount(2);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "JSON 내보내기" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("bazaar-decks.json");
  await page.screenshot({
    path: "test-results-production/production-desktop.png",
    fullPage: true,
  });
});
test("unknown retired ID is preserved via snapshot instead of resetting the deck", async ({
  page,
}) => {
  await page.goto("/");
  const item = {
    id: "authorized:retired",
    name: "Archived Item",
    nameEn: "Archived Item",
    nameKo: null,
    translationStatus: "untranslated",
    heroes: ["Vanessa"],
    size: 3,
    tags: ["Archived"],
    tiers: { gold: { effects: ["Archived source text"] } },
    image: { path: null, sourceUrl: null, status: "missing" },
    source: {
      id: "retired",
      url: "https://example.invalid/archive",
      patchVersion: "ARCHIVED",
    },
    icon: "gem",
    color: "#aaaaaa",
  };
  const save = {
    schemaVersion: 1,
    dataVersion: "older-authorized-patch",
    activeId: "archive",
    decks: [
      {
        id: "archive",
        name: "Archived deck",
        hero: "바네사",
        items: [
          {
            id: "placed",
            itemId: item.id,
            start: 7,
            tier: "골드",
            enchant: "없음",
            snapshot: item,
          },
        ],
      },
    ],
  };
  await page
    .locator("input[data-testid=deck-import]")
    .setInputFiles({
      name: "archive.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(save)),
    });
  await expect(page.locator(".toast")).toContainText("성공적으로");
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Archived Item 보드 아이템",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Archived Item 보드 아이템", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Archived source text");
});
test("blocked production mobile layout keeps browser usable without catalog fixtures", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await expect(page.getByRole("note")).toContainText(
    "실제 아이템 데이터 연결 대기",
  );
  await expect(page.locator(".item-grid .item-card")).toHaveCount(0);
  await page.screenshot({
    path: "test-results-production/production-mobile.png",
    fullPage: true,
  });
});
