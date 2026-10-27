import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runPipeline, validateManifest } from '../scripts/update-items.mjs';

const approved = scope => ({ status: 'approved', evidenceUrl: 'https://supplier.example/permission', licenseName: 'Synthetic test permission', attribution: 'Synthetic test provider — not game data', scope, reviewedBy: 'offline-test', reviewedAt: '2026-10-27T00:00:00Z' });
const fixtureManifest = () => ({ schemaVersion: 1, source: { id: 'test-provider', name: 'Synthetic offline test provider', url: 'https://supplier.example/provenance' }, input: { type: 'file', location: 'export.json' }, patch: { version: 'synthetic-test-patch', verifiedAt: '2026-10-27T00:00:00Z', evidenceUrl: 'https://supplier.example/patch', latestConfirmed: false }, permissions: { data: approved(['download', 'transform', 'redistribute']), images: { status: 'unverified' } }, images: { allowedHosts: [] } });
const record = (id = 'synthetic-item') => ({ id, nameEn: 'SYNTHETIC TEST ITEM', nameKo: '임의 번역은 배포하지 않음', nameKoOfficial: false, heroes: ['Vanessa'], size: 2, tags: ['synthetic'], tiers: { bronze: { effects: ['SYNTHETIC EFFECT — NOT GAME DATA'], stats: { value: 7, sourceText: 'unchanged' } }, gold: { effects: ['SYNTHETIC GOLD EFFECT'] } } });
async function setup(t, { records = [record()], manifest = fixtureManifest() } = {}) {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bazaar-pipeline-test-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
 await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
 await fs.writeFile(path.join(root, 'export.json'), JSON.stringify({ schemaVersion: 1, patchVersion: manifest.patch.version, items: records }));
 return { root, manifestPath: path.join(root, 'manifest.json') };
}
const noFetch = async () => { throw Error('Network must not be used for this test'); };

test('permission metadata is required before network or even source file read', async t => {
 const manifest = fixtureManifest(); manifest.permissions.data.status = 'unverified'; manifest.input = { type: 'url', location: 'https://supplier.example/export.json' };
 const opts = await setup(t, { manifest }); let requests = 0;
 await assert.rejects(runPipeline({ ...opts, fetchImpl: async () => { requests++; throw Error('never'); } }), e => e.code === 'PERMISSION_REQUIRED'); assert.equal(requests, 0);
});
test('known restricted source hosts/repo fail even with claimed approval', () => {
 for (const url of ['https://bazaardb.gg/items', 'https://api.github.com/repos/lifein-ai/bazaar-helper/contents/data', 'https://raw.githubusercontent.com/lifein-ai/bazaar-helper/main/data/cards.json']) {
  const manifest = fixtureManifest(); manifest.source.url = url;
  assert.throws(() => validateManifest(manifest), e => e.code === 'SOURCE_RESTRICTED');
 }
});
test('bulk conversion preserves source tier values, namespaces IDs and deduplicates', async t => {
 const raw = record(); const manifest = fixtureManifest(); manifest.source.reviewedBy = 'private-reviewer'; manifest.patch.reviewedBy = 'private-reviewer'; manifest.localization = { officialKorean: false, reviewedBy: 'private-reviewer' }; const opts = await setup(t, { records: [raw, structuredClone(raw)], manifest });
 const { catalog, report, published } = await runPipeline({ ...opts, fetchImpl: noFetch });
 assert.equal(published, true); assert.equal(catalog.items.length, 1); assert.equal(report.duplicateCount, 1);
 assert.equal(catalog.items[0].id, 'test-provider:synthetic-item'); assert.deepEqual(catalog.items[0].tiers, raw.tiers);
 assert.equal(catalog.items[0].nameKo, null); assert.equal(catalog.items[0].translationStatus, 'untranslated');
 assert.equal(catalog.items[0].image.status, 'missing'); assert.equal(report.untranslatedCount, 1);
 assert.match(catalog.provenance.inputSha256, /^[a-f0-9]{64}$/);
 const status = JSON.parse(await fs.readFile(path.join(opts.root, 'public/data/status.json'), 'utf8'));
 assert.equal(status.status, 'ready'); assert.equal(status.itemCount, 1); assert.equal(status.latestPatchConfirmed, false); assert.equal(status.untranslatedCount, 1);
 const attribution = JSON.parse(await fs.readFile(path.join(opts.root, 'public/data/attribution.json'), 'utf8'));
 assert.equal(attribution.data.licenseName, 'Synthetic test permission'); assert.equal(attribution.images.status, 'unverified');
 assert.equal(JSON.stringify(attribution).includes('reviewedBy'), false); assert.equal(JSON.stringify(attribution).includes('reviewedAt'), false);
 assert.equal(JSON.stringify(catalog).includes('reviewedBy'), false); assert.equal(JSON.stringify(catalog).includes('private-reviewer'), false); assert.equal(JSON.stringify(attribution).includes('private-reviewer'), false);
 assert.equal(JSON.parse(await fs.readFile(path.join(opts.root, 'public/data/missing-images.json'), 'utf8')).length, 1);
 assert.equal(JSON.parse(await fs.readFile(path.join(opts.root, 'public/data/untranslated-items.json'), 'utf8')).length, 1);
 assert.equal(JSON.parse(await fs.readFile(path.join(opts.root, 'src/data/items.json'), 'utf8')).version, 'test-provider@synthetic-test-patch');
});
test('conflicting duplicates and invalid records cannot replace an existing catalog', async t => {
 const first = record(); const second = record(); second.size = 3;
 const opts = await setup(t, { records: [first, second] });
 await fs.mkdir(path.join(opts.root, 'src/data'), { recursive: true }); await fs.writeFile(path.join(opts.root, 'src/data/items.json'), 'KEEP ORIGINAL');
 await assert.rejects(runPipeline({ ...opts, fetchImpl: noFetch }), e => e.code === 'INVALID_ITEMS' && e.report.invalidItems[0].code === 'DUPLICATE_CONFLICT');
 assert.equal(await fs.readFile(path.join(opts.root, 'src/data/items.json'), 'utf8'), 'KEEP ORIGINAL');
});
test('unlicensed image URLs are reported but never fetched', async t => {
 const raw = record(); raw.imageUrl = 'https://images.example/item.png';
 const opts = await setup(t, { records: [raw] }); let requests = 0;
 const { catalog, report } = await runPipeline({ ...opts, fetchImpl: async () => { requests++; throw Error('never'); } });
 assert.equal(requests, 0); assert.equal(catalog.items[0].image.status, 'unlicensed'); assert.equal(report.missingImageCount, 1);
 assert.equal(report.missingImages[0].reason, 'image-rights-unverified');
});
test('approved image downloads require exact host allowlist and a safe raster signature', async t => {
 const manifest = fixtureManifest(); manifest.permissions.images = approved(['download', 'redistribute']); manifest.images.allowedHosts = ['images.example']; manifest.localization = { officialKorean: true, evidenceUrl: 'https://supplier.example/official-localization' };
 const first = record('valid'); first.nameKo = '공식 테스트 명칭'; first.nameKoOfficial = true; first.imageUrl = 'https://images.example/valid.png';
 const second = record('svg'); second.imageUrl = 'https://images.example/unsafe.svg';
 const third = record('wrong-host'); third.imageUrl = 'https://other.example/wrong.png';
 const opts = await setup(t, { records: [first, second, third], manifest }); const urls = [];
 const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWHcAAAAASUVORK5CYII=', 'base64');
 const { catalog, report } = await runPipeline({ ...opts, fetchImpl: async url => { urls.push(url); return url.endsWith('.svg') ? new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }) : new Response(png, { headers: { 'content-type': 'image/png' } }); } });
 assert.equal(urls.length, 2); assert.equal(report.imageCount, 1); assert.equal(report.missingImageCount, 2);
 const item = catalog.items.find(i => i.source.id === 'valid'); assert.equal(item.image.status, 'available'); assert.equal(item.translationStatus, 'official');
 assert.deepEqual(await fs.readFile(path.join(opts.root, 'public', item.image.path)), png);
 assert.deepEqual(report.missingImages.map(i => i.reason).sort(), ['HOST_NOT_ALLOWED', 'IMAGE_FORMAT']);
});
test('data export patch mismatch refuses publication and dry-run leaves output untouched', async t => {
 const opts = await setup(t); const result = await runPipeline({ ...opts, fetchImpl: noFetch, dryRun: true }); assert.equal(result.published, false);
 await assert.rejects(fs.access(path.join(opts.root, 'src/data/items.json')));
 const json = JSON.parse(await fs.readFile(path.join(opts.root, 'export.json'), 'utf8')); json.patchVersion = 'different'; await fs.writeFile(path.join(opts.root, 'export.json'), JSON.stringify(json));
 await assert.rejects(runPipeline({ ...opts, fetchImpl: noFetch }), e => e.code === 'DATASET_INVALID');
});
test('same patch snapshot is immutable when supplier silently changes data', async t => {
 const opts = await setup(t); await runPipeline({ ...opts, fetchImpl: noFetch });
 const original = await fs.readFile(path.join(opts.root, 'src/data/items.json'), 'utf8');
 const json = JSON.parse(await fs.readFile(path.join(opts.root, 'export.json'), 'utf8')); json.items[0].tags.push('changed'); await fs.writeFile(path.join(opts.root, 'export.json'), JSON.stringify(json));
 await assert.rejects(runPipeline({ ...opts, fetchImpl: noFetch }), e => e.code === 'VERSION_CONFLICT');
 assert.equal(await fs.readFile(path.join(opts.root, 'src/data/items.json'), 'utf8'), original);
 assert.equal((await fs.readdir(opts.root)).filter(name => name.startsWith('.data-stage-')).length, 0);
});
test('remote JSON uses reviewed exact host and refuses redirects to unrelated hosts', async t => {
 const manifest = fixtureManifest(); manifest.input = { type: 'url', location: 'https://supplier.example/export.json' };
 const opts = await setup(t, { manifest }); let requests = 0;
 await assert.rejects(runPipeline({ ...opts, fetchImpl: async () => { requests++; return new Response(null, { status: 302, headers: { location: 'https://other.example/copy.json' } }); } }), e => e.code === 'HOST_NOT_ALLOWED');
 assert.equal(requests, 1);
});
