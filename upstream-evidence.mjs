import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from './build.mjs';

export const upstreamVersion = '1.5.2';

const evidencePaths = {
  package: /^(?:.*\/)?package\.json$/,
  classConfig: /(?:^|\/)registerClassesConfig\.ts$/,
  spellModel: /(?:^|\/)SpellDataModel\.ts$/,
  baseModel: /(?:^|\/)(?:BaseItem(?:Data)?Model|ItemDataModel)\.ts$/,
  metadata: /(?:^|\/)Metadata\.svelte$/,
  actionModel: /(?:^|\/)(?:ActionDataModel|ActionModel)\.ts$/,
  fireball: /(?:^|\/)fireball\.json$/,
  magicMissile: /(?:^|\/)magic-missile\.json$/,
  cureWounds: /(?:^|\/)cure-wounds\.json$/,
  officialPackBuild: /(?:^|\/)buildCompendia\.mjs$/,
  officialPackLibrary: /(?:^|\/)Pack\.mjs$/
};

async function listFiles(root, relative = '') {
  const result = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const file = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await listFiles(root, file));
    else if (entry.isFile()) result.push(file);
  }
  return result.sort();
}

export async function inspectUpstream(directory) {
  const root = path.resolve(directory);
  let listing;
  let directoryPresent = true;
  try {
    listing = await listFiles(root);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    directoryPresent = false;
    listing = [];
  }
  const files = {};
  const missing = [];
  const ambiguous = {};
  for (const [key, pattern] of Object.entries(evidencePaths)) {
    const matches = listing.filter(file => pattern.test(file));
    if (key === 'package' && matches.includes('package.json')) matches.splice(0, matches.length, 'package.json');
    if (matches.length === 0) missing.push(key);
    else if (matches.length > 1) ambiguous[key] = matches;
    else files[key] = { path: matches[0], sha256: sha256(await readFile(path.join(root, matches[0]))) };
  }
  const findings = [];
  let version = null;
  if (files.package) {
    try {
      version = JSON.parse(await readFile(path.join(root, files.package.path), 'utf8')).version ?? null;
      if (version !== upstreamVersion) findings.push(`Expected A5e ${upstreamVersion}; package.json reports ${version}.`);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      findings.push('Could not parse staged package.json.');
    }
  }
  if (files.classConfig) {
    const registry = await readFile(path.join(root, files.classConfig.path), 'utf8');
    for (const id of ['wizard', 'sorcerer', 'cleric', 'herald']) {
      if (!new RegExp(`\\b${id}\\b`).test(registry)) findings.push(`Registry does not contain ${id}.`);
    }
  }
  for (const name of ['fireball', 'magicMissile', 'cureWounds']) {
    if (!files[name]) continue;
    try {
      const item = JSON.parse(await readFile(path.join(root, files[name].path), 'utf8'));
      if (item.type !== 'spell' || typeof item.system !== 'object' || !item.system) {
        findings.push(`Expected a spell Item in ${files[name].path}.`);
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      findings.push(`Could not parse ${files[name].path}.`);
    }
  }
  return { directory: root, directoryPresent, version, files, missing, ambiguous, findings };
}
