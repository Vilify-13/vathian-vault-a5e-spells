import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dcRollLabel, getDynamicSave, moduleId, resolveDynamicSave } from './scripts/save-rules.mjs';
import { enhanceSpellCard, permittedDefenders, recordSpellCard, visibleCard } from './scripts/spell-chat.mjs';

const actionId = 'a674bea6dfa3412b';
const player = { id: 'player' };
const gm = { id: 'gm', isGM: true };
const caster = { type: 'character', uuid: 'Actor.caster', system: { attributes: { spellDC: 14, spellcasting: 'int' } },
  spellBooks: new Map([['secondary', { stats: { dc: 17, ability: 'wis' } }]]) };

function card(sourceKey, { rolls = [], prompts = [], action = { default: true } } = {}) {
  const item = { type: 'spell', actor: caster, system: { spellBook: 'secondary' }, actions: new Map([[actionId, action]]),
    flags: { [moduleId]: { sourceKey, chatSaves: true } } };
  const message = { type: 'item', actor: caster,
    flags: {}, updateSource(changes) { this.flags[moduleId] = { saveCard: changes[`flags.${moduleId}.saveCard`] }; },
    system: { itemId: 'Actor.caster.Item.spell', actorId: caster.uuid, actionId, prompts,
      rollData: rolls.map(() => ({ type: 'generic', label: dcRollLabel })) }, rolls };
  recordSpellCard(message, gm.id, { user: gm }, () => item);
  return message;
}

class ElementFixture {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.dataset = {};
    this.ownerDocument = { createElement: tag => new ElementFixture(tag) };
  }
  append(node) { this.children.push(node); }
  setAttribute() {}
  addEventListener(type, handler, options) {
    assert.equal(type, 'click');
    assert.equal(options.capture, true);
    assert.equal(this.handler, undefined);
    this.handler = handler;
  }
  async click(overrides = {}) {
    const event = { shiftKey: false, ctrlKey: false, altKey: false,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...overrides };
    await this.handler(event);
    assert.equal(event.prevented && event.stopped, true);
  }
}

function render(message, api, native = false) {
  const article = new ElementFixture('article');
  const shell = { querySelector: selector => selector === 'article.a5e-chat-card__body' ? article : null };
  const section = new ElementFixture('section');
  article.querySelector = selector => selector === 'section.prompts' && native ? section : null;
  const buttons = (message.system.prompts ?? []).map(() => new ElementFixture('button'));
  section.querySelectorAll = selector => selector === 'button.save-prompt' ? buttons : [];
  enhanceSpellCard(message, shell, api);
  enhanceSpellCard(message, shell, api);
  return { article, section, buttons };
}

function defender(name, total, owner) {
  return { name, uuid: `Actor.${name}`, calls: [], testUserPermission(user, level) { return user.id === owner && level === 'OWNER'; },
    async rollSavingThrow(ability, options) { this.calls.push({ ability, options }); return { rolls: [{ total }] }; } };
}

function runtime(user, controlled, settings = {}) {
  const warnings = [];
  return { game: { user, settings: { get: (_system, key) => settings[key] } },
    canvas: { tokens: { controlled: controlled.map(actor => ({ document: { actor } })) } },
    config: { A5E: { ROLL_MODE: { ADVANTAGE: 1, NORMAL: 0, DISADVANTAGE: -1 } } },
    notifications: { warn: message => warnings.push(message), error: message => assert.fail(message) }, warnings };
}

test('pins a rolled DC to each Arcane card and computes only the specified force damage', async () => {
  for (const [key, cap, shield, missile] of [['2e-wizard-983', 20, 5, true], ['2e-wizard-989', 30, 2, false], ['2e-wizard-958', 20, 2, true]]) {
    const rule = getDynamicSave(key);
    assert.deepEqual([rule.cap, rule.shield, rule.missile], [cap, shield, missile]);
    assert.equal(resolveDynamicSave(rule, 44, 3, { armor: true }).damage, Math.floor(cap / 2));
    assert.equal(resolveDynamicSave(rule, 20, 20).damage, 0);
    assert.equal(resolveDynamicSave(rule, 20, 17, { armor: true }).damage, 1);
    assert.throws(() => resolveDynamicSave(rule, 20, 18, { missile: -1 }));
    const foe = defender('Foe', 14, 'player');
    const message = card(key, { rolls: [{ total: 24 }] });
    const { article } = render(message, runtime(gm, [foe]));
    const [section] = article.children;
    assert.match(section.children[0].textContent, /DC 24/);
    const [, , shieldDiv, armorDiv] = section.children;
    shieldDiv.children[0].children[0].checked = true;
    armorDiv.children[0].children[0].checked = true;
    if (missile) section.children[4].children[0].children[0].valueAsNumber = 1;
    const [button, status] = section.children.slice(-2);
    await button.click();
    assert.deepEqual(foe.calls.map(x => x.ability), ['dex']);
    assert.match(status.textContent, new RegExp(`DC ${missile ? 23 : 24}.*${Math.floor(((missile ? 23 : 24) - 14 - shield) / 2)} force damage`));
    assert.match(status.textContent, key.endsWith('958') ? /missile hits/ : /damage\.$/);
  }
});

test('a selected owned actor uses the native A5e save and sees the comparison on the same card', async () => {
  const owned = defender('Owned', 16, 'player');
  const unowned = defender('Hostile', 3, 'gm');
  const prompt = { type: 'savingThrow', ability: 'wis', dc: 15, saveDC: { type: 'spellcasting' } };
  const api = runtime(player, [owned, unowned, owned]);
  const { buttons, section } = render(card('ordinary', { prompts: [prompt] }), api, true);
  await buttons[0].click({ altKey: true, shiftKey: true });
  assert.deepEqual(owned.calls, [{ ability: 'wis', options: { skipRollDialog: true, rollMode: 1 } }]);
  assert.equal(unowned.calls.length, 0);
  assert.match(section.children[0].textContent, /Owned: 16 vs DC 15.*success/);
  assert.deepEqual(permittedDefenders([], { ...player, character: owned }), [owned]);
  assert.deepEqual(permittedDefenders([{ document: { actor: unowned } }], { ...player, character: owned }), []);
  const mixed = render(card('mixed', { prompts: [prompt, { ...prompt, ability: 'con', dc: 17 }] }), api, true);
  await mixed.buttons[1].click();
  assert.equal(owned.calls.at(-1).ability, 'con');
  assert.match(mixed.section.children[0].textContent, /16 vs DC 17.*failure/);
});

test('source-specific context uses the correct ability, fixed DC, and conditional trigger', async () => {
  const self = defender('Caster', 19, 'player');
  self.uuid = caster.uuid;
  const created = card('tome-createlife');
  assert.equal(created.flags[moduleId].saveCard.ability, 'wis');
  const { article } = render(created, runtime(gm, [self]));
  const [button, status] = article.children[0].children.slice(-2);
  await button.click();
  assert.equal(self.calls[0].ability, 'wis');
  assert.match(status.textContent, /19 vs DC 20.*failure/);
  const noReaction = card('tome-forcebuckler');
  assert.deepEqual(noReaction.flags, {});
  const reaction = card('tome-forcebuckler', { action: { name: 'Absorb a spell targeting only you' } });
  const panel = render(reaction, runtime(gm, [self])).article.children[0];
  panel.children[2].children[0].children[0].valueAsNumber = 18;
  await panel.children.at(-2).click();
  assert.match(panel.children.at(-1).textContent, /19 vs DC 18.*success/);
});

test('cancellation, omitted DC rolls, and private cards leave game state untouched', async () => {
  const owned = defender('Owned', 15, 'player');
  const absent = render(card('2e-wizard-983'), runtime(player, [owned]));
  assert.match(absent.article.children[0].children[0].textContent, /was not rolled/);
  assert.equal(absent.article.children[0].children.some(child => child.tag === 'button'), false);
  assert.equal(visibleCard({ whisper: ['someone'] }, player), false);
  assert.equal(visibleCard({ blind: true }, player), false);
  const unowned = defender('Hostile', 3, 'gm');
  const api = runtime(player, [unowned]);
  const message = card('ordinary', { prompts: [{ type: 'savingThrow', ability: 'con', dc: 10 }] });
  await render(message, api, true).buttons[0].click();
  assert.equal(unowned.calls.length, 0);
  assert.equal(api.warnings.length, 1);
  owned.rollSavingThrow = async () => null;
  const cancelled = render(message, runtime(player, [owned]), true);
  await cancelled.buttons[0].click();
  assert.equal(cancelled.section.children[0].textContent, 'No saving throw was posted.');
});
