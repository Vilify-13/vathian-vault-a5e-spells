import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sha256 } from './build.mjs';

const rows = readFileSync(new URL('./fresh-spell-review.ndjson', import.meta.url), 'utf8').trim().split(/\r?\n/).filter(Boolean);
const decisions = new Map();
for (const line of rows) {
  const [id, rulesSha256, status, rationale] = JSON.parse(line);
  assert.ok(id && !decisions.has(id), `Duplicate fresh review for ${id}`);
  assert.match(rulesSha256, /^[a-f0-9]{64}$/);
  assert.ok(['adjusted', 'retained', 'manual'].includes(status) && rationale.trim());
  decisions.set(id, { rulesSha256, status, rationale });
}

export const getFreshReview = id => decisions.get(id);

export function verifyFreshReviews(records) {
  const source = new Map(records.map(record => [record.id, record.rules]));
  assert.equal(decisions.size, source.size, 'The corrective build requires a fresh decision for every canonical record');
  for (const [id, decision] of decisions) {
    assert.ok(source.has(id), `Fresh review references unknown spell ${id}`);
    assert.equal(sha256(source.get(id)), decision.rulesSha256, `Rules changed after fresh review of ${id}`);
  }
}
