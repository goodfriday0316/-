// Browser QA runs on an isolated copy. Synthetic data never touches production src/data/items.json.
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
const root = resolve(import.meta.dirname, "..");
const dir = await mkdtemp(join(tmpdir(), "bazaar-browser-qa-"));
for (const file of [
  "src",
  "public",
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "index.html",
])
  await cp(join(root, file), join(dir, file), { recursive: true });
await symlink(join(root, "node_modules"), join(dir, "node_modules"), "dir");
const legacy = JSON.parse(
  await readFile(join(root, "src/data/1.0.0-sample.json"), "utf8"),
);
const heroNames = [
  "바네사",
  "피그말리엔",
  "둘리",
  "막",
  "스텔",
  "쥴스",
  "카르녹",
  "드래곤즈",
  "중립",
];
const heroIds = [
  "Vanessa",
  "Pygmalien",
  "Dooley",
  "Mak",
  "Stelle",
  "Jules",
  "Karnok",
  "Dragons",
  "Neutral",
];
const tiers = Object.fromEntries(
  ["bronze", "silver", "gold", "diamond"].map((t, i) => [
    t,
    {
      effects: [`TEST ONLY ${t} effect ${i + 1}`],
      stats: { testValue: i + 1 },
    },
  ]),
);
const fixture = {
  schemaVersion: 1,
  version: "test-only-fixture",
  patchVersion: "TEST-ONLY",
  status: "ready",
  generatedAt: "2026-10-27T00:00:00Z",
  source: {
    id: "test-only",
    url: "https://example.invalid/test-only",
    dataPermission: "test-fixture-not-game-data",
    imagePermission: "test-fixture",
  },
  items: legacy.items.map((i) => ({
    id: i.id,
    nameEn: `Test ${i.id}`,
    nameKo: i.name,
    translationStatus: "official",
    heroes: [heroIds[heroNames.indexOf(i.hero)]],
    size: i.size,
    tags: i.tags,
    tiers,
    image: {
      path: i.id === "compass" ? "/images/items/test-only.png" : null,
      sourceUrl: null,
      status: i.id === "compass" ? "available" : "missing",
    },
    source: {
      id: i.id,
      url: "https://example.invalid/test-only",
      patchVersion: "TEST-ONLY",
    },
  })),
};
await writeFile(join(dir, "src/data/items.json"), JSON.stringify(fixture));
await mkdir(join(dir, "public/images/items"), { recursive: true });
await writeFile(
  join(dir, "public/images/items/test-only.png"),
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
);
async function run(args) {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, args, { cwd: dir, stdio: "inherit" });
    p.on("exit", (c) => (c === 0 ? res() : rej(Error(`QA build exited ${c}`))));
  });
}
await run([join(root, "node_modules/typescript/bin/tsc"), "-b"]);
await run([join(root, "node_modules/vite/bin/vite.js"), "build"]);
const server = spawn(
  process.execPath,
  [
    join(root, "node_modules/vite/bin/vite.js"),
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "5174",
    "--strictPort",
  ],
  { cwd: dir, stdio: "inherit" },
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.kill("SIGTERM");
  await rm(dir, { recursive: true, force: true });
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", async (code) => {
  if (!stopping) {
    await rm(dir, { recursive: true, force: true });
    process.exit(code ?? 0);
  }
});
