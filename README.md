# Vathian Vault A5e Spells

The v0.2.2 candidate for Foundry VTT v14 contains 819 native spell Items in one LevelDB compendium. Every spell has a fresh decision based on its converted rules and save header. The reference system is A5e 1.5.2 at commit `6d8c39f2e5c9ec6bbbbf1388a24005a5a6e10c8c`.

## Install locally

1. Use a disposable Foundry v14 instance or a separately authorized installation with official A5e 1.5.2 installed.
2. Shut down the disposable instance. Extract `vathian-vault-a5e-spells-0.2.2.zip` into its user data `Data/modules/` directory. The module directory contains `module.json`, `packs/spells/`, and `scripts/`.
3. Start that instance and enable **Vathian Vault A5e Spells** in a disposable A5e world. Open **Vathian Vault Spells** from the Compendium Packs tab as GM.
4. Drag fresh compendium copies onto test actors. Copies already embedded in actors retain the data imported at the time. Activate the spell’s Action from the actor sheet. The adjacent description-sharing control posts text alone. Follow [the runtime acceptance steps](ACCEPTANCE.md).

Use `releases/vathian-vault-a5e-spells-0.2.2.zip` for local installation. The manifest and version-specific ZIP both use `main` URLs, so they become available together when the approved update is merged. The download has no tag dependency.

## Mechanics

- The approved class counts are Wizard 519, Sorcerer 75, Cleric 361, and Herald 333. The importer checks a digest of the approved class assignments for every canonical ID. The native Herald key is `herald`. Six same-name pairs retain distinct IDs, 28 Quest entries have level 9 and the `quest` tag, and 318 records have exact deity associations. Deity flags and tags document eligibility for reference. They do not enforce it.
- Quest spells (all 28) are intentionally excluded from automated damage, attack rolls, saving throw prompts and interactive follow-up mechanics. They retain their level-9 placement, tags, class/deity assignments, casting data and complete source rules for manual resolution. The 791 non-Quest spells remain in scope for automation.
- All 819 cast cards show canonical rules in their original order. Bibliographic citations remain on the spell sheet. The 509 follow-up and alternate cards use excerpts selected for each Action’s trigger or mode. When a source passage is incomplete or contradictory, the card preserves the supplied wording and the private audit records the gap.
- Ordinary damage rolls and caster/fixed DC prompts use A5e's Action activation, dialog and card rendering. Click a prompt with an owned token selected. Players can also use their assigned owned character when no tokens are selected. GMs select the NPC tokens they intend to roll for. The module calls A5e’s saving-throw dialog and reports the result against that card’s DC locally. A5e’s protected DC display continues to apply. Use the separate A5e damage control only if you intend to apply damage.
- Arcane Blast, Bomb, and Spray roll the base DC once per casting with `1d20 + proficiency + the spellbook’s casting ability modifier`. A5e attack bonuses tied to a melee or ranged attack type are excluded because these spells set a DC. Select one defender and choose the applicable shield, armor and magical missile modifiers. The card reports force damage and Spray’s hit count. Reloading retains the original DC. Local results and selections are temporary.
- The casting actor’s owner can open the cast card’s **Follow-up and alternate Actions** menu. Choose a labeled action only when its trigger or mode applies. Some DCs require entry of the established, external, or GM-adjudicated value. Critical hits, most slot increases, spell-slot and material payments, repeated timing, conditions, eligibility, and HP application remain manual.

## Reproduce the private build

Use Node 22 or newer, the locally installed official Foundry CLI 3.0.5 with ClassicLevel 3.0.0, and Windows bsdtar. The canonical input and A5e checkout are read-only. Choose fresh build directories.

```powershell
node --test
node a5e-1.5.2.mjs ../vathian-spell-source-20261118 ../a5e-reference build/native-0.2.2-local
node pack.mjs build/native-0.2.2-local foundry-cli.mjs build/release-0.2.2-local
node verify-action-description-parity.mjs build/native-0.2.1-quest-excluded/items build/release-0.2.2-local/roundtrip build/native-0.2.2-local/audit.json
```

The build checks the pinned A5e sources and all 819 hashes in `fresh-spell-review.ndjson`. The private `audit.json` records each spell’s mechanics rationale and each Action’s stable ID, reviewed selection, source rules hash and rendered description hash. The follow-up selector file contains only canonical IDs, Action IDs and source segment references. The pack script requires all 1,328 descriptions, compiles and unpacks a fresh ZIP through the official CLI, and compares all 819 Items. The parity command compares that unpack against the Quest-excluded baseline and permits changes only to `system.actions.*.description`. The release receipt records the hashes and coverage. Tests use offline sources and mocked chat execution. The disposable Foundry acceptance run remains open.

The earlier canonical and staging audits remain reproducible with `node canonical.mjs` and `node native-adapter.mjs stage`. These private outputs are excluded from version control.
