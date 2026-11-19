import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { documentId, moduleId, readSnapshot, sha256 } from './build.mjs';
import { canonicalCodec } from './source.mjs';
import { excludedOnly, sorcererNo, sorcererYes } from './class-review.mjs';

export const classNames = ['Wizard', 'Sorcerer', 'Cleric', 'Herald'];
export const approvedEligibilitySha256 = '7f65d39a314f4f19f7d7d198e5f44d74ec9756f5ff67ef77b86a5d4f7d9ec58c';
export function eligibilityDigest(assignments) {
  const byKey = ([a], [b]) => a < b ? -1 : a > b ? 1 : 0;
  return sha256(JSON.stringify(assignments.toSorted(byKey)));
}
const clericSources = ['Cleric', 'Priest (legacy)'];
const retainedSourceClasses = new Set([...classNames, ...clericSources]);
const canonicalHashes = {
  'manifest.json': '356d572db6ee96ec9e9e0f74b19164bb2c894316d12ddfe0ffcececc6696f037',
  'spells-0.bin': 'ee4c37535f27a176b68c7c5f18146a1e8a9779783d836bdfc5f98d5cf32e7cde',
  'spells-1.bin': '8cc2623a4f8222ec478aa04d7ba149db32e230be3d2bdedb6c8ecdeb8baa21af',
  'spells-2.bin': 'a90315af2fcbb64e2b1c903b5d7d2a813fd5e932146f57b5e247285a9cab11ae'
};
const mechanicFields = ['castingTime', 'range', 'target', 'area', 'duration', 'components',
  'savingThrow', 'damage', 'higherLevels'];
const sourceRuleGaps = {
  '2e-priest-870': 'Animate Flame has an incomplete spellcasting-check DC clause (“check against On a failure”).',
  '2e-wizard-431': 'Magic Staff has an incomplete activation clause (“as an action, using The user”).',
  '2e-wizard-453': 'Spell Shape has an incomplete check DC and failure clause. The source does not supply the omitted text.',
  '2e-wizard-421': 'Minor Spell Turning has an incomplete reflection instruction before its cantrip cost.',
  '2e-wizard-393': 'Hornung’s Baneful Deflector has a missing phrase after “attack roll at the newly selected target using”.',
  'tome-shieldvessel': 'Shield Vessel has an incomplete limitation after “This doesn’t”.',
  'tome-spiritbinding': 'Spirit Binding describes both outcomes as success. The audit preserves the source wording and does not infer which branch is the failure.'
};
const html = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('\r\n', '\n').replaceAll('\n', '<br>\n');
const owns = (object, key) => Object.hasOwn(object, key);

function eligibility(raw, rulesExcerpt) {
  const wizardSource = raw.classes.filter(name => name === 'Wizard' || name === 'Sorcerer');
  const clericSource = raw.classes.filter(name => clericSources.includes(name));
  const explicitHerald = raw.classes.includes('Herald');
  const excluded = raw.classes.filter(name => !retainedSourceClasses.has(name));
  const onlyExcluded = raw.classes.every(name => !retainedSourceClasses.has(name));
  assert.equal(owns(excludedOnly, raw.name), onlyExcluded, `Check excluded-only decision for ${raw.id}`);
  const resolution = onlyExcluded ? excludedOnly[raw.name] : null;
  const wizard = wizardSource.length > 0 || resolution?.[0] === 'Wizard';
  const cleric = clericSource.length > 0 || resolution?.[0] === 'Cleric';
  const derivedHerald = cleric && raw.deities.length > 0;
  const herald = explicitHerald || derivedHerald;
  const sorcerer = wizard && owns(sorcererYes, raw.name);
  assert.ok(!owns(sorcererYes, raw.name) || wizard, `Check arcane status for ${raw.id}`);
  const provenance = {
    Wizard: wizardSource.length ? wizardSource.map(name => `Source class: ${name}`) :
      (wizard ? [`Excluded-only arcane review: ${resolution[1]}`] : []),
    Sorcerer: sorcerer ? [sorcererYes[raw.name]] : [],
    Cleric: clericSource.length ? clericSource.map(name => `Source class: ${name}`) :
      (cleric ? [`Excluded-only divine review: ${resolution[1]}`] : []),
    Herald: [...(explicitHerald ? ['Source class: Herald'] : []),
      ...(derivedHerald ? ['Authoritative ruling: deity-listed Cleric is also eligible for Herald'] : [])]
  };
  const associations = ['Cleric', 'Herald'].flatMap(name => provenance[name].length ?
    raw.deities.map(deity => ({ class: name, deity, evidence: `Canonical ${raw.id}.deities; ${provenance[name].join('; ')}` })) : []);
  assert.deepEqual([...new Set(associations.map(entry => entry.deity))], [...new Set(raw.deities)],
    `Deity association coverage is incomplete for ${raw.id}`);
  let sorcererRationale;
  if (sorcerer) sorcererRationale = sorcererYes[raw.name];
  else if (owns(sorcererNo, raw.name)) sorcererRationale = sorcererNo[raw.name];
  else if (wizard) sorcererRationale = `The operative effect applies magic to its subject without directly shaping raw magic or modifying magic itself. Source summary: ${raw.summary} Rules evidence: ${rulesExcerpt}`;
  else sorcererRationale = `Divine access only after the class rulings. ${resolution?.[1] ?? raw.summary}`;
  return {
    classes: classNames.filter(name => provenance[name].length > 0), associations, provenance,
    excludedClasses: excluded, excludedOnlyResolution: resolution && { class: resolution[0], rationale: resolution[1] },
    sorcerer: { eligible: sorcerer, sourceListed: raw.classes.includes('Sorcerer'), rationale: sorcererRationale },
    untaggedExplicitHerald: explicitHerald && raw.deities.length === 0
  };
}

function parseComponents(text) {
  const match = /^([VSM](?:\s*,\s*[VSM])*)(?:\s*\(([\s\S]*)\))?\.?$/.exec(text.trim());
  if (!match) return null;
  const [, codes, material = ''] = match;
  return {
    components: { vocalized: codes.includes('V'), seen: codes.includes('S'), material: codes.includes('M') },
    materials: material || (codes.includes('M') ? null : ''),
    materialsConsumed: !codes.includes('M') ? false : null
  };
}

function mechanics(raw, quest) {
  const fields = Object.fromEntries(mechanicFields.map(field => [field, raw[field]]));
  const missingFields = mechanicFields.filter(field => !raw[field].trim());
  const components = parseComponents(raw.components);
  const concentration = /^concentration\b/i.test(raw.duration.trim()) ? true : null;
  const limitations = [{
    fields: ['castingTime', 'range', 'target', 'area', 'duration'],
    reason: 'Keep the source headers and full rule text. Native A5e action fields and unit enums require official schema verification.'
  }, {
    fields: ['savingThrow', 'damage', 'higherLevels'],
    reason: 'Keep the source headers and rule text. No roll, save, damage or scaling action is generated.'
  }];
  if (missingFields.length) limitations.push({
    fields: missingFields, reason: 'Blank source headers are unresolved or described in the rules. No replacement value was inferred.'
  });
  if (!components || components.materials === null || components.materialsConsumed === null) limitations.push({
    fields: ['components'], reason: 'Missing, nonstandard or material-component syntax needs rule-level review of materials and consumption.'
  });
  if (concentration === null) limitations.push({
    fields: ['duration'], reason: 'Duration does not start with an explicit concentration requirement. Verify whether the rules specify concentration, including optional modes.'
  });
  if (quest) limitations.push({
    fields: ['level', 'castingTime'], reason: 'Level 9 is the catalog placement. Preserve the text governing quest or divine casting, including any outside-slot treatment.'
  });
  if (owns(sourceRuleGaps, raw.id)) limitations.push({ fields: ['rules'], reason: sourceRuleGaps[raw.id] });
  if (/\b(?:choose one|depending on|alternatively|one of the following)\b/i.test(raw.rules)) limitations.push({
    fields: ['actions'], reason: 'Rules contain choices or alternate outcomes. A single generic action would not encode them.'
  });
  if (/\b(?:per (?:wizard|cleric|class|caster) level|wild.surge|spell slot|narrator|dungeon master)\b/i.test(raw.rules)) limitations.push({
    fields: ['actions'], reason: 'Rules contain class-level scaling, spell resources, surges or adjudication; evaluate manually before encoding.'
  });
  return { fields, missingFields, components, concentration, limitations };
}

function draftRecord(raw) {
  const rulesExcerpt = raw.rules.replace(/\s+/g, ' ').trim().slice(0, 420);
  const review = eligibility(raw, rulesExcerpt);
  const quest = raw.level === null;
  if (quest) assert.equal(raw.original?.level, 'Q', `Unconfirmed Quest level for ${raw.id}`);
  const name = quest ? `${raw.name} (Quest)` : raw.name;
  const native = mechanics(raw, quest);
  const sourceFlags = {
    originalName: raw.name, originalClasses: raw.classes, sourceOrigin: raw.origin, sourceSchool: raw.school,
    canonicalLevel: raw.level, originalLevel: raw.original?.level ?? null, quest,
    exactDeityNames: raw.deities, eligibility: review.provenance,
    untaggedExplicitHerald: review.untaggedExplicitHerald, sourceThemes: raw.themes,
    sourceMechanics: native.fields, ...(raw.original ? { legacySource: raw.original } : {})
  };
  const descriptionHtml = [
    `<p><strong>Summary</strong> ${html(raw.summary)}</p>`,
    ...Object.entries(native.fields).filter(([, text]) => text.trim()).map(([field, text]) =>
      `<p><strong>${html(field.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase()))}</strong> ${html(text)}</p>`),
    `<p><strong>Rules</strong><br>\n${html(raw.rules)}</p>`
  ].join('\n');
  return {
    key: raw.id, _id: documentId(raw.id), name, type: 'spell', classes: review.classes,
    level: quest ? 9 : raw.level, tags: quest ? ['quest'] : [], ritual: raw.ritual,
    associations: review.associations, sourceFlags, descriptionHtml, raw,
    componentProposal: native.components, concentrationProposal: native.concentration,
    review: { ...review, originalName: raw.name, originalClasses: raw.classes, originalLevel: sourceFlags.originalLevel,
      level: quest ? 9 : raw.level, quest, rulesExcerpt, rulesSha256: sha256(raw.rules),
      missingFields: native.missingFields, mechanicalLimitations: native.limitations }
  };
}

export function prepareCanonical(snapshot) {
  assert.deepEqual(snapshot.hashes, canonicalHashes, 'Class rulings apply to the reviewed canonical bytes');
  const { records } = snapshot;
  const names = new Map();
  for (const { name } of records) names.set(name, (names.get(name) ?? 0) + 1);
  for (const name of [...Object.keys(excludedOnly), ...Object.keys(sorcererYes), ...Object.keys(sorcererNo)]) {
    assert.equal(names.get(name), 1, `Reviewed name must resolve to exactly one canonical ID: ${name}`);
  }
  const byId = new Map(records.map(raw => {
    const record = draftRecord(raw);
    return [raw.id, record];
  }));
  const drafts = [...byId.values()];
  assert.equal(drafts.length, 819);
  assert.equal(new Set(drafts.map(row => row._id)).size, 819);
  assert.equal(drafts.filter(row => row.tags.includes('quest')).length, 28);
  assert.equal(drafts.filter(row => row.level === 9).length, 52);
  assert.equal(drafts.filter(row => row.associations.length).length, 318);
  assert.deepEqual([...names.values()].filter(count => count > 1), Array(6).fill(2));
  assert.ok(drafts.every(row => row.classes.length && row.level >= 0 && row.level <= 9));
  assert.equal(eligibilityDigest(drafts.map(row => [row.key, row.classes])), approvedEligibilitySha256,
    'Approved per-spell eligibility changed');
  return byId;
}

// Native integration stays behind the exact official release boundary. The
// caller's API supplies source-backed registry values, schema and action review.
export function createNativeAdapter(official) {
  const { classIds, evidence, slugify, canonicalRevision } = official;
  assert.deepEqual(Object.keys(classIds).sort(), [...classNames].sort());
  const nativeIds = classNames.map(name => classIds[name]);
  assert.equal(new Set(nativeIds).size, 4);
  assert.ok(typeof official.validateItem === 'function' && typeof official.mapSystem === 'function'
    && typeof official.reviewMechanics === 'function' && typeof slugify === 'function');
  assert.equal(slugify('quest'), 'quest');
  let drafts;
  return {
    ...canonicalCodec, classIds: nativeIds, clericClassId: classIds.Cleric, heraldClassId: classIds.Herald,
    evidence, slugify, canonicalRevision, prepare: snapshot => { drafts = prepareCanonical(snapshot); },
    map(raw) {
      const draft = drafts.get(raw.id);
      const system = { ...official.mapSystem(draft), classes: draft.classes.map(name => classIds[name]),
        level: draft.level, ritual: draft.ritual };
      const treatment = official.reviewMechanics(system, draft);
      assert.ok(Array.isArray(treatment?.unresolved) && Array.isArray(treatment?.evidence) && treatment.evidence.length,
        `Missing official or manual mechanical treatment for ${raw.id}`);
      return { ...draft, system, classAliases: draft.classes.includes('Herald') ? { [classIds.Herald]: 'Vathian Herald' } : {},
        unresolved: treatment.unresolved, review: { ...draft.review, nativeTreatment: treatment.evidence } };
    },
    validateItem(item, raw) {
      const draft = drafts.get(raw.id);
      assert.equal(item.name, draft.name);
      assert.deepEqual(item.flags[moduleId].originalClasses, raw.classes);
      assert.deepEqual(item.system.classes, draft.classes.map(name => classIds[name]));
      const expectedTags = [...draft.tags, ...new Set(raw.deities)].map(value => slugify(value));
      assert.equal(new Set(expectedTags).size, expectedTags.length, `Native tag collision for ${raw.id}`);
      assert.deepEqual(item.system.tags, expectedTags);
      return official.validateItem(item, draft);
    }
  };
}

export async function writeReview(input, output) {
  const snapshot = await readSnapshot(input, canonicalCodec);
  const drafts = [...prepareCanonical(snapshot).values()];
  const count = predicate => drafts.filter(predicate).length;
  // All deity names in this pinned transfer are simple ASCII words. The native
  // build uses the verified official slugify and validates every generated tag.
  const tagsFor = row => [...new Set([...row.tags, ...row.associations.map(entry => entry.deity)].map(value => {
    assert.match(value, /^[A-Za-z]+$/, 'New tag format requires official slug verification');
    return value.toLowerCase();
  }))];
  const nameGroups = Map.groupBy(drafts, row => row.raw.name);
  const sameNamePairs = [...nameGroups].filter(([, rows]) => rows.length === 2).map(([sourceName, rows]) => ({
    sourceName, variants: rows.map(row => ({ sourceId: row.key, documentId: row._id }))
  }));
  const tagsById = new Map(drafts.map(row => [row.key, tagsFor(row)]));
  const totalSourceDeities = drafts.reduce((total, row) => total + new Set(row.raw.deities).size, 0);
  const deityTagCount = [...tagsById.values()].reduce((total, tags) => total + tags.filter(tag => tag !== 'quest').length, 0);
  assert.equal(deityTagCount, totalSourceDeities, 'Deity tag omission or slug collision');
  const audit = {
    status: 'private-pre-native-review',
    hashes: snapshot.hashes, gitBlobs: snapshot.gitBlobs, canonical: drafts.length, omitted: 0,
    classCounts: Object.fromEntries(classNames.map(name => [name, count(row => row.classes.includes(name))])),
    sorcererAdded: count(row => !row.review.sorcerer.sourceListed && row.review.sorcerer.eligible),
    sorcererRemoved: count(row => row.review.sorcerer.sourceListed && !row.review.sorcerer.eligible),
    excludedOnly: count(row => row.review.excludedOnlyResolution),
    excludedOnlyByClass: Object.fromEntries(['Wizard', 'Cleric'].map(name =>
      [name, count(row => row.review.excludedOnlyResolution?.class === name)])),
    quest: count(row => row.tags.includes('quest')), level9: count(row => row.level === 9),
    withDeities: count(row => row.associations.length),
    deityClassAssociations: Object.fromEntries(['Cleric', 'Herald'].map(name =>
      [name, drafts.reduce((total, row) => total + row.associations.filter(entry => entry.class === name).length, 0)])),
    deityTagCount, distinctDeityNames: new Set(drafts.flatMap(row => row.raw.deities)).size,
    untaggedCleric: count(row => row.classes.includes('Cleric') && !row.associations.length),
    untaggedExplicitHerald: count(row => row.review.untaggedExplicitHerald),
    blankFieldCounts: Object.fromEntries(mechanicFields.map(field => [field, count(row => row.review.missingFields.includes(field))])),
    flaggedRuleGaps: Object.keys(sourceRuleGaps),
    sameNamePairs,
    inventory: drafts.map(row => ({ key: row.key, id: row._id, name: row.name, ...row.review,
      deityAssociations: row.associations, proposedTags: tagsById.get(row.key) }))
  };
  const target = path.resolve(output);
  await mkdir(target);
  const write = (name, data) => writeFile(path.join(target, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
  await write('audit.json', audit);
  await write('drafts.json', drafts.map(({ key, _id, name, type, classes, level, ritual, associations, sourceFlags,
    descriptionHtml, componentProposal, concentrationProposal, raw }) =>
    ({ key, _id, name, type, classes, level, proposedTags: tagsById.get(key), ritual,
      componentProposal, concentrationProposal, descriptionHtml,
      flags: { [moduleId]: { ...sourceFlags, sourceKey: key, deityAssociations: associations } }, source: raw })));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(audit).filter(([key]) => key !== 'inventory')), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2) throw new Error('Usage: node canonical.mjs CANONICAL_INPUT NEW_PRIVATE_REVIEW_DIRECTORY');
  await writeReview(...args);
}
