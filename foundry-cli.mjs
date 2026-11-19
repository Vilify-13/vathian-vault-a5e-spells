import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { moduleId, sha256 } from './build.mjs';

const require = createRequire(import.meta.url);
const cliRoot = path.dirname(require.resolve('@foundryvtt/foundryvtt-cli'));
const cli = path.join(cliRoot, 'fvtt.mjs');
const cliPackage = JSON.parse(await readFile(path.join(cliRoot, 'package.json'), 'utf8'));
const levelRequire = createRequire(cli);
const { version: levelVersion } = levelRequire('classic-level/package.json');
assert.equal(cliPackage.version, '3.0.5');
assert.equal(levelVersion, '3.0.0');
const command = await readFile(path.join(cliRoot, 'commands', 'package.mjs'), 'utf8');
assert.match(command, /path\.join\(pack, compendiumName\)/);
assert.match(command, /alias: "in"/);
assert.match(command, /alias: "out"/);
const baseArgs = (verb, input, output, { packName, documentType }) => [cli, 'package', verb, '--in', input,
  '--out', output, '--id', moduleId, '--type', 'Module', '--compendiumName', packName, '--compendiumType', documentType];

export default {
  evidence: `Official Foundry CLI ${cliPackage.version}, ClassicLevel ${levelVersion}; commands/package.mjs sha256:${sha256(command)}`,
  executable: process.execPath,
  archiveExecutable: path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'),
  packArgs: args => baseArgs('pack', args.input, path.dirname(args.database), args),
  unpackArgs: args => baseArgs('unpack', path.dirname(args.database), args.unpacked, args)
};
