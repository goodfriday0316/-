import { test, expect, type Page } from "@playwright/test";
import { syntheticLocalFile, syntheticRawCard } from "./fixtures/local-raw";
const key = "bazaar-planner-v1";
async function importFile(page: Page, value: unknown = syntheticLocalFile()) {
  await expect(
    page.getByRole("button", { name: "원본 JSON 불러오기", exact: true }),
  ).toBeEnabled();
  await page
    .getByTestId("raw-import")
    .setInputFiles({
      name: "synthetic-local.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(value)),
    });
  await expect(
    page.getByRole("dialog", { name: "개인 도감 관리" }),
  ).toBeVisible();
}
async function applyFile(page: Page) {
  await importFile(page);
  await page
    .getByRole("button", { name: "이 파일을 개인 도감으로 사용" })
    .click();
  await expect(page.getByRole("note")).toContainText("개인 파일 아이템 3개");
}
async function state(page: Page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key);
}
test("browser worker imports local raw format, reports exclusions and sends no file data to any server", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const requests: { url: string; method: string; body: string | null }[] = [];
  context.on("request", (r) =>
    requests.push({ url: r.url(), method: r.method(), body: r.postData() }),
  );
  await importFile(page);
  const dialog = page.getByRole("dialog", { name: "개인 도감 관리" });
  await expect(dialog.locator(".import-summary")).toContainText("전체 8");
  await expect(dialog.locator(".import-summary")).toContainText("변환됨 3");
  await expect(dialog.locator(".import-summary")).toContainText("제외 4");
  await expect(dialog.locator(".import-summary")).toContainText("격리 1");
  await page
    .getByRole("button", { name: "이 파일을 개인 도감으로 사용" })
    .click();
  await expect(page.locator(".item-grid .item-card")).toHaveCount(3);
  await expect(page.getByRole("note")).toContainText("이 브라우저에 보관됨");
  expect(requests.every((r) => r.method === "GET")).toBe(true);
  expect(
    requests.every((r) => new URL(r.url).origin === new URL(page.url()).origin),
  ).toBe(true);
  expect(JSON.stringify(requests)).not.toContain(
    "PRIVATE_SYNTHETIC_CANARY_DO_NOT_SEND",
  );
  expect(JSON.stringify(requests)).not.toContain("synthetic-local.json");
  const workers = requests.filter((r) => r.url.includes("raw-import.worker"));
  expect(workers.length).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "SYNTHETIC MEDIUM", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "아이템 툴팁" })).toContainText(
    "미해석",
  );
  await expect(page.getByRole("dialog", { name: "아이템 툴팁" })).toContainText(
    "활성 여부 불확실",
  );
});
test("inheritance, zero, local catalog reload, stable IDs, deck export/import and catalog deletion preserve decks", async ({
  page,
}) => {
  await page.goto("/");
  await applyFile(page);
  await page
    .getByRole("button", { name: "SYNTHETIC SMALL", exact: true })
    .click();
  await page.getByLabel("효과 미리보기 등급").selectOption("실버");
  await expect(page.getByRole("dialog")).toContainText("Value 41");
  await expect(page.getByRole("dialog")).toContainText("7300");
  await page.getByLabel("효과 미리보기 등급").selectOption("골드");
  await expect(page.getByRole("dialog")).toContainText("Value 0");
  await page.getByRole("button", { name: "빈 공간에 추가" }).click();
  const saved = await state(page);
  expect(saved.decks[0].items[0].itemId).toBe("local-raw:synthetic-small");
  await page.reload();
  await expect(page.getByRole("note")).toContainText("개인 파일 아이템 3개");
  await expect(
    page.getByRole("button", {
      name: "SYNTHETIC SMALL 보드 아이템",
      exact: true,
    }),
  ).toBeVisible();
  expect(await state(page)).toEqual(saved);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "JSON 내보내기", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("bazaar-decks.json");
  await page.getByRole("button", { name: "덱 복제", exact: true }).click();
  await page.getByRole("button", { name: "덱 비교", exact: true }).click();
  await expect(page.locator(".compare-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "개인 도감 관리", exact: true })
    .click();
  await page
    .getByRole("button", { name: "개인 도감 지우기", exact: true })
    .click();
  await expect(page.locator(".item-grid .item-card")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "SYNTHETIC SMALL 보드 아이템",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "SYNTHETIC SMALL 보드 아이템",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByTestId("deck-import")
    .setInputFiles({
      name: "saved-deck.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(saved)),
    });
  await expect(page.locator(".toast")).toContainText("성공적으로");
  expect(await state(page)).toEqual(saved);
  await applyFile(page);
  expect((await state(page)).decks[0].items[0].itemId).toBe(
    "local-raw:synthetic-small",
  );
  await page.screenshot({
    path: "test-results-production/local-import-desktop.png",
    fullPage: true,
  });
});
test("malformed and entirely quarantined imports do not replace previous local catalog", async ({
  page,
}) => {
  await page.goto("/");
  await applyFile(page);
  await page
    .getByTestId("raw-import")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{not json"),
    });
  await expect(page.locator(".toast")).toBeVisible();
  await expect(page.locator(".item-grid .item-card")).toHaveCount(3);
  await importFile(page, {
    unknown: syntheticRawCard("synthetic-bad", "SYNTHETIC BAD", "Unknown"),
  });
  await expect(
    page.getByRole("button", { name: "이 파일을 개인 도감으로 사용" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "개인 도감 닫기" }).click();
  await page.reload();
  await expect(page.locator(".item-grid .item-card")).toHaveCount(3);
});
test("CSP blocks outbound requests and local raw image URLs are never loaded", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const remote: string[] = [];
  context.on("request", (r) => {
    if (new URL(r.url()).origin !== new URL(page.url()).origin)
      remote.push(r.url());
  });
  await importFile(page, {
    one: syntheticRawCard("synthetic-image", "SYNTHETIC IMAGE", "Small", {
      imageUrl: "https://untrusted.example/game-art.png",
      image: "https://untrusted.example/game-art.png",
    }),
  });
  await page
    .getByRole("button", { name: "이 파일을 개인 도감으로 사용" })
    .click();
  await expect(
    page.getByRole("button", { name: "SYNTHETIC IMAGE", exact: true }),
  ).toBeVisible();
  expect(remote).toEqual([]);
  expect(
    await page
      .locator("meta[http-equiv=Content-Security-Policy]")
      .getAttribute("content"),
  ).toContain("connect-src 'none'");
  const blocked = await page.evaluate(async () => {
    try {
      await fetch("https://untrusted.example/not-an-upload", {
        method: "POST",
        body: "SYNTHETIC CSP TEST",
      });
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
});
test("unavailable IndexedDB remains usable in memory and reports session-only storage honestly", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.goto("/");
  await applyFile(page);
  await expect(page.getByRole("note")).toContainText("현재 탭에서만 사용");
  await expect(page.getByRole("note")).toContainText("저장에 실패");
  await page
    .getByRole("button", { name: "SYNTHETIC SMALL", exact: true })
    .click();
  await page.getByRole("button", { name: "빈 공간에 추가" }).click();
  await page.reload();
  await expect(page.locator(".item-grid .item-card")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "SYNTHETIC SMALL 보드 아이템",
      exact: true,
    }),
  ).toBeVisible();
});
test.describe("mobile personal catalog", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  test("local import, touch placement and reload work on mobile", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await applyFile(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(390);
    await page
      .getByRole("button", { name: "SYNTHETIC SMALL", exact: true })
      .tap();
    await page.getByRole("button", { name: "빈 공간에 추가" }).tap();
    const placed = page.getByRole("button", {
      name: "SYNTHETIC SMALL 보드 아이템",
      exact: true,
    });
    await placed.scrollIntoViewIfNeeded();
    const a = await placed.boundingBox();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: a!.x + a!.width / 2, y: a!.y + a!.height / 2 }],
    });
    await page.waitForTimeout(300);
    for (let n = 1; n <= 22; n++) {
      const b = await page.getByTestId("slot-3").boundingBox();
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x:
              a!.x +
              a!.width / 2 +
              ((b!.x + b!.width / 2 - a!.x - a!.width / 2) * n) / 22,
            y:
              a!.y +
              a!.height / 2 +
              ((b!.y + b!.height / 2 - a!.y - a!.height / 2) * n) / 22,
          },
        ],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(async () => (await state(page)).decks[0].items[0].start)
      .toBe(3);
    await page.reload();
    await expect(page.getByRole("note")).toContainText("개인 파일 아이템 3개");
    expect((await state(page)).decks[0].items[0].start).toBe(3);
    await page.screenshot({
      path: "test-results-production/local-import-mobile.png",
      fullPage: true,
    });
  });
});
test("corrupt IndexedDB import report is rejected without crashing existing decks or manager", async ({
  page,
}) => {
  await page.goto("/");
  await applyFile(page);
  await page
    .getByRole("button", { name: "SYNTHETIC SMALL", exact: true })
    .click();
  await page.getByRole("button", { name: "빈 공간에 추가" }).click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("bazaar-local-library-v1", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("catalog", "readwrite");
          const store = tx.objectStore("catalog");
          const get = store.get("current");
          get.onsuccess = () =>
            store.put({ ...get.result, report: {} }, "current");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await expect(page.getByRole("note")).toContainText("올바르지 않습니다");
  await expect(
    page.getByRole("button", {
      name: "SYNTHETIC SMALL 보드 아이템",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "개인 도감 관리", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "개인 도감 관리" }),
  ).toBeVisible();
});
test("session-only catalog can be cleared even with IndexedDB unavailable", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.goto("/");
  await applyFile(page);
  await page
    .getByRole("button", { name: "개인 도감 관리", exact: true })
    .click();
  await page
    .getByRole("button", { name: "개인 도감 지우기", exact: true })
    .click();
  await expect(page.locator(".item-grid .item-card")).toHaveCount(0);
  await expect(page.getByRole("note")).toContainText(
    "현재 탭의 개인 도감은 지웠습니다",
  );
});
