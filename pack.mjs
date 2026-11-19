import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleId, partNames, sha256 } from './build.mjs';
import { approvedEligibilitySha256, eligibilityDigest } from './canonical.mjs';
import { classIds } from './native-adapter.mjs';
import { upstreamVersion } from './upstream-evidence.mjs';
import { a5eRevision } from './a5e-1.5.2.mjs';

const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const run = (program, args, cwd, logName) => {
  const local = path.join(cwd, 'tool-state');
  const env = { ...process.env, APPDATA: local, XDG_DATA_HOME: local, TEMP: local, TMP: local, TMPDIR: local };
  const result = spawnSync(program, args, { cwd, env, shell: false, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  assert.equal(result.status, 0, `Local tool failed: ${program}\n${output.slice(-3500)}`);
  return logName ? writeFile(path.join(cwd, logName), output, { flag: 'wx' }) : output;
};

async function pack(source, localDriver, output) {
  const root = path.resolve(output);
  const input = path.resolve(source, 'items');
  const audit = await readJson(path.resolve(source, 'audit.json'));
  assert.equal(audit.withUnresolvedMechanics, 0, 'Resolve mechanics or document verified native/manual treatment in the importer before packaging');
  assert.equal(audit.nativeValidation?.status, 'official-source-schema-checked', 'Package a build checked against the official A5e 1.5.2 source');
  assert.equal(audit.nativeValidation.a5eRevision, a5eRevision);
  assert.equal(audit.nativeValidation.a5eVersion, upstreamVersion);
  assert.equal(audit.nativeValidation.approvedEligibilitySha256, approvedEligibilitySha256);
  assert.equal(audit.included, 819, 'The release requires all canonical records');
  for (const name of ['manifest.json', ...partNames]) {
    assert.match(audit.gitBlobs?.[name] ?? '', /^[0-9a-f]{40}$/, `Missing canonical Git blob for ${name}`);
  }
  const expected = new Map();
  for (const [id, hash] of Object.entries(audit.itemHashes)) {
    assert.match(id, /^[A-Za-z0-9]{16}$/);
    const bytes = await readFile(path.join(input, id + '.json'));
    assert.equal(sha256(bytes), hash, `Built source changed: ${id}`);
    const item = JSON.parse(bytes);
    assert.equal(item._id, id);
    expected.set(id, item);
  }
  assert.equal(expected.size, audit.included);
  assert.ok(expected.size > 0);
  assert.deepEqual((await readdir(input)).sort(), [...expected.keys()].map(id => id + '.json').sort());
  const expectedItems = [...expected.values()];
  const displayClass = Object.fromEntries(Object.entries(classIds).map(([name, id]) => [id, name]));
  assert.equal(new Set(expectedItems.map(item => item.flags[moduleId].sourceKey)).size, 819);
  assert.equal(eligibilityDigest(expectedItems.map(item => [
    item.flags[moduleId].sourceKey, item.system.classes.map(id => displayClass[id])
  ])), approvedEligibilitySha256, 'Package would change approved per-spell eligibility');
  assert.deepEqual(Object.fromEntries(['wizard', 'sorcerer', 'cleric', 'herald'].map(id => [
    id, expectedItems.filter(item => item.system.classes.includes(id)).length
  ])), { wizard: 519, sorcerer: 75, cleric: 361, herald: 333 });
  const quests = expectedItems.filter(item => item.system.tags.includes('quest'));
  assert.equal(quests.length, 28);
  for (const item of quests) {
    const actions = Object.values(item.system.actions);
    assert.equal(item.flags[moduleId].chatSaves, false, item.name);
    assert.equal(item.flags[moduleId].rollReview.category, 'quest-excluded', item.name);
    assert.equal(actions.length, 1, item.name);
    assert.deepEqual([actions[0].rolls, actions[0].prompts, actions[0].consumers], [{}, {}, {}], item.name);
  }
  assert.equal(expectedItems.filter(item => item.system.level === 9).length, 52);
  assert.equal(expectedItems.filter(item => item.flags[moduleId].deityAssociations.length).length, 318);
  const manifest = JSON.parse(await readFile(new URL('./module.json', import.meta.url), 'utf8'));
  const runtimeFiles = manifest.esmodules?.length ? ['scripts/spell-chat.mjs', 'scripts/save-rules.mjs'] : [];
  if (manifest.version === '0.2.1') {
    assert.deepEqual(manifest.esmodules, [runtimeFiles[0]], 'Release must load the verified chat entry point');
    assert.ok(manifest.download.endsWith(`/main/releases/${moduleId}-0.2.1.zip`));
    assert.equal(audit.rollCoverage?.individuallyReviewed, audit.included, 'Release requires an individual rules review for every spell');
    assert.equal(audit.rollCoverage.pending, 0);
    assert.equal(audit.freshReviewCoverage?.reviewed, audit.included, 'Release requires a fresh rules review for every included spell');
    assert.equal(audit.freshReviewCoverage.pending, 0);
    assert.deepEqual(audit.actionDescriptionCoverage,
      { verified: 1328, casts: 819, followUps: 509, spellsWithFollowUps: 295, pending: 0 });
    assert.ok(expectedItems.every(item => item.flags[moduleId].rollReview?.reviewed === true));
  }
  const driver = (await import(pathToFileURL(path.resolve(localDriver)))).default;
  assert.ok(typeof driver.evidence === 'string' && driver.evidence.trim(), 'Provide official CLI version and local command evidence');
  assert.ok(path.isAbsolute(driver.executable), 'Provide an absolute local executable path');
  assert.ok((await lstat(driver.executable)).isFile(), 'Expected a local executable');
  assert.ok(path.isAbsolute(driver.archiveExecutable), 'Provide an absolute local bsdtar executable path');
  assert.ok((await lstat(driver.archiveExecutable)).isFile(), 'Expected a local archive executable');
  const staging = path.join(root, 'staging');
  const moduleDir = path.join(staging, moduleId);
  const database = path.join(root, 'packed', 'spells');
  const databaseForRelease = path.join(moduleDir, 'packs', 'spells');
  const cliInput = path.join(root, 'cli-input');
  const unpacked = path.join(root, 'roundtrip');
  await mkdir(root);
  await mkdir(path.join(root, 'tool-state'));
  await mkdir(cliInput);
  await mkdir(path.dirname(database), { recursive: true });
  await Promise.all(expectedItems.map(item => writeFile(path.join(cliInput, item._id + '.json'),
    JSON.stringify({ ...item, _key: `!items!${item._id}` }), { flag: 'wx' })));
  const args = { input: cliInput, database, unpacked, packName: 'spells', documentType: 'Item' };
  await run(driver.executable, driver.packArgs(args), root, 'pack.log');
  const files = await readdir(database, { withFileTypes: true });
  assert.ok(files.every(file => file.isFile()) && files.some(file => file.name === 'CURRENT')
    && files.some(file => /^MANIFEST-\d+$/.test(file.name)), 'Expected a LevelDB directory');
  // Ship the data and active write-ahead log, with the CLI's lock and diagnostic
  // logs confined to the build. Unpack a new extraction of the ZIP.
  const dbFiles = files.map(file => file.name).filter(name => name !== 'LOCK' && !/^LOG(?:\.old)?$/.test(name)).sort();
  await mkdir(databaseForRelease, { recursive: true });
  for (const name of dbFiles) await copyFile(path.join(database, name), path.join(databaseForRelease, name));
  await writeFile(path.join(moduleDir, 'module.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  if (runtimeFiles.length) await mkdir(path.join(moduleDir, 'scripts'));
  for (const file of runtimeFiles) await copyFile(new URL(file, import.meta.url), path.join(moduleDir, file));
  const archive = path.join(root, `${moduleId}-${manifest.version}.zip`);
  run(driver.archiveExecutable, ['-a', '-cf', archive, '-C', staging, moduleId], root);
  const entries = run(driver.archiveExecutable, ['-tf', archive], root).trim().split(/\r?\n/);
  const moduleFiles = ['module.json', ...runtimeFiles, ...dbFiles.map(name => `packs/spells/${name}`)];
  assert.deepEqual(entries.filter(entry => !entry.endsWith('/')).sort(), moduleFiles.map(file => `${moduleId}/${file}`).sort());
  const zipExtract = path.join(root, 'archive-verification');
  await mkdir(zipExtract);
  run(driver.archiveExecutable, ['-xf', archive, '-C', zipExtract], root);
  const extracted = path.join(zipExtract, moduleId);
  const moduleFileHashes = {};
  for (const file of moduleFiles) {
    const digest = sha256(await readFile(path.join(moduleDir, file)));
    assert.equal(sha256(await readFile(path.join(extracted, file))), digest, `ZIP changed ${file}`);
    moduleFileHashes[file] = digest;
  }
  await run(driver.executable, driver.unpackArgs({ ...args, database: path.join(extracted, 'packs', 'spells') }),
    root, 'unpack.log');
  const names = await readdir(unpacked);
  assert.equal(names.length, expected.size);
  for (const file of names) {
    assert.match(file, /\.json$/);
    const actual = await readJson(path.join(unpacked, file));
    const original = expected.get(actual._id);
    assert.ok(original, `Unexpected or repeated unpacked item: ${actual._id}`);
    assert.equal(actual._key, `!items!${actual._id}`);
    const { _key, ...unpackedItem } = actual;
    assert.deepEqual(unpackedItem, original, `Round-trip changed ${actual._id}`);
    expected.delete(actual._id);
  }
  assert.equal(expected.size, 0);
  await writeFile(path.join(root, 'release-receipt.json'), JSON.stringify({
    archive: path.basename(archive), sha256: sha256(await readFile(archive)), moduleFileHashes, roundTripCount: audit.included,
    toolingEvidence: driver.evidence, officialEvidence: audit.officialEvidence,
    nativeValidation: audit.nativeValidation, rollCoverage: audit.rollCoverage, chatSaveCoverage: audit.chatSaveCoverage,
    freshReviewCoverage: audit.freshReviewCoverage, actionDescriptionCoverage: audit.actionDescriptionCoverage,
    canonicalRevision: audit.canonicalRevision, canonicalHashes: audit.hashes, canonicalGitBlobs: audit.gitBlobs
  }, null, 2) + '\n', { flag: 'wx' });
}

const args = process.argv.slice(2);
if (args.length !== 3) throw new Error('Usage: node pack.mjs BUILD TRUSTED_LOCAL_DRIVER.mjs NEW_RELEASE_DIRECTORY');
await pack(...args);
