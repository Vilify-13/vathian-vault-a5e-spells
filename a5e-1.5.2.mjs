import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWithAdapter, documentId, moduleId, sha256 } from './build.mjs';
import { approvedEligibilitySha256, createNativeAdapter } from './canonical.mjs';
import { classIds, mechanicalPlan } from './native-adapter.mjs';
import { nativeRollActions, reviewFor, validateReview } from './spell-rolls.mjs';

export const a5eRevision = '6d8c39f2e5c9ec6bbbbf1388a24005a5a6e10c8c';
const version = '1.5.2';
const files = {
  package: 'package.json', system: 'public/system.json',
  spellModel: 'src/dataModels/item/SpellDataModel.ts', baseModel: 'src/dataModels/item/base.ts',
  itemFields: 'src/dataModels/item/common.ts', common: 'src/dataModels/common.ts',
  classConfig: 'src/config/registerClassesConfig.ts', config: 'src/config.ts',
  metadata: 'src/view/sheets/components/item/Metadata.svelte',
  actions: 'src/dataModels/item/actions/ActionDataModel.ts',
  rolls: 'src/dataModels/item/actions/ActionRollsDataModel.ts',
  prompts: 'src/dataModels/item/actions/ActionPromptsDataModel.ts',
  rollState: 'src/managers/RollStateManager.ts', rollPreparation: 'src/managers/RollPreparationManager.ts',
  chatCreation: 'src/documents/item/item.svelte.ts', damageButtons: 'src/view/chat/components/DamageButtons.svelte',
  saveDC: 'src/utils/computeSaveDC.ts',
  migration: 'src/migration/runner/base.ts',
  rangeSummary: 'src/utils/summaries/getRangeLabels.ts', areaSummary: 'src/utils/summaries/getAreaLabel.ts',
  fireball: 'packs/spells/fireball.json', magicMissile: 'packs/spells/magic-missile.json',
  cureWounds: 'packs/spells/cure-wounds.json',
  packBuild: 'build/buildCompendia.mjs', pack: 'build/lib/Pack.mjs', levelDB: 'build/lib/LevelDB.mjs'
};
const idPattern = /^[a-z0-9]{16}$/;
const schoolAliases = { aburation: 'abjuration', necromantic: 'necromancy', transformation: 'transmutation' };
const actionUnits = { action: 'action', 'bonus action': 'bonusAction', reaction: 'reaction',
  minute: 'minute', hour: 'hour', day: 'day' };

function keys(source, name, optional = '') {
  const declaration = new RegExp(`const ${name} = \\{\\r?\\n${optional}([\\s\\S]+?)\\r?\\n\\t?\\}`).exec(source);
  assert.ok(declaration, `Missing upstream registry ${name}`);
  return new Set([...declaration[1].matchAll(/^\s*(\w+):/gm)].map(match => match[1]));
}

export async function readReference(directory) {
  const root = path.resolve(directory);
  const git = (...args) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, ...args],
    { encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
  assert.equal(git('rev-parse', 'HEAD').trim(), a5eRevision);
  const sources = {};
  const fingerprints = {};
  for (const [key, file] of Object.entries(files)) {
    const committed = git('show', `${a5eRevision}:${file}`);
    const local = await readFile(path.join(root, file), 'utf8');
    assert.equal(local.replaceAll('\r\n', '\n'), committed.replaceAll('\r\n', '\n'), `A5e reference changed: ${file}`);
    sources[key] = committed;
    fingerprints[key] = { file, sha256: sha256(committed) };
  }
  assert.equal(JSON.parse(sources.package).version, version);
  const manifest = JSON.parse(sources.system);
  assert.equal(manifest.id, 'a5e');
  assert.equal(manifest.version, version);
  assert.equal(manifest.compatibility.minimum, '14');
  for (const id of Object.values(classIds)) assert.ok(sources.classConfig.includes(`${id}: 'A5E.characterClasses.${id}'`));
  assert.match(sources.spellModel, /\.\.\.actions\(\)/);
  assert.match(sources.itemFields, /description: new fields\.HTMLField/);
  assert.match(sources.common, /tags: new fields\.SetField/);
  assert.match(sources.metadata, /"system\.tags"/);
  assert.match(sources.metadata, /slugify\(\{ strict: true \}\)/);
  assert.match(sources.actions, /validateKey.*isValidId/);
  assert.match(sources.rolls, /const damageRollSchema/);
  assert.match(sources.prompts, /saveDC: new fields.SchemaField/);
  assert.match(sources.rollState, /getDefaultIds\('rolls'\)/);
  assert.match(sources.rollPreparation, /new DamageRoll/);
  assert.match(sources.chatCreation, /rolls: rolls.map/);
  assert.match(sources.damageButtons, /actor.applyDamage/);
  assert.match(sources.saveDC, /getSpellBookDC\(actor, item\)/);
  const getAction = key => {
    const item = JSON.parse(sources[key]);
    assert.equal(item.type, 'spell');
    return Object.values(item.system.actions)[0];
  };
  assert.equal(getAction('fireball').area.shape, 'sphere');
  assert.equal(getAction('magicMissile').target.type, 'creature');
  assert.equal(Object.values(getAction('cureWounds').ranges)[0].range, 'touch');
  const migrationVersion = Number(/LATEST_MIGRATION_VERSION = ([\d.]+);/.exec(sources.migration)?.[1]);
  assert.ok(migrationVersion > 0);
  return { fingerprints, migrationVersion,
    activation: keys(sources.config, 'abilityActivationTypes'), periods: keys(sources.config, 'timePeriods'),
    schools: keys(sources.config, 'spellSchools', '\\tprimary: \\{\\r?\\n'),
    areas: keys(sources.config, 'areaTypes'), targets: keys(sources.config, 'targetTypes') };
}

const slug = value => value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const missingComponents = { vocalized: false, seen: false, material: false };

function nativeAction(draft, plan, reference) {
  const actionId = documentId(`${draft.key}:cast`);
  const activationPlan = plan.activation;
  const activationType = actionUnits[activationPlan?.unit] ?? 'special';
  const trigger = /^1 reaction, (.+)$/i.exec(draft.raw.castingTime)?.[1] ?? '';
  const activation = trigger ? { type: 'reaction', cost: 1, reactionTrigger: trigger }
    : { type: activationType, cost: activationType === 'special' ? 0 : activationPlan.value, reactionTrigger: '' };
  assert.ok(reference.activation.has(activation.type));
  const durationPlan = plan.duration;
  const timed = durationPlan?.kind === 'timed' && reference.periods.has(durationPlan.unit);
  const duration = { unit: timed ? durationPlan.unit : durationPlan?.kind === 'instantaneous' ? 'instantaneous' : 'special',
    value: timed ? String(durationPlan.value) : '0', concentration: plan.concentration === true };
  const ranges = {};
  if (plan.range) {
    const { kind, value } = plan.range;
    ranges[documentId(`${draft.key}:range`)] = kind === 'distance'
      ? { range: value, unit: 'feet', value: 0 } : { range: kind, unit: null, value: 0 };
  }
  const area = { shape: 'none', quantity: 1, length: 0, height: 0, radius: 0, width: 0,
    isAura: false, behaviors: {}, scaling: {} };
  const target = { type: '', quantity: 1, otherText: '', seen: false, heard: false, scaling: { mode: null, config: { value: '' } } };
  const targeting = plan.targeting;
  if (targeting?.count && reference.targets.has(targeting.kind)) {
    target.type = targeting.kind;
    target.quantity = targeting.count;
  } else if (targeting?.measure && reference.areas.has(targeting.kind)) {
    area.shape = targeting.kind;
    area[targeting.measure === 'edge' ? 'width' : targeting.measure] = targeting.value;
  }
  const notes = ['Use the spell text to resolve outcomes and any mechanics omitted from this Action.',
    draft.sourceFlags.quest ? 'Follow the Quest casting and cost instructions in the spell description.'
      : 'Apply spell slots and any special costs manually as stated in the spell description.'];
  if (activation.type === 'special') notes.push('Use the casting time in the spell description.');
  if (duration.unit === 'special') notes.push('Use the duration in the spell description.');
  return { id: actionId, name: draft.name, default: true, img: '', description: `<p>${notes.join(' ')}</p>`,
    descriptionOutputs: ['item', 'action'], activation, duration, ranges, area, target,
    effects: [], macro: '', consumers: {}, prompts: {}, rolls: {} };
}

function mapSystem(draft, reference) {
  const plan = mechanicalPlan(draft);
  const school = draft.raw.school.toLowerCase().trim();
  const primary = schoolAliases[school] ?? school;
  assert.ok(reference.schools.has(primary), `Unknown A5e school for ${draft.key}: ${school}`);
  const action = nativeAction(draft, plan, reference);
  return {
    description: draft.descriptionHtml, secretDescription: '', favorite: false, macro: '',
    source: draft.raw.original?.source || 'Vathian Vault',
    slug: `${slug(draft.name)}-${slug(draft.key)}`, disciplines: [],
    components: plan.materials?.components ?? missingComponents, concentration: plan.concentration === true,
    materials: plan.materials?.materials ?? '', materialsConsumed: plan.materials?.consumed ?? false,
    prepared: 0, prerequisite: '', rare: false, schools: { primary, secondary: [] }, spellBook: '',
    migrationData: { version: reference.migrationVersion, type: 'a5e' },
    uses: { value: 0, max: '', per: '', recharge: { formula: '', threshold: 0, type: 'recoverAll' },
      countdown: { size: 6, threshold: 6 } },
    actions: nativeRollActions(action, draft)
  };
}

export function makeAdapter(reference) {
  const cite = key => `${reference.fingerprints[key].file} sha256:${reference.fingerprints[key].sha256}`;
  const evidence = { version, revision: a5eRevision, spellModel: cite('spellModel'), baseModel: cite('baseModel'),
    classConfig: cite('classConfig'), metadata: cite('metadata'), actions: cite('actions') };
  const adapter = createNativeAdapter({
    classIds, evidence, slugify: slug,
    mapSystem: draft => mapSystem(draft, reference),
    reviewMechanics(system, draft) {
      const action = Object.values(system.actions)[0];
      const decision = reviewFor(draft.raw);
      const manual = [decision.rationale, 'Resolve save outcomes, damage application, effects and spell-slot costs manually.'];
      if (action.activation.type === 'special') manual.push('Casting time');
      if (!Object.keys(action.ranges).length) manual.push('Range');
      if (action.duration.unit === 'special') manual.push('Duration');
      if (action.area.shape === 'none' && !action.target.type) manual.push('Target and area where specified');
      if (!draft.componentProposal || mechanicalPlan(draft).materials?.consumed === null) manual.push('Unstructured or conditional material requirements');
      if (draft.sourceFlags.quest) manual.push('Quest-specific casting and slot treatment');
      manual.push(...draft.review.mechanicalLimitations.filter(item => item.fields.includes('rules')).map(item => item.reason));
      // Manual treatment is recorded explicitly and never serialized as a fabricated action.
      return { evidence: manual, unresolved: [] };
    },
    validateItem(item, draft) {
      const { system, flags } = item;
      const expected = mapSystem(draft, reference);
      for (const field of Object.keys(expected)) assert.deepEqual(system[field], expected[field]);
      const action = Object.values(system.actions)[0];
      assert.match(action.id, idPattern);
      assert.ok(reference.activation.has(action.activation.type));
      assert.ok(reference.periods.has(action.duration.unit));
      assert.equal(action.duration.concentration, system.concentration);
      assert.ok(reference.schools.has(system.schools.primary));
      assert.ok(action.area.shape === 'none' || reference.areas.has(action.area.shape));
      assert.ok(!action.target.type || reference.targets.has(action.target.type));
      for (const candidate of Object.values(system.actions)) {
        assert.match(candidate.id, idPattern);
        assert.deepEqual([candidate.consumers, candidate.effects, candidate.macro], [{}, [], '']);
        if (!candidate.default) assert.equal(candidate.duration.concentration, false);
      }
      assert.equal(flags[moduleId].canonicalRules, draft.raw.rules);
      assert.equal(system.description, draft.descriptionHtml);
      return true;
    }
  });
  const map = adapter.map;
  const prepare = adapter.prepare;
  adapter.prepare = snapshot => {
    validateReview(new Set(snapshot.records.map(record => record.id)));
    return prepare(snapshot);
  };
  adapter.map = (raw, index) => {
    const mapped = map(raw, index);
    const decision = reviewFor(raw);
    mapped.review.rollReview = decision;
    mapped.sourceFlags = { ...mapped.sourceFlags, canonicalRules: raw.rules, canonicalSummary: raw.summary,
      manualMechanics: mapped.review.nativeTreatment, rollReview: { reviewed: decision.reviewed, category: decision.category } };
    return mapped;
  };
  adapter.nativeValidation = { status: 'official-source-schema-checked', runtimeValidated: false,
    a5eVersion: version, a5eRevision, approvedEligibilitySha256, evidenceFiles: reference.fingerprints };
  return adapter;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, reference, output, ...rest] = process.argv.slice(2);
  if (!input || !reference || !output || rest.length) throw new Error('Usage: node a5e-1.5.2.mjs INPUT A5E_REFERENCE NEW_BUILD');
  await buildWithAdapter(input, makeAdapter(await readReference(reference)), output);
}
