#!/usr/bin/env node
/** Bulk data importer. Rights approval is a reviewed manifest, never a CLI bypass. */
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isIP } from 'node:net';

const HEROES = new Set(['Vanessa', 'Pygmalien', 'Dooley', 'Mak', 'Stelle', 'Jules', 'Karnok', 'Dragons', 'Neutral']);
const TIERS = new Set(['bronze', 'silver', 'gold', 'diamond']);
const DATA_SCOPES = ['download', 'transform', 'redistribute'];
const IMAGE_SCOPES = ['download', 'redistribute'];
const DEFAULT_DATA_LIMIT = 25 * 1024 * 1024;
const DEFAULT_IMAGE_LIMIT = 5 * 1024 * 1024;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 500) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const stable = value => JSON.stringify(value, (_, val) => plain(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val);
const safeSegment = value => value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
const publicPermission = value => value?.status === 'approved' ? { status: value.status, evidenceUrl: value.evidenceUrl, licenseName: value.licenseName, attribution: value.attribution, scope: [...value.scope] } : { status: 'unverified' };

export class PipelineError extends Error {
  constructor(code, message, report) { super(message); this.name = 'PipelineError'; this.code = code; this.report = report; }
}
function fail(code, message, report) { throw new PipelineError(code, message, report); }
function httpsUrl(value, label = 'URL') {
  let url;
  try { url = new URL(value); } catch { fail('INVALID_URL', `${label} must be an HTTPS URL.`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || isIP(url.hostname) || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local') || !url.hostname.includes('.')) fail('INVALID_URL', `${label} must use a public HTTPS hostname without credentials or a custom port.`);
  return url;
}
function restricted(url) {
  const u = httpsUrl(url);
  const host = u.hostname.toLowerCase();
  if (host === 'bazaardb.gg' || host.endsWith('.bazaardb.gg')) return 'BazaarDB terms restrict copying and reuse for similar websites.';
  if (['github.com', 'api.github.com', 'raw.githubusercontent.com', 'codeload.github.com'].includes(host) && /(?:^|\/)lifein-ai\/(?:repos\/)?bazaar-helper(?:\/|$)/i.test(u.pathname.replace(/^\/repos\//, '/'))) return 'lifein-ai/bazaar-helper has no verified redistribution license.';
  return null;
}
function permission(value, needed, label) {
  if (!plain(value) || value.status !== 'approved' || !text(value.reviewedBy, 150) || !text(value.reviewedAt, 50) || !Number.isFinite(Date.parse(value.reviewedAt)) || !Array.isArray(value.scope) || needed.some(scope => !value.scope.includes(scope))) fail('PERMISSION_REQUIRED', `${label} permission needs a reviewed approval and scopes: ${needed.join(', ')}.`);
  httpsUrl(value.evidenceUrl, `${label} permission evidence`);
  if (!text(value.licenseName, 250) || !text(value.attribution, 2000)) fail('PERMISSION_REQUIRED', `${label} permission needs licenseName and attribution.`);
  return value;
}
export function validateManifest(raw) {
  if (!plain(raw) || raw.schemaVersion !== 1 || !plain(raw.source) || !/^[a-z][a-z0-9-]{1,49}$/.test(raw.source.id) || !text(raw.source.name, 150)) fail('MANIFEST_INVALID', 'Manifest needs schemaVersion 1, source.id and source.name.');
  if (raw.source.revision !== undefined && !/^[a-zA-Z0-9._-]{1,100}$/.test(raw.source.revision)) fail('MANIFEST_INVALID', 'Optional source.revision must be a stable supplier revision.');
  const sourceUrl = httpsUrl(raw.source.url, 'Source provenance URL');
  const reason = restricted(sourceUrl.href);
  if (reason) fail('SOURCE_RESTRICTED', reason);
  permission(raw.permissions?.data, DATA_SCOPES, 'Data');
  if (!plain(raw.patch) || !text(raw.patch.version, 100) || /^(?:latest|unknown|unverified)$/i.test(raw.patch.version) || !text(raw.patch.verifiedAt, 50) || !Number.isFinite(Date.parse(raw.patch.verifiedAt))) fail('PATCH_REQUIRED', 'An explicit patch version and verification date are required.');
  httpsUrl(raw.patch.evidenceUrl, 'Patch evidence URL');
  if (!plain(raw.input) || !['file', 'url'].includes(raw.input.type) || !text(raw.input.location, 2000)) fail('MANIFEST_INVALID', 'Input must be a file or an HTTPS JSON export.');
  if (raw.input.type === 'url') {
    const inputUrl = httpsUrl(raw.input.location, 'Data URL');
    const inputReason = restricted(inputUrl.href);
    if (inputReason) fail('SOURCE_RESTRICTED', inputReason);
  }
  if (raw.localization?.officialKorean === true) httpsUrl(raw.localization.evidenceUrl, 'Official Korean localization evidence');
  const approvedImages = raw.permissions?.images?.status === 'approved';
  if (approvedImages) {
    permission(raw.permissions.images, IMAGE_SCOPES, 'Images');
    if (!Array.isArray(raw.images?.allowedHosts) || raw.images.allowedHosts.length === 0 || raw.images.allowedHosts.some(host => !text(host, 253) || httpsUrl(`https://${host}`).hostname !== host)) fail('MANIFEST_INVALID', 'Approved images need an exact allowedHosts list.');
    for (const host of raw.images.allowedHosts) { const why = restricted(`https://${host}`); if (why) fail('SOURCE_RESTRICTED', why); }
  }
  return raw;
}
async function readLimitedResponse(response, limit) {
  const headerLength = Number(response.headers.get('content-length') || 0);
  if (headerLength > limit) fail('SIZE_LIMIT', 'Remote response exceeds the configured size limit.');
  const chunks = []; let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > limit) { await response.body.cancel().catch(() => {}); fail('SIZE_LIMIT', 'Remote response exceeds the configured size limit.'); }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
async function fetchBytes(urlString, { fetchImpl, allowedHosts, limit, image = false }, depth = 0) {
  const url = httpsUrl(urlString);
  if (!allowedHosts.includes(url.hostname)) fail('HOST_NOT_ALLOWED', 'Remote hostname is outside the reviewed allowlist.');
  const reason = restricted(url.href); if (reason) fail('SOURCE_RESTRICTED', reason);
  const response = await fetchImpl(url.href, { redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { Accept: image ? 'image/png,image/jpeg,image/webp' : 'application/json', 'User-Agent': 'BazaarDeckPlanner-AuthorizedImport/1.0' } });
  if (response.status >= 300 && response.status < 400) {
    if (depth >= 3) fail('REDIRECT_LIMIT', 'Too many redirects.');
    const location = response.headers.get('location'); if (!location) fail('INVALID_REDIRECT', 'Redirect did not include a location.');
    return fetchBytes(new URL(location, url).href, { fetchImpl, allowedHosts, limit, image }, depth + 1);
  }
  if (!response.ok) fail('HTTP_ERROR', `Remote request failed with HTTP ${response.status}.`);
  const bytes = await readLimitedResponse(response, limit);
  return { bytes, contentType: (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), finalUrl: url.href };
}
function imageExtension(bytes, contentType) {
  if (contentType === 'image/png' && bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (contentType === 'image/jpeg' && bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (contentType === 'image/webp' && bytes.length >= 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'webp';
  fail('IMAGE_FORMAT', 'Only PNG, JPEG and WebP with matching MIME type and file signature are accepted.');
}
function normalizeRecord(raw, manifest, index) {
  if (!plain(raw) || !text(raw.id, 250) || !text(raw.nameEn, 300) || !Array.isArray(raw.heroes) || raw.heroes.length === 0 || raw.heroes.some(h => !HEROES.has(h)) || ![1, 2, 3].includes(raw.size) || !Array.isArray(raw.tags) || raw.tags.length > 100 || raw.tags.some(t => !text(t, 150)) || !plain(raw.tiers) || Object.keys(raw.tiers).length === 0) fail('ITEM_INVALID', `Item at index ${index} is missing an ID, English name, canonical heroes, size, tags or tiers.`);
  if (raw.patchVersion !== undefined && raw.patchVersion !== manifest.patch.version) fail('PATCH_MISMATCH', `Item at index ${index} declares a different patch.`);
  const tiers = {};
  for (const [tier, value] of Object.entries(raw.tiers)) {
    if (!TIERS.has(tier) || !plain(value) || !Array.isArray(value.effects) || value.effects.length > 100 || value.effects.some(effect => !text(effect, 10000))) fail('TIER_INVALID', `Item at index ${index} has an invalid tier.`);
    const stats = value.stats;
    if (stats !== undefined && (!plain(stats) || Object.entries(stats).some(([key, v]) => !text(key, 150) || !(typeof v === 'string' && v.length <= 2000 || typeof v === 'number' && Number.isFinite(v))))) fail('TIER_INVALID', `Item at index ${index} has unsupported tier stats.`);
    if (value.effects.length === 0 && (!stats || Object.keys(stats).length === 0)) fail('TIER_INVALID', `Item at index ${index} has neither source effects nor source stats.`);
    tiers[tier] = { effects: [...value.effects], ...(stats === undefined ? {} : { stats: { ...stats } }) };
  }
  const translated = manifest.localization?.officialKorean === true && raw.nameKoOfficial === true && text(raw.nameKo, 300);
  const sourceUrl = raw.sourceUrl === undefined ? manifest.source.url : httpsUrl(raw.sourceUrl, 'Item source URL').href;
  const sourceReason = restricted(sourceUrl); if (sourceReason) fail('SOURCE_RESTRICTED', sourceReason);
  let imageUrl = null;
  if (raw.imageUrl !== undefined && raw.imageUrl !== null && raw.imageUrl !== '') imageUrl = httpsUrl(raw.imageUrl, 'Item image URL').href;
  return { id: `${manifest.source.id}:${raw.id}`, nameEn: raw.nameEn, nameKo: translated ? raw.nameKo : null, translationStatus: translated ? 'official' : 'untranslated', heroes: [...new Set(raw.heroes)], size: raw.size, tags: [...new Set(raw.tags)], tiers, image: { path: null, sourceUrl: imageUrl, status: imageUrl ? 'unlicensed' : 'missing' }, source: { url: sourceUrl, patchVersion: manifest.patch.version, id: raw.id } };
}
export function convertDataset(input, manifest) {
  if (!plain(input) || input.schemaVersion !== 1 || input.patchVersion !== manifest.patch.version || !Array.isArray(input.items) || input.items.length === 0 || input.items.length > 20000) fail('DATASET_INVALID', 'Supplier export must have schemaVersion 1, the exact patchVersion and 1–20000 items.');
  const unique = new Map(); const invalid = []; let duplicateCount = 0;
  for (let index = 0; index < input.items.length; index++) {
    try {
      const item = normalizeRecord(input.items[index], manifest, index);
      const previous = unique.get(item.id);
      if (previous && stable(previous) !== stable(item)) fail('DUPLICATE_CONFLICT', `Conflicting duplicate source ID at index ${index}.`);
      if (previous) duplicateCount++; else unique.set(item.id, item);
    } catch (error) { invalid.push({ index, id: typeof input.items[index]?.id === 'string' ? input.items[index].id : null, code: error.code || 'ITEM_INVALID', message: error.message }); }
  }
  if (invalid.length) fail('INVALID_ITEMS', `${invalid.length} invalid or conflicting source record(s). No catalog was published.`, { invalidItems: invalid });
  return { items: [...unique.values()].sort((a, b) => a.id.localeCompare(b.id)), duplicateCount };
}
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function commit(staged, root, entries) {
  const completed = [];
  try {
    for (const entry of entries) {
      const destination = path.join(root, entry); const incoming = path.join(staged, 'new', entry); const backup = path.join(staged, 'old', entry);
      await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.mkdir(path.dirname(backup), { recursive: true });
      const hadPrevious = await exists(destination);
      if (hadPrevious) await fs.rename(destination, backup);
      try { await fs.rename(incoming, destination); } catch (error) { if (hadPrevious) await fs.rename(backup, destination); throw error; }
      completed.push({ destination, backup, hadPrevious });
    }
  } catch (error) {
    for (const { destination, backup, hadPrevious } of completed.reverse()) { await fs.rm(destination, { recursive: true, force: true }); if (hadPrevious) await fs.rename(backup, destination); }
    throw error;
  }
}
async function writeJson(file, value) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n'); }
export async function runPipeline({ manifestPath, root, dryRun = false, fetchImpl = globalThis.fetch, now = () => new Date().toISOString() }) {
  if (!root || !manifestPath) fail('ARGUMENT_REQUIRED', 'root and manifestPath are required.');
  const resolvedRoot = path.resolve(root); const resolvedManifest = path.resolve(manifestPath);
  const manifest = validateManifest(JSON.parse(await fs.readFile(resolvedManifest, 'utf8')));
  // Permission and restricted-source checks above must finish before any supplier read/network request.
  let bytes;
  if (manifest.input.type === 'file') {
    const inputFile = path.resolve(path.dirname(resolvedManifest), manifest.input.location);
    const stat = await fs.stat(inputFile); if (!stat.isFile() || stat.size > DEFAULT_DATA_LIMIT) fail('SIZE_LIMIT', 'Local export is not a file or exceeds 25 MiB.');
    bytes = await fs.readFile(inputFile);
  } else {
    const inputUrl = httpsUrl(manifest.input.location);
    bytes = (await fetchBytes(inputUrl.href, { fetchImpl, allowedHosts: [inputUrl.hostname], limit: DEFAULT_DATA_LIMIT })).bytes;
  }
  let input; try { input = JSON.parse(bytes.toString('utf8')); } catch { fail('JSON_INVALID', 'Supplier export is not valid JSON.'); }
  const { items, duplicateCount } = convertDataset(input, manifest);
  const generatedAt = now();
  const version = `${manifest.source.id}@${manifest.patch.version}${manifest.source.revision ? `+${manifest.source.revision}` : ''}`;
  const stage = path.join(resolvedRoot, `.data-stage-${randomUUID()}`); const imageDir = path.join(stage, 'new', 'public', 'images', 'items');
  const missingImages = []; let imageSuccess = 0;
  await fs.mkdir(imageDir, { recursive: true });
  try {
    const oldImages = path.join(resolvedRoot, 'public', 'images', 'items');
    if (await exists(oldImages)) await fs.cp(oldImages, imageDir, { recursive: true });
    for (const item of items) {
      if (!item.image.sourceUrl) { missingImages.push({ id: item.id, nameEn: item.nameEn, reason: 'no-source-image-url' }); continue; }
      if (manifest.permissions?.images?.status !== 'approved') { missingImages.push({ id: item.id, nameEn: item.nameEn, reason: 'image-rights-unverified', sourceUrl: item.image.sourceUrl }); continue; }
      try {
        const result = await fetchBytes(item.image.sourceUrl, { fetchImpl, allowedHosts: manifest.images.allowedHosts, limit: DEFAULT_IMAGE_LIMIT, image: true });
        const extension = imageExtension(result.bytes, result.contentType);
        const filename = `${sha(Buffer.from(item.id)).slice(0, 16)}-${sha(result.bytes).slice(0, 16)}.${extension}`;
        await fs.writeFile(path.join(imageDir, filename), result.bytes);
        item.image.path = `/images/items/${filename}`; item.image.status = 'available'; imageSuccess++;
      } catch (error) { item.image.status = 'missing'; missingImages.push({ id: item.id, nameEn: item.nameEn, reason: error.code || 'image-download-failed', sourceUrl: item.image.sourceUrl }); }
    }
    const untranslated = items.filter(item => item.translationStatus === 'untranslated').map(item => ({ id: item.id, nameEn: item.nameEn }));
    const provenance = { retrievedAt: generatedAt, inputSha256: sha(bytes), permissionEvidence: { data: manifest.permissions.data, images: manifest.permissions.images || null }, patchEvidence: manifest.patch, supplier: manifest.source, localizationEvidence: manifest.localization || null };
    const publicSource = { id: manifest.source.id, name: manifest.source.name, url: manifest.source.url, ...(manifest.source.revision ? { revision: manifest.source.revision } : {}) };
    const publicLocalization = { officialKorean: manifest.localization?.officialKorean === true, ...(manifest.localization?.officialKorean === true ? { evidenceUrl: manifest.localization.evidenceUrl } : {}) };
    const publicProvenance = { retrievedAt: generatedAt, inputSha256: provenance.inputSha256, permissionEvidence: { data: publicPermission(manifest.permissions.data), images: publicPermission(manifest.permissions.images) }, patchEvidence: { version: manifest.patch.version, verifiedAt: manifest.patch.verifiedAt, evidenceUrl: manifest.patch.evidenceUrl, latestConfirmed: manifest.patch.latestConfirmed === true }, supplier: publicSource, localizationEvidence: publicLocalization };
    const catalog = { schemaVersion: 1, version, patchVersion: manifest.patch.version, status: 'ready', generatedAt, source: { id: manifest.source.id, url: manifest.source.url, dataPermission: manifest.permissions.data.evidenceUrl, imagePermission: manifest.permissions?.images?.status === 'approved' ? manifest.permissions.images.evidenceUrl : 'unverified' }, items, provenance: publicProvenance };
    const report = { generatedAt, version, patchVersion: manifest.patch.version, latestPatchConfirmed: manifest.patch.latestConfirmed === true, latestPatchEvidence: manifest.patch.evidenceUrl, itemCount: items.length, duplicateCount, imageCount: imageSuccess, missingImageCount: missingImages.length, imageSuccessRate: items.length ? imageSuccess / items.length : 0, officialKoreanCount: items.length - untranslated.length, untranslatedCount: untranslated.length, koreanTranslationRate: items.length ? (items.length - untranslated.length) / items.length : 0, invalidItems: [], missingImages, untranslatedItems: untranslated, provenance };
    const publicStatus = { schemaVersion: 1, status: 'ready', generatedAt, version, patchVersion: report.patchVersion, latestPatchConfirmed: report.latestPatchConfirmed, latestPatchEvidence: report.latestPatchEvidence, source: { id: manifest.source.id, name: manifest.source.name, url: manifest.source.url }, itemCount: report.itemCount, imageCount: report.imageCount, missingImageCount: report.missingImageCount, imageSuccessRate: report.imageSuccessRate, officialKoreanCount: report.officialKoreanCount, untranslatedCount: report.untranslatedCount, koreanTranslationRate: report.koreanTranslationRate, duplicateCount: report.duplicateCount, inputSha256: provenance.inputSha256, reports: { missingImages: '/data/missing-images.json', untranslatedItems: '/data/untranslated-items.json', attribution: '/data/attribution.json' } };
    const publicAttribution = { schemaVersion: 1, generatedAt, source: { id: manifest.source.id, name: manifest.source.name, url: manifest.source.url }, data: publicPermission(manifest.permissions.data), images: publicPermission(manifest.permissions.images), localization: publicLocalization };
    const archivePath = `data/versions/${safeSegment(version)}.json`;
    const archiveFile = path.join(resolvedRoot, archivePath);
    if (await exists(archiveFile)) {
      const previous = JSON.parse(await fs.readFile(archiveFile, 'utf8'));
      if (previous.provenance?.inputSha256 !== provenance.inputSha256) fail('VERSION_CONFLICT', 'This source/patch version already has a different immutable snapshot. Record the real supplier commit/export revision in source.revision; do not change the game patch or silently replace history.');
    }
    const outputs = { 'src/data/items.json': catalog, [archivePath]: catalog, 'data/reports/catalog-report.json': report, 'data/reports/missing-images.json': missingImages, 'data/reports/untranslated-items.json': untranslated, 'data/reports/invalid-items.json': [], 'public/data/status.json': publicStatus, 'public/data/missing-images.json': missingImages, 'public/data/untranslated-items.json': untranslated, 'public/data/attribution.json': publicAttribution };
    for (const [relative, value] of Object.entries(outputs)) await writeJson(path.join(stage, 'new', relative), value);
    if (!dryRun) await commit(stage, resolvedRoot, [...Object.keys(outputs), 'public/images/items']);
    return { catalog, report, published: !dryRun };
  } finally { await fs.rm(stage, { recursive: true, force: true }); }
}
async function main(args) {
  const options = {}; for (let i = 0; i < args.length; i++) { const key = args[i]; if (key === '--dry-run') options.dryRun = true; else if (key === '--manifest' || key === '--root') { if (!args[i + 1]) fail('ARGUMENT_REQUIRED', `${key} needs a path.`); options[key.slice(2)] = args[++i]; } else fail('ARGUMENT_INVALID', `Unknown argument: ${key}`); }
  const root = path.resolve(options.root || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const manifestPath = path.resolve(options.manifest || path.join(root, 'scripts', 'source-manifest.json'));
  try {
    const result = await runPipeline({ root, manifestPath, dryRun: options.dryRun });
    const { report } = result; console.log(JSON.stringify({ published: result.published, version: report.version, itemCount: report.itemCount, missingImageCount: report.missingImageCount, untranslatedCount: report.untranslatedCount, latestPatchConfirmed: report.latestPatchConfirmed }, null, 2));
  } catch (error) {
    if (error.report) { const rejectionPath = path.join(root, 'data', 'rejected', `${new Date().toISOString().replace(/[:.]/g, '-')}.json`); await writeJson(rejectionPath, { code: error.code, ...error.report }); }
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2)).catch(error => { console.error(`${error.code || 'UPDATE_FAILED'}: ${error.message}`); process.exitCode = 1; });
