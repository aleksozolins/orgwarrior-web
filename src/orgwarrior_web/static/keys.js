"use strict";
// The keyboard, as org's agenda has it: stand on a line of the list and press
// a key; each opens a small sheet or acts at once.  The task's pane beside is
// for reading (and the mouse): focus never goes into it.  One set of keys, no
// modes: they act only outside a field.  The query box takes everything the
// orgwarrior command takes (c and x fill it in).

// The list row the keys act on, by ID; its index, for when an action takes
// it away (archived, refiled): the row that took its place.
let cursor = null, cursorIndex = 0, previewTimer = null;
// TAB from an agenda: the task the file's view opens on, and the agenda Esc goes back to.
let revealCursor = null, revealFrom = null, revealPreview = false;
let previewing = null;  // the row a preview is on its way to: markCurrent puts the bar there

// The keys: the server's table (keymap.py, /api/views' keymap), each action's
// sequences, org agenda's keys unless [web.keys] or a preset says otherwise.
// Dispatch, hints and ? all read it, so a key rebound follows everywhere.
let keyTable = null;
const keyActions = new Map();  // name → {name, group, what, keys, org}
let bindings = new Map(), prefixes = new Set();  // "d d" → "kill"; "d"

function setKeys(table) {
  keyTable = table;
  keyActions.clear();
  for (const a of table?.actions ?? []) keyActions.set(a.name, a);
  [bindings, prefixes] = bindingsOf([...keyActions.keys()]);
  // The page's own controls (the header's, the preferences'): their hints by action too.
  for (const el of document.querySelectorAll("[data-hint-for]")) {
    if (keyHint(el.dataset.hintFor)) el.dataset.hint = keyHint(el.dataset.hintFor);
    else delete el.dataset.hint;
  }
}

// NAMES' sequences, as sequence → action, and the keys that start one.
function bindingsOf(names) {
  const map = new Map(), starts = new Set();
  for (const name of names) for (const seq of keyActions.get(name)?.keys ?? []) {
    map.set(seq, name);
    const keys = seq.split(" ");
    for (let i = 1; i < keys.length; i++) starts.add(keys.slice(0, i).join(" "));
  }
  return [map, starts];
}

const keysOf = name => keyActions.get(name)?.keys ?? [];
// As a keycap shows a key: Emacs's notation, arrows drawn as arrows.
const LABELS = {"<up>": "↑", "<down>": "↓", "<left>": "←", "<right>": "→", "<prior>": "PgUp", "<next>": "PgDn",
                "<home>": "Home", "<end>": "End", "<delete>": "Del", "<insert>": "Ins"};
const keyLabel = seq => seq.split(" ").map(k => k.replace(/<[a-z0-9]+>$/, m => LABELS[m] ?? m.slice(1, -1).toUpperCase())).join(" ");
// The hint for NAME's control: its first key, none if it has none.
const keyHint = name => keysOf(name).length ? keyLabel(keysOf(name)[0]) : "";
const hintAttr = name => keyHint(name) ? ` data-hint="${esc(keyHint(name))}"` : "";

// A key as Emacs writes it (keymap.py's form): C- M- S- s-, then the key; a
// character as typed (T, $), Shift in it.  Null for a modifier alone.
const KEY_NAMES = {Enter: "RET", " ": "SPC", Tab: "TAB", Escape: "ESC", Backspace: "DEL", Delete: "<delete>",
                   Insert: "<insert>", Home: "<home>", End: "<end>", PageUp: "<prior>", PageDown: "<next>",
                   ArrowUp: "<up>", ArrowDown: "<down>", ArrowLeft: "<left>", ArrowRight: "<right>"};
function eventKey(e) {
  if (["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph", "OS", "Dead", "Process", "Unidentified"].includes(e.key)) return null;
  // AltGr types a character (@ on a German keyboard): the character, no modifiers.
  if (e.getModifierState?.("AltGraph") && [...e.key].length === 1) return e.key;
  let base = KEY_NAMES[e.key] ?? (/^F([1-9]|1[0-2])$/.test(e.key) ? `<f${e.key.slice(1)}>` : null);
  let shift = e.shiftKey;
  if (!base) {
    // With C- M- s-, a letter or digit by its place (Alt-j on a Mac types ∆), Shift apart.
    const at = /^Key([A-Z])$/.exec(e.code)?.[1] ?? /^Digit([0-9])$/.exec(e.code)?.[1];
    if ((e.ctrlKey || e.altKey || e.metaKey) && at) base = at.toLowerCase();
    else if ([...e.key].length === 1) [base, shift] = [e.key, false];
    else return null;
  }
  return `${e.ctrlKey ? "C-" : ""}${e.altKey ? "M-" : ""}${shift ? "S-" : ""}${e.metaKey ? "s-" : ""}${base}`;
}

// A sequence under way (d, of d d): its keys so far, shown in a corner as
// Emacs's echo area shows C-x-.  Esc, a click, or a key that goes nowhere ends it.
let pendingKeys = [];
const PENDING = Symbol("pending");
function showPending() {
  const el = document.getElementById("keyseq");
  el.hidden = !pendingKeys.length;
  el.textContent = pendingKeys.length ? `${keyLabel(pendingKeys.join(" "))} …` : "";
}
function cancelPending() {
  if (pendingKeys.length) pendingKeys = [], showPending();
}

// E's action in MAP (the list's, or the card's): a sequence done gives its
// action, one begun PENDING, one gone nowhere PENDING too (said, and
// swallowed); else null, the key not one of these.
function keyAction(e, [map, starts] = [bindings, prefixes]) {
  const k = eventKey(e);
  if (!k) return null;
  // C-c with text selected is the browser's copy, sequence or not.
  if (k === "C-c" && !pendingKeys.length && String(getSelection()).length) return null;
  const seq = [...pendingKeys, k].join(" ");
  if (map.has(seq)) return cancelPending(), map.get(seq);
  if (starts.has(seq)) return pendingKeys.push(k), showPending(), PENDING;
  if (pendingKeys.length) return cancelPending(), toast(`${keyLabel(seq)} isn't a key`, true), PENDING;
  return null;
}
// Whether E would be the list's (a modifier key the browser would have otherwise).
const listWants = e => pendingKeys.length > 0 || (k => k && (bindings.has(k) || prefixes.has(k)))(eventKey(e));

const keyboardOn = () => document.body.classList.contains("keyboard");
const listShown = () => document.body.dataset.page === "view" || wide.matches;
const cursorRows = () => listShown() ? [...list.querySelectorAll(".task[data-id]")] : [];
const sameId = (a, b) => a.startsWith(b) || b.startsWith(a);  // an ID's length follows the other tasks

// Called wherever the list is redrawn (markCurrent): the cursor follows its
// ID, else its place.  Its place first while that row still has the ID: two
// headings with one title share one, and the cursor mustn't jump between them.
function markCursor() {
  const rows = cursorRows();
  // Just added and in this list: the cursor onto it.
  const fresh = justAdded ? rows.findIndex(r => sameId(r.dataset.id, justAdded)) : -1;
  if (fresh >= 0) {
    [cursor, cursorIndex, justAdded] = [rows[fresh].dataset.id, fresh, null];
    rows[fresh].scrollIntoView({block: "nearest"});
  }
  const here = rows[cursorIndex];
  let row = cursor && (here && sameId(here.dataset.id, cursor) ? here : rows.find(r => sameId(r.dataset.id, cursor)));
  if (!row && cursor) row = rows[Math.min(cursorIndex, rows.length - 1)];
  for (const r of list.querySelectorAll(".task.cursor")) r.classList.remove("cursor");
  if (!row) return null;
  row.classList.add("cursor");
  cursor = row.dataset.id;
  cursorIndex = rows.indexOf(row);
  return row;
}

// The cursor's row (else the open task's) archived or killed, with IDS: the
// cursor onto the row after it, as org goes on; in a file's tree, the last
// of its level onto the heading before it, else its parent (the next row
// would be out of the subtree).
function landAfter(ids) {
  const rows = cursorRows(), gone = r => ids.some(id => sameId(r.dataset.id, id));
  const row = rows.find(r => cursor ? sameId(r.dataset.id, cursor) : r.classList.contains("current"));
  if (!row || !gone(row)) return;
  const i = rows.indexOf(row), level = el => { const out = []; for (let e = el; e; e = e.nextElementSibling) out.push(e); return out; };
  let pick = rows.slice(i + 1).find(r => !gone(r)) ?? rows.slice(0, i).reverse().find(r => !gone(r));
  if (row.matches(".node") && !level(row.nextElementSibling).some(e => e.matches(".task") && !gone(e))) {
    let before = row.previousElementSibling;
    while (before && !(before.matches(".task[data-id]") && !gone(before))) before = before.previousElementSibling;
    const parent = row.parentElement.matches(".sub") ? row.parentElement.previousElementSibling : null;
    pick = before ?? (parent?.matches(".task[data-id]") ? parent : pick);
  }
  [cursor, cursorIndex] = pick ? [pick.dataset.id, rows.indexOf(pick)] : [null, 0];
}

// SHOWN: whether the cursor was on screen; if not, the first press shows it.
// Side by side, the row it lands on opens beside, once the keys pause: held
// down, j doesn't load every task on the way.
function moveCursor(step, shown) {
  const rows = cursorRows();
  if (!rows.length) return;
  const at = markCursor();
  // Starting out: from the open task's row if there is one, else the top.
  const from = at ? rows.indexOf(at) : rows.findIndex(r => r.classList.contains("current"));
  const row = rows[from < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, from + (at && shown ? step : 0)))];
  cursor = row.dataset.id;
  cursorIndex = rows.indexOf(row);
  markCursor();
  row.scrollIntoView({block: "nearest"});
  cancelPreview();
  // Marking, the bar covers the task's pane: nothing to show beside.
  if (wide.matches && !selecting) {
    // The open task's bar goes with the cursor at once; the pane catches up.
    previewing = row.dataset.id;
    markCurrent();
    previewTimer = setTimeout(() => preview(row), 150);
  }
}

// Where M's range starts: the row last marked with m.
let markFrom = null;

// Mark the rows from FROM's (an ID; else the cursor's) to ROW (M,
// Shift-click); the cursor goes there.
function markRange(row, fromId = null) {
  const rows = cursorRows(), at = markCursor(), to = rows.indexOf(row);
  const start = fromId ? rows.findIndex(r => r.dataset.id === fromId) : at ? rows.indexOf(at) : -1;
  const from = start < 0 ? to : start;
  for (const r of rows.slice(Math.min(from, to), Math.max(from, to) + 1)) setMarked(r.dataset.id, true);
  [cursor, cursorIndex] = [row.dataset.id, to];
  markCursor();
}

// A pending preview called off: its bar back on the open task.
function cancelPreview() {
  clearTimeout(previewTimer);
  if (previewing) {
    previewing = null;
    markCurrent();
  }
}

async function preview(row) {
  if (row.isConnected && sheet.hidden && !(currentTask && sameId(row.dataset.id, currentTask.id))) await openRow(row);
  // Not opened after all (a sheet, a change kept): the bar back on the open task.
  if (previewing === row.dataset.id && !location.hash.startsWith(`#/t/${row.dataset.id}`)) {
    previewing = null;
    markCurrent();
  }
}

// Whether the cursor's row is what a key means: nothing is open beside it
// (the list alone), it is the open task, or its preview is on the way (j
// then t quickly).  Once another task is open (a child walked into from an
// outline, a link followed) the cursor's row is one you're not looking at:
// a kill took a parent, its subtree and all, so.
const cursorMeant = row => !!row && (document.body.dataset.page !== "task" || !currentTask
  || sameId(row.dataset.id, currentTask.id) || previewing === row.dataset.id);

// What a key acts on: the selection, else the cursor's row when it's meant
// (read first, so its own keywords, tags and priority are offered), else
// the open task.
async function keyTargets() {
  if (selecting) return {ids: [...selected], task: null};
  const row = cursorRows().length && markCursor();
  if (cursorMeant(row) && !(currentTask && sameId(row.dataset.id, currentTask.id))) {
    const task = await orToast(api(`/api/task/${encodeURIComponent(row.dataset.id)}`));
    return task && {ids: [task.id], task};
  }
  return currentTask ? {ids: [currentTask.id], task: currentTask} : null;
}

// The keys needing the task read first: clocking in on it (now, or at a
// time), its clocks, its notes and history, its properties, its effort, a zoom into it.
async function clockKey(action) {
  cancelPreview();
  const target = await keyTargets();
  if (!target) return;
  if (target.ids.length > 1) return toast("One task at a time", true);
  const task = target.task ?? await orToast(api(`/api/task/${encodeURIComponent(target.ids[0])}`));
  if (!task) return;
  if (action === "clocks") return chooseClock(task);
  if (action === "outline") return zoomTo(task.file, task.id);
  if (action === "history") return chooseHistory(task);
  if (action === "properties") return chooseProps(task);
  if (action === "effort") return chooseEffort(task);
  return action === "clock-in-at" ? chooseClockIn(task) : clockIn(task);
}

// The actions run as the task page's controls are (act): action → its verb.
const VERBS = {state: "states", priority: "pri", tags: "tags", note: "note", schedule: "sched", deadline: "due", when: "when",
               refile: "refile", archive: "archive", rename: "rename", move: "move", kill: "kill",
               "move-down": "down", "move-up": "up", promote: "promote", demote: "demote"};

// The address already moved on, the page not yet drawn (history.back changes
// the address first): a quick second Esc or [ isn't a second Back.
const addressAhead = () => pageOf(location.hash) !== document.body.dataset.page;

// A file's view (its tree), not an agenda's.
const inFile = () => fileShown !== null && fileOf(listQuery) === fileShown;

// TAB on an agenda's row: its file's tree, unfolded down to it, the cursor on
// it and (side by side) it shown beside, as org agenda's TAB goes to the entry.
async function reveal() {
  const tg = await keyTargets();
  if (tg?.task && tg.ids.length === 1) revealTask(tg.task);
}
// The task's file, unfolded down to it, the cursor on it (TAB, and the file
// in a task page's path).
function revealTask({file, parents, id}) {
  folds = readFolds(file);
  fileShown = file;
  for (const p of parents) if (p.id) folds.add(p.id);
  keepFolds();
  [revealCursor, revealFrom, revealPreview] = [id, location.hash, wide.matches];
  location.hash = `#/v/${encodeURIComponent(file)}`;
}

// h: the file's view zoomed into a heading, as org's narrowing.  AT, the
// task a path link came from: the cursor on it and (side by side) it beside,
// Esc back to it, as TAB.
function zoomTo(file, id, at = null) {
  [revealCursor, revealFrom, revealPreview] = [at, at && location.hash, !!at && wide.matches];
  location.hash = `#/v/${encodeURIComponent(zoomQuery(file, id))}`;
}
// ^: out a level, the cursor on the heading left.
function widen() {
  revealCursor = zoomTask.id;
  location.hash = `#/v/${encodeURIComponent(zoomQuery(zoomTask.file, zoomTask.parents.findLast(p => p.id)?.id))}`;
}

async function act(verb) {
  cancelPreview();  // its sheet first: a preview landing now would close it
  const target = await keyTargets();
  if (!target) return;
  if (["down", "up", "promote", "demote"].includes(verb) && target.ids.length === 1) {
    justMoved = target.ids[0];
    // Into the heading above: unfolded, so it lands in view.
    const row = inFile() && cursorRows().length && markCursor();
    let above = row?.previousElementSibling;
    if (above?.matches(".sub")) above = above.previousElementSibling;
    if (verb === "demote" && above?.dataset.id) folds.add(above.dataset.id), keepFolds();
  }
  if (verb === "states") return chooseState(target.ids, target.task);
  if (verb === "kill") return confirmThen("kill", target.ids);
  if (["rename", "move", "down", "up", "promote", "demote"].includes(verb)) {
    if (target.ids.length > 1) return toast("One task at a time", true);
    if (verb === "rename") return chooseRename(target.ids[0], target.task);
    if (verb === "move") return chooseMove(target.ids[0]);
    return run(verb, target.ids);
  }
  const b = document.createElement("button");
  b.dataset.do = verb;
  doControl(b, target.ids, target.task);
}

// ?: every action and its keys, by group, then the keys that are always
// so.  An action rebound (the preset, [web.keys]) is marked; one with no
// key shows –, so what there is to bind is in the list too.
function showKeys() {
  const acts = keyTable?.actions ?? [], groups = [...new Set(acts.map(a => a.group))];
  const changed = a => JSON.stringify(a.keys) !== JSON.stringify(a.org);
  const mark = on => on ? ` <span class="rebound" title="not org's key">·</span>` : "";
  const row = (keys, what, rebound) => `<dt>${esc(keys)}${mark(rebound)}</dt><dd>${esc(what)}</dd>`;
  const one = a => row(a.keys.length ? a.keys.map(keyLabel).join(", ") : "–", a.what, changed(a));
  // The ten tabs one row: each one's first key, in order.
  const tabActs = acts.filter(a => /^tab-\d+$/.test(a.name));
  const tabRow = tabActs.length ? row(tabActs.map(a => a.keys.length ? keyLabel(a.keys[0]) : "–").join(" "),
                                      "the tabs, in order", tabActs.some(changed)) : "";
  const note = keyTable?.preset ? `<div class="hint">Keys: the ${esc(keyTable.preset)} preset${
    keyTable.unmatched ? `. What it binds that the page doesn't have: ${esc(keyTable.unmatched)}` : ""}.</div>` : "";
  ask(`<div class="sheet-title">Keyboard</div>${note}
    <dl class="keys">${groups.map(g => `<div class="keys-group">${esc(g)}</div>${
      acts.filter(a => a.group === g && !tabActs.includes(a)).map(one).join("")}${g === tabActs[0]?.group ? tabRow : ""}`).join("")}
    <div class="keys-group">Always</div>
    ${(keyTable?.fixed ?? []).map(([k, what]) => row(k, what, false)).join("")}</dl>
    <div class="hint">· not org's key: the preset's or yours. Keys are set in config.toml's [web.keys], as Emacs writes them:
      <kbd>kill = "d d"</kbd>, <kbd>preset = "evil"</kbd>.</div>
    <div class="sheet-buttons"><button data-a="cancel" autofocus>Close</button></div>`, () => {});
  sheet.querySelector(".sheet-body").scrollTop = 0;  // from the top: focusing Close scrolled it to the end
}

// What scrolls a page read on its own (the read page; a task page with no
// list beside it, a phone's): down and up (j k, the arrows) a line, Space
// and Shift-Space a screen, Home and End the ends, as a browser or less has
// them.  EL: the pane (side by side it scrolls, not the window).
function scrollKey(action, key, shift, el) {
  const page = el === window ? window.innerHeight : el.clientHeight;
  const by = {down: 60, up: -60}[action] ?? {PageDown: page - 60, PageUp: 60 - page, " ": shift ? 60 - page : page - 60}[key];
  if (by !== undefined) return el.scrollBy({top: by}), true;
  if (key === "Home" || key === "End") return el.scrollTo({top: key === "Home" ? 0 : 1e9}), true;
  return false;
}

// The query box, filled in: TEXT and the cursor after it.
function intoBox(text) {
  q.value = text;
  q.focus();
  q.setSelectionRange(text.length, text.length);
}

// A row of choices: arrows, or h l k j, between its buttons, in the order
// they're shown; Tab passes over it as one stop.  A pair of buttons
// (Cancel/Save, Keep/Discard) takes the arrows too, but Tab still steps
// through it: two stops are no trouble.
const CHOICES = ".chips, .list, .actions, .move-list, .org-tools, #themes, #modes, #hints";
const PAIRS = ".sheet-buttons";
function moveAmong(e) {
  const g = e.target.parentElement?.closest(`${CHOICES}, ${PAIRS}`);
  if (!g || !e.target.matches("button, a")) return false;
  const items = [...g.querySelectorAll("button, a[href]")].filter(i => !i.disabled && !i.closest("[hidden]"));
  const at = items.indexOf(e.target);
  const step = {ArrowRight: 1, ArrowDown: 1, l: 1, j: 1, ArrowLeft: -1, ArrowUp: -1, h: -1, k: -1}[e.key];
  if (at < 0 || !step) return false;
  e.preventDefault();
  items[Math.max(0, Math.min(items.length - 1, at + step))].focus();
  return true;
}

// Tab and Shift-Tab within SCOPE (a sheet, wrapping; else the page), a row
// of choices one stop, entered on its current choice (the task's state, a
// tab), else its first.  So Tab from the quick dates goes to the date.
const choiceRow = el => el?.matches("button, a") ? el.parentElement?.closest(CHOICES) : null;
function tabOver(e, scope, wrap) {
  const items = [...scope.querySelectorAll("button, input, select, textarea, a[href], summary, [tabindex]")]
    .filter(i => !i.disabled && i.getClientRects().length && i.tabIndex >= 0);
  const at = items.indexOf(document.activeElement), step = e.shiftKey ? -1 : 1;
  if (at < 0) {
    if (!wrap) return false;
    e.preventDefault();
    return items.at(e.shiftKey ? -1 : 0)?.focus();
  }
  const row = choiceRow(items[at]);
  let i = at + step;
  while (row && i >= 0 && i < items.length && choiceRow(items[i]) === row) i += step;
  if (i < 0 || i >= items.length) {
    if (!wrap) return false;
    i = (i + items.length) % items.length;
  }
  const next = choiceRow(items[i]);
  const target = next ? items.find(x => choiceRow(x) === next && x.matches('[aria-pressed="true"], [aria-checked="true"], .on'))
    ?? items.find(x => choiceRow(x) === next) : items[i];
  if (!row && !next && !wrap) return false;  // plain field to plain field: the browser's own
  e.preventDefault();
  target.focus();
  return true;
}

// A day's agenda by org agenda's keys: b f a day, B F a week, D the date
// picker (org's j is the cursor here); . today, from any list.
const DAY_STEPS = {earlier: -1, later: 1, "earlier-week": -7, "later-week": 7};
function dayKey(action) {
  // A clock report: earlier, later (either size) its span before and after, today this one's kind now.
  const report = list.querySelector(".report-head");
  if (report && REPORT_QUERY.test(listQuery ?? "")) {
    if (action === "today") return location.hash = `#/v/${encodeURIComponent(report.dataset.home)}`, true;
    const b = action !== "date" && report.querySelector(`[data-step="${DAY_STEPS[action] < 0 ? "earlier" : "later"}"]`);
    return b ? (b.click(), true) : false;
  }
  const pick = list.querySelector(".stepper .pick"), input = pick?.querySelector("input");
  // On a week's agenda b f and B F all step a week, as org's step by the span, and . is this week.
  const week = input && "week" in input.dataset;
  if (action === "today") {
    location.hash = `#/v/${encodeURIComponent(week ? weekOf(isoDate(new Date())) : isoDate(new Date()))}`;
    return true;
  }
  if (!input?.value) return false;  // not one day's or week's agenda
  if (action === "date") pick.click();
  else if (week) location.hash = `#/v/${encodeURIComponent(weekOf(shiftDate(input.value, DAY_STEPS[action] < 0 ? -7 : 7)))}`;
  else location.hash = `#/v/${shiftDate(input.value, DAY_STEPS[action])}`;
  return true;
}

// Org's fast keys in a picker sheet: a choice's letter picks it (a state, a
// priority) or toggles it (a tag), SPC is none, and in tags Enter saves, as
// RET does after C-c C-q.  The letters win over hjkl there (a SKIP(k)); the
// arrows still move, and Enter picks the choice focused.
function fastPick(e) {
  if (e.key === "Enter" && sheet.querySelector(".tagchip")) {
    e.preventDefault();
    sheet.querySelector("button.primary")?.click();
    return true;
  }
  const b = [...sheet.querySelectorAll("[data-key]")].find(x => x.dataset.key === e.key && !x.closest("[hidden]"));
  if (!b) return false;
  e.preventDefault();
  // Space presses a button on its keyup: on whatever has the focus by then
  // (the card's Add, once the picker closes), so that keyup goes nowhere.
  if (e.key === " ") addEventListener("keyup", u => u.key === " " && u.preventDefault(), {capture: true, once: true});
  b.click();
  return true;
}

// The button that saves what EL is in: a sheet, a fold of the task page, a
// form page (add, edit, capture).
const FORM_SAVE = ".add-page [data-a=add], [data-a=save]";
function submitButton(el) {
  if (!sheet.hidden) return sheet.querySelector("button.primary:not([hidden])");
  const unit = el.closest?.("[data-unit]");
  if (unit) return unit.querySelector("[data-f=save]");
  return detail.querySelector(FORM_SAVE);
}

// The keys, in this order: the discard dialog's, the page's own (a sheet's
// Esc, the box), saving, Tab, a sheet's, the capture page's, a field's Esc
// and the moves, then the list's.  Each handler returns true once the key
// is taken (handled or left to the browser), and nothing after it runs.
document.addEventListener("keydown", e => {
  if (discardDialog.open) return dialogKey(e);
  // A sequence under way: Esc ends it, and nothing else; Tab ends it too.
  if (pendingKeys.length && e.key === "Escape") return e.preventDefault(), cancelPending();
  if (e.key === "Tab") cancelPending();
  if (!e.defaultPrevented) pageKey(e);
  const t = e.target, k = {e, t, key: e.key, inField: t.matches("input, textarea, select, [contenteditable]"),
    wasKeyboard: keyboardOn(),  // before this key: whether the cursor was showing
    handled: () => { e.preventDefault(); document.body.classList.add("keyboard"); }};
  if (k.key === "Tab" || (!k.inField && !["Shift", "Control", "Alt", "Meta"].includes(k.key)))
    document.body.classList.add("keyboard");
  k.page = document.body.dataset.page;
  // Ctrl-Enter (or Cmd) from anywhere saves what it's in.
  if (k.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    const b = submitButton(t);
    if (b) k.handled(), b.click();
    return;
  }
  if (e.defaultPrevented) return;
  enterKey(k) || tabKey(k) || (!sheet.hidden ? sheetKey(k) : document.body.dataset.mode ? captureKey(k)
    : fieldKey(k) || (!pendingKeys.length && moveAmong(e)) || listKey(k));
});

// Keep or Discard: y and n, as y-or-n-p; arrows and hjkl too.
function dialogKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const pick = {y: "discard", n: "keep"}[e.key];
  if (pick) return e.preventDefault(), discardDialog.querySelector(`[value=${pick}]`).click();
  moveAmong(e);
}

// Anywhere: Enter on the day's date opens its picker, Escape is Back for a
// sheet (out of a field in it first) and ends marking.  A field's own Esc (the
// card's title) stays its own: those come here prevented.
function pageKey(e) {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches(".pick")) {
    e.preventDefault();
    return e.target.click();
  }
  if (e.key === "Escape" && !sheet.hidden) {
    e.preventDefault();
    // In a field written in (not a picker's filter): out of it first, to the
    // button that saves, so Enter saves and the sheet's keys work (d, x);
    // Esc again closes it, as a form's fields do.
    if (sheet.contains(e.target) && e.target.matches("textarea, input:not([type=search])")) {
      document.body.classList.add("keyboard");
      return (sheet.querySelector(".sheet-buttons .primary") ?? sheet.querySelector("button"))?.focus();
    }
    return cancelSheet?.();
  }
  if (e.key === "Escape" && selecting) return e.preventDefault(), leaveSelection();
}

// Enter in a one-line field: a filter picks its first match, a new tag is
// added, else what it's in is saved.
function enterKey({key, t, handled}) {
  if (key !== "Enter") return false;
  if (t.matches("#tagfilter, #rf-filter")) {
    handled();
    (t.closest("#sheet, [data-unit], .add-page") ?? document).querySelector("[data-t]:not([hidden])")?.click();
    return true;
  }
  if (t.matches("#newtag")) return handled(), t.parentElement.querySelector("[data-a=new]")?.click(), true;
  if (t.matches("input:not([type=search]):not([type=checkbox])") && !t.closest("#search")) {
    const b = submitButton(t);
    if (b) return handled(), b.click(), true;
  }
  return false;
}

function tabKey({e, key, t, inField, wasKeyboard, page, handled}) {
  if (key !== "Tab" || e.ctrlKey || e.altKey) return false;
  // From the list, or from the header's tab or logo clicked last (it keeps
  // the focus unseen, and the browser's Tab went on to the box).  The task
  // pane keeps its own Tab.
  const fromList = !inField && sheet.hidden && (t === document.body || list.contains(t) || !!t.closest("header"));
  if (fromList && (page === "view" || page === "task")) {
    handled();
    // Org's TAB, while the cursor shows: in a file, fold the row (Shift:
    // all); in an agenda, the task in its file.
    if (wasKeyboard && cursorRows().length && list.querySelector(".task.cursor")) {
      const row = markCursor();
      if (!inFile()) {
        if (!e.shiftKey) reveal();
      } else if (e.shiftKey) {
        const all = foldable(fileTree), open = all.some(id => !folds.has(id));
        folds = new Set(open ? all : []);
        keepFolds();
        drawFile();
      } else if (row.querySelector("[data-tw]")) toggleFold(row.dataset.id);
      return true;
    }
    // Else (no cursor showing yet, after a view changed): show the cursor,
    // never walk the focus into the header.
    if (t.closest("header")) t.blur();
    if (cursorRows().length && !list.querySelector(".task.cursor")) moveCursor(0, false);
    return true;
  }
  // A row of choices one stop; a sheet keeps it inside.
  if (tabOver(e, sheet.hidden ? document.body : sheet, !sheet.hidden)) document.body.classList.add("keyboard");
  return true;
}

// In a sheet: its filter's ↓, the card's keys, y and n, help's scrolling,
// the pickers' fast keys, arrows and hjkl among a row's choices or a pair
// of buttons.
function sheetKey({e, key, t, inField, handled}) {
  // From a filter, ↓ goes into its list (refile's, Where's).
  if (key === "ArrowDown" && t.id === "rf-filter") return handled(), sheet.querySelector(".list button:not([hidden])")?.focus(), true;
  if (inField) return true;
  // A draft's card (c): its fields' keys (the task's, C-c C-d too) open their
  // pickers; Enter is the button focused, Add.
  if (sheet.querySelector(".draft")) {
    const picks = [...sheet.querySelectorAll("[data-pick]")].map(p => p.dataset.pick);
    const action = keyAction(e, bindingsOf(picks));
    if (action === PENDING) return handled(), true;
    if (action) return handled(), sheet.querySelector(`[data-pick="${action}"]`).click(), true;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  // A yes-or-no question (kill, archive): y does it, n doesn't, as y-or-n-p.
  if (sheet.querySelector("[data-a=yes]") && (key === "y" || key === "n"))
    return handled(), sheet.querySelector(key === "y" ? "[data-a=yes]" : "[data-a=cancel]").click(), true;
  // A long read (the keys, help): down and up (j k, the arrows), Space and Home/End scroll it.
  if (sheet.querySelector("pre.help, dl.keys")
      && scrollKey(bindings.get(eventKey(e)), key, e.shiftKey, sheet.querySelector(".sheet-body"))) return handled(), true;
  if (!fastPick(e)) moveAmong(e);
  return true;
}

// The capture page: its form only.  Arrows and hjkl between Task and Event,
// between the quick dates.
function captureKey({e, key, t, inField}) {
  if (key === "Escape" && inField) t.blur();
  if (!inField && !e.ctrlKey && !e.metaKey && !e.altKey) moveAmong(e);
  return true;
}

// Esc in a field; any other key in a field, or with a modifier the list
// doesn't have, is the browser's.
function fieldKey({e, key, t, inField, page, handled}) {
  // Esc in a field: the query box goes back to the view; on the add and edit
  // pages, out of the field to their button (a second Esc leaves); else out of the field.
  if (key === "Escape" && inField) {
    handled();
    if (t === q) q.value = listQuery ?? "", q.blur();
    // A form of several fields: out of the field first (to its Add or
    // Save, so Enter is ready); Esc again leaves the form, asking if changed.
    else if (page === "add" || page === "edit") detail.querySelector(FORM_SAVE)?.focus();
    else t.blur();
    return true;
  }
  // With a modifier, the browser's, unless it's one of the list's (C-k,
  // M-↓; Alt-← alone stays the browser's Back).
  return inField || ((e.ctrlKey || e.metaKey || e.altKey) && !listWants(e));
}

// The list's keys, as org's agenda has them, and the page's own: the key's
// action in the table (keyTable), whatever key it is.
function listKey({e, key, t, wasKeyboard, page, handled}) {
  const action = key === "Escape" ? null : keyAction(e);
  if (action === PENDING) return handled();
  // Esc, or quit (q): the task closed, else back; Esc also drops the cursor.
  if (key === "Escape" || action === "quit") {
    if (addressAhead()) return handled();
    cancelPreview();
    if (page === "task") return handled(), closeTask();
    if (page !== "view") return handled(), goBack();
    // Back from a file TAB showed a task in: the agenda it came from.
    if (revealFrom && inFile()) return handled(), revealFrom = null, goBack();
    if (action === "quit" || !cursor) return;
    handled();
    cursor = null;
    return markCursor();
  }
  if (action === "help") return handled(), showKeys();
  if (action === "preferences") return handled(), openSettings();
  if (action === "box") return handled(), q.focus(), q.select();
  if (action === "clock-report" && sheet.hidden) return handled(), setClockReport(!clockReportOn),
    toast(clockReportOn ? "Under a day or week: what was clocked" : "Under a day or week: nothing");
  // Back and forward through what was shown: views, TAB, a task opened (a
  // preview replaces its entry, so they don't pile up).
  if (action === "back") return handled(), addressAhead() || goBack();
  if (action === "forward") return handled(), addressAhead() || history.forward();
  // The read page: edit what's read (its own keys only: down would walk the list hidden beside it);
  // it and a task page alone (no list beside) scroll by the keys.
  if (page === "read" && action === "edit" && currentTask) return handled(), location.hash = `#/e/${encodeURIComponent(currentTask.id)}`;
  if ((page === "read" || (page === "task" && !cursorRows().length)) && !t.matches("button, a, summary, [role=button]")
      && scrollKey(action, key, e.shiftKey, wide.matches ? detail : window)) return handled();
  if (page !== "view" && page !== "task" || !action) return;
  // Marks, as org's agenda has them: mark and unmark move on down (so does
  // mark-toggle, org agenda's M-m); mark-range marks from the last mark to the
  // cursor (a range, both ends); mark-all, unmark-all.
  if (["mark", "unmark", "mark-toggle", "mark-range"].includes(action)) {
    if (!cursorRows().length) return;
    if (!markCursor()) moveCursor(0, false);  // no cursor yet: its row first
    const row = markCursor();
    handled();
    cancelPreview();
    if (action === "mark-range") return markRange(row, markFrom), markFrom = row.dataset.id;
    const on = action === "mark-toggle" ? !selected.has(row.dataset.id) : action === "mark";
    setMarked(row.dataset.id, on);
    if (on) markFrom = row.dataset.id;
    else if (markFrom === row.dataset.id) markFrom = null;  // unmarked: no range from it
    return moveCursor(1, true);
  }
  if (action === "mark-all") return handled(), cursorRows().forEach(r => setMarked(r.dataset.id, true));
  if (action === "unmark-all") return handled(), leaveSelection();
  if (action === "down" || action === "up") {
    if (!cursorRows().length) return;  // a task page alone: the arrows scroll it
    const shown = wasKeyboard && list.querySelector(".task.cursor");
    handled();
    return moveCursor(action === "down" ? 1 : -1, shown);
  }
  if (action === "open" && !t.matches("button, a, summary, [role=button]")) {
    // A toast offering a step (an add's new task, a clock's Adjust): open takes it while it shows.
    if (toastAction && !toastEl.hidden) return handled(), toastEl.querySelector(".toast-act").click();
    const row = cursorRows().length && markCursor();
    if (!row) return;
    handled();
    clearTimeout(previewTimer);  // opened now instead: its bar stays (previewing) until it's drawn
    return currentTask && sameId(row.dataset.id, currentTask.id) ? null : openRow(row);
  }
  if (["earlier", "later", "earlier-week", "later-week", "date", "today"].includes(action))
    return dayKey(action) ? handled() : undefined;
  if (Object.hasOwn(VERBS, action)) return handled(), act(VERBS[action]);
  if (action === "priority-up" || action === "priority-down") {
    handled();
    cancelPreview();
    return keyTargets().then(tg => tg && run("pri", tg.ids, [action === "priority-up" ? "up" : "down"]));
  }
  // Clocking, org's I and O: lower case now, upper case asks the time.
  if (["clock-in", "clock-in-at", "clocks", "history", "properties", "effort", "outline"].includes(action)) return handled(), clockKey(action);
  if (action === "clock-out" || action === "clock-cancel" || action === "clock-goto") {
    handled();
    const c = shownClock();
    if (!c) return toast("No clock running");
    if (action === "clock-goto") return location.hash = `#/t/${encodeURIComponent(c.id)}`;
    if (action === "clock-out") return clockOut(c);
    return yesNo("Discard this clock?", `${c.title}, since ${c.start.slice(11)}: its line is removed.`, "Discard")
      .then(yes => yes && orToast(post("/api/clock", {op: "cancel", id: c.id})))
      .then(r => r && (toast("Clock discarded"), route(true)));
  }
  if (action === "clock-out-at") return handled(), chooseClockOut();
  if (action === "edit" || action === "read") {  // edit its text; read it full screen
    handled();
    return keyTargets().then(tg => {
      if (tg?.ids.length === 1) location.hash = `#/${action === "edit" ? "e" : "r"}/${encodeURIComponent(tg.ids[0])}`;
    });
  }
  if (action === "command") {
    handled();
    const row = cursorRows().length && markCursor();
    const ids = selecting ? [...selected] : [cursorMeant(row) ? row.dataset.id : currentTask?.id].filter(Boolean);
    return intoBox(ids.length ? `${ids.join(" ")} ` : "");
  }
  if (action === "add") return handled(), draftTask();
  if (action === "add-under") return handled(), draftTask("under");
  if (action === "add-beside") return handled(), draftTask("beside");
  if (action === "refresh") return handled(), document.getElementById("reload").click();
  if (action === "save-tab" && listShown()) return handled(), tabSheet();
  if (action === "widen" && listShown() && inFile() && zoomTask) return handled(), widen();
  const tab = /^tab-(\d+)$/.exec(action);
  if (tab) {  // tab-1 to tab-10, as the row reads
    const a = tabs.querySelectorAll("a")[Number(tab[1]) - 1];
    if (a) handled(), a.click();
  }
}
// A header control clicked (a tab, the logo, ↻) gives up the focus it took:
// the keys are the list's, or j would walk the tabs and Enter click one
// again.  Pressed from the keys (a click of detail 0), it keeps it.
document.querySelector("header").addEventListener("click", e => {
  const c = e.target.closest("a, button");
  if (c && e.detail > 0) c.blur();
});
// The cursor and focus rings show only while the keys are in use.
// The key hints stay through the press (.hints-linger): gone at once, the
// tabs and chips would shrink under the pointer and the click land elsewhere.
document.addEventListener("pointerdown", () => {
  cancelPending();
  if (document.body.classList.contains("keyboard")) document.body.classList.add("hints-linger");
  document.body.classList.remove("keyboard");
});
document.addEventListener("pointerup", () => setTimeout(() => document.body.classList.remove("hints-linger"), 300));
