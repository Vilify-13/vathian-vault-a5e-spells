// Each decision pairs the canonical savingThrow header with the converted rules.
// Follow-up indexes refer to the existing reviewed actions in roll-review.mjs.
const spec = (ability, onSave) => ({ ability, onSave, bonus: '' });
const initial = (ability, onSave, rationale) => ({ base: spec(ability, onSave), rationale });
const existing = (indices, ability, onSave, rationale) => ({ indices, save: spec(ability, onSave), rationale });
const followup = (name, ability, onSave, rationale) => ({ add: [{ name, savingThrow: spec(ability, onSave) }], rationale });
const repeat = (ability, onSave, name, repeatOutcome, rationale) => ({
  base: spec(ability, onSave), add: [{ name, savingThrow: spec(ability, repeatOutcome) }], rationale
});
const half = 'Half damage.';
const unaffected = 'Unaffected.';

const supplementalRolls = {
  'tome-bearhug': { add: [{ name: 'Optional squeeze after a successful grapple', activation: 'action', rolls: [
    { formula: '1d4', type: 'bludgeoning', cantrip: 4, modifier: '@spell.mod + @str.mod' }] }],
    rationale: 'Use the actor’s actual melee grapple to initiate. Squeeze only while grappling, including the optional squeeze during casting. Escape uses the higher of the two stated DCs.' },
  '2e-wizard-139': { add: [{ name: 'Unauthorized reading triggers the sigil', generic: 'sigil-attack' }],
    rationale: 'Roll the sigil’s spell attack only when triggered. Compare the result against the nearest eligible creature’s AC. Resolve the suspension or harmless smoke manually.' },
  '2e-priest-742': { add: [{ name: 'Temporary spell slots expire', generic: 'uplift-expiration' }],
    rationale: 'Roll 2d6 untyped damage only when the temporary slots expire. Resolve the unpreventable loss and the special recovery period manually.' }
};

export const saveCorrections = {
  'tome-battlecurse': initial('wis', unaffected, 'The target can resist losing its action and taking the AC penalty.'),
  'tome-bloodscall': initial('wis', 'Avoid the charm and order.', 'Select only an eligible humanoid with a fresh blood sample in range.'),
  'tome-codeofsecrecy': initial('wis', 'Avoid the speech restriction.', 'Resistance to the curse is separate from the diviner’s spellcasting ability check.'),
  'tome-deadensenses': initial('wis', unaffected, 'The target can resist the debuff. Later Constitution saves belong to other effects.'),
  'tome-detectheresy': initial('wis', 'Conceal the heresy reading.', 'Only a member or purported member of the caster’s faith qualifies.'),
  'tome-ecstasy': initial('con', unaffected, 'Only eligible living creatures can be affected. Apply slowing and the other conditions manually.'),
  'tome-graymantle': initial('con', 'Retain access to recovery and Hit Dice.', 'This spell prevents recovery without dealing damage. Resolve slot-dependent duration manually.'),
  'tome-remember': initial('int', 'Resist the memory suppression.', 'This save is separate from another caster’s attempt to detect the suppression.'),
  'tome-sarcophagusofstone': initial('dex', 'Avoid the coffin.', 'A trapped creature must be Medium or smaller. Resolve suffocation and coffin damage separately.'),
  'tome-sleepwalking': initial('wis', 'Remain asleep without following the task.', 'Check whether the sleeper is eligible and track the waking triggers manually.'),
  'tome-soulsafe': initial('cha', 'Keep the soul-fragment.', 'The caster targets a soul-fragment. Track strife, recovery and the jet manually.'),
  'tome-spyingshadow': initial('wis', 'Resist the replacement shadow.', 'The initial save differs from a later observer’s Insight check.'),
  'tome-twist': initial('con', 'Avoid the spell’s killing effect.', 'Select only a creature currently at 50 HP or fewer. Resolve death manually.'),
  '2e-priest-763': followup('Unwilling creature resists repetition', 'wis', 'Resolve resistance according to the converted rule and header.',
    'The header grants an unwilling creature Wisdom resistance. The prose is truncated. Any incidental save belongs to the repeated action.'),
  'tome-beckoningmirage': repeat('wis', unaffected, 'Mirage repeat save', 'End the mirage. Roll with advantage when the mirage is inaccessible.',
    'Use repeat saves only after a listed trigger. A successful creature is immune to this casting.'),
  'tome-bewilder': initial('int', 'Avoid the charm.', 'The Intelligence header applies to the initial charm. The later action attempt is a separate Intelligence save.'),
  'tome-brand': followup('Brand an eligible creature', 'con', 'The brand fades after the target’s long rest.',
    'Only creatures save against permanence. The untyped damage remains 1 point per actual symbol.'),
  'tome-capriciouszephyr': followup('Ball enters a creature’s space', 'str', 'The save does not prevent displacement. A failure by at least 5 also knocks prone.',
    'Roll only on contact; calculate movement and its direction manually.'),
  '2e-wizard-274': followup('Eligible undead attempts to resist', 'wis', 'Check the missing eligibility clause with the GM before resolving control.',
    'The control budget and Wisdom header survive. The text defining which chosen undead must save is truncated.'),
  'tome-crownofdespair': repeat('wis', 'Avoid paralysis.', 'Paralyzed creature ends its turn', 'End paralysis and gain 24-hour immunity.',
    'Only eligible hostile viewers are affected. Frightened immunity and the 24-hour immunity are manual.'),
  '2e-wizard-300': followup('Optional Suggestion in the message', 'wis', 'Resist the suggestion. Roll with disadvantage.',
    'The message itself requires no save. The optional Suggestion uses this caster’s DC and its own eligibility rules.'),
  'tome-divefloat': repeat('str', 'Negate the chosen water effect.', 'Affected creature ends its turn', 'End the chosen effect.',
    'Choose Dive or Float as part of casting. Track water depth and movement manually.'),
  'tome-drown': followup('Suffocating creature ends its turn', 'con', 'End the effect. Failure adds one strife.',
    'The target immediately starts suffocating if it cannot breathe water. The stated save is at turn end.'),
  'tome-fieryeyes': followup('Issue a qualifying Command', 'wis', 'Resist the command.',
    'Roll each time the caster gives an eligible Command. No save is triggered by creating the eyes.'),
  'tome-heartcall': { add: [{ name: 'Heart attack branch only', rolls: [{ formula: '3d10', type: 'bludgeoning' }],
    savingThrow: spec('con', 'Half damage and one level of strife.') }],
    rationale: 'Choose the HP branch and slot threshold before using this action. The immediate death branch has no damage roll or save.' },
  'tome-lifeillusion': repeat('wis', 'Avoid becoming unconscious. An unconscious target rolls with disadvantage.', 'Later attempt to wake', 'Wake and end the effect.',
    'Follow-up saves occur after 12 hours or when a Dream user convinces the target. Dream injuries are not real damage.'),
  'tome-lockjaw': repeat('str', 'Keep the jaw open.', 'Affected creature ends its turn', 'End the jaw closure.', 'Resolve speech, bite attacks and breath restrictions manually.'),
  'tome-maladweomer': repeat('wis', unaffected, 'Cursed spellcaster ends its turn', 'End the curse.',
    'The Constitution concentration rolls and spell damage mentioned in the rules come from other effects.'),
  'tome-neverendingnightmares': repeat('wis', 'Avoid the curse.', 'When the cursed creature wakes', 'No strife. Track progress toward three successes.',
    'Check sleep and dream eligibility. Track three nonconsecutive successes manually.'),
  'tome-pet': initial('cha', 'Resist calming. Roll with advantage if in combat.', 'Confirm beast eligibility and use the creature’s combat state before rolling.'),
  'tome-quell': repeat('con', 'Keep speech and sound.', 'Affected creature ends its turn', 'End the speech loss.', 'Track additional targets at higher slots manually.'),
  'tome-scapegoat': initial('wis', 'Resist hostility toward the scapegoat.', 'The surrounding onlookers save, separately from the scapegoat. Track slot-dependent duration manually.'),
  'tome-sensorydeprivation': initial('con', 'Avoid sensory deprivation. Track prone on a failure by 5 and strife on a critical failure.',
    'Use the save margin for prone and critical failure. Adjudicate the spell’s sensory effects manually.'),
  'tome-shadowplay': { add: [ { name: 'Living shadow owner resists', savingThrow: spec('wis', 'Resist manipulation of that shadow.') },
    { name: 'Attempt to unnerve a viewer', savingThrow: spec('wis', 'Avoid rattled.'), activation: 'action' } ],
    rationale: 'Only a living shadow owner and a chosen viewer in the later unnerve attempt save.' },
  'tome-sobriety': followup('Unwilling target resists', 'con', 'Retain the intoxication and avoid the spell.', 'Willing targets need no save. The spell excludes poisons and magical intoxicants.'),
  'tome-spiritbinding': { add: [{ name: 'Eligible creature resists binding', savingThrow: spec('cha', 'The source labels both outcomes as success. Resolve the result with the GM.') },
    { name: 'If the table adjudicates the damage branch', rolls: [{ formula: '2d10', type: 'force' }] }],
    rationale: 'The save ability and damage dice are explicit. The text gives conflicting success branches, so roll damage only after resolving the text at the table.' },
  'tome-timesnare': followup('Affected creature starts its turn', 'cha', 'End the time loop.', 'No initial save is stated. Repeated actions belong to the target.'),
  'tome-trapthesoul': repeat('cha', 'Incapacitated until the end of the next turn. Read the conflicting end-of-spell wording.',
    'If the target is still subject to the second save', 'Target falls unconscious for up to 1 minute. Use advantage for qualifying high level or CR.',
    'The initial result and second-save trigger are in tension; adjudicate before rolling the second save.'),
  'tome-universalmindbender': repeat('wis', 'Resist the rewrite if initially unwilling.', '30-day personality recovery save', 'Restore the original personality.',
    'A willing initial subject can still attempt recovery every 30 days.'),
  'tome-acidrainstorm': initial('dex', half, 'The initial acid and residual coating use separate actions. Whether the coating persists is adjudicated separately.'),
  'tome-admonishment': initial('wis', unaffected, 'Use the Wisdom resistance and track the conditions, stable-at-zero outcome and damage scaling.'),
  'tome-awakensin': repeat('wis', 'Half damage and no rattled.', 'Rattled target ends its turn', 'End rattled.',
    'Good or Evil creatures roll these saves with advantage. Handle stable-at-zero manually.'),
  'tome-bloodburn': initial('con', unaffected, 'Only a bloodied creature qualifies. End ongoing fire when the target stops being bloodied.'),
  'tome-blueblaze': initial('con', half, 'Both damage types apply to the initial cone. Choose the upcast type manually.'),
  'tome-bonetodust': repeat('con', 'End the spell; use the separate 6d10 necrotic roll.',
    'Incapacitated creature makes the second save', 'End the spell.',
    'Only a successful initial save deals damage. A successful follow-up ends the spell without that damage.'),
  'tome-burninghate': initial('dex', half, 'The initial fire uses a save. Save-free light and optional upcast increments are separate.'),
  'tome-castigate': initial('cha', 'Half damage and no deafness.', 'Apply the same save outcome to the base and upcast damage. Resolve additional higher-slot targets manually.'),
  'tome-chillofthevoid': initial('con', half, 'Plants have disadvantage. Apply both damage types and resolve eligible vegetation separately.'),
  'tome-chromaticrod': { ...existing([0], 'con', 'Half damage and no blindness.', 'The rod requires a later touch. A blinded target can save at the end of its turns.'),
    add: [{ name: 'Blinded creature ends its turn', savingThrow: spec('con', 'End blindness.') }] },
  'tome-coalstone': existing([1], 'dex', half, 'Only the thrown explosion uses the header’s Dexterity save. Contact has no save.'),
  'tome-coneofearth': initial('dex', 'Half damage; avoid prone and burial.', 'Use size and burrow speed to adjudicate the failure effects.'),
  'tome-disruption': followup('Qualifying creature at or below CR limit', 'wis', 'Avoid removal; use the separate 50 force roll.', 'A creature above the limit takes force without attempting this save.'),
  'tome-dragonwheel': existing([0, 1, 2], 'dex', half, 'Only the chosen damage mode applies, on impact. Resolve higher-slot dice manually.'),
  'tome-extractwaterelemental': initial('con', half, 'The target saves against the extraction damage. A resulting elemental uses its own actions.'),
  'tome-feeblebody': repeat('str', 'Avoid the penalties to its body and fatigue saves.', '30-day recovery save', 'End the effect.',
    'The initial necrotic damage is stated separately from the failed-save ability penalties.'),
  'tome-firecracker': initial('dex', 'Half damage and no rattled.', 'Character level changes the area. Resolve rattled manually.'),
  'tome-forceram': initial('dex', 'Half damage and a 5-foot push on a creature.', 'Use the header’s half-damage save for creatures. Objects and structures take double damage.'),
  'tome-frostbite': repeat('con', 'Half initial damage; read the slowing and repeat-save rules.', 'Slowed creature ends its turn', 'End the effect.',
    'On a critical failure apply one fatigue. Resolve slot increments manually.'),
  'tome-frostfire': existing([0], 'con', half, 'The Freeze the Fire mode has a creature damage roll. The other modes alter existing fire.'),
  'tome-graspinghandsofhorror': followup('Adjudicated save for a creature already grabbed', 'str',
    'The prose leaves the timing and success result open. Roll with disadvantage when held by two or more arms.',
    'Each arm attacks separately. The header provides Strength. The body only specifies disadvantage for multiple arms.'),
  'tome-hailstones': initial('dex', half, 'The initial pebbles deal damage. The later difficult terrain is separate.'),
  'tome-hellfire': initial('wis', 'Use the separate fire and necrotic damage action; the spell ends.',
    'Check eligibility first. Only an initial success causes damage. The later Constitution save is separate.'),
  'tome-heatlightning': initial('dex', half, 'Both initial damage rolls share one save. Manually choose the damage type for the upcast increment.'),
  'tome-hornofevilandgood': initial('con', 'Half damage. Avoid AC reduction and loss of concentration.', 'Select only creatures of the chosen alignment. Apply the higher-slot damage and rare variant manually.'),
  'tome-jetofsteam': initial('dex', 'No damage. On failure, use the separate damage action.', 'The steam damage only rolls after a failed Dexterity save.'),
  'tome-lightningstorm': { ...existing([0], 'con', half, 'Creatures already in the cloud take damage at casting. Use the follow-up on first entry during a creature’s turn.'),
    base: spec('con', half), baseFrom: 0, rename: 'First entry on the creature’s turn' },
  'tome-magiccloud': existing([0], 'dex', half, 'The header’s area save applies when adjudicating cloud exposure. The separately directed bolt has its own damage action.'),
  'tome-moldtouch': { add: [{ name: 'Brown mold exposure save', savingThrow: spec('con', 'No exposure damage.') },
    { name: 'Yellow mold exposure save', savingThrow: spec('con', 'No exposure damage or poisoning.') }],
    rationale: 'Use the appropriate exposure save on touch and at the listed start-of-turn trigger. Both prose branches gate damage on failure. The separate fire exposure has its own action.' },
  'tome-murderousmist': existing([0], 'con', half, 'Only first entry during the creature’s turn deals damage. The caster is exempt.'),
  'tome-oblivion': initial('con', 'Resist destruction. Celestials, elementals and fiends roll with advantage.',
    'This save applies only to non-undead targets at or above the CR threshold. Resolve the caster’s separate fixed Charisma save.'),
  'tome-pyroclasticsurge': followup('Poisoned creature starts its turn', 'con', 'End the poison.',
    'The body gives Constitution for recovery and Dexterity for the bolt. The dust exposure’s initial poison save ability is not independently confirmed.'),
  'tome-rainbowblast': initial('dex', half, 'The five types apply together. Choose one type for any slot increment.'),
  'tome-rollingcloud': existing([0], 'con', 'Half damage and no incapacitation.', 'Use at turn start or first entry, as stated in the rules.'),
  'tome-shadowfire': repeat('dex', 'Half damage and no poison.', 'Poisoned creature ends its turn', 'End the poison.', 'Only the first hit deals both damage types.'),
  'tome-shockwave': initial('str', 'Half damage and push distance; no prone.', 'Tiny or Small creatures roll with disadvantage. Huge or Gargantuan creatures roll with advantage. Track failure margin manually.'),
  'tome-shroudofflame': initial('dex', half, 'Dexterity saves halve initial damage only. Ending ongoing damage uses a Dexterity ability check.'),
  'tome-spiderbite': initial('con', half, 'Track the zero-HP effects of poison damage manually.'),
  'tome-spiritscream': initial('con', 'Half damage and no frightened.', 'Check the withering effect only when the damage kills.'),
  'tome-staplingspikes': { add: [{ name: 'Pinned target attempts escape', savingThrow: spec('str', 'The spikes break. Use the attempt damage roll regardless of outcome.') },
    { name: 'Escape attempt or assisted removal', rolls: [{ formula: '2d4', type: 'piercing' }] }],
    rationale: 'Hit damage is separate. A pinned target may attempt a save and takes damage whichever way it rolls.' },
  'tome-starvation': initial('con', 'Half damage and no fatigue.', 'Enforce the Supply and rest condition manually.'),
  'tome-thornwrack': followup('Target attempts to end the spell', 'con', 'Track progress toward three successes. Apply the header’s half-damage result only when associated with a thorn.',
    'Ripping out one thorn remains optional. The prose supplies no saving-throw timing and requires three successes.'),
  'tome-throbbingbones': existing([0], 'con', 'Half damage, speed capped at 20 feet, and no disadvantage.', 'Save only at the target’s turn start. Track three successes and movement restrictions manually.'),
  'tome-thunderhead': followup('Defender saves against the bolt at caster turn start', 'dex', 'No damage; omit the lightning damage action.',
    'There is no bolt on initial cast. On a failed save, use the correct flat damage for the caster’s level.'),
  'tome-torture': existing([0], 'wis', half, 'Only a refusal or knowingly false answer triggers damage. Resolve the stable-at-zero rule manually.'),
  'tome-vaeladaunce': initial('dex', 'Half damage and no poison.', 'Failure poisons only creatures that need to breathe. Handle upcast dice manually.'),
  'tome-welcometheamoebicsea': { extra: [spec('con', 'Half damage and no ongoing acid or rattled.')],
    rationale: 'Constitution governs the damage and coating. Wisdom governs strife independently. Ongoing acid follows only a failed Constitution save.' }
};

export function applySaveCorrection(id, prior) {
  if (Object.hasOwn(supplementalRolls, id)) {
    const { add, rationale } = supplementalRolls[id];
    return { ...prior, category: 'conditional-damage', rationale, saveEvidence: 'canonical-conditional-roll', followups: add };
  }
  if (!Object.hasOwn(saveCorrections, id)) return prior;
  const { base, indices, save, rationale, add = [], baseFrom, rename, extra } = saveCorrections[id];
  const followups = (prior.followups ?? []).map((phase, index) =>
    indices?.includes(index) ? { ...phase, name: rename ?? phase.name, savingThrow: save } : phase);
  const rolls = baseFrom === undefined ? prior.rolls : prior.followups[baseFrom].rolls;
  const category = base ? (rolls?.length ? 'cast-damage-and-save' : 'save-only') : 'save-only-followup';
  return { ...prior, category: prior.category.endsWith('-manual') || prior.category === 'no-damage-no-save' || base ? category : prior.category,
    rationale, saveEvidence: 'canonical-save-header-and-rule', rolls, savingThrow: base ?? prior.savingThrow,
    extraSaves: extra, followups: [...followups, ...add] };
}
