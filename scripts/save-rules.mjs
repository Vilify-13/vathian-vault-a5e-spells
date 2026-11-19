export const moduleId = 'vathian-vault-a5e-spells';
export const dcRollLabel = 'Rolled saving throw DC';
export const dcRollBonus = '@prof + @spell.mod';

export const dynamicSaves = Object.freeze({
  '2e-wizard-983': Object.freeze({ ability: 'dex', cap: 20, shield: 5, missile: true, excludeCaster: true,
    target: 'Each other creature within 30 feet of the caster.', shieldCondition: 'Shield wielded and facing the caster' }),
  '2e-wizard-989': Object.freeze({ ability: 'dex', cap: 30, shield: 2, missile: false,
    target: 'Each creature within 30 feet of the impact point, including the caster if in the area.',
    shieldCondition: 'Shield wielded and facing the impact point' }),
  '2e-wizard-958': Object.freeze({ ability: 'dex', cap: 20, shield: 2, missile: true, countMissiles: true,
    target: 'The one targeted creature. Each point of failure margin is one missile hit, up to 20.', shieldCondition: 'Shield wielded' })
});

export const getDynamicSave = key => Object.hasOwn(dynamicSaves, key) ? dynamicSaves[key] : undefined;

const contextSaves = {
  '2e-priest-545': { action: 'Ward responds to ability or maximum HP reduction', ability: 'con',
    instructions: 'Enter the triggering effect’s DC, or 15 if it has none. On success, negate the reduction and roll retaliation only for an undead attacker.' },
  'tome-forcebuckler': { action: 'Absorb a spell targeting only you', ability: 'dex', casterOnly: true,
    instructions: 'Enter the attacking spellcaster’s save DC. On success, the buckler absorbs the attack and dissolves.' },
  '2e-wizard-358': { action: 'Resist qualifying mental effect with no normal save', ability: 'wis', modifier: 6,
    casterOnly: true, instructions: 'Enter the source effect’s save DC, or 15 if it has none. The ward adds +6 to this save.' },
  '2e-wizard-298': { action: 'Binding save against established DC', ability: 'wis',
    instructions: 'Enter the caster’s DC including assistant contributions, or the established DC for annual or qualifying renewal saves. For the initial save, enter the form bonus and any weakening penalty in the roll dialog.' },
  'tome-createlife': { ability: 'casterSpellcasting', fixed: 20, casterOnly: true,
    instructions: 'The caster saves using this spell’s casting ability. Apply the maximum HP loss, fatigue and strife manually.' },
  'tome-forgetspell': { ability: 'defenderSpellcasting', useCasterDC: true,
    instructions: 'Choose the target’s spellcasting save ability. On success it retains the prepared spell.' },
  'tome-lastimage': { action: 'Repeat an original gaze save', ability: 'choose', advantage: true, casterOnly: true,
    instructions: 'Use the original gaze’s ability and DC. Roll only if a gaze killed the subject and required a save.' },
  '2e-priest-688': { action: 'Repeat a qualifying fear save', ability: 'choose',
    instructions: 'Use the originating fear effect’s ability and DC. Enter the optional class-level bonus in the roll dialog. Adjudicate morale separately.' },
  '2e-priest-804': { action: 'Unwilling traveler resists Etherwalk', ability: 'wis', modifier: -4,
    instructions: 'Enter the adjudicated Quest save DC. The header gives Wisdom and the rule imposes -4. On success the traveler stays behind.' },
  '2e-priest-809': { action: 'Creature resists implosion or inversion', ability: 'wis', modifier: -4,
    instructions: 'Enter the adjudicated Quest save DC. The header gives Wisdom and the prose calls this a death-magic save at -4. The caster’s later Constitution check is separate.' },
  '2e-priest-811': { action: 'Unwilling creature resists Mindnet', ability: 'wis', modifier: -4,
    instructions: 'Enter the adjudicated Quest save DC. The header gives Wisdom and the prose imposes -4. On success the creature stays outside the link.' },
  '2e-priest-812': { action: 'Unwilling creature resists planar travel', ability: 'wis', modifier: -4,
    instructions: 'Enter the adjudicated Quest save DC. The header gives Wisdom and the prose imposes -4. On success the creature stays behind.' },
  '2e-priest-825': { action: 'Unwilling creature resists Warband Quest', ability: 'dex', modifier: -4,
    instructions: 'Enter the adjudicated Quest save DC. The header gives Dexterity and the prose imposes -4. On success the creature avoids the Quest.' },
  '2e-priest-818': { action: 'Save against the initial shower or an impact splash', ability: 'dex', modifier: -4,
    instructions: 'Enter the adjudicated Quest DC. Success halves the shower or splash. Direct star impact allows no save. The shower’s fire and lightning split is unspecified.' }
};

export const getContextSave = key => Object.hasOwn(contextSaves, key) ? contextSaves[key] : undefined;

export function resolveDynamicSave(rule, baseDC, saveTotal, { shield = false, missile = 0, armor = false } = {}) {
  if (![baseDC, saveTotal, missile].every(Number.isSafeInteger) || missile < 0 || (!rule.missile && missile)) {
    throw new RangeError('Invalid saving throw total or adjustment');
  }
  const dc = baseDC - missile;
  const adjusted = saveTotal + (shield ? rule.shield : 0);
  const margin = Math.min(rule.cap, Math.max(0, dc - adjusted));
  return { dc, adjusted, success: adjusted >= dc, margin, damage: armor ? Math.floor(margin / 2) : margin };
}
