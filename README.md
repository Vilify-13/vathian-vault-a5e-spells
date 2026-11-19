# Vathian Vault A5e Spells

Private local release 0.1.0 for Foundry VTT v14 and the official Level Up A5e system. The module contains 819 native spell Items in one LevelDB compendium. The reference schema is A5e 1.5.2 at commit `6d8c39f2e5c9ec6bbbbf1388a24005a5a6e10c8c`.

## Install locally

1. Use a disposable Foundry v14 instance or a separately authorized installation with official A5e 1.5.2 installed.
2. Shut down Foundry. Extract `vathian-vault-a5e-spells-0.1.0.zip` into that instance's user data `Data/modules/` directory. The resulting paths should be `Data/modules/vathian-vault-a5e-spells/module.json` and `Data/modules/vathian-vault-a5e-spells/packs/spells/`.
3. Start that instance and enable **Vathian Vault A5e Spells** in a disposable A5e world. Open **Vathian Vault Spells** from the Compendium Packs tab as GM.
4. Verify a same-name pair, a level-9 Quest spell, an explicit Herald-only spell, and a spell with a native area and concentration. The pack starts with player access disabled. The release was verified offline against official source and the LevelDB round trip. In-game startup, schema initialization, browsing, and activation still need a disposable Foundry test.

The ZIP supports private manual installation. The GitHub repository is private. The manifest and versioned ZIP URLs require authentication; Foundry cannot install them anonymously. Download the ZIP through an authenticated GitHub session for manual installation, or use a separately authorized reachable private host for manifest installation. Never put credentials in module.json.

## Mechanics

- The approved class counts are Wizard 519, Sorcerer 75, Cleric 361, and Herald 333. The importer checks a digest of the approved class assignments for every canonical ID. The native Herald key is `herald`. Six same-name pairs retain distinct IDs, 28 Quest entries have level 9 and the `quest` tag, and 318 records have exact deity associations. Deity flags and tags document eligibility for reference. They do not enforce it.
- Every spell includes its canonical rules in the visible Item description and exact source text in private namespaced flags. The default Action presents source-backed casting cost and timing, range, simple target or area, duration, and concentration where the headers are unambiguous. Components and unambiguous material consumption use the corresponding A5e spell fields.
- Review the Item description before casting. Roll formulas, saves, damage, scaling, active effects, slot and material payments, Quest-specific casting, and special or unresolved mechanics are manual. When the schema lacks a suitable exact form or the source is ambiguous, the Action uses a special label or leaves that field empty. The audit preserves missing headers and incomplete rules, and the Item flags include manual guidance. The default Action does not charge a spell resource or enforce deity requirements.

## Reproduce the private build

Use Node 22 or newer, the locally installed official Foundry CLI 3.0.5 with ClassicLevel 3.0.0, and Windows bsdtar. The canonical input and A5e checkout are read-only. Choose fresh build directories.

```powershell
node --test
node a5e-1.5.2.mjs ../vathian-spell-source-20261118 ../a5e-reference build/native-0.1.0-local
node pack.mjs build/native-0.1.0-local foundry-cli.mjs build/release-0.1.0-local
```

The native build verifies the checkout revision and compares each reference file it reads with the tracked commit. It records the fingerprints and creates `items/` and `audit.json`. The pack script uses explicit CLI input and output paths and confines CLI config and temporary files to the release build. It compiles ClassicLevel database entries, checks the ZIP member list and file bytes, then unpacks a fresh copy from the ZIP and compares all 819 Items with the native JSON. The ZIP contains only the module manifest and pack data. The separate `release-receipt.json` records the ZIP and file SHA-256 hashes.

The earlier canonical and staging audits remain reproducible with `node canonical.mjs` and `node native-adapter.mjs stage`. These private outputs are excluded from version control.
