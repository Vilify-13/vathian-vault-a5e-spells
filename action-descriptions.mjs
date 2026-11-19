import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ruleParagraphs, ruleSegments } from './action-text-source.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const selections = new Map();
// Ordered, one-based sentence ranges within the canonical rules, with pipe
// table rows intact. "*" retains the whole body. "h" adds the source save
// header; "a" adds only its ability for follow-ups with a different outcome.
for (const line of readFileSync(new URL('./follow-up-text.ndjson', import.meta.url), 'utf8').trim().split(/\r?\n/)) {
  const [id, actions] = JSON.parse(line);
  assert.ok(!selections.has(id) && Object.keys(actions).length, `Invalid or duplicate description review for ${id}`);
  selections.set(id, actions);
}

// These observations belong in the private audit. The card retains the supplied
// wording, including gaps. The existing phase, save and damage data is preserved.
const sourceNotes = {
  'tome-acidrainstorm': 'The save header says Dexterity halves. The body does not specify what the save changes or give a periodic trigger for the coating. The existing Dexterity prompt is on cast only.',
  '2e-priest-870': 'The magical fire spellcasting check is interrupted before stating its DC.',
  'tome-barrierreaver': 'The barrier response does not establish a complete success outcome for each case.',
  'tome-coalstone': 'The impact sentence ends at “must make .”; the save header supplies Dexterity halves.',
  '2e-wizard-274': 'The low-CR threshold sentence has a missing clause after “roughly”.',
  'tome-crownofdespair': 'The source repeats “ends” in the recovery-save timing and omits the creature noun; the source wording is retained.',
  'tome-deathshade': 'The shelter sentence breaks off before stating the protection afforded by underground or magical shelters.',
  '2e-wizard-374': 'The madness outcomes are interrupted before the repeat-save clause.',
  'tome-feeblebody': 'The source runs two clauses together and prints “30 fays”; the source wording is retained.',
  '2e-wizard-442': 'The tendril reach sentence is interrupted after “within 20 feet of”.',
  'tome-graspinghandsofhorror': 'The header says Strength negates and the body gives disadvantage when multiple arms grab a creature. The body does not establish a save trigger or result.',
  'tome-moldtouch': 'The Constitution halves header and the failure-only damage clauses in the body differ. Follow-up excerpts retain the stated ability and the outcome wording from the body.',
  '2e-priest-545': 'The failed-save outcome is interrupted after “On failure,”.',
  '2e-priest-781': 'The reflection attack clause is interrupted before the area-spell exception.',
  'tome-pyroclasticsurge': 'The body links the dust poison to a failed save without identifying its ability. The header says Dexterity halves and the existing dust phase leaves the save unresolved.',
  '2e-priest-763': 'The final rule paragraph contains an interrupted conditional. The header supplies Wisdom for unwilling targets.',
  '2e-wizard-455': 'The persistence clause is interrupted after “These effects persist outside”.',
  '2e-priest-783': 'The consent clause is interrupted after “applies only to”.',
  'tome-spiritbinding': 'The body assigns incompatible outcomes to a successful Charisma save.',
  '2e-wizard-106': 'The spellcasting clause is interrupted before the swarm dispersal rule.',
  'tome-thunderhead': 'The header lists Dexterity negates; the body states its caster-turn damage without explaining a save.',
  'tome-trapthesoul': 'The body ends the spell on the first successful save yet calls for a second save by the creature incapacitated on that success.',
  'tome-welcometheamoebicsea': 'The final strife clause ends with a comma. The header gives Constitution halves; the body additionally calls for a Wisdom save.'
};

function savingThrowHeader(raw) {
  const header = raw.savingThrow.trim();
  // Internal review remarks occur in a few source headers. Where the ability
  // itself is stated, keep that part and leave the editorial note in the audit.
  if (header === 'Wisdom (effect on success requires review)') return 'Wisdom';
  return /^(?:none\b|see effect$|special$)/i.test(header) ? '' : header;
}

const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('[', '&#91;').replaceAll('@', '&#64;');

function inline(text) {
  return escape(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/^\*\*\s*|\s*\*\*$/g, '');
}

function renderParagraphs(paragraphs) {
  const blocks = [];
  let rows = [];
  function finishTable() {
    if (!rows.length) return;
    blocks.push(`<table><tbody>${rows.join('')}</tbody></table>`);
    rows = [];
  }
  for (const [index, text] of paragraphs.entries()) {
    if (/^\|.*\|$/.test(text)) {
      const cells = text.slice(1, -1).split('|').map(cell => cell.trim());
      if (cells.every(cell => /^:?-+:?$/.test(cell))) continue;
      const tag = !rows.length && /^\|(?:\s*:?-+:?\s*\|)+$/.test(paragraphs[index + 1] ?? '') ? 'th' : 'td';
      rows.push(`<tr>${cells.map(cell => `<${tag}>${inline(cell)}</${tag}>`).join('')}</tr>`);
      continue;
    }
    finishTable();
    const prose = inline(text);
    if (prose) blocks.push(`<p>${prose}</p>`);
  }
  finishTable();
  return blocks.join('');
}

function selectParagraphs(raw, selector) {
  if (selector === '*') return ruleParagraphs(raw.rules);
  if (selector === 'acid-ongoing') {
    const paragraphs = ruleParagraphs(raw.rules);
    const phrase = 'Each creature takes 4d6 acid damage plus 1d6 ongoing acid damage for 1 minute.';
    assert.ok(paragraphs[0].includes(phrase) && paragraphs[1].includes('wipe off the acid'), raw.id);
    return [phrase.replace('4d6 acid damage plus ', ''), paragraphs[1]];
  }
  const segments = ruleSegments(raw.rules);
  const selected = new Set();
  for (const range of selector.split(',')) {
    assert.match(range, /^[1-9]\d*(?:-[1-9]\d*)?$/, `Invalid description selection for ${raw.id}`);
    const [start, end = start] = range.split('-').map(Number);
    assert.ok(start <= end && end <= segments.length, `Description selection outside rules for ${raw.id}: ${range}`);
    for (let index = start - 1; index < end; index++) selected.add(index);
  }
  const excerpts = [];
  let previous = -2;
  for (const index of [...selected].sort((a, b) => a - b)) {
    const { paragraph, text } = segments[index];
    if (index === previous + 1 && paragraph === segments[previous].paragraph) excerpts[excerpts.length - 1] += ` ${text}`;
    else excerpts.push(text);
    previous = index;
  }
  return excerpts;
}

export function validateActionDescriptionRecords(records) {
  const ids = new Set(records.map(record => record.id));
  for (const id of selections.keys()) assert.ok(ids.has(id), `No canonical record for Action description review ${id}`);
}

// The text renderer receives canonical fields and stable Action identity only.
// Roll and save decisions, including their rationales, are outside its inputs.
export function describeActions(raw, actions) {
  const reviewed = selections.get(raw.id) ?? {};
  const followUps = actions.filter(action => !action.default).map(action => action.id).sort();
  assert.deepEqual(Object.keys(reviewed).sort(), followUps, `Action description review coverage on ${raw.id}`);
  assert.equal(actions.length - followUps.length, 1, `Expected one cast on ${raw.id}`);
  const sourceRulesSha256 = hash(raw.rules);
  return actions.map(({ id, name, default: cast }) => {
    const selection = cast ? '*h' : reviewed[id];
    // A follow-up may reuse the stated ability without reusing the cast outcome.
    const headerMode = /[ha]$/.exec(selection)?.[0];
    const selector = headerMode ? selection.slice(0, -1) : selection;
    const canonicalHeader = headerMode ? savingThrowHeader(raw) : '';
    const header = headerMode === 'a' ? /^(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\b/i.exec(canonicalHeader)?.[0] : canonicalHeader;
    if (headerMode === 'a') assert.ok(header, `Missing source ability on ${raw.id}/${id}`);
    const paragraphs = selectParagraphs(raw, selector);
    const body = renderParagraphs(paragraphs);
    assert.ok(body.length > 7, `Missing source rules on ${raw.id}/${id}`);
    const description = body + (header ? `<p><strong>Saving Throw:</strong> ${inline(header)}</p>` : '');
    const evidence = { sourceId: raw.id, actionId: id, name, status: 'verified',
      kind: cast ? 'cast' : 'follow-up', sourceRulesSha256, selection,
      sourceSavingThrow: raw.savingThrow, displayedSavingThrow: header,
      selectionSha256: hash(JSON.stringify(paragraphs)), descriptionSha256: hash(description),
      sourceNote: sourceNotes[raw.id] ?? null };
    return { id, description, evidence };
  });
}
