import { dcRollLabel, getContextSave, getDynamicSave, moduleId, resolveDynamicSave } from './save-rules.mjs';

const idPattern = /^[A-Za-z0-9]{16}$/;
const abilityNames = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const isAbility = ability => Object.hasOwn(abilityNames, ability);
const validDC = value => Number.isSafeInteger(value);

export function recordSpellCard(message, userId, game, resolveItem) {
  const { system } = message;
  if (game.user?.id !== userId || message.type !== 'item' || !idPattern.test(system.actionId ?? '')) return;
  const item = resolveItem(system.itemId);
  const source = item?.flags?.[moduleId];
  const action = item?.actions?.get(system.actionId);
  if (item?.type !== 'spell' || !source?.chatSaves || !action || item.actor?.uuid !== system.actorId) return;
  const dynamic = action.default && getDynamicSave(source.sourceKey) ? source.sourceKey : null;
  const context = getContextSave(source.sourceKey);
  const useContext = context && (context.action ? action.name === context.action : action.default);
  if (!dynamic && !useContext && !system.prompts?.some(prompt => prompt.type === 'savingThrow')) return;
  const flag = useContext ? { context: source.sourceKey } : { dynamic };
  if (useContext && (context.ability === 'casterSpellcasting' || context.useCasterDC)) {
    const { actor } = item;
    const bookId = item.system.spellBook;
    const book = bookId ? actor.spellBooks?.get(bookId) : null;
    if (context.ability === 'casterSpellcasting') {
      const ability = book?.stats.ability && book.stats.ability !== 'default' ? book.stats.ability : actor.system.attributes.spellcasting;
      if (isAbility(ability)) flag.ability = ability;
    }
    if (context.useCasterDC) {
      const dc = book?.stats.dc ?? actor.system.attributes.spellDC;
      if (validDC(dc)) flag.dc = dc;
    }
  }
  message.updateSource({ [`flags.${moduleId}.saveCard`]: flag });
}

export function visibleCard(message, user) {
  if (!user || message.isContentVisible === false) return false;
  const recipients = message.whisper ?? [];
  if (recipients.length === 1 && !recipients.includes(user.id)) return false;
  return user.isGM || (!message.blind && (!recipients.length || recipients.includes(user.id)));
}

export function permittedDefenders(controlled, user) {
  const actors = controlled.map(token => token.document?.actor);
  if (!controlled.length && !user.isGM && user.character) actors.push(user.character);
  const authorized = actors.filter(actor => actor?.uuid && typeof actor.rollSavingThrow === 'function'
    && (user.isGM || actor.testUserPermission?.(user, 'OWNER')));
  return [...new Map(authorized.map(actor => [actor.uuid, actor])).values()];
}

export async function rollDefenders({ actors, ability, dc, options, dynamic, modifiers }) {
  if (!isAbility(ability) || (dc !== null && !validDC(dc))) throw new RangeError('Invalid saving throw');
  const results = [];
  for (const actor of actors) {
    const save = await actor.rollSavingThrow(ability, options);
    const total = save?.rolls?.[0]?.total;
    if (!Number.isSafeInteger(total)) continue;
    if (dc === null) results.push(`${actor.name}: save rolled. The DC is hidden.`);
    else if (dynamic) {
      const result = resolveDynamicSave(dynamic, dc, total, modifiers);
      const missileHits = dynamic.countMissiles ? `, ${result.margin} missile hits` : '';
      results.push(`${actor.name}: ${result.adjusted} vs DC ${result.dc} – ${result.success ? 'success' : 'failure'}, ${result.damage} force damage${missileHits}.`);
    } else results.push(`${actor.name}: ${total} vs DC ${dc} – ${total >= dc ? 'success' : 'failure'}.`);
  }
  return results;
}

function makeElement(parent, tag, text = '') {
  const element = parent.ownerDocument.createElement(tag);
  element.textContent = text;
  parent.append(element);
  return element;
}

function checkbox(parent, text) {
  const label = makeElement(parent, 'label');
  const field = makeElement(label, 'input');
  field.type = 'checkbox';
  label.append(text);
  return field;
}

function bindSaveButton(button, status, message, ability, dc, api, getAdjustments = () => ({})) {
  button.addEventListener('click', async event => {
    if (!visibleCard(message, api.game.user)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (button.disabled) return;
    const { game, canvas, notifications, config } = api;
    const actors = permittedDefenders(canvas?.tokens?.controlled ?? [], game.user);
    const plan = getAdjustments();
    if ((plan.dynamic || plan.context) && (actors.length !== 1
      || (plan.dynamic?.excludeCaster && actors[0].uuid === message.system.actorId)
      || (plan.context?.casterOnly && actors[0].uuid !== message.system.actorId))) {
      notifications.warn('Select exactly one eligible defender for this spell.');
      return;
    }
    if (!actors.length) {
      notifications.warn('Select a token whose actor you own or control as GM.');
      return;
    }
    if (plan.dynamic && (!Number.isSafeInteger(plan.modifiers.missile) || plan.modifiers.missile < 0)) {
      notifications.warn('Enter a nonnegative whole number for the magical missile penalty.');
      return;
    }
    const modes = config.A5E.ROLL_MODE;
    const reverseAlt = game.settings.get('a5e', 'reverseAltBehavior');
    const selectedAbility = plan.ability ?? ability;
    const selectedDC = plan.dc === undefined ? dc : plan.dc;
    if (!isAbility(selectedAbility) || (selectedDC !== null && !validDC(selectedDC))) {
      notifications.warn('Choose the applicable save ability and enter a whole-number DC.');
      return;
    }
    const options = { skipRollDialog: reverseAlt ? !event.altKey : event.altKey,
      rollMode: event.ctrlKey ? modes.DISADVANTAGE : event.shiftKey || plan.context?.advantage ? modes.ADVANTAGE : modes.NORMAL };
    if (plan.context?.modifier) options.situationalMods = String(plan.context.modifier);
    button.disabled = true;
    try {
      const results = await rollDefenders({ actors, ability: selectedAbility, dc: selectedDC, options,
        dynamic: plan.dynamic, modifiers: plan.modifiers });
      status.textContent = results.join(' ') || 'No saving throw was posted.';
    } catch (error) {
      console.error(moduleId, error);
      notifications.error('The saving throw could not be completed.');
    } finally {
      button.disabled = false;
    }
  }, { capture: true });
}

function renderContextSave(article, message, flag, api, canSeeDC) {
  const context = getContextSave(flag.context);
  if (!context) return false;
  const section = makeElement(article, 'section');
  const dc = context.fixed ?? (context.useCasterDC ? flag.dc : undefined);
  makeElement(section, 'h4', validDC(dc) && canSeeDC ? `Saving throw DC ${dc}` : 'Saving throw');
  makeElement(section, 'p', context.instructions);
  if (!canSeeDC && !validDC(dc)) return true;
  let abilitySelect;
  let dcInput;
  if (context.ability === 'choose' || context.ability === 'defenderSpellcasting') {
    const label = makeElement(makeElement(section, 'div'), 'label', 'Save ability ');
    abilitySelect = makeElement(label, 'select');
    makeElement(abilitySelect, 'option', 'Choose ability').value = '';
    const keys = context.ability === 'choose' ? Object.keys(abilityNames) : ['int', 'wis', 'cha'];
    for (const ability of keys) makeElement(abilitySelect, 'option', abilityNames[ability]).value = ability;
  }
  if (!validDC(dc)) {
    const label = makeElement(makeElement(section, 'div'), 'label', 'Applicable DC ');
    dcInput = makeElement(label, 'input');
    dcInput.type = 'number';
    dcInput.step = '1';
  }
  const fixedAbility = context.ability === 'casterSpellcasting' ? flag.ability : context.ability;
  if (!abilitySelect && !isAbility(fixedAbility)) {
    makeElement(section, 'p', 'Set the caster’s spellcasting ability and cast again.');
    return true;
  }
  const button = makeElement(section, 'button', isAbility(fixedAbility) ? `Roll ${abilityNames[fixedAbility]} saving throw` : 'Roll saving throw');
  button.type = 'button';
  const status = makeElement(section, 'p');
  status.setAttribute('aria-live', 'polite');
  bindSaveButton(button, status, message, fixedAbility, canSeeDC ? dc : null, api, () => ({ context,
    ability: abilitySelect?.value, dc: dcInput?.valueAsNumber }));
  return true;
}

export function enhanceSpellCard(message, html, api) {
  const flag = message.flags?.[moduleId]?.saveCard;
  if (!flag || message.type !== 'item' || !visibleCard(message, api.game.user)) return;
  const root = html?.querySelector ? html : html?.[0];
  const article = root?.querySelector('article.a5e-chat-card__body');
  if (!article || article.dataset.vathianSaveCard) return;
  const { user, settings } = api.game;
  const caster = message.actor;
  const canSeeDC = user.isGM || !settings.get('a5e', 'protectRolls') || caster?.type === 'character'
    || caster?.testUserPermission?.(user, 'OBSERVER');
  if (flag.context) {
    if (!renderContextSave(article, message, flag, api, canSeeDC)) return;
  } else if (flag.dynamic) {
    const dynamic = getDynamicSave(flag.dynamic);
    if (!dynamic) return;
    const index = message.system.rollData?.findIndex(roll => roll.type === 'generic' && roll.label === dcRollLabel);
    const dc = message.rolls?.[index]?.total;
    const section = makeElement(article, 'section');
    makeElement(section, 'h4', validDC(dc) ? (canSeeDC ? `Saving throw DC ${dc} · Dexterity` : 'Dexterity saving throw') : 'Saving throw DC was not rolled');
    if (!validDC(dc)) {
      makeElement(section, 'p', 'Activate the spell with the rolled DC selected.');
    } else {
      makeElement(section, 'p', `${dynamic.target} Select one defender and set the modifiers below.`);
      const shield = checkbox(makeElement(section, 'div'), `${dynamic.shieldCondition} (+${dynamic.shield} to save)`);
      const armor = checkbox(makeElement(section, 'div'), 'Metal or magic armor (halves force damage)');
      let missile;
      if (dynamic.missile) {
        const label = makeElement(makeElement(section, 'div'), 'label', 'Magical missile penalty (reduces DC) ');
        missile = makeElement(label, 'input');
        missile.type = 'number';
        missile.min = '0';
        missile.step = '1';
        missile.value = '0';
      }
      const button = makeElement(section, 'button', 'Roll Dexterity saving throw');
      button.type = 'button';
      const status = makeElement(section, 'p');
      status.setAttribute('aria-live', 'polite');
      bindSaveButton(button, status, message, dynamic.ability, canSeeDC ? dc : null, api, () => ({ dynamic,
        modifiers: { shield: shield.checked, armor: armor.checked, missile: missile ? missile.valueAsNumber : 0 } }));
    }
  } else {
    const prompts = message.system.prompts ?? [];
    const section = article.querySelector('section.prompts');
    const buttons = section?.querySelectorAll('button.save-prompt');
    if (!buttons?.length || buttons.length !== prompts.length || prompts.some(prompt => prompt.type !== 'savingThrow'
      || !isAbility(prompt.ability) || !validDC(prompt.dc))) return;
    const status = makeElement(section, 'p');
    status.setAttribute('aria-live', 'polite');
    buttons.forEach((button, index) => {
      const prompt = prompts[index];
      bindSaveButton(button, status, message, prompt.ability, canSeeDC ? prompt.dc : null, api);
    });
  }
  article.dataset.vathianSaveCard = 'true';
}

if (typeof Hooks !== 'undefined') {
  Hooks.on('preCreateChatMessage', (message, _data, _options, userId) => {
    if (game.system.id === 'a5e') recordSpellCard(message, userId, game, fromUuidSync);
  });
  Hooks.on('renderChatMessageHTML', (message, html) => {
    if (game.system.id !== 'a5e') return;
    // A5e mounts its Svelte ItemCard in the same Foundry hook.
    queueMicrotask(() => enhanceSpellCard(message, html, { game, canvas: globalThis.canvas, notifications: ui.notifications, config: CONFIG }));
  });
}
