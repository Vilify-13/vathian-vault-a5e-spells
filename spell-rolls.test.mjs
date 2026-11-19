import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { makeAdapter, readReference } from './a5e-1.5.2.mjs';
import { convert, moduleId, readSnapshot, sha256 } from './build.mjs';
import { canonicalCodec } from './source.mjs';
import { validateReview } from './spell-rolls.mjs';
import { rollReview } from './roll-review.mjs';

test('the release review rejects a canonical record without a decision', () => {
  assert.throws(() => validateReview(new Set([...Object.keys(rollReview), 'unreviewed-record'])),
    /No individual rules review for unreviewed-record/);
});

test('official-source-bound roll build preserves the corpus and gates later mechanics', async context => {
  const input = fileURLToPath(new URL('../vathian-spell-source-20261118/', import.meta.url));
  const upstream = fileURLToPath(new URL('../a5e-reference/', import.meta.url));
  try {
    await Promise.all([access(input), access(upstream)]);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    context.skip('Private canonical transfer or pinned official checkout unavailable');
    return;
  }
  const [snapshot, reference] = await Promise.all([readSnapshot(input, canonicalCodec), readReference(upstream)]);
  const adapter = makeAdapter(reference);
  adapter.prepare(snapshot);
  const { items, inventory } = convert(snapshot.records, adapter);
  const keyed = new Map(items.map(item => [item.flags[moduleId].sourceKey, item]));
  assert.equal(items.length, 819);
  assert.equal(keyed.size, 819);
  const actions = sourceKey => Object.values(keyed.get(sourceKey).system.actions);
  const rolls = action => Object.values(action.rolls);
  const prompts = action => Object.values(action.prompts);
  const direct = actions('2e-wizard-384')[0];
  assert.deepEqual(rolls(direct).map(roll => [roll.type, roll.formula, roll.damageType, roll.default]),
    [['damage', '2d6', 'fire', true]]);
  assert.deepEqual(prompts(direct).map(prompt => [prompt.default, prompt.ability, prompt.onSave, prompt.saveDC.type]),
    [[true, 'dex', 'No damage.', 'spellcasting']]);
  const [initial, ...coated] = actions('2e-wizard-446');
  assert.equal(rolls(initial).length, 1);
  assert.deepEqual(coated.map(action => [action.default, rolls(action)[0].formula]), [[false, '2d6'], [false, '3d6'], [false, '4d6']]);
  const [shieldCast, ...retaliation] = actions('tome-lightningshield');
  assert.equal(rolls(shieldCast).length, 0);
  assert.deepEqual(retaliation.map(action => [action.default, rolls(action)[0].damageType]),
    [[false, 'acid'], [false, 'lightning']]);
  const saveOnly = actions('2e-priest-705')[0];
  assert.deepEqual(rolls(saveOnly), []);
  assert.deepEqual(prompts(saveOnly).map(prompt => prompt.ability), ['wis']);
  const [attack, hit] = actions('tome-rayofentropy');
  assert.deepEqual(rolls(attack).map(roll => roll.type), ['attack']);
  assert.deepEqual(rolls(hit).map(roll => roll.formula), ['3d10']);
  assert.equal(hit.default, false);
  assert.equal(hit.duration.concentration, false);
  const fixed = actions('2e-priest-676')[1];
  assert.deepEqual(prompts(fixed)[0].saveDC, { type: 'custom', bonus: '15' });
  const cantrip = rolls(actions('tome-admonishment')[0])[0];
  assert.deepEqual([cantrip.die.number, cantrip.die.denom, cantrip.scaling.mode, cantrip.scaling.config.number],
    [1, 6, 'cantrip', 1]);
  const castigate = actions('tome-castigate');
  assert.deepEqual(rolls(castigate[1]).map(roll => roll.formula), ['1d4', '1d4']);
  assert.equal(castigate[1].default, false);
  const [fogCast, ...fogExposure] = actions('2e-wizard-237');
  assert.equal(rolls(fogCast).length, 0);
  assert.deepEqual(fogExposure.map(action => [action.default, rolls(action)[0].formula]),
    [[false, '1'], [false, '2'], [false, '4'], [false, '8']]);
  const [gatewayCast, fireGate, airGate, waterGate] = actions('2e-wizard-927');
  assert.deepEqual([rolls(gatewayCast), prompts(gatewayCast)], [[], []]);
  assert.deepEqual([rolls(fireGate)[0].formula, prompts(fireGate)[0].ability], ['8d6', 'dex']);
  for (const action of [airGate, waterGate]) {
    assert.deepEqual(rolls(action), []);
    assert.equal(prompts(action)[0].ability, 'str');
  }
  assert.deepEqual(prompts(actions('tome-graft')[0])[0].saveDC, { type: 'custom', bonus: '10' });
  const [ward, undead] = actions('2e-priest-492');
  assert.deepEqual(prompts(ward), []);
  assert.equal(prompts(undead)[0].ability, 'wis');
  assert.deepEqual([rolls(actions('2e-wizard-192')[0]), prompts(actions('2e-wizard-192')[0])], [[], []]);
  const [breathCast, breathRepeat, breathFail, breathSuccess] = actions('2e-wizard-455');
  assert.equal(prompts(breathCast)[0].ability, 'con');
  assert.equal(prompts(breathRepeat)[0].ability, 'con');
  assert.deepEqual([rolls(breathCast), rolls(breathRepeat)], [[], []]);
  assert.deepEqual([breathFail, breathSuccess].map(a => [a.default, rolls(a)[0].formula]),
    [[false, '2d4'], [false, '1d4']]);
  const [thornCast, optionalThorn, laterThorn] = actions('tome-thornwrack');
  assert.deepEqual(rolls(thornCast), []);
  assert.equal(rolls(optionalThorn)[0].formula, '4d10');
  assert.equal(laterThorn.activation.type, 'bonusAction');
  const [orbCast, ...orbOutcomes] = actions('2e-priest-785');
  assert.deepEqual(rolls(orbCast).map(roll => [roll.type, roll.attackType, roll.bonus]),
    [['attack', 'rangedSpellAttack', '3']]);
  assert.deepEqual(orbOutcomes.map(a => [a.default, rolls(a)[0].formula, prompts(a)[0].ability]),
    [[false, '6d6', 'con'], [false, '12d6', 'con'], [false, '3d6', 'con'], [false, '6d6', 'con']]);
  const [boltCast, ...boltOutcomes] = actions('tome-wildbolt');
  assert.deepEqual(rolls(boltCast).map(roll => roll.type), ['attack']);
  assert.deepEqual(boltOutcomes.map(a => rolls(a)[0].formula), ['1d12', '2d12', '3d12', '1d4', '2d4', '3d4']);
  const [snowCast, snowOrdinary, snowElemental] = actions('tome-snowball');
  assert.deepEqual(rolls(snowCast), []);
  assert.equal(rolls(snowOrdinary)[0].scaling.mode, 'cantrip');
  assert.equal(rolls(snowElemental)[0].formula, '1d12');
  const [plumeCast, airPlume] = actions('tome-planarplume');
  assert.deepEqual([rolls(plumeCast), prompts(plumeCast)], [[], []]);
  assert.deepEqual([rolls(airPlume)[0].formula, prompts(airPlume)[0].ability], ['8d8', 'str']);
  assert.deepEqual(rolls(actions('2e-wizard-139')[0]), []);
  for (const id of ['2e-wizard-983', '2e-wizard-989', '2e-wizard-958']) {
    const [cast] = actions(id);
    assert.deepEqual(rolls(cast).map(roll => [roll.type, roll.default, roll.formula, roll.die.number, roll.die.denom]),
      [['generic', true, '@prof + @spell.mod', 1, 20]]);
    assert.deepEqual(prompts(cast), []);
  }
  assert.deepEqual(prompts(actions('tome-castigate')[0]).map(prompt => [prompt.ability, prompt.saveDC.type]), [['cha', 'spellcasting']]);
  const [thunderCast, thunderEntry] = actions('tome-lightningstorm');
  assert.deepEqual(rolls(thunderCast).map(roll => roll.formula), ['8d6', '5d6']);
  assert.deepEqual(prompts(thunderEntry).map(prompt => prompt.ability), ['con']);
  assert.deepEqual(prompts(actions('tome-graymantle')[0]).map(prompt => prompt.ability), ['con']);
  const [drownCast, drownAfter] = actions('tome-drown');
  assert.deepEqual(prompts(drownCast), []);
  assert.deepEqual(prompts(drownAfter).map(prompt => prompt.ability), ['con']);
  const [bucklerCast, bucklerReaction] = actions('tome-forcebuckler');
  assert.deepEqual(prompts(bucklerCast), []);
  assert.match(bucklerReaction.description, /attacking spellcaster/);
  const [hugCast, squeeze] = actions('tome-bearhug');
  assert.deepEqual(rolls(hugCast), []);
  assert.deepEqual(rolls(squeeze).map(roll => [roll.die.denom, roll.formula, roll.scaling.mode]),
    [[4, '@spell.mod + @str.mod', 'cantrip']]);
  const bySourceId = new Map(snapshot.records.map(record => [record.id, record]));
  for (const row of inventory) {
    const item = keyed.get(row.key);
    const raw = bySourceId.get(row.key);
    assert.equal(item.flags[moduleId].canonicalRules, raw.rules);
    assert.equal(row.rulesSha256, sha256(raw.rules));
    const native = actions(row.key);
    assert.equal(row.rollReview.reviewed, true, row.key);
    assert.ok(row.rollReview.rationale.trim(), row.key);
    assert.equal(native.filter(action => action.default).length, 1);
    const cast = native.find(action => action.default);
    assert.deepEqual(cast.descriptionOutputs, ['action']);
    assert.doesNotMatch(cast.description, /resolve outcomes and any mechanics omitted/);
    assert.ok(cast.description.length > 10 && cast.description.length < 1400, row.key);
    if (row.rollReview.category.endsWith('-manual') || row.rollReview.category === 'no-damage-no-save') {
      assert.ok(native.every(action => !rolls(action).length && !prompts(action).length), row.key);
    }
    if (!row.rollReview.category.startsWith('cast-damage')) {
      assert.ok(rolls(native.find(action => action.default)).every(roll => roll.type !== 'damage'), row.key);
    }
    for (const action of native) {
      assert.deepEqual([action.effects, action.consumers, action.macro], [[], {}, '']);
      for (const prompt of prompts(action)) {
        assert.match(prompt.ability, /^(str|dex|con|int|wis|cha)$/);
        assert.ok(prompt.onSave.trim(), row.key);
        assert.match(prompt.saveDC.type, /^(custom|spellcasting)$/);
      }
      for (const roll of rolls(action).filter(roll => roll.type === 'damage')) {
        assert.equal(roll.canCrit, false);
        if (roll.formula) assert.match(roll.formula, /^(?:\d+d\d+(?: ?\+ ?\d+)?|\d+|@spell\.mod \+ @str\.mod)$/);
      }
    }
  }
});
