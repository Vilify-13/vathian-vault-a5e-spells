import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

export const moduleId = 'vathian-vault-a5e-spells';
export const partNames = ['spells-0.bin', 'spells-1.bin', 'spells-2.bin'];
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const documentId = key => sha256(`vathian-vault-spell\0${key}`).slice(0, 16);
const json = value => JSON.stringify(value, null, 2) + '\n';
const parse = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const string = value => typeof value === 'string';
const nonempty = value => string(value) && value.trim().length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const strings = value => Array.isArray(value) && value.every(nonempty);

export async function readSnapshot(input, adapter) {
  const manifestBytes = await readFile(path.join(input, 'manifest.json'));
  const manifest = parse(manifestBytes);
  assert.equal(manifest.count, 819, 'Unexpected canonical manifest count');
  // The adapter verifies the actual manifest keys and ordered part descriptors.
  const format = adapter.manifest(manifest);
  assert.equal(format.encoding, 'multipart-gzip-json');
  assert.deepEqual(format.parts, partNames);
  assert.ok(['per-part', 'joined'].includes(format.layout), 'Unverified gzip layout');
  assert.ok(['decoded', 'included'].includes(format.countBasis), 'Unverified count semantics');
  const parts = await Promise.all(partNames.map(name => readFile(path.join(input, name))));
  const hashes = Object.fromEntries(partNames.map((name, index) => [name, sha256(parts[index])]));
  for (const [name, expected] of Object.entries(format.sha256 ?? {})) {
    assert.equal(hashes[name], expected, `Manifest digest mismatch for ${name}`);
  }
  const chunks = format.layout === 'joined' ? [Buffer.concat(parts)] : parts;
  const payloads = chunks.map(compressed => parse(gunzipSync(compressed, { maxOutputLength: 64 * 1024 * 1024 })));
  const records = payloads.flatMap((payload, index) => {
    const rows = adapter.records(payload, index, manifest);
    assert.ok(Array.isArray(rows), 'Expected a decoded record array');
    return rows;
  });
  if (format.countBasis === 'decoded') assert.equal(records.length, manifest.count);
  const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  const gitBlobs = Object.fromEntries([['manifest.json', gitBlob(manifestBytes)],
    ...partNames.map((name, index) => [name, gitBlob(parts[index])])]);
  return { records, format, count: manifest.count, gitBlobs, hashes: { 'manifest.json': sha256(manifestBytes), ...hashes } };
}

export function convert(records, adapter) {
  const { evidence, classIds, heraldClassId, clericClassId } = adapter;
  assert.ok(/^1\.5\.\d+$/.test(evidence?.version ?? ''), 'Provide the verified A5e version');
  for (const key of ['spellModel', 'baseModel', 'metadata', 'classConfig', 'actions']) {
    assert.ok(nonempty(evidence[key]), `Missing official evidence for ${key}`);
  }
  assert.ok(strings(classIds) && classIds.includes(heraldClassId) && classIds.includes(clericClassId));
  assert.notEqual(heraldClassId, clericClassId);
  const keys = new Set();
  const ids = new Set();
  const results = [];
  const inventory = [];
  for (const [index, raw] of records.entries()) {
    const row = adapter.map(raw, index);
    assert.ok(nonempty(row.key) && !keys.has(row.key), `Missing or duplicate immutable source key at row ${index + 1}`);
    keys.add(row.key);
    if (row.omit !== undefined) {
      assert.ok(['retired', 'index-only'].includes(row.omit) && nonempty(row.omissionEvidence), `Unsupported omission ${row.key}`);
      inventory.push({ key: row.key, disposition: row.omit, evidence: row.omissionEvidence });
      continue;
    }
    const { name, system, associations, tags, unresolved, classAliases } = row;
    assert.ok(nonempty(name) && object(system), `Missing spell name or system data for ${row.key}`);
    assert.ok(Array.isArray(system.classes) && system.classes.every(id => classIds.includes(id)), `Invalid native classes for ${row.key}`);
    assert.equal(new Set(system.classes).size, system.classes.length, `Duplicate classes for ${row.key}`);
    for (const field of ['concentration', 'materialsConsumed', 'rare', 'ritual']) assert.equal(typeof system[field], 'boolean', field);
    for (const field of ['materials', 'prerequisite', 'spellBook']) assert.ok(string(system[field]), field);
    for (const field of ['vocalized', 'seen', 'material']) assert.equal(typeof system.components?.[field], 'boolean', field);
    assert.ok(object(system.schools) && Array.isArray(system.disciplines), 'Missing schools or disciplines');
    assert.ok(Number.isInteger(system.level) && Number.isFinite(system.prepared), 'Invalid level or prepared value');
    assert.ok(Object.hasOwn(system, 'description') && Object.hasOwn(system, 'source') && nonempty(system.slug), 'Missing base spell fields');
    assert.ok(strings(tags) && strings(unresolved), 'Supply source tags and unresolved mechanics arrays');
    assert.ok(Array.isArray(associations), 'Supply exact source deity associations');
    for (const association of associations) {
      const eligible = { Cleric: clericClassId, Herald: heraldClassId };
      assert.ok(Object.hasOwn(eligible, association.class) && system.classes.includes(eligible[association.class])
        && nonempty(association.deity) && nonempty(association.evidence), `Unsupported deity association for ${row.key}`);
    }
    assert.ok(object(classAliases), 'Supply verified display aliases');
    for (const [id, alias] of Object.entries(classAliases)) {
      assert.ok(system.classes.includes(id) && nonempty(alias), `Invalid class alias for ${row.key}`);
    }
    const nativeTags = [...new Set([...tags, ...associations.map(entry => entry.deity)].map(tag => {
      const slug = adapter.slugify(tag);
      assert.ok(nonempty(slug), `Tag could not be slugified for ${row.key}`);
      return slug;
    }))];
    const _id = documentId(row.key);
    assert.ok(!ids.has(_id), `Document ID collision for ${row.key}`);
    ids.add(_id);
    const item = { _id, name, type: 'spell', effects: [], system: { ...system, tags: nativeTags },
      flags: { [moduleId]: { ...row.sourceFlags, sourceKey: row.key, classAliases, deityAssociations: associations } } };
    assert.equal(adapter.validateItem(item, raw), true, `Official schema or fidelity check failed for ${row.key}`);
    results.push(item);
    inventory.push({ ...row.review, key: row.key, id: _id, name, classes: system.classes, deityAssociations: associations, unresolved });
  }
  return { items: results.sort((a, b) => a._id.localeCompare(b._id)), inventory };
}

export async function build(input, adapterFile, output) {
  const adapter = (await import(pathToFileURL(path.resolve(adapterFile)))).default;
  return buildWithAdapter(input, adapter, output);
}

export async function buildWithAdapter(input, adapter, output) {
  const snapshot = await readSnapshot(input, adapter);
  adapter.prepare?.(snapshot);
  const { items, inventory } = convert(snapshot.records, adapter);
  const reviewedRows = inventory.filter(row => row.rollReview?.reviewed);
  const spellActions = item => Object.values(item.system.actions ?? {});
  const has = (action, field, type) => Object.values(action[field] ?? {}).some(entry => entry.type === type);
  const count = predicate => items.filter(predicate).length;
  const rollCoverage = inventory.some(row => row.rollReview) ? {
    individuallyReviewed: reviewedRows.length,
    pending: inventory.length - reviewedRows.length,
    categories: Object.fromEntries([...Map.groupBy(inventory, row => row.rollReview?.category)]
      .map(([category, rows]) => [category, rows.length])),
    withDefaultDamage: count(item => spellActions(item).some(action => action.default && has(action, 'rolls', 'damage'))),
    withAnyDamage: count(item => spellActions(item).some(action => has(action, 'rolls', 'damage'))),
    withNativeSave: count(item => spellActions(item).some(action => has(action, 'prompts', 'savingThrow'))),
    withNativeAttack: count(item => spellActions(item).some(action => has(action, 'rolls', 'attack'))),
    withFollowupAction: count(item => spellActions(item).length > 1),
    withCantripScaling: count(item => spellActions(item).some(action => Object.values(action.rolls ?? {})
      .some(roll => roll.scaling?.mode === 'cantrip')))
  } : null;
  const chatRows = inventory.filter(row => row.chatSave);
  const chatSaveCoverage = chatRows.length ? {
    withCompactCastDescription: count(item => spellActions(item).some(action => action.default && action.descriptionOutputs?.includes('action')
      && !action.descriptionOutputs.includes('item') && action.description)),
    withInteractiveSave: chatRows.filter(row => row.chatSave.saves.length).length,
    withSaveOnCast: chatRows.filter(row => row.chatSave.saves.some(save => save.action === 'Cast')).length,
    byDC: Object.fromEntries(['caster', 'fixed', 'rolled', 'context'].map(type => [type,
      chatRows.filter(row => row.chatSave.saves.some(save => save.dc === type)).length])),
    correctiveDecisions: chatRows.filter(row => row.chatSave.correctionEvidence).length,
    baselineDecisionsRetained: chatRows.filter(row => !row.chatSave.correctionEvidence).length,
    priorManualOnly: chatRows.filter(row => row.chatSave.baselineManualOnly).length,
    priorManualOnlyNowInteractive: chatRows.filter(row => row.chatSave.baselineManualOnly && row.chatSave.saves.length).length,
    priorManualOnlyChanged: chatRows.filter(row => row.chatSave.baselineManualOnly && row.chatSave.correctionEvidence).length,
    priorSecondaryOnly: chatRows.filter(row => row.chatSave.baselineSecondaryOnly).length,
    priorSecondaryOnlyChanged: chatRows.filter(row => row.chatSave.baselineSecondaryOnly && row.chatSave.correctionEvidence).length,
    manualOnly: chatRows.filter(row => row.rollReview.category.endsWith('-manual')).length,
    saveAbilityUnspecified: chatRows.filter(row => row.chatSave.sourceLimits.includes('save-ability-unspecified')).length,
    sourceHeaderWithoutMappedSave: chatRows.filter(row => row.chatSave.sourceLimits.includes('ability-in-header-without-confirmed-native-save')).length
  } : null;
  if (snapshot.format.countBasis === 'included') assert.equal(items.length, snapshot.count);
  assert.ok(items.length, 'No included spells');
  const audit = {
    canonicalSource: 'Vilify-13/vathian-vault-site/public/spells/data/',
    canonicalRevision: adapter.canonicalRevision ?? null,
    hashes: snapshot.hashes, gitBlobs: snapshot.gitBlobs, officialEvidence: adapter.evidence,
    nativeValidation: adapter.nativeValidation ?? null,
    rollCoverage, chatSaveCoverage,
    manifestCount: snapshot.count, countBasis: snapshot.format.countBasis, decoded: snapshot.records.length,
    included: items.length, omitted: inventory.length - items.length,
    itemHashes: Object.fromEntries(items.map(item => [item._id, sha256(json(item))])),
    classCounts: Object.fromEntries(adapter.classIds.map(id => [id, items.filter(item => item.system.classes.includes(id)).length])),
    omissionCounts: Object.fromEntries(['retired', 'index-only'].map(reason =>
      [reason, inventory.filter(row => row.disposition === reason).length])),
    withUnresolvedMechanics: inventory.filter(row => row.unresolved?.length).length,
    inventory
  };
  const target = path.resolve(output);
  await mkdir(target);
  await mkdir(path.join(target, 'items'));
  await Promise.all(items.map(item => writeFile(path.join(target, 'items', item._id + '.json'), json(item), { flag: 'wx' })));
  await writeFile(path.join(target, 'audit.json'), json(audit), { flag: 'wx' });
  console.log(`Built ${items.length} Item sources. Omitted ${audit.omitted}. Blocking native mapping gaps on ${audit.withUnresolvedMechanics}.`);
  if (rollCoverage) console.log(JSON.stringify(rollCoverage, null, 2));
  if (chatSaveCoverage) console.log(JSON.stringify(chatSaveCoverage, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 3) throw new Error('Usage: node build.mjs INPUT TRUSTED_ADAPTER.mjs NEW_BUILD_DIRECTORY');
  await build(...args);
}
