# Vathian Vault A5e Spells

The v0.2.0 review build for Foundry VTT v14 contains 819 native spell Items in one LevelDB compendium. The reference schema is A5e 1.5.2 at commit `6d8c39f2e5c9ec6bbbbf1388a24005a5a6e10c8c`. This is a partial automation update. The individual rules review covers 594 spells, including 414 reviewed in the second pass. The other 225 retain their existing manual actions.

## Install locally

1. Use a disposable Foundry v14 instance or a separately authorized installation with official A5e 1.5.2 installed.
2. Shut down Foundry. Extract `vathian-vault-a5e-spells-0.2.0.zip` into that instance's user data `Data/modules/` directory. The resulting paths should be `Data/modules/vathian-vault-a5e-spells/module.json` and `Data/modules/vathian-vault-a5e-spells/packs/spells/`.
3. Start that instance and enable **Vathian Vault A5e Spells** in a disposable A5e world. Open **Vathian Vault Spells** from the Compendium Packs tab as GM.
4. Verify a same-name pair, a level-9 Quest spell, an explicit Herald-only spell, and a spell with a native area and concentration. The pack starts with player access disabled. The release was verified offline against official source and the LevelDB round trip. In-game startup, schema initialization, browsing, and activation still need a disposable Foundry test.

Use `releases/vathian-vault-a5e-spells-0.2.0.zip` for local review. The remaining individual reviews are pending before a PR. The manifest URL remains on `main`. The versioned download in the manifest will resolve once the approved release is merged and tagged `v0.2.0`. Never put credentials in `module.json`.

## Mechanics

- The approved class counts are Wizard 519, Sorcerer 75, Cleric 361, and Herald 333. The importer checks a digest of the approved class assignments for every canonical ID. The native Herald key is `herald`. Six same-name pairs retain distinct IDs, 28 Quest entries have level 9 and the `quest` tag, and 318 records have exact deity associations. Deity flags and tags document eligibility for reference. They do not enforce it.
- Every spell includes its canonical rules in the visible Item description and exact source text in private namespaced flags. The default Action presents source-backed casting cost and timing, range, simple target or area, duration, and concentration where the headers are unambiguous. Components and unambiguous material consumption use the corresponding A5e spell fields.
- For reviewed direct-damage casts, the native base-damage rolls are selected by default and run through A5e's Action activation to chat. The system may show its normal activation dialog first. Save prompts give defenders the save ability and result text. They use the caster's spellbook DC when appropriate, or the fixed DC stated in the rules. The user still determines the outcome, applies half or no damage, and chooses whether to click the separate chat damage control.
- Use labeled follow-up Actions only when their trigger occurs. For attacks, roll the attack before selecting hit damage. Apply critical hits manually. One reviewed cantrip uses native character-level scaling. Selected upcasts have a separate increment roll, and other slot increases remain manual. Spell slots, material payments, actual HP application, automatic effects, repeated timing, and deity restrictions are outside the automation.
- The private build audit records each canonical ID, review status, rationale, and rule hash. Unreviewed records can have full-text search hints for triage. Hints never create rolls or prompts. This build includes 33 spells with default cast damage, 95 with any native damage roll, 173 with native save prompts, 28 with native attacks, and 171 with follow-up or mode actions. These counts overlap.

## Reproduce the private build

Use Node 22 or newer, the locally installed official Foundry CLI 3.0.5 with ClassicLevel 3.0.0, and Windows bsdtar. The canonical input and A5e checkout are read-only. Choose fresh build directories.

```powershell
node --test
node a5e-1.5.2.mjs ../vathian-spell-source-20261118 ../a5e-reference build/native-0.2.0-local
node pack.mjs build/native-0.2.0-local foundry-cli.mjs build/release-0.2.0-local
```

The native build verifies the checkout revision and compares each reference file it reads with the tracked commit. It records the fingerprints and creates `items/` and `audit.json`. The pack script uses explicit CLI input and output paths and confines CLI config and temporary files to the release build. It compiles ClassicLevel database entries, checks the ZIP member list and file bytes, then unpacks a fresh copy from the ZIP and compares all 819 Items with the native JSON. The ZIP contains only the module manifest and pack data. The separate `release-receipt.json` records the ZIP and file SHA-256 hashes.

The earlier canonical and staging audits remain reproducible with `node canonical.mjs` and `node native-adapter.mjs stage`. These private outputs are excluded from version control.
