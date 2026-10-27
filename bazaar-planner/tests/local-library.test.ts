import test from "node:test";
import assert from "node:assert/strict";
import {
  matchLocalImagePath,
  loadLocalLibrary,
  saveLocalLibrary,
  putLocalImage,
} from "../src/local-library.ts";

const items = [
  {
    id: "local:synthetic-id-a",
    source: {
      id: "synthetic-id-a",
      url: "local:fixture",
      patchVersion: "TEST",
    },
  },
  {
    id: "local:synthetic-id-b",
    source: {
      id: "synthetic-id-b",
      url: "local:fixture",
      patchVersion: "TEST",
    },
  },
];

test("future local image mapping uses exact source IDs or explicit canonical manifest", () => {
  assert.deepEqual(matchLocalImagePath("items/synthetic-id-a.png", items), {
    status: "matched",
    path: "items/synthetic-id-a.png",
    itemId: "local:synthetic-id-a",
    sourceId: "synthetic-id-a",
  });
  assert.equal(
    matchLocalImagePath("SYNTHETIC DISPLAY NAME.png", items).status,
    "unmatched",
  );
  assert.equal(
    matchLocalImagePath("images/picture.webp", items, {
      "images/picture.webp": "local:synthetic-id-b",
    }).status,
    "matched",
  );
});

test("ambiguous same-source image IDs do not pick the first supplier", () => {
  const duplicate = [
    ...items,
    { id: "other:synthetic-id-a", source: { ...items[0].source } },
  ];
  const result = matchLocalImagePath("synthetic-id-a.png", duplicate);
  assert.equal(result.status, "ambiguous");
  if (result.status === "ambiguous") assert.equal(result.itemIds.length, 2);
});

test("future image paths reject traversal, URLs, backslashes and SVG", () => {
  for (const path of [
    "../synthetic-id-a.png",
    "/synthetic-id-a.png",
    "a/../synthetic-id-a.png",
    "https://images.example/synthetic-id-a.png",
    "a\\synthetic-id-a.png",
    "synthetic-id-a.svg",
    "synthetic-id-a.png?url=x",
    "synthetic-id-a.png#x",
    "a//synthetic-id-a.png",
  ]) {
    assert.equal(matchLocalImagePath(path, items).status, "invalid", path);
  }
});

test("missing IndexedDB rejects explicitly rather than pretending persistence", async () => {
  assert.equal(typeof globalThis.indexedDB, "undefined");
  await assert.rejects(
    loadLocalLibrary(),
    (error) => error.code === "UNAVAILABLE",
  );
});

test("invalid catalog and image reject before opening a browser store", async () => {
  await assert.rejects(
    saveLocalLibrary({ version: 1 } as never),
    (error) => error.code === "INVALID_DATA",
  );
  await assert.rejects(
    putLocalImage({
      itemId: "local:synthetic-id-a",
      sourceId: "synthetic-id-a",
      fileName: "synthetic-id-a.svg",
      mimeType: "image/png",
      blob: new Blob(["<svg/>"], { type: "image/png" }),
      importedAt: "2026-10-27T00:00:00Z",
    }),
    (error) => error.code === "INVALID_DATA",
  );
  await assert.rejects(
    putLocalImage({
      itemId: "local:synthetic-id-a",
      sourceId: "synthetic-id-a",
      fileName: "synthetic-id-a.png",
      mimeType: "image/png",
      blob: new Blob(["not a PNG"], { type: "image/png" }),
      importedAt: "2026-10-27T00:00:00Z",
    }),
    (error) => error.code === "INVALID_DATA",
  );
});
test('Chronicle matching requires an explicitly verified image UUID; null does not fall back to source ID', () => {
  const image = {path:null,sourceUrl:null,status:'missing' as const,localId:null as string|null};
  const local = [{...items[0],image}];
  assert.equal(matchLocalImagePath('synthetic-id-a.webp',local).status,'unmatched');
  image.localId='verified-image';
  assert.equal(matchLocalImagePath('synthetic-id-a.webp',local).status,'unmatched');
  assert.equal(matchLocalImagePath('verified-image.webp',local).status,'matched');
});
