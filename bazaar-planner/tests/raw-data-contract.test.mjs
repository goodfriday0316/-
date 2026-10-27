/**
 * Diagnostic contract tests, NOT a production raw-data adapter.
 * Every name, ID, effect, value and status below is synthetic. Only field shapes
 * follow the previously researched exporter. Known gaps are asserted explicitly;
 * passing these tests does not mean raw game data is supported.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertDataset, runPipeline } from '../scripts/update-items.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const protectedPaths = ['src/data/items.json', 'src/main.tsx', 'src/style.css', 'scripts/source-manifest.json'];
const originalFiles = await Promise.all(protectedPaths.map(p => fs.readFile(path.join(project, p))));
after(async () => {
  for (let i = 0; i < protectedPaths.length; i++) {
    assert.deepEqual(await fs.readFile(path.join(project, protectedPaths[i])), originalFiles[i], `Changed protected project file: ${protectedPaths[i]}`);
  }
});
const manifest = () => ({
  schemaVersion: 1,
  source: { id: 'offline-probe', name: 'Synthetic probe, not game data', url: 'https://probe.example/provenance' },
  patch: { version: 'SYNTHETIC-ONLY', verifiedAt: '2026-10-27T00:00:00Z', evidenceUrl: 'https://probe.example/patch', latestConfirmed: false },
  input: { type: 'file', location: 'fixture.json' },
  permissions: {
    data: { status: 'approved', reviewedBy: 'offline-test', reviewedAt: '2026-10-27T00:00:00Z', licenseName: 'Synthetic fixture authored for test', attribution: 'No game data', evidenceUrl: 'https://probe.example/fixture', scope: ['download', 'transform', 'redistribute'] },
    images: { status: 'unverified' },
  },
  images: { allowedHosts: [] },
});
const normalized = (overrides = {}) => ({
  id: 'synthetic-stable-id', nameEn: 'SYNTHETIC PROBE DEVICE', heroes: ['Vanessa'], size: 2, tags: ['synthetic'],
  tiers: { bronze: { effects: ['SYNTHETIC effect 23'], stats: { DamageAmount: 23, CooldownMax: 7500 } } },
  ...overrides,
});
const raw = (overrides = {}) => ({
  id: 'synthetic-stable-id', source_id: 'synthetic-stable-id', template_id: 'synthetic-template',
  internal_name: 'SyntheticInternal', name: 'SYNTHETIC PROBE DEVICE',
  hero: 'Vanessa', heroes: ['Vanessa'], type: 'Item', size: 'Medium',
  min_rarity: 'Bronze', max_rarity: 'Gold', rarity: 'Bronze', tiers: ['Bronze', 'Silver', 'Gold'],
  tags: ['synthetic'], visible_tags: ['synthetic'], hidden_tags: [], buy_prices: {}, sell_prices: {},
  description: 'Synthetic damage {ability.0}; synthetic time {ability.1}.', card_pack_id: 'synthetic-pack',
  raw_effects: {
    abilities: {
      '0': { $type: 'SyntheticAbility', Id: 'synthetic-ability-damage', Trigger: {}, Action: { $type: 'SyntheticDamageAction' } },
      '1': { $type: 'SyntheticAbility', Id: 'synthetic-ability-time', Trigger: {}, Action: { $type: 'SyntheticTimeAction' } },
    },
    auras: {},
    // Fixture contract only: absent attribute keys inherit; explicit zero replaces.
    // This is a test expectation, not proof of the full game's inheritance rules.
    tiers_raw: {
      Bronze: { Attributes: { DamageAmount: 23, CooldownMax: 7500, ChargeAmount: 1250 }, AbilityIds: ['synthetic-ability-damage', 'synthetic-ability-time'], AuraIds: [] },
      Silver: { Attributes: { DamageAmount: 61 } },
      Gold: { Attributes: { DamageAmount: 0 } },
    },
  },
  raw_effect_fields: ['abilities', 'auras', 'tiers_raw'],
  ...overrides,
});
const envelope = records => ({ schemaVersion: 1, patchVersion: 'SYNTHETIC-ONLY', items: records });
const output = records => convertDataset(envelope(records), manifest()).items;
const invalidRecord = predicate => error => error.code === 'INVALID_ITEMS' && predicate(error.report.invalidItems);
const noFetch = async () => { throw Error('Network forbidden in offline probe'); };

// These first tests establish the currently implemented normalized contract.
test('SUPPORTED: normalized IDs survive renaming; source namespace is retained', () => {
  const before = output([normalized()])[0];
  const afterRename = output([normalized({ nameEn: 'RENAMED SYNTHETIC PROBE' })])[0];
  assert.equal(before.id, 'offline-probe:synthetic-stable-id');
  assert.equal(before.id, afterRename.id);
  assert.equal(afterRename.source.id, 'synthetic-stable-id');
});
test('SUPPORTED: canonical multiple heroes, numeric sizes and explicit tier data are preserved', () => {
  for (const size of [1, 2, 3]) {
    const input = normalized({ heroes: ['Vanessa', 'Dooley', 'Neutral'], size });
    const item = output([input])[0];
    assert.equal(item.size, size); assert.deepEqual(item.heroes, input.heroes); assert.deepEqual(item.tiers, input.tiers);
  }
});
test('SUPPORTED: conflicting normalized IDs reject; missing lower tiers are never fabricated', () => {
  assert.throws(() => output([normalized(), normalized({ size: 3 })]), invalidRecord(rows => rows[0].code === 'DUPLICATE_CONFLICT'));
  const item = output([normalized({ tiers: { silver: { effects: ['SYNTHETIC SILVER'], stats: { value: 0 } } } })])[0];
  assert.deepEqual(Object.keys(item.tiers), ['silver']); assert.equal(item.tiers.silver.stats.value, 0);
});

// Passing GAP tests confirm a limitation rather than claiming game compatibility.
test('GAP: name-keyed cards_generated root and enveloped raw records are not decoded', () => {
  assert.throws(() => convertDataset({ 'SYNTHETIC PROBE DEVICE': raw() }, manifest()), e => e.code === 'DATASET_INVALID');
  assert.throws(() => output([raw()]), invalidRecord(rows => rows[0].code === 'ITEM_INVALID'));
});
test('GAP: source_id is not interpreted or reconciled with a normalized id', () => {
  assert.throws(() => output([normalized({ id: undefined, source_id: 'synthetic-source-only' })]), invalidRecord(rows => rows[0].code === 'ITEM_INVALID'));
  const item = output([normalized({ id: 'synthetic-alias', source_id: 'synthetic-canonical' })])[0];
  assert.equal(item.source.id, 'synthetic-alias');
  assert.notEqual(item.source.id, 'synthetic-canonical');
});
test('GAP: Common and unresolved Hero8 are rejected; string sizes require an adapter', () => {
  for (const hero of ['Common', 'Hero8']) assert.throws(() => output([normalized({ heroes: [hero] })]), invalidRecord(rows => rows[0].code === 'ITEM_INVALID'));
  for (const size of ['Small', 'Medium', 'Large', 'Unknown']) assert.throws(() => output([normalized({ size })]), invalidRecord(rows => rows[0].code === 'ITEM_INVALID'));
});
test('GAP: sparse tier attributes are not inherited by the current normalized importer', () => {
  const source = raw();
  const partial = normalized({
    raw_effects: source.raw_effects,
    tiers: {
      bronze: { effects: ['SYNTHETIC BRONZE'], stats: source.raw_effects.tiers_raw.Bronze.Attributes },
      silver: { effects: ['SYNTHETIC SILVER'], stats: source.raw_effects.tiers_raw.Silver.Attributes },
      gold: { effects: ['SYNTHETIC GOLD'], stats: source.raw_effects.tiers_raw.Gold.Attributes },
    },
  });
  const item = output([partial])[0];
  // Expected effective Silver under the explicit synthetic inheritance contract:
  const expected = { DamageAmount: 61, CooldownMax: 7500, ChargeAmount: 1250 };
  assert.notDeepEqual(item.tiers.silver.stats, expected);
  assert.equal(item.tiers.silver.stats.CooldownMax, undefined);
  assert.equal(item.tiers.silver.stats.ChargeAmount, undefined);
  assert.equal(item.tiers.gold.stats.DamageAmount, 0);
});
test('GAP: description is ignored and unresolved placeholders in effects pass through unchanged', () => {
  const source = raw();
  const item = output([normalized({ description: source.description, raw_effects: source.raw_effects, tiers: { bronze: { effects: [source.description], stats: { DamageAmount: 23, ChargeAmount: 1250 } } } })])[0];
  const fullyResolvedSyntheticExpectation = 'Synthetic damage 23; synthetic time 1.25.';
  assert.equal(item.tiers.bronze.effects[0], source.description);
  assert.notEqual(item.tiers.bronze.effects[0], fullyResolvedSyntheticExpectation);
  assert.match(item.tiers.bronze.effects[0], /\{ability\.0\}/);
  assert.equal('description' in item, false);
  // No binding from ability index to an attribute/unit was inferred or published.
});
test('GAP: raw ability/aura references are neither interpreted nor preserved in normalized output', () => {
  const item = output([normalized({ raw_effects: raw().raw_effects })])[0];
  assert.equal('raw_effects' in item, false);
  assert.equal(JSON.stringify(item).includes('synthetic-ability-damage'), false);
});
test('GAP: activity/type/debug/template metadata needs a separate reviewed filter', () => {
  // active:false here is a hypothetical synthetic flag, NOT a claim that the
  // researched raw export contains a reliable activity flag.
  const records = [
    normalized({ id: 'synthetic-debug', nameEn: '[DEBUG] SYNTHETIC ONLY' }),
    normalized({ id: 'synthetic-template-record', nameEn: '[SYNTHETIC TEMPLATE]' }),
    normalized({ id: 'synthetic-inactive', active: false }),
    normalized({ id: 'synthetic-skill', type: 'Skill' }),
    normalized({ id: 'synthetic-ordinary', nameEn: 'SYNTHETIC Test Bench' }),
  ];
  const items = output(records);
  assert.equal(items.length, records.length);
  for (const record of records) assert.ok(items.some(i => i.source.id === record.id));
});
test('BOUNDARY: Legendary is rejected explicitly instead of silently becoming Diamond', () => {
  for (const tier of ['legendary', 'Legendary', 'Bronze']) {
    assert.throws(() => output([normalized({ tiers: { [tier]: { effects: ['SYNTHETIC'] } } })]), invalidRecord(rows => rows[0].code === 'TIER_INVALID'));
  }
});
test('SAFETY: raw fixture rejection and missing permission leave the existing catalog unchanged', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bazaar-raw-probe-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const m = manifest(); const manifestPath = path.join(root, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(m));
  await fs.writeFile(path.join(root, 'fixture.json'), JSON.stringify({ 'SYNTHETIC PROBE DEVICE': raw() }));
  const target = path.join(root, 'src/data/items.json'); await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, 'SYNTHETIC SENTINEL: KEEP');
  await assert.rejects(runPipeline({ root, manifestPath, fetchImpl: noFetch }), e => e.code === 'DATASET_INVALID');
  assert.equal(await fs.readFile(target, 'utf8'), 'SYNTHETIC SENTINEL: KEEP');
  m.permissions.data.status = 'unverified'; m.input = { type: 'url', location: 'https://probe.example/no-request.json' };
  await fs.writeFile(manifestPath, JSON.stringify(m)); let requests = 0;
  await assert.rejects(runPipeline({ root, manifestPath, fetchImpl: async () => { requests++; return noFetch(); } }), e => e.code === 'PERMISSION_REQUIRED');
  assert.equal(requests, 0); assert.equal(await fs.readFile(target, 'utf8'), 'SYNTHETIC SENTINEL: KEEP');
});
