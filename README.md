# Vathian Vault A5e Spells

The v0.2.1 candidate for Foundry VTT v14 contains 819 native spell Items in one LevelDB compendium. The reference system is A5e 1.5.2 at commit `6d8c39f2e5c9ec6bbbbf1388a24005a5a6e10c8c`. The v0.2.0 individual spell review is the baseline. This update revises cast text across the compendium and corrects a subset of the mechanical decisions.

## Install locally

1. Use a disposable Foundry v14 instance or a separately authorized installation with official A5e 1.5.2 installed.
2. Shut down the disposable instance. Extract `vathian-vault-a5e-spells-0.2.1.zip` into its user data `Data/modules/` directory. The module directory contains `module.json`, `packs/spells/`, and `scripts/`.
3. Start that instance and enable **Vathian Vault A5e Spells** in a disposable A5e world. Open **Vathian Vault Spells** from the Compendium Packs tab as GM.
4. Drag fresh compendium copies onto test actors. Copies already embedded in actors retain the data imported at the time. Activate the spell’s Action from the actor sheet. The adjacent description-sharing control posts text alone. Follow [the runtime acceptance steps](ACCEPTANCE.md).

Use `releases/vathian-vault-a5e-spells-0.2.1.zip` for local installation. The manifest and version-specific ZIP both use `main` URLs, so they become available together when the approved update is merged. The download has no tag dependency.

## Mechanics

- The approved class counts are Wizard 519, Sorcerer 75, Cleric 361, and Herald 333. The importer checks a digest of the approved class assignments for every canonical ID. The native Herald key is `herald`. Six same-name pairs retain distinct IDs, 28 Quest entries have level 9 and the `quest` tag, and 318 records have exact deity associations. Deity flags and tags document eligibility for reference. They do not enforce it.
- All spell sheets retain the full canonical rules. Chat shows a short, spell-specific Action description. Confirm the timing and target from the spell sheet when needed.
- Ordinary damage rolls and caster/fixed DC prompts use A5e's Action activation, dialog and card rendering. Click a prompt with an owned token selected. Players can also use their assigned owned character when no tokens are selected. GMs select the NPC tokens they intend to roll for. The module calls A5e’s saving-throw dialog and reports the result against that card’s DC locally. A5e’s protected DC display continues to apply. Use the separate A5e damage control only if you intend to apply damage.
- Arcane Blast, Bomb, and Spray roll the base DC once per casting with `1d20 + proficiency + the spellbook’s casting ability modifier`. The resulting roll stays on the card. Select one defender and choose the applicable shield, armor and magical missile modifiers. The card reports force damage and Spray’s hit count. Determine eligibility and modifiers at the table. Reloading retains the original DC; the local result and selections are temporary.
- Use labeled follow-up Actions only when their trigger occurs. Some source-defined DCs require entry of the established, external, or GM-adjudicated number on the card. The audit records which cases still lack a complete rule. Critical hits, most slot increases, spell-slot and material payments, repeated timing, conditions, eligibility, and HP application are manual.

## Reproduce the private build

Use Node 22 or newer, the locally installed official Foundry CLI 3.0.5 with ClassicLevel 3.0.0, and Windows bsdtar. The canonical input and A5e checkout are read-only. Choose fresh build directories.

```powershell
node --test
node a5e-1.5.2.mjs ../vathian-spell-source-20261118 ../a5e-reference build/native-0.2.1-local
node pack.mjs build/native-0.2.1-local foundry-cli.mjs build/release-0.2.1-local
```

The build checks the pinned A5e sources and writes `items/` and a private `audit.json`, with each ID, rules hash, DC type, save ability and remaining limitation where identified. The pack script compiles and unpacks a fresh ZIP through the official CLI, comparing the contents of all 819 Items exactly. The ZIP contains the manifest, pack, and two chat scripts. The release receipt records the hashes and coverage. Tests use offline sources and mocked chat execution. The disposable Foundry acceptance run remains open.

The earlier canonical and staging audits remain reproducible with `node canonical.mjs` and `node native-adapter.mjs stage`. These private outputs are excluded from version control.
