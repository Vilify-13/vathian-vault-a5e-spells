import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { readSnapshot, moduleId, convert } from './build.mjs';
import { canonicalCodec } from './source.mjs';
import { classNames, createNativeAdapter, prepareCanonical } from './canonical.mjs';

const input = fileURLToPath(new URL('../vathian-spell-source-20261118/', import.meta.url));
async function fixture(context) {
  try {
    await access(input);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    context.skip('Private canonical transfer is unavailable');
    return null;
  }
  return readSnapshot(input, canonicalCodec);
}

test('canonical record, class, deity, Quest, and variant coverage', async context => {
  const snapshot = await fixture(context);
  if (!snapshot) return;
  const drafts = prepareCanonical(snapshot);
  assert.equal(drafts.size, 819);
  const variants = new Map();
  let quest = 0;
  let level9 = 0;
  let untaggedHerald = 0;
  let withDeities = 0;
  const named = name => [...drafts.values()].find(row => row.raw.name === name);
  for (const raw of snapshot.records) {
    const row = drafts.get(raw.id);
    assert.deepEqual(row.raw, raw);
    assert.deepEqual(row.sourceFlags.originalClasses, raw.classes);
    assert.ok(row.classes.every(name => classNames.includes(name)));
    assert.ok(row.review.sorcerer.rationale && row.review.rulesExcerpt && row.review.mechanicalLimitations.length);
    if (raw.classes.some(name => ['Wizard', 'Sorcerer'].includes(name))) assert.ok(row.classes.includes('Wizard'));
    if (row.classes.includes('Sorcerer')) assert.ok(row.classes.includes('Wizard'));
    if (raw.classes.some(name => ['Priest (legacy)', 'Cleric'].includes(name))) assert.ok(row.classes.includes('Cleric'));
    if (raw.classes.includes('Herald')) assert.ok(row.classes.includes('Herald'));
    if (row.classes.includes('Cleric') && raw.deities.length) assert.ok(row.classes.includes('Herald'));
    assert.deepEqual(row.associations.map(entry => entry.class + '|' + entry.deity),
      ['Cleric', 'Herald'].filter(name => row.classes.includes(name)).flatMap(name => raw.deities.map(deity => name + '|' + deity)));
    if (raw.deities.length) withDeities++;
    if (row.review.untaggedExplicitHerald) {
      assert.deepEqual(row.associations, []);
      untaggedHerald++;
    }
    if (raw.level === null) {
      assert.equal(row.level, 9);
      assert.equal(row.name, raw.name + ' (Quest)');
      assert.deepEqual(row.tags, ['quest']);
      assert.equal(row.sourceFlags.originalLevel, 'Q');
      quest++;
    } else {
      assert.equal(row.name, raw.name);
      assert.deepEqual(row.tags, []);
    }
    if (row.level === 9) level9++;
    assert.match(row._id, /^[0-9a-f]{16}$/);
    if (!variants.has(raw.name)) variants.set(raw.name, new Set());
    variants.get(raw.name).add(row._id);
  }
  assert.deepEqual([quest, level9, untaggedHerald, withDeities], [28, 52, 15, 318]);
  assert.equal([...variants.values()].filter(ids => ids.size === 2).length, 6);
  assert.equal([...drafts.values()].filter(row => row.review.excludedOnlyResolution).length, 45);
  for (const name of ['Arcane Blast', 'Force Missiles', 'Spell Turning', 'Mana Tap', 'Glancing Blow', 'Maladweomer']) {
    assert.ok(named(name).classes.includes('Sorcerer'), name);
  }
  for (const name of ['Acid Storm', 'Animate Flame', 'Analyze Dweomer', 'Starvation', 'Stonesplit', 'Highway']) {
    assert.ok(!named(name).classes.includes('Sorcerer'), name);
  }
  assert.deepEqual(named('Bear Hug').classes, ['Cleric']);
  assert.deepEqual(named('Pyroclastic Surge').classes, ['Wizard']);
});

test('native adapter plumbing retains all canonical Items through a synthetic registry and model', async context => {
  const snapshot = await fixture(context);
  if (!snapshot) return;
  const adapter = createNativeAdapter({
    classIds: { Wizard: 'test-wizard', Sorcerer: 'test-sorcerer', Cleric: 'test-cleric', Herald: 'test-paladin' },
    evidence: { version: '1.5.1', spellModel: 'fixture', baseModel: 'fixture',
      classConfig: 'fixture', metadata: 'fixture', actions: 'fixture' },
    slugify: value => value.toLowerCase(),
    mapSystem: draft => ({
      description: draft.descriptionHtml, source: draft.sourceFlags.sourceOrigin, slug: draft._id,
      components: { vocalized: false, seen: false, material: false }, concentration: false, materialsConsumed: false,
      rare: false, materials: '', prerequisite: '', spellBook: '', schools: {}, disciplines: [], prepared: 0
    }),
    reviewMechanics: () => ({ unresolved: ['Fixture only'], evidence: ['Fixture only'] }),
    validateItem: (item, draft) => item._id === draft._id && item.system.description === draft.descriptionHtml
  });
  adapter.prepare(snapshot);
  const { items, inventory } = convert(snapshot.records, adapter);
  assert.equal(items.length, 819);
  assert.equal(inventory.length, 819);
  assert.equal(items.filter(item => item.system.tags.includes('quest')).length, 28);
  assert.equal(items.filter(item => item.flags[moduleId].deityAssociations.length).length, 318);
  assert.equal(items.reduce((total, item) => total + item.system.tags.filter(tag => tag !== 'quest').length, 0), 2559);
  assert.equal(items.filter(item => item.system.classes.includes('test-paladin')).length, 333);
  assert.throws(() => adapter.prepare({ ...snapshot, hashes: {} }), /reviewed canonical bytes/);
});
