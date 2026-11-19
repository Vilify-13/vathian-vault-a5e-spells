import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { moduleId, sha256 } from './build.mjs';

const [, , baselinePath, candidatePath, auditPath, ...extra] = process.argv;
assert.ok(baselinePath && candidatePath && auditPath && !extra.length,
  'Usage: node verify-action-description-parity.mjs BASELINE_ITEMS CANDIDATE_ITEMS AUDIT_JSON');
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const audit = await readJson(auditPath);
const evidenceBySourceId = new Map(audit.inventory.map(row => [row.key, row.actionDescriptions]));
async function readItems(directory) {
  const files = await readdir(directory);
  assert.equal(files.length, 819);
  const items = new Map();
  for (const file of files) {
    assert.match(file, /\.json$/);
    const { _key, ...item } = await readJson(path.join(directory, file));
    assert.match(item._id, /^[a-f0-9]{16}$/);
    if (_key !== undefined) assert.equal(_key, `!items!${item._id}`);
    assert.ok(!items.has(item._id), `Duplicate Item ID in ${directory}/${file}`);
    items.set(item._id, item);
  }
  return items;
}
const [baselineItems, candidateItems] = await Promise.all([baselinePath, candidatePath].map(readItems));
assert.deepEqual([...candidateItems.keys()].sort(), [...baselineItems.keys()].sort(), 'The Item ID sets differ');
assert.equal(evidenceBySourceId.size, 819);

const results = { items: 0, actions: 0, casts: 0, followUps: 0, spellsWithFollowUps: 0,
  questSpells: 0, nonQuestSpells: 0, changedDescriptions: 0, otherItemChanges: 0 };
for (const [itemId, baseline] of baselineItems) {
  const candidate = candidateItems.get(itemId);
  const flags = baseline.flags[moduleId];
  const sourceId = flags.sourceKey;
  const oldActions = baseline.system.actions;
  const newActions = candidate.system.actions;
  const actionIds = Object.keys(oldActions).sort();
  const evidence = evidenceBySourceId.get(sourceId);
  assert.ok(evidence, sourceId);
  assert.deepEqual(Object.keys(newActions).sort(), actionIds, sourceId);
  assert.deepEqual(evidence.map(entry => entry.actionId).sort(), actionIds, sourceId);
  results.items++;
  results.spellsWithFollowUps += Number(actionIds.length > 1);
  if (flags.quest) {
    results.questSpells++;
    assert.equal(actionIds.length, 1, sourceId);
    assert.deepEqual([newActions[actionIds[0]].rolls, newActions[actionIds[0]].prompts, candidate.flags[moduleId].chatSaves],
      [{}, {}, false], sourceId);
  } else results.nonQuestSpells++;

  for (const entry of evidence) {
    const { actionId } = entry;
    const before = oldActions[actionId];
    const after = newActions[actionId];
    assert.equal(entry.sourceId, sourceId);
    assert.equal(entry.status, 'verified');
    assert.equal(entry.sourceRulesSha256, sha256(flags.canonicalRules));
    assert.equal(entry.descriptionSha256, sha256(after.description));
    assert.equal(before.id, actionId);
    assert.equal(after.id, actionId);
    assert.ok(after.description.trim(), `${sourceId}/${actionId}`);
    results.actions++;
    results.casts += Number(after.default);
    results.followUps += Number(!after.default);
    results.changedDescriptions += Number(before.description !== after.description);
    delete before.description;
    delete after.description;
  }
  assert.deepEqual(candidate, baseline, `Change outside Action description on ${sourceId}`);
  evidenceBySourceId.delete(sourceId);
}
assert.equal(evidenceBySourceId.size, 0);
assert.deepEqual(results, { items: 819, actions: 1328, casts: 819, followUps: 509, spellsWithFollowUps: 295,
  questSpells: 28, nonQuestSpells: 791, changedDescriptions: 1328, otherItemChanges: 0 });
console.log(JSON.stringify(results, null, 2));
