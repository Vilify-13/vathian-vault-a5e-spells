import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { readSnapshot, moduleId, sha256 } from './build.mjs';
import { canonicalCodec } from './source.mjs';
import { inspectUpstream } from './upstream-evidence.mjs';
import { mechanicalPlan } from './native-adapter.mjs';

test('literal action and cost planning preserves conditional or mixed costs for manual handling', () => {
  const raw = { castingTime: '1 bonus action', range: 'Short (30 feet)', target: '', area: '20-foot-radius sphere',
    duration: 'Concentration (1 minute)', ritual: false };
  const componentProposal = { components: { vocalized: true, seen: false, material: true },
    materials: 'a diamond worth 1,000 gp, consumed', materialsConsumed: null };
  const plan = mechanicalPlan({ raw, componentProposal, concentrationProposal: true, sourceFlags: { quest: false } });
  assert.deepEqual(plan.activation, { value: 1, unit: 'bonus action' });
  assert.deepEqual(plan.range, { kind: 'distance', value: 30, unit: 'feet' });
  assert.deepEqual(plan.targeting, { kind: 'sphere', value: 20, unit: 'feet', measure: 'radius' });
  assert.deepEqual(plan.duration, { kind: 'timed', value: 1, unit: 'minute', concentration: true });
  assert.deepEqual(plan.materials.prices, [{ text: '1,000 gp', amount: 1000, currency: 'gp' }]);
  assert.equal(plan.materials.consumed, true);
  assert.equal(plan.cost.automaticResourceSpend, false);
  const mixed = mechanicalPlan({ raw: { ...raw, castingTime: '1 action or ritual', range: 'Self or 30 feet',
    target: 'One creature', duration: '1 hour per class level' },
  componentProposal: { ...componentProposal, materials: 'a gem worth 100 gp and a vial worth 5 sp, consumed' },
  concentrationProposal: null, sourceFlags: { quest: true } });
  assert.deepEqual([mixed.activation, mixed.range, mixed.targeting, mixed.duration, mixed.materials.consumed],
    [null, null, null, null, null]);
  assert.equal(mixed.materials.wholeCostManual, true);
  assert.equal(mixed.cost.automaticResourceSpend, false);
});

test('all Item fragments match approved per-record classes and source text with official evidence absent', async context => {
  const repo = fileURLToPath(new URL('./', import.meta.url));
  const input = path.resolve(repo, '../vathian-spell-source-20261118');
  let snapshot;
  try {
    snapshot = await readSnapshot(input, canonicalCodec);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    context.skip('Private canonical transfer unavailable');
    return;
  }
  await mkdir(path.join(repo, 'build'), { recursive: true });
  const temp = await mkdtemp(path.join(repo, 'build', 'native-test-'));
  const empty = path.join(temp, 'missing-evidence');
  const out = path.join(temp, 'staged');
  const evidence = await inspectUpstream(empty);
  assert.equal(evidence.directoryPresent, false);
  assert.ok(evidence.missing.includes('actionModel'));
  const run = (...args) => spawnSync(process.execPath, args, { cwd: repo, encoding: 'utf8', shell: false });
  const build = run('native-adapter.mjs', 'build', input, empty, path.join(temp, 'missing-binding'), path.join(temp, 'candidate'));
  assert.notEqual(build.status, 0);
  assert.match(build.stderr, /Incomplete official source staging/);
  const stage = run('native-adapter.mjs', 'stage', input, empty, out);
  assert.equal(stage.status, 0, stage.stderr);
  const files = await readFile(path.join(out, 'item-fragments.json'));
  const checksums = JSON.parse(await readFile(path.join(out, 'checksums.json')));
  assert.equal(checksums['item-fragments.json'], sha256(files));
  const items = JSON.parse(files);
  const audit = JSON.parse(await readFile(path.join(out, 'audit.json')));
  assert.equal(audit.status, 'native-item-fragments-not-packable');
  assert.equal(audit.nativeValidation, null);
  assert.deepEqual(audit.classCounts, { wizard: 519, sorcerer: 75, cleric: 361, herald: 333 });
  assert.deepEqual([audit.quest, audit.level9, audit.withDeities, audit.heraldOnly, audit.untaggedHeraldOnly,
    audit.untaggedExplicitHerald, audit.automatedActions], [28, 52, 318, 11, 4, 15, 0]);
  const byKey = new Map(items.map(item => [item.flags[moduleId].sourceKey, item]));
  assert.equal(items.length, 819);
  assert.equal(byKey.size, items.length);
  for (const raw of snapshot.records) {
    const item = byKey.get(raw.id);
    assert.equal(item.flags[moduleId].canonicalRules, raw.rules);
    assert.deepEqual(item.flags[moduleId].originalClasses, raw.classes);
    assert.deepEqual(item.flags[moduleId].exactDeityNames, raw.deities);
    assert.ok(!Object.hasOwn(item.system, 'actions'));
  }
  const pack = run('pack.mjs', out, path.join(temp, 'missing-driver'), path.join(temp, 'release'));
  assert.notEqual(pack.status, 0);
  assert.match(pack.stderr, /Resolve mechanics/);
});
