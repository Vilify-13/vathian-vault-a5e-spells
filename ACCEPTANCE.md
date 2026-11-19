# Foundry v14 and A5e 1.5.2 acceptance

Run these checks in a disposable Foundry v14 user-data directory with A5e 1.5.2 and the v0.2.1 module enabled. Import fresh spells from the module pack onto a test caster. Give it a spellbook whose casting ability and DC differ from the actor defaults. In the test scene place the caster, a player-owned actor assigned to a test player, and an unowned NPC. Use one GM and one player client. Use the actor sheet’s activation control and leave the default rolls and prompts selected. The description-sharing control is a separate operation.

| Case | Expected result |
| --- | --- |
| Official Fireball control and Vathian Blue Blaze | Native damage rolls appear on cast. Vathian Blue Blaze shows both damage types and a Constitution prompt against the selected spellbook’s DC. Clicking rolls the defender save and shows success or failure without changing HP. |
| Graymantle | Constitution prompt with the caster’s DC and no damage roll. |
| Graft | Native save prompt shows the explicit fixed DC 10 regardless of the spellbook DC. |
| Welcome the Amoebic Sea | Two separate native buttons. Constitution addresses damage and coating; Wisdom addresses strife. Each button must roll its own ability. |
| Arcane Blast | One caster DC roll uses 1d20 plus proficiency and the spellbook ability modifier. The card exposes Dexterity against that same rolled DC. Select a single other creature. Run unmodified, shield facing the caster (+5 to save), magical missile penalty (subtract from DC), and metal or magical armor (halve damage and round down after applying the cap of 20). A tied or higher save yields zero damage. The caster cannot save from this card. |
| Arcane Bomb and Arcane Spray | Both use rolled Dexterity DCs. Bomb permits the caster within the impact area, caps at 30, and provides +2 for a facing shield with no missile penalty field. Spray targets one creature, uses +2 for a wielded shield, permits the magical missile penalty, and reports at most 20 hits of one force each before armor. |
| Lightning Shield and Drown | The cast card does not roll retaliatory damage or Drown’s later save. Choose the labeled follow-up when its trigger occurs. |
| Forcebuckler | Use the absorption Action only when a spell targets the defender alone. Enter the original attacker's save DC. The defender rolls Dexterity against it. |
| Permissions and reload | As GM select the test NPC. As the player select the owned actor, then clear selection and use the assigned owned actor. A player cannot roll for the unowned NPC. Compare each result to the same cast DC, reload the player client, and roll from the original card again. Confirm the same DC remains and cancelling the A5e dialog posts no save. Check a GM-whispered or blind card in both clients. |

Record the Foundry build, A5e system version, module version, spell/action, caster spellbook, displayed DC, defender roll, and player or GM role for each case. Report any missing buttons, duplicate save messages, console errors, or HP changes. Inspect a freshly imported spell before comparing behavior with any copy created before the update.
