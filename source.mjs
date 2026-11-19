import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { partNames, readSnapshot } from './build.mjs';

export const canonicalCodec = {
  manifest(raw) {
    assert.equal(raw.version, 1, 'Unsupported Vault manifest version');
    assert.equal(raw.format, 'multipart-gzip-json');
    assert.deepEqual(raw.parts, partNames);
    return { encoding: raw.format, parts: raw.parts, layout: 'joined', countBasis: 'decoded' };
  },
  records(payload, index, manifest) {
    assert.equal(index, 0);
    assert.equal(payload.version, manifest.version);
    assert.equal(payload.count, manifest.count);
    assert.match(payload.sourceDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Array.isArray(payload.records));
    assert.equal(payload.records.length, payload.count);
    const ids = new Set();
    for (const row of payload.records) {
      assert.ok(typeof row.id === 'string' && row.id.trim() && !ids.has(row.id), 'Invalid or duplicate Vault record ID');
      ids.add(row.id);
      for (const field of ['name', 'origin', 'school', 'summary', 'castingTime', 'range', 'target', 'area',
        'duration', 'components', 'savingThrow', 'damage', 'higherLevels', 'rules']) {
        assert.equal(typeof row[field], 'string', `Expected source ${field} on ${row.id}`);
      }
      for (const field of ['classes', 'deities', 'themes']) {
        assert.ok(Array.isArray(row[field]) && row[field].every(value => typeof value === 'string'),
          `Expected source ${field} on ${row.id}`);
      }
      assert.ok(row.level === null || Number.isInteger(row.level), `Unexpected source level on ${row.id}`);
      assert.equal(typeof row.ritual, 'boolean');
    }
    return payload.records;
  }
};

const counts = values => {
  const totals = new Map();
  for (const value of values) totals.set(value, (totals.get(value) ?? 0) + 1);
  return Object.fromEntries([...totals].sort(([a], [b]) => a.localeCompare(b)));
};

export async function inspect(input) {
  const { records, count, hashes } = await readSnapshot(input, canonicalCodec);
  const withDeities = records.filter(row => row.deities.length > 0);
  return {
    hashes, manifestCount: count, decoded: records.length, uniqueIds: new Set(records.map(row => row.id)).size,
    distinctNames: new Set(records.map(row => row.name)).size, missingNumericLevel: records.filter(row => row.level === null).length,
    origins: counts(records.map(row => row.origin)), sourceClassCounts: counts(records.flatMap(row => row.classes)),
    withSpellLevelDeityNames: withDeities.length,
    deityNamedWithBothClericAndHerald: withDeities.filter(row => row.classes.includes('Cleric') && row.classes.includes('Herald')).length,
    deityNamedWithoutClericOrHerald: withDeities.filter(row => !row.classes.includes('Cleric') && !row.classes.includes('Herald')).length,
    explicitRetirementOrIndexFields: records.filter(row => ['retired', 'indexOnly', 'status'].some(key => Object.hasOwn(row, key))).length
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, ...extra] = process.argv.slice(2);
  if (!input || extra.length) throw new Error('Usage: node source.mjs CANONICAL_INPUT_DIRECTORY');
  console.log(JSON.stringify(await inspect(input), null, 2));
}
