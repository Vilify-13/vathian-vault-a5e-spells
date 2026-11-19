import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { test } from 'node:test';
import { build, convert, moduleId, partNames, readSnapshot, sha256 } from './build.mjs';
import { canonicalCodec } from './source.mjs';

// Synthetic test data exercises the contract only.
const adapter = {
  evidence: { version: '1.5.0', spellModel: 'fixture', baseModel: 'fixture',
    metadata: 'fixture', classConfig: 'fixture', actions: 'fixture' },
  classIds: ['test-divine', 'test-herald', 'test-arcane'],
  clericClassId: 'test-divine',
  heraldClassId: 'test-herald',
  manifest: manifest => manifest,
  records: payload => payload.rows,
  map: raw => raw,
  slugify: value => value.toLowerCase().replaceAll(' ', '-'),
  validateItem: item => item.type === 'spell'
};

function row(key) {
  return { key, name: 'Fixture variant', tags: ['Test Tag'], unresolved: ['Target automation unverified'],
    associations: [{ class: 'Herald', deity: 'Exact Fixture Name', evidence: 'fixture field' }],
    classAliases: { 'test-herald': 'Vathian Herald' },
    system: { classes: ['test-herald', 'test-arcane'], level: 1, prepared: 0, components: {
      vocalized: true, seen: false, material: false
    }, concentration: true, materials: '', materialsConsumed: false, disciplines: [],
    prerequisite: '', rare: false, ritual: true, schools: {}, spellBook: '', description: {},
    source: {}, slug: 'fixture-variant', actions: { fixture: { target: 'fixture' } } } };
}

test('preserves same-name variants, exact associations, native tags, actions, and arcane access', () => {
  const rows = [row('key-a'), row('key-b'), { key: 'key-c', omit: 'retired', omissionEvidence: 'fixture field' }];
  const { items, inventory } = convert(rows, adapter);
  assert.equal(items.length, 2);
  assert.deepEqual(convert(rows.toReversed(), adapter).items, items);
  assert.equal(new Set(items.map(item => item._id)).size, 2);
  for (const item of items) {
    assert.match(item._id, /^[A-Za-z0-9]{16}$/);
    assert.deepEqual(item.system.classes, rows[0].system.classes);
    assert.deepEqual(item.system.actions, rows[0].system.actions);
    assert.deepEqual(item.system.tags, ['test-tag', 'exact-fixture-name']);
    assert.deepEqual(item.flags[moduleId].deityAssociations, rows[0].associations);
  }
  assert.equal(inventory[2].disposition, 'retired');
  assert.deepEqual(inventory[0].unresolved, rows[0].unresolved);
});

test('rejects duplicate identities, unsupported omissions, invalid classes, and unmatched associations', () => {
  assert.throws(() => convert([row('a'), row('a')], adapter), /duplicate immutable/);
  assert.throws(() => convert([{ key: 'a', omit: 'index-only' }], adapter), /Unsupported omission/);
  const invalid = row('a');
  invalid.system.classes = ['invalid'];
  assert.throws(() => convert([invalid], adapter), /Invalid native classes/);
  invalid.system.classes = ['test-arcane'];
  assert.throws(() => convert([invalid], adapter), /Unsupported deity association/);
});

test('verified Vault codec checks the manifest, record identity and decoded count', () => {
  const manifest = { version: 1, format: 'multipart-gzip-json', count: 1, parts: partNames };
  assert.equal(canonicalCodec.manifest(manifest).layout, 'joined');
  assert.throws(() => canonicalCodec.manifest({ ...manifest, parts: partNames.toReversed() }));
  const row = Object.fromEntries(['name', 'origin', 'school', 'summary', 'castingTime', 'range', 'target', 'area',
    'duration', 'components', 'savingThrow', 'damage', 'higherLevels', 'rules'].map(field => [field, 'fixture']));
  Object.assign(row, { id: 'fixture', level: null, ritual: false, classes: [], deities: [], themes: [] });
  const payload = { version: 1, sourceDate: '2026-11-02', count: 1, records: [row] };
  assert.deepEqual(canonicalCodec.records(payload, 0, manifest), [row]);
  assert.throws(() => canonicalCodec.records({ ...payload, records: [] }, 0, manifest));
  assert.throws(() => canonicalCodec.records({ ...payload, count: 2, records: [row, row] }, 0, { ...manifest, count: 2 }),
    /duplicate Vault record ID/);
});

for (const layout of ['per-part', 'joined']) {
  test(`builds and audits canonical-sized synthetic ${layout} input`, async () => {
    const buildRoot = fileURLToPath(new URL('./build/', import.meta.url));
    await mkdir(buildRoot, { recursive: true });
    const root = await mkdtemp(path.join(buildRoot, 'vathian-spell-test-'));
    const rows = Array.from({ length: 819 }, (_, index) => row('fixture-' + index));
    rows[818] = { key: 'fixture-818', omit: 'index-only', omissionEvidence: 'fixture field' };
    const compressed = gzipSync(JSON.stringify({ rows }));
    const parts = layout === 'joined' ?
      [compressed.subarray(0, 17), compressed.subarray(17, 211), compressed.subarray(211)] :
      [0, 273, 546].map(start => gzipSync(JSON.stringify({ rows: rows.slice(start, start + 273) })));
    const hashes = Object.fromEntries(partNames.map((name, index) => [name, sha256(parts[index])]));
    const manifest = { encoding: 'multipart-gzip-json', parts: partNames, layout, countBasis: 'decoded', count: 819, sha256: hashes };
    await Promise.all(partNames.map((name, index) => writeFile(path.join(root, name), parts[index])));
    await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
    const adapterFile = path.join(root, 'fixture.mjs');
    await writeFile(adapterFile, `export default { ...${JSON.stringify(adapter)},
      manifest: ${adapter.manifest.toString()}, records: ${adapter.records.toString()}, map: ${adapter.map.toString()},
      slugify: ${adapter.slugify.toString()}, validateItem: ${adapter.validateItem.toString()} };`);
    const out = path.join(root, 'build');
    await build(root, adapterFile, out);
    const audit = JSON.parse(await readFile(path.join(out, 'audit.json'), 'utf8'));
    assert.equal(audit.decoded, 819);
    assert.equal(audit.included, 818);
    assert.equal(audit.omitted, 1);
    assert.equal(audit.withUnresolvedMechanics, 818);
    assert.equal((await readdir(path.join(out, 'items'))).length, 818);
    await assert.rejects(build(root, adapterFile, out), { code: 'EEXIST' });
    const release = spawnSync(process.execPath, [fileURLToPath(new URL('./pack.mjs', import.meta.url)),
      out, path.join(root, 'unused.mjs'), path.join(root, 'release')], { encoding: 'utf8' });
    if (release.error) throw release.error;
    assert.notEqual(release.status, 0);
    assert.match(release.stderr, /Resolve mechanics/);
    await writeFile(path.join(root, partNames[0]), Buffer.from('damaged'));
    await assert.rejects(readSnapshot(root, adapter), /Manifest digest mismatch/);
  });
}
