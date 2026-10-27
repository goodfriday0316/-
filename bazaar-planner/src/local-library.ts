import type { CatalogItem } from "./catalog";
import type { RawImportReport } from "./raw-adapter";

/** Converted user-selected data only. No original JSON bytes or remote requests. */
export type LocalLibrary = {
  version: 1;
  digest: string;
  fileName: string;
  importedAt: string;
  patchVersion: string | null;
  items: CatalogItem[];
  report: RawImportReport;
};

/** A future ZIP reader can pass reviewed local Blobs to this separate store. */
export type LocalImage = {
  itemId: string;
  sourceId: string;
  fileName: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  blob: Blob;
  importedAt: string;
};

export type ImagePathMatch =
  | { status: "matched"; itemId: string; sourceId: string; path: string }
  | { status: "ambiguous"; itemIds: string[]; path: string }
  | { status: "unmatched"; path: string }
  | { status: "invalid"; path: string; reason: string };

export class LocalLibraryError extends Error {
  readonly code: "UNAVAILABLE" | "INVALID_DATA" | "STORAGE_FAILED";
  constructor(
    code: "UNAVAILABLE" | "INVALID_DATA" | "STORAGE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "LocalLibraryError";
    this.code = code;
  }
}

const DATABASE = "bazaar-local-library-v1";
const DATABASE_VERSION = 1;
const CATALOG_STORE = "catalog";
const IMAGE_STORE = "local-images";
const CURRENT = "current";
const MAX_IMAGES_BYTES = 5 * 1024 * 1024;
const rasterExtension = /\.(png|jpe?g|webp)$/i;
const nonempty = (value: unknown, max: number): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= max &&
  !/[\u0000-\u001f]/.test(value);
const isoDate = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

function validReport(
  value: unknown,
  itemCount: number,
): value is RawImportReport {
  if (!value || typeof value !== "object") return false;
  const r = value as RawImportReport;
  const count = (n: unknown, max = 20_000) =>
    Number.isInteger(n) && Number(n) >= 0 && Number(n) <= max;
  const issues = (v: unknown) =>
    Array.isArray(v) &&
    v.length <= 20_000 &&
    v.every(
      (i) =>
        !!i &&
        typeof i === "object" &&
        typeof i.key === "string" &&
        i.key.length <= 1000 &&
        typeof i.reason === "string" &&
        i.reason.length <= 2000 &&
        (i.id === undefined ||
          (typeof i.id === "string" && i.id.length <= 500)),
    );
  return (
    count(r.totalRecords) &&
    count(r.importedCount) &&
    r.importedCount === itemCount &&
    count(r.unresolvedCount, 20_000_000) &&
    count(r.uncertainActivityCount) &&
    r.uncertainActivityCount <= r.importedCount &&
    issues(r.excluded) &&
    issues(r.quarantined) &&
    Array.isArray(r.warnings) &&
    r.warnings.length <= 2000 &&
    r.warnings.every((w) => typeof w === "string" && w.length <= 2000) &&
    (r.fileName === null ||
      (typeof r.fileName === "string" && r.fileName.length <= 500)) &&
    (r.sha256 === null ||
      (typeof r.sha256 === "string" && /^[a-f0-9]{64}$/i.test(r.sha256))) &&
    (r.patchVersion === null ||
      (typeof r.patchVersion === "string" && r.patchVersion.length <= 100))
  );
}
function assertLibrary(value: unknown): asserts value is LocalLibrary {
  const library = value as LocalLibrary | null;
  if (
    !library ||
    library.version !== 1 ||
    !nonempty(library.digest, 300) ||
    !nonempty(library.fileName, 500) ||
    !isoDate(library.importedAt) ||
    !(library.patchVersion === null || nonempty(library.patchVersion, 200)) ||
    !Array.isArray(library.items) ||
    library.items.length > 20000 ||
    !validReport(library.report, library.items.length)
  )
    throw new LocalLibraryError(
      "INVALID_DATA",
      "로컬 아이템 도감 형식이 올바르지 않습니다.",
    );
  const ids = new Set<string>();
  for (const item of library.items) {
    if (
      !item ||
      !nonempty(item.id, 600) ||
      ids.has(item.id) ||
      !nonempty(item.nameEn, 300) ||
      ![1, 2, 3].includes(item.size) ||
      !Array.isArray(item.heroes) ||
      !Array.isArray(item.tags) ||
      !item.tiers ||
      typeof item.tiers !== "object" ||
      !item.source ||
      !nonempty(item.source.id, 500)
    )
      throw new LocalLibraryError(
        "INVALID_DATA",
        "로컬 아이템 도감에 잘못되거나 중복된 항목이 있습니다.",
      );
    ids.add(item.id);
  }
}

function storageError(error: unknown): LocalLibraryError {
  if (error instanceof LocalLibraryError) return error;
  return new LocalLibraryError(
    "STORAGE_FAILED",
    "이 브라우저에 로컬 파일을 저장하지 못했습니다. 저장 공간이나 브라우저 설정을 확인하세요.",
  );
}

async function openDatabase(): Promise<IDBDatabase> {
  if (typeof globalThis.indexedDB === "undefined")
    throw new LocalLibraryError(
      "UNAVAILABLE",
      "이 브라우저에서는 로컬 파일 저장소를 사용할 수 없습니다. 가져온 데이터는 현재 화면에서만 사용할 수 있습니다.",
    );
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = globalThis.indexedDB.open(DATABASE, DATABASE_VERSION);
    } catch (error) {
      reject(storageError(error));
      return;
    }
    let settled = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CATALOG_STORE))
        db.createObjectStore(CATALOG_STORE);
      if (!db.objectStoreNames.contains(IMAGE_STORE))
        db.createObjectStore(IMAGE_STORE, { keyPath: "itemId" });
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => {
      settled = true;
      reject(storageError(request.error));
    };
    request.onblocked = () => {
      settled = true;
      reject(
        new LocalLibraryError(
          "STORAGE_FAILED",
          "다른 탭에서 로컬 저장소를 사용 중입니다. 다른 탭을 닫고 다시 시도하세요.",
        ),
      );
    };
  });
}

async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  operation: (tx: IDBTransaction, success: (value: T) => void) => void,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      let result: T;
      let tx: IDBTransaction;
      try {
        tx = db.transaction(stores, mode);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(storageError(tx.error));
        tx.onabort = () => reject(storageError(tx.error));
        operation(tx, (value) => {
          result = value;
        });
      } catch (error) {
        reject(storageError(error));
      }
    });
  } finally {
    db.close();
  }
}

export async function loadLocalLibrary(): Promise<LocalLibrary | null> {
  const value = await transaction<unknown>(
    [CATALOG_STORE],
    "readonly",
    (tx, success) => {
      const request = tx.objectStore(CATALOG_STORE).get(CURRENT);
      request.onsuccess = () => success(request.result);
    },
  );
  if (value === undefined) return null;
  assertLibrary(value);
  return value;
}

export async function saveLocalLibrary(library: LocalLibrary): Promise<void> {
  assertLibrary(library);
  await transaction<void>([CATALOG_STORE], "readwrite", (tx) => {
    // Only this converted structure is persisted; never the source File/text.
    tx.objectStore(CATALOG_STORE).put(
      {
        version: library.version,
        digest: library.digest,
        fileName: library.fileName,
        importedAt: library.importedAt,
        patchVersion: library.patchVersion,
        items: library.items,
        report: library.report,
      },
      CURRENT,
    );
  });
}

/** Clear the catalog only. Existing deck snapshots and image records stay separate. */
export async function clearLocalLibrary(): Promise<void> {
  await transaction<void>([CATALOG_STORE], "readwrite", (tx) => {
    tx.objectStore(CATALOG_STORE).delete(CURRENT);
  });
}

function validRelativeImagePath(filePath: string): boolean {
  return (
    nonempty(filePath, 1024) &&
    !filePath.startsWith("/") &&
    !filePath.includes("\\") &&
    !filePath.includes("://") &&
    !/[?#]/.test(filePath) &&
    filePath
      .split("/")
      .every(
        (segment) => segment !== "" && segment !== "." && segment !== "..",
      ) &&
    rasterExtension.test(filePath)
  );
}

/**
 * Preparation for a local ZIP import, not a ZIP parser. Match exact stable IDs,
 * never English/Korean display names. An optional manifest maps relative paths
 * to canonical item IDs. Conflicts remain ambiguous; no first-match guessing.
 */
export function matchLocalImagePath(
  filePath: string,
  items: Pick<CatalogItem, "id" | "source">[],
  manifest?: Readonly<Record<string, string>>,
): ImagePathMatch {
  if (!validRelativeImagePath(filePath))
    return {
      status: "invalid",
      path: filePath,
      reason: "안전한 상대 PNG/JPEG/WebP 파일 경로가 아닙니다.",
    };
  const manifestHasPath =
    !!manifest && Object.prototype.hasOwnProperty.call(manifest, filePath);
  const stem = filePath
    .slice(filePath.lastIndexOf("/") + 1)
    .replace(rasterExtension, "");
  const candidates = items.filter((item) =>
    manifestHasPath
      ? item.id === manifest![filePath]
      : item.id === stem || item.source.id === stem,
  );
  const unique = [
    ...new Map(candidates.map((item) => [item.id, item])).values(),
  ];
  if (unique.length === 1)
    return {
      status: "matched",
      path: filePath,
      itemId: unique[0].id,
      sourceId: unique[0].source.id,
    };
  if (unique.length > 1)
    return {
      status: "ambiguous",
      path: filePath,
      itemIds: unique.map((item) => item.id).sort(),
    };
  return { status: "unmatched", path: filePath };
}

async function assertImage(image: LocalImage): Promise<void> {
  if (
    !image ||
    !nonempty(image.itemId, 600) ||
    !nonempty(image.sourceId, 500) ||
    !validRelativeImagePath(image.fileName) ||
    !isoDate(image.importedAt) ||
    !(image.blob instanceof Blob) ||
    image.blob.size === 0 ||
    image.blob.size > MAX_IMAGES_BYTES ||
    !["image/png", "image/jpeg", "image/webp"].includes(image.mimeType) ||
    image.blob.type !== image.mimeType
  )
    throw new LocalLibraryError(
      "INVALID_DATA",
      "로컬 이미지의 형식·크기 또는 ID가 올바르지 않습니다.",
    );
  const bytes = new Uint8Array(await image.blob.slice(0, 12).arrayBuffer());
  const valid =
    (image.mimeType === "image/png" &&
      bytes.length >= 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) ||
    (image.mimeType === "image/jpeg" &&
      bytes.length >= 3 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255) ||
    (image.mimeType === "image/webp" &&
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP");
  if (!valid)
    throw new LocalLibraryError(
      "INVALID_DATA",
      "로컬 이미지의 실제 파일 형식과 MIME 형식이 일치하지 않습니다.",
    );
}

export async function putLocalImage(image: LocalImage): Promise<void> {
  await assertImage(image);
  await transaction<void>([IMAGE_STORE], "readwrite", (tx) => {
    tx.objectStore(IMAGE_STORE).put(image);
  });
}

export async function getLocalImage(
  itemId: string,
): Promise<LocalImage | null> {
  if (!nonempty(itemId, 600))
    throw new LocalLibraryError(
      "INVALID_DATA",
      "아이템 ID가 올바르지 않습니다.",
    );
  const image = await transaction<LocalImage | undefined>(
    [IMAGE_STORE],
    "readonly",
    (tx, success) => {
      const request = tx.objectStore(IMAGE_STORE).get(itemId);
      request.onsuccess = () => success(request.result);
    },
  );
  if (image === undefined) return null;
  await assertImage(image);
  return image;
}

export async function deleteLocalImage(itemId: string): Promise<void> {
  if (!nonempty(itemId, 600))
    throw new LocalLibraryError(
      "INVALID_DATA",
      "아이템 ID가 올바르지 않습니다.",
    );
  await transaction<void>([IMAGE_STORE], "readwrite", (tx) => {
    tx.objectStore(IMAGE_STORE).delete(itemId);
  });
}

export async function clearLocalImages(): Promise<void> {
  await transaction<void>([IMAGE_STORE], "readwrite", (tx) => {
    tx.objectStore(IMAGE_STORE).clear();
  });
}

/** User-requested deletion can remove both stores in one transaction. */
export async function clearAllLocalData(): Promise<void> {
  await transaction<void>([CATALOG_STORE, IMAGE_STORE], "readwrite", (tx) => {
    tx.objectStore(CATALOG_STORE).clear();
    tx.objectStore(IMAGE_STORE).clear();
  });
}
