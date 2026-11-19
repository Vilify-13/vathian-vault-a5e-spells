// Explicit corrections from the second review. Other actions retain their existing IDs.
const save = (ability, onSave) => ({ ability, onSave, bonus: '' });
const phase = (name, mechanics) => ({ name, ...mechanics });
const damage = (formula, type, modifier) => ({ formula, type, modifier });
const hit = (name, formula, type, modifier) => phase(name, { rolls: [damage(formula, type, modifier)] });
const generic = (name, kind) => phase(name, { generic: kind });
const check = (name, ability, onSave) => phase(name, { savingThrow: save(ability, onSave) });
const k = {
  add: (entry, ...phases) => ({ ...entry, followups: [...(entry.followups ?? []), ...phases] }),
  amend: (entry, index, patch) => ({ ...entry, followups: entry.followups.map((action, i) => i === index ? { ...action, ...patch } : action) })
};

export const genericRolls = {
  'insect-pool': { label: 'Insects available', formula: '(1d6 + 4) * 100' },
  'claw-die': { label: 'Untyped claw damage on hit', formula: '1d6' },
  'reversion-multiplier': { label: 'Missing HP multiplier', formula: '1d6' },
  'halberd-table': { label: 'Natural 18–20 hit table', formula: '1d10' },
  'spirit-count': { label: 'Number of spirits summoned', formula: '2d4 + 2' },
  'sunmote-damage': { label: 'Untyped damage to one enemy on cast', formula: '1d4 + 1' },
  'plume-plane': { label: 'Plane of the plume', formula: '1d12' },
  'wards-untyped-damage': { label: 'Untyped damage on failed Wards entry save', formula: '4d6' },
  'thunder-staff-distance': { label: 'Push distance (feet), before the save outcome', formula: '4d4 + 4' }
};

const conditionalSaves = {
  'tome-mudpack': ['After the ranged spell hit', 'dex', 'Avoid the mud, blindness, and deafness.'],
  'tome-thump': ['After the melee spell hit', 'cha', 'Avoid the charm.']
};

const updates = {
  '2e-wizard-425': entry => ({ ...entry, generic: 'thunder-staff-distance' }),
  '2e-priest-810': entry => ({ ...entry, followups: [generic('Wards — damage after failed entry save', 'wards-untyped-damage')] }),
  '2e-priest-874': entry => ({ ...entry, category: 'cast-damage-and-save', rolls: [damage('2d4', 'cold')],
    savingThrow: save('con', 'Half total damage after adding the granting class level.') }),
  'tome-oblivion': entry => ({ ...entry, followups: [] }),
  '2e-wizard-349': entry => ({ ...entry, category: 'cast-damage-and-save',
    rolls: [damage('5d4', 'force')], savingThrow: save('dex', 'Half total damage after adding twice the granting class level, bonus capped at 30.') }),
  'tome-lingeringraver': entry => ({ ...entry, savingThrow: save('wis', 'Half damage and no strife.') }),
  'tome-blueearth': entry => ({ ...entry, category: 'cast-damage-and-save',
    savingThrow: save('dex', 'Half cold damage for an affected creature. Objects do not save.') }),
  '2e-priest-771': entry => ({ ...entry, savingThrow: null }),
  '2e-wizard-988': entry => k.add({ ...entry, category: 'attack' }, phase('Deliver a touch spell — melee spell attack',
    { attack: { type: 'meleeSpellAttack', bonus: '1' } })),
  'tome-burrow': entry => k.add({ ...entry, category: 'conditional-damage' }, generic('Claws hit', 'claw-die')),
  '2e-priest-640': entry => ({ ...entry, category: 'conditional-damage', generic: 'insect-pool' }),
  '2e-wizard-379': entry => k.add({ ...entry, category: 'conditional-damage' }, generic('Spell expires — reversion', 'reversion-multiplier')),
  '2e-priest-890': entry => k.add({ ...entry, category: 'conditional-damage' }, generic('Forged weapon hits with natural 18–20', 'halberd-table')),
  'tome-razorwind': entry => k.amend(entry, 0, { savingThrow: save('dex', 'Half damage.') }),
  'tome-rip': entry => ({ ...entry, category: 'cast-damage-and-save', savingThrow: save('str', 'Negates the initial effect. Objects do not save and take double damage.') }),
  'tome-rayofentropy': entry => k.amend(entry, 0, { savingThrow: save('con', 'Negates the hit effect per the source header.') }),
  '2e-priest-793': entry => k.add({ ...entry, category: 'conditional-damage' },
    hit('Fallback ballista hit in range', '2d10', 'piercing'), hit('Fallback catapult hit on its firing round', '3d10', 'bludgeoning'),
    hit('Fallback ram hit against an adjacent structure', '2d10', 'bludgeoning')),
  '2e-priest-827': entry => ({ ...entry, category: 'summon-roll', generic: 'spirit-count' }),
  '2e-priest-801': entry => ({ ...entry, generic: 'sunmote-damage', followups: entry.followups.filter((_, i) => i !== 0) }),
  'tome-clawsofdarkness': entry => k.add(entry,
    phase('Make one of the two claw attacks', { attack: 'meleeSpellAttack' }),
    hit('One claw hits — cold damage', '1d8', 'cold', '@spell.mod')),
  'tome-deathshade': entry => ({ ...entry, followups: entry.followups.filter((_, i) => i !== 0) }),
  '2e-priest-805': entry => ({ ...entry, followups: [] }),
  '2e-wizard-385': entry => k.add(entry, hit('Stone-hand strike hits', '1d8', 'bludgeoning', '@spell.mod')),
  'tome-holycrown': entry => k.amend(entry, 0, { rationale: 'Use on cast only if you chose Brilliance. The later radiant damage is a separate action.' }),
  '2e-wizard-357': entry => ({ ...entry, category: 'cast-damage', rolls: [damage('2d4', 'force')], followups: [
    { ...entry.followups[0], name: 'Additional missile — impact' }, entry.followups[1]
  ] }),
  'tome-planarplume': entry => ({ ...entry, generic: 'plume-plane' }),
  'tome-planarweapon': entry => k.add(entry,
    check('Smoke hit', 'con', 'Avoid choking.'), check('Steam hit', 'con', 'Avoid being blinded.'),
    check('Abyss hit — confusion', 'wis', 'Avoid being confused.'), check('Abyss hit — poison', 'con', 'Avoid being poisoned.'),
    check('Chaotic hit', 'con', 'Avoid being confused.'), check('Ethereal hit', 'con', 'Avoid being slowed.'),
    check('Lawful hit', 'con', 'Avoid being stunned.'), check('Material hit — choose stun instead of ally effect', 'con', 'Avoid being stunned.')),
  'tome-sealdestiny': entry => ({ ...entry, followups: [] }),
  '2e-wizard-103': entry => k.add(entry, phase('Deliver a touch spell — attack only if it calls for one',
    { attack: { type: 'meleeSpellAttack', bonus: '2' } })),
  '2e-wizard-365': entry => k.add(entry, ...['1d8', '1d12', '1d20', '2d12', '3d12'].map((formula, i) =>
    hit(`Object explodes — ${['1–5', '6–25', '26–100', '101–500', '501–2,000'][i]} lb base damage`, formula, 'thunder'))),
  '2e-priest-797': entry => ({ ...entry, followups: entry.followups.filter((_, i) => i !== 1) }),
  '2e-wizard-426': entry => k.amend(entry, 0, { name: 'Throw the first pebble on cast or the next pebble on a later turn' }),
  'tome-usefularcanehand': entry => k.add(entry, hit('Flying Fist hits', '1d10', 'bludgeoning', '@spell.mod')),
  '2e-wizard-367': entry => k.add(entry, ...[
    ['Wizard 11 or lower — failure', '20'], ['Wizard 11 or lower — success', '1d3'],
    ['Wizard 12–14 — failure', '25'], ['Wizard 12–14 — success', '2d4'],
    ['Wizard 15–17 — failure', '30'], ['Wizard 15–17 — success', '2d6'], ['Wizard 18 or higher — success', '20']
  ].map(([name, formula]) => hit(`After poison onset — ${name}`, formula, 'poison'))),
  'tome-wallofbones': entry => k.amend(entry, 0, { rationale: 'Select only if the wall appears through a creature’s space. Push the creature to the chosen side after the damage.' }),
  '2e-priest-848': entry => k.add(entry, ...[
    ['1–4', '1d6', '1d3'], ['5–8', '1d10', '1d6'], ['9–12', '1d12', '1d8'], ['13 or higher', '2d8', '1d10']
  ].flatMap(([band, strike, constrict]) => [hit(`Strike hit — class level ${band}`, strike, 'bludgeoning'),
    hit(`Constrict hit — class level ${band}`, constrict, 'bludgeoning')]))
};

export function applyFreshActionChanges(id, entry, review) {
  const update = Object.hasOwn(updates, id) ? updates[id] : null;
  const conditional = Object.hasOwn(conditionalSaves, id) ? conditionalSaves[id] : null;
  if (!update && !conditional) return entry;
  if (conditional) entry = k.add(entry, check(...conditional));
  return { ...(update ? update(entry) : entry), saveEvidence: 'fresh-source-review', rationale: review.rationale };
}
