import assert from 'node:assert/strict';
import { documentId } from './build.mjs';
import { rollReview } from './roll-review.mjs';

const abilities = new Set(['str', 'dex', 'con', 'int', 'wis', 'cha']);
const attackTypes = new Set(['meleeSpellAttack', 'rangedSpellAttack']);
const damageTypes = new Set(['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder']);
const formulaPattern = /^(?:[1-9]\d{0,2}d(?:3|4|6|8|10|12|20)(?: ?\+ ?[1-9]\d{0,2})?|[1-9]\d{0,2})$/;

export function validateReview(recordIds) {
  for (const id of Object.keys(rollReview)) assert.ok(recordIds.has(id), `No canonical record for roll review ${id}`);
  for (const id of recordIds) {
    assert.ok(Object.hasOwn(rollReview, id), `No individual rules review for ${id}`);
    const { category, rationale } = rollReview[id];
    assert.ok(category && rationale.trim(), `Incomplete rules review for ${id}`);
  }
}

export function reviewFor(raw) {
  const entry = rollReview[raw.id];
  if (entry) return { reviewed: true, ...entry };
  const hints = {
    damageText: /\bdamage\b/i.test(raw.rules),
    diceText: /\b\d*d\d+\b/i.test(raw.rules),
    saveText: /\b(?:save|saving throws?)\b/i.test(raw.rules),
    attackText: /\b(?:spell attack|attack roll)\b/i.test(raw.rules)
  };
  return { reviewed: false, category: 'pending-full-rules-review', hints,
    rationale: 'Full rules retained. No native roll or prompt added pending individual review.' };
}

function writePhase(action, phase, key) {
  for (const [index, entry] of (phase.rolls ?? []).entries()) {
    assert.ok(formulaPattern.test(entry.formula), `Unsupported damage formula on ${key}`);
    assert.ok(damageTypes.has(entry.type), `Unsupported damage type on ${key}`);
    const cantrip = entry.cantrip;
    if (cantrip) assert.equal(entry.formula, `1d${cantrip}`, 'Cantrip progression requires a reviewed single base die');
    action.rolls[documentId(`${key}:damage:${index}`)] = {
      type: 'damage', default: true, label: '', damageType: entry.type, canCrit: false, critBonus: '',
      formula: cantrip ? '' : entry.formula,
      die: { number: cantrip ? 1 : 0, denom: cantrip ?? 0, modifiers: [] },
      scaling: { mode: cantrip ? 'cantrip' : null, config: { value: '', number: cantrip ? 1 : 0, denom: 0, cap: 5 } }
    };
  }
  if (phase.attack) {
    const { type, bonus = '' } = typeof phase.attack === 'string' ? { type: phase.attack } : phase.attack;
    assert.ok(attackTypes.has(type), `Unsupported attack type on ${key}`);
    assert.ok(bonus === '' || /^[1-9]\d?$/.test(bonus), `Unsupported attack bonus on ${key}`);
    action.rolls[documentId(`${key}:attack`)] = { type: 'attack', default: true, label: '',
      ability: 'default', attackType: type, bonus, critThreshold: 20, proficient: true };
  }
  if (phase.savingThrow) {
    const { ability, onSave, bonus } = phase.savingThrow;
    assert.ok(abilities.has(ability) && onSave && (!bonus || /^[1-9]\d?$/.test(bonus)));
    action.prompts[documentId(`${key}:save`)] = { type: 'savingThrow', ability, default: true, label: '',
      onSave, saveDC: { type: bonus ? 'custom' : 'spellcasting', bonus } };
  }
}

export function nativeRollActions(base, draft) {
  const decision = reviewFor(draft.raw);
  writePhase(base, decision, draft.key);
  const actions = { [base.id]: base };
  for (const [index, phase] of (decision.followups ?? []).entries()) {
    const key = `${draft.key}:follow-up:${index}`;
    const id = documentId(key);
    const action = {
      ...structuredClone(base), id, name: phase.name, default: false,
      description: '<p>Use only when the trigger in the spell description occurs. Adjudicate results manually.</p>',
      activation: { type: phase.activation ?? 'special', cost: phase.activation ? 1 : 0, reactionTrigger: '' },
      duration: { unit: 'instantaneous', value: '0', concentration: false },
      ranges: {}, area: { ...base.area, shape: 'none', length: 0, height: 0, radius: 0, width: 0 },
      target: { ...base.target, type: '', quantity: 1 }, rolls: {}, prompts: {}
    };
    writePhase(action, phase, key);
    actions[id] = action;
  }
  return actions;
}
