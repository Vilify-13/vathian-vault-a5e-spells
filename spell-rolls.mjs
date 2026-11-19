import assert from 'node:assert/strict';
import { documentId } from './build.mjs';
import { rollReview } from './roll-review.mjs';
import { dcRollBonus, dcRollLabel, getContextSaves, getDynamicSave } from './scripts/save-rules.mjs';
import { applySaveCorrection, saveCorrections } from './save-review.mjs';
import { applyFreshActionChanges, genericRolls } from './reaudit-actions.mjs';
import { getFreshReview } from './fresh-spell-review.mjs';

const abilities = new Set(['str', 'dex', 'con', 'int', 'wis', 'cha']);
const attackTypes = new Set(['meleeSpellAttack', 'rangedSpellAttack']);
const damageTypes = new Set(['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder']);
const formulaPattern = /^(?:[1-9]\d{0,2}d(?:3|4|6|8|10|12|20)(?: ?\+ ?[1-9]\d{0,2})?|[1-9]\d{0,2})$/;
const savesIn = phase => [phase.savingThrow, ...(phase.extraSaves ?? [])].filter(Boolean);

export function validateReview(recordIds) {
  for (const id of Object.keys(rollReview)) assert.ok(recordIds.has(id), `No canonical record for roll review ${id}`);
  for (const id of Object.keys(saveCorrections)) assert.ok(recordIds.has(id), `No canonical record for save correction ${id}`);
  for (const id of recordIds) {
    assert.ok(Object.hasOwn(rollReview, id), `No individual rules review for ${id}`);
    const { category, rationale } = rollReview[id];
    assert.ok(category && rationale.trim(), `Incomplete rules review for ${id}`);
  }
}

export function reviewFor(raw) {
  const entry = rollReview[raw.id];
  const dynamicSave = getDynamicSave(raw.id);
  if (dynamicSave) return { reviewed: true, category: 'rolled-dc-save', dynamicSave, saveEvidence: 'explicit-rolled-dc',
    rationale: 'The caster rolls the DC. Select one defender at a time and apply listed shield, armor and magical missile rules as applicable. Apply the reported damage manually.' };
  if (entry) {
    const prior = applySaveCorrection(raw.id, entry);
    const fresh = getFreshReview(raw.id);
    const updated = applyFreshActionChanges(raw.id, prior, fresh);
    const contextSaves = getContextSaves(raw.id);
    if (contextSaves.length) {
      const followups = [...(updated.followups ?? [])];
      for (const context of contextSaves) {
        if (context.action) followups.push({ name: context.action, rationale: context.instructions });
      }
      return { ...updated, reviewed: true, followups, contextSaves, category: 'contextual-dc-save',
        saveEvidence: 'source-defined-context', rationale: fresh?.rationale ?? contextSaves[0].instructions };
    }
    return { reviewed: true, ...updated };
  }
  const hints = {
    damageText: /\bdamage\b/i.test(raw.rules),
    diceText: /\b\d*d\d+\b/i.test(raw.rules),
    saveText: /\b(?:save|saving throws?)\b/i.test(raw.rules),
    attackText: /\b(?:spell attack|attack roll)\b/i.test(raw.rules)
  };
  return { reviewed: false, category: 'pending-full-rules-review', hints,
    rationale: 'Full rules retained. No native roll or prompt added pending individual review.' };
}

export function saveAuditFor(raw, decision) {
  const baseline = rollReview[raw.id];
  const header = raw.savingThrow?.trim() ?? '';
  const headerAbility = /^\b(?:strength|dexterity|constitution|intelligence|wisdom|charisma)\b/i.exec(header)?.[0] ?? null;
  const saves = [];
  for (const [index, phase] of [decision, ...(decision.followups ?? [])].entries()) {
    for (const { ability, bonus, onSave } of savesIn(phase)) {
      saves.push({ action: index ? phase.name : 'Cast', dc: bonus ? 'fixed' : 'caster', value: bonus || null, ability, onSave });
    }
  }
  if (decision.dynamicSave) saves.push({ action: 'Cast', dc: 'rolled', ability: decision.dynamicSave.ability });
  for (const { fixed, useCasterDC, ability, action } of decision.contextSaves ?? []) {
    saves.push({ action: action ?? 'Cast', dc: fixed ? 'fixed' : useCasterDC ? 'caster' : 'context', value: fixed ?? null, ability });
  }
  const sourceLimits = [];
  if (!saves.length && headerAbility) sourceLimits.push(/investigation/i.test(header) ? 'ability-check-in-header' : 'ability-in-header-without-confirmed-native-save');
  if (['tome-pyroclasticsurge', '2e-priest-810'].includes(raw.id)) sourceLimits.push('save-ability-unspecified');
  return { header, headerAbility, correctionEvidence: decision.saveEvidence ?? null,
    baselineManualOnly: baseline.category.endsWith('-manual'),
    baselineSecondaryOnly: Boolean(!baseline.rolls?.length && !baseline.savingThrow && !baseline.attack && baseline.followups?.length),
    rationale: decision.rationale, baselineRationale: baseline.rationale, saves, sourceLimits };
}

const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('[', '&#91;').replaceAll('@', '&#64;');

function chatDescription(decision, raw) {
  const dynamic = decision.dynamicSave;
  if (dynamic) return `<p>${escape(dynamic.target)} The caster rolls 1d20 + their spell attack modifier to set the Dexterity save DC. Use the save section to resolve each defender.</p>`;
  const short = raw.summary?.trim();
  const preview = short && /[.!?]$/.test(short) ? short : '';
  const notes = [preview && preview !== decision.rationale ? preview : '', decision.rationale].filter(Boolean);
  if (decision.followups?.length) {
    const list = decision.followups.slice(0, 3).map(phase => phase.name).join('; ');
    notes.push(`Actions when applicable: ${list}${decision.followups.length > 3 ? '; more on the spell sheet' : ''}.`);
  }
  return notes.map(text => `<p>${escape(text)}</p>`).join('');
}

function writePhase(action, phase, key) {
  for (const [index, entry] of (phase.rolls ?? []).entries()) {
    assert.ok(formulaPattern.test(entry.formula), `Unsupported damage formula on ${key}`);
    assert.ok(damageTypes.has(entry.type), `Unsupported damage type on ${key}`);
    const cantrip = entry.cantrip;
    if (cantrip) assert.equal(entry.formula, `1d${cantrip}`, 'Cantrip progression requires a reviewed single base die');
    if (entry.modifier) assert.ok(entry.modifier === '@spell.mod' || (cantrip && entry.modifier === '@spell.mod + @str.mod'));
    action.rolls[documentId(`${key}:damage:${index}`)] = {
      type: 'damage', default: true, label: '', damageType: entry.type, canCrit: false, critBonus: '',
      formula: cantrip ? entry.modifier ?? '' : [entry.formula, entry.modifier].filter(Boolean).join(' + '),
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
  for (const [index, { ability, onSave, bonus }] of savesIn(phase).entries()) {
    assert.ok(abilities.has(ability) && onSave && (!bonus || /^[1-9]\d?$/.test(bonus)));
    action.prompts[documentId(index ? `${key}:save:${index}` : `${key}:save`)] = { type: 'savingThrow', ability, default: true, label: '',
      onSave, saveDC: { type: bonus ? 'custom' : 'spellcasting', bonus } };
  }
  if (phase.generic === 'sigil-attack') addGeneric(action, key, 'Triggered spell attack', dcRollBonus, 1, 20);
  if (phase.generic === 'uplift-expiration') addGeneric(action, key, 'Untyped damage on expiration', '', 2, 6);
  if (Object.hasOwn(genericRolls, phase.generic)) {
    const { label, formula } = genericRolls[phase.generic];
    addGeneric(action, key, label, formula, 0, 0);
  }
}

function addGeneric(action, key, label, formula, number, denom) {
  action.rolls[documentId(`${key}:generic`)] = { type: 'generic', default: true, label, formula,
    die: { number, denom, modifiers: [] }, scaling: { mode: null, config: {} } };
}

export function nativeRollActions(base, draft) {
  const decision = reviewFor(draft.raw);
  base.description = chatDescription(decision, draft.raw);
  writePhase(base, decision, draft.key);
  if (decision.dynamicSave) addGeneric(base, draft.key, dcRollLabel, dcRollBonus, 1, 20);
  const actions = { [base.id]: base };
  for (const [index, phase] of (decision.followups ?? []).entries()) {
    const key = `${draft.key}:follow-up:${index}`;
    const id = documentId(key);
    const action = {
      ...structuredClone(base), id, name: phase.name, default: false,
      description: `<p>${escape(phase.rationale ?? decision.rationale)}</p>`,
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
