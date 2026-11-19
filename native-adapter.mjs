import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildWithAdapter, moduleId, readSnapshot, sha256 } from './build.mjs';
import { approvedEligibilitySha256, createNativeAdapter, prepareCanonical } from './canonical.mjs';
import { canonicalCodec } from './source.mjs';
import { inspectUpstream, upstreamVersion } from './upstream-evidence.mjs';

export const classIds = Object.freeze({ Wizard: 'wizard', Sorcerer: 'sorcerer', Cleric: 'cleric', Herald: 'herald' });

const plainTags = draft => [...new Set([...draft.tags, ...draft.raw.deities])].map(value => {
  assert.match(value, /^[A-Za-z]+$/);
  return value.toLowerCase();
});

function timed(text) {
  const match = /^(\d+) (action|bonus action|reaction|round|minute|hour|day)s?$/i.exec(text.trim());
  return match ? { value: Number(match[1]), unit: match[2].toLowerCase() } : null;
}

function distance(text) {
  const value = text.trim();
  if (/^self$/i.test(value)) return { kind: 'self' };
  if (/^touch(?: \(5 feet\))?$/i.test(value)) return { kind: 'touch' };
  const match = /^(?:(?:short|medium|long) \((\d+) feet\)|(\d+) feet)$/i.exec(value);
  return match ? { kind: 'distance', value: Number(match[1] ?? match[2]), unit: 'feet' } : null;
}

function targeting(target, area) {
  if (target.trim() && area.trim()) return null;
  const value = (target.trim() || area.trim()).toLowerCase();
  const direct = /^one (willing )?(creature|object)$/.exec(value);
  if (direct) return { count: 1, kind: direct[2], ...(direct[1] ? { willing: true } : {}) };
  const template = /^(\d+)-foot(?:(-radius))? (cone|cube|sphere)$/.exec(value);
  if (!template || (template[3] === 'sphere') !== Boolean(template[2])) return null;
  return { kind: template[3], value: Number(template[1]), unit: 'feet', measure: {
    sphere: 'radius', cone: 'length', cube: 'edge'
  }[template[3]] };
}

function duration(text) {
  const value = text.trim();
  if (/^instant(?:aneous)?$/i.test(value)) return { kind: 'instantaneous' };
  if (/^until dispelled$/i.test(value)) return { kind: 'until-dispelled' };
  const concentration = /^concentration(?: \((.*?)\)|, up to (.*))$/i.exec(value);
  const limit = timed(concentration ? concentration[1] ?? concentration[2] : value);
  return limit ? { kind: 'timed', ...limit, ...(concentration ? { concentration: true } : {}) } : null;
}

function materialPlan(proposal) {
  if (!proposal) return null;
  const { components, materials } = proposal;
  const text = materials ?? '';
  const prices = Array.from(text.matchAll(/\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(gp|sp|cp|pp|ep)\b/gi),
    match => ({ text: match[0], amount: Number(match[1].replaceAll(',', '') + (match[2] ? '.' + match[2] : '')),
      currency: match[3].toLowerCase() }));
  const wholeCostManual = prices.length !== 1 || /[;–—]|\b(?:or|plus|per|each)\b|\d\s*-\s*\d/i.test(text);
  let consumed = proposal.materialsConsumed;
  // Map a whole requirement only when the statement is explicit and singular.
  // Mixed requirements remain in the manual description.
  if (consumed === null && !/[;]|\b(?:and|or|plus|each|both)\b/i.test(text)) {
    if (/,\s*(?:not consumed|reusable)$/i.test(text)) consumed = false;
    else if (/,\s*(?:consumed|which is consumed (?:by the spell|in the casting))$/i.test(text)) consumed = true;
  }
  return { components, materials, consumed, prices, wholeCostManual };
}

export function mechanicalPlan(draft) {
  const { raw } = draft;
  const materials = materialPlan(draft.componentProposal);
  const concentration = draft.concentrationProposal ??
    (/\bno concentration\b/i.test(raw.duration) ? false : null);
  // Quest entries retain unusual casting or slot requirements in the rules.
  // The semantic plan supplies only literal header values for later schema mapping.
  return {
    activation: timed(raw.castingTime),
    range: distance(raw.range),
    targeting: targeting(raw.target, raw.area),
    duration: duration(raw.duration),
    concentration,
    materials,
    cost: { quest: draft.sourceFlags.quest, ritual: raw.ritual, automaticResourceSpend: false },
    manualRules: ['savingThrows', 'rolls', 'damage', 'scaling', 'conditionalEffects', 'deityEligibility']
  };
}

function commonSystem(draft, plan, tags) {
  const values = {
    classes: draft.classes.map(name => classIds[name]),
    tags,
    level: draft.level,
    ritual: draft.ritual
  };
  if (plan.concentration !== null) values.concentration = plan.concentration;
  if (plan.materials) {
    values.components = plan.materials.components;
    if (plan.materials.materials !== null) values.materials = plan.materials.materials;
    if (plan.materials.consumed !== null) values.materialsConsumed = plan.materials.consumed;
  }
  return values;
}

function sourceFlags(draft) {
  return { ...draft.sourceFlags, canonicalSummary: draft.raw.summary, canonicalRules: draft.raw.rules,
    sourceRuleGaps: draft.review.mechanicalLimitations.filter(entry => entry.fields.includes('rules')) };
}

function checkProjection(actual, desired, field) {
  if (desired && typeof desired === 'object' && !Array.isArray(desired)) {
    assert.ok(actual && typeof actual === 'object', `Official model removed ${field}`);
    for (const [key, value] of Object.entries(desired)) checkProjection(actual[key], value, `${field}.${key}`);
  } else {
    assert.deepEqual(actual, desired, `Official model changed ${field}`);
  }
}

export function bindOfficialModel(evidence, binding) {
  assert.ok(evidence.version === upstreamVersion && !evidence.missing.length &&
    !Object.keys(evidence.ambiguous).length && !evidence.findings.length, 'Stage the missing or ambiguous A5e model, example and pack evidence');
  assert.equal(binding.version, upstreamVersion);
  for (const method of ['slugify', 'mapSystem', 'readDescription', 'normalizeItem', 'reviewMechanics']) {
    assert.equal(typeof binding[method], 'function', `Provide the verified official binding method ${method}`);
  }
  assert.match(binding.foundryVersion ?? '', /^14(?:\.\d+)*$/);
  const modelFiles = evidence.files;
  const cite = key => `${modelFiles[key].path} sha256:${modelFiles[key].sha256}`;
  const adapter = createNativeAdapter({
    classIds,
    canonicalRevision: binding.canonicalRevision,
    evidence: { version: upstreamVersion, spellModel: cite('spellModel'), baseModel: cite('baseModel'),
      classConfig: cite('classConfig'), metadata: cite('metadata'), actions: cite('actionModel') },
    slugify: value => binding.slugify(value),
    mapSystem(draft) {
      const plan = mechanicalPlan(draft);
      const verified = binding.mapSystem(draft, plan);
      assert.ok(verified && typeof verified === 'object' && !Array.isArray(verified));
      const system = { ...verified, ...commonSystem(draft, plan, plainTags(draft)) };
      assert.equal(binding.readDescription(system), draft.descriptionHtml, `Native description lost canonical text for ${draft.key}`);
      return system;
    },
    reviewMechanics: (system, draft) => binding.reviewMechanics(system, draft, mechanicalPlan(draft)),
    validateItem(item) {
      const normalized = binding.normalizeItem(structuredClone(item));
      assert.ok(normalized && typeof normalized === 'object' && !('then' in normalized),
        'normalizeItem must return the synchronous result of official Foundry Item model validation');
      for (const field of ['_id', 'name', 'type', 'system', 'flags']) checkProjection(normalized[field], item[field], field);
      return true;
    }
  });
  const mapItem = adapter.map;
  adapter.map = (raw, index) => {
    const row = mapItem(raw, index);
    return { ...row, sourceFlags: sourceFlags(row) };
  };
  adapter.nativeValidation = { status: 'official-model-roundtrip', foundryVersion: binding.foundryVersion,
    a5eVersion: upstreamVersion, evidenceFiles: modelFiles, approvedEligibilitySha256 };
  return adapter;
}

export async function stageNative(input, evidenceDirectory, output) {
  const [snapshot, evidence] = await Promise.all([
    readSnapshot(input, canonicalCodec), inspectUpstream(evidenceDirectory)
  ]);
  const drafts = [...prepareCanonical(snapshot).values()];
  const staged = drafts.map(draft => {
    const plan = mechanicalPlan(draft);
    const system = commonSystem(draft, plan, plainTags(draft));
    const flags = { ...sourceFlags(draft), sourceKey: draft.key, deityAssociations: draft.associations,
      manualDescriptionHtml: draft.descriptionHtml,
      classAliases: draft.classes.includes('Herald') ? { herald: 'Vathian Herald' } : {} };
    const fragment = { _id: draft._id, name: draft.name, type: 'spell', system, flags: { [moduleId]: flags } };
    return { draft, plan, fragment };
  });
  const classCounts = Object.fromEntries(Object.values(classIds).map(id =>
    [id, staged.filter(row => row.fragment.system.classes.includes(id)).length]));
  assert.deepEqual(classCounts, { wizard: 519, sorcerer: 75, cleric: 361, herald: 333 });
  const count = predicate => staged.filter(predicate).length;
  const audit = {
    status: 'native-item-fragments-not-packable',
    nativeValidation: null,
    canonical: staged.length, classCounts, approvedEligibilitySha256,
    quest: count(row => row.fragment.system.tags.includes('quest')),
    level9: count(row => row.fragment.system.level === 9),
    withDeities: count(row => row.draft.associations.length),
    deityTagPlacements: staged.reduce((total, row) => total + row.fragment.system.tags.filter(tag => tag !== 'quest').length, 0),
    heraldOnly: count(row => row.fragment.system.classes.join(',') === 'herald'),
    untaggedHeraldOnly: count(row => row.fragment.system.classes.join(',') === 'herald' && !row.draft.associations.length),
    untaggedExplicitHerald: count(row => row.draft.review.untaggedExplicitHerald),
    nativeFieldCoverage: Object.fromEntries(['components', 'materials', 'materialsConsumed', 'concentration'].map(field =>
      [field, count(row => Object.hasOwn(row.fragment.system, field))])),
    actionPlanCoverage: Object.fromEntries(['activation', 'range', 'targeting', 'duration'].map(field =>
      [field, count(row => row.plan[field] !== null)])),
    withMaterialPriceMentions: count(row => row.plan.materials?.prices.length > 0),
    automatedActions: 0,
    sourceHashes: snapshot.hashes, sourceGitBlobs: snapshot.gitBlobs, upstream: evidence,
    inventory: staged.map(({ draft, fragment, plan }) => ({ key: draft.key, id: draft._id, name: draft.name,
      nativeClasses: fragment.system.classes, tags: fragment.system.tags, rulesSha256: draft.review.rulesSha256,
      sourceGaps: draft.review.mechanicalLimitations.filter(entry => entry.fields.includes('rules')),
      missingSourceFields: draft.review.missingFields, plan }))
  };
  const directory = path.resolve(output);
  await mkdir(directory);
  const write = (file, value) => writeFile(path.join(directory, file), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  await write('item-fragments.json', staged.map(row => row.fragment));
  await write('audit.json', audit);
  const manifest = await readFile(new URL('./module.json', import.meta.url));
  await writeFile(path.join(directory, 'module-manifest-preview.json'), manifest, { flag: 'wx' });
  const artifactHashes = {};
  for (const file of ['item-fragments.json', 'audit.json', 'module-manifest-preview.json']) {
    artifactHashes[file] = sha256(await readFile(path.join(directory, file)));
  }
  await write('checksums.json', artifactHashes);
  console.log(JSON.stringify({ ...Object.fromEntries(Object.entries(audit).filter(([key]) => key !== 'inventory')),
    artifactHashes }, null, 2));
}

async function main(args) {
  const [mode, input, evidenceDirectory, bindingOrOutput, output] = args;
  if (mode === 'stage' && args.length === 4) return stageNative(input, evidenceDirectory, bindingOrOutput);
  if (mode === 'build' && args.length === 5) {
    const evidence = await inspectUpstream(evidenceDirectory);
    assert.ok(evidence.version === upstreamVersion && !evidence.missing.length &&
      !Object.keys(evidence.ambiguous).length && !evidence.findings.length,
    `Incomplete official source staging: ${JSON.stringify(evidence)}`);
    const binding = (await import(pathToFileURL(path.resolve(bindingOrOutput)))).default;
    return buildWithAdapter(input, bindOfficialModel(evidence, binding), output);
  }
  throw new Error('Usage: node native-adapter.mjs stage INPUT EVIDENCE NEW_OUTPUT or build INPUT EVIDENCE TRUSTED_BINDING NEW_OUTPUT');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
