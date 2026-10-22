"use strict";

// Acting on tasks.  The task page's controls, the long-press menu and the
// marks' bar all run the same flows, and every flow takes a list of IDs.

// After an add, the new task one key away, without leaving where you were
// (as org-capture returns you): in the list shown, the cursor goes onto it
// once it's drawn (markCursor); else the toast opens it.
let justAdded = null;
// TITLE what was added, said in the toast (its ID beside it, as the lists
// show IDs): "Added e3" alone said nothing.
function added(id, title, children = 0) {
  allTags = null;
  justAdded = id || null;
  // Not in the list within the toast's time: it doesn't take the cursor later.
  setTimeout(() => { if (justAdded === id) justAdded = null; }, 5000);
  toast(`${title ? `Added ${title}` : "Added"}${underIt(children)}`, false, id || null);
}
// An add's answer, its heading as org wrote it, as its title: no keyword, tags.
const addedTitle = heading => heading.replace(/\s+:[^\s:]+(:[^\s:]+)*:\s*$/, "")
  .replace(new RegExp(`^(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s+`), "");

// After an action: stay on the task page if the task is still there (following
// a refile's new ID), else go back; on a list, or after acting on a page's
// children, reload it.
function settle(verb, results) {
  const h = location.hash;
  // The keys' cursor follows a refiled or renamed task, on any page: its old
  // ID may now be another task's.
  const followed = cursor && results.find(r => r.old && r.id && sameId(cursor, r.old));
  if (followed) cursor = followed.id;
  const gone = verb === "archive" || verb === "kill";
  if (gone) landAfter(results.map(r => r.id).filter(Boolean));
  if (pageOf(h) === "task") {
    // An ID is the shortest prefix of the task's hash that no other task has:
    // it may have grown or shrunk since the page was loaded.
    const current = shownId(h);
    const same = id => id && (id.startsWith(current) || current.startsWith(id));
    if (gone && results.some(r => same(r.id))) return closeTask(true);
    const moved = results.find(r => same(r.old));
    // Not by location: a new ID that reads the same fires no hashchange.
    if (moved && moved.id) history.replaceState(null, "", `#/t/${encodeURIComponent(moved.id)}`);
    pageForm = null;  // redrawn as saved, even with another field half-typed
  }
  route(true);
}

async function run(verb, ids, args = [], note = null, newHeading = null) {
  try {
    const results = await post("/api/act", {ids, verb, args, note, ...newHeading && {new: newHeading}});
    if (verb === "tag") allTags = null;  // a new tag: offer it next time
    const already = results.filter(r => r.already).length;
    const out = verb === "promote" || verb === "demote"
      ? results[0].parent ? `Now under ${results[0].parent}` : "Now at the top level" : null;
    toast(out ?? (already ? `${plural(already, "task")} already there` : "Done"));
    leaveSelection();
    settle(verb, results);
  } catch (e) {
    toast(e.message, true);
  }
}

// ---- The flows ----

// A checkbox's [ ] on the task page, B its button.  No "Done": the box
// flipping says so.  Its text goes along, so a list changed underneath is refused.
async function check(id, b) {
  await orToast(post("/api/check", {id, n: Number(b.dataset.n), text: b.dataset.text}));
  pageForm = null;  // so the page redraws, a half-typed field or not
  route(true);
}

async function setState(ids, keyword) {
  let note = null;
  try {
    if (await post("/api/wants-note", {ids, verb: keyword.toLowerCase()})) {
      note = await ask(
        `<div class="sheet-title">Note for ${esc(keyword)}${what(ids)}</div>
         <div class="org-edit">${ORG_TOOLS}<textarea class="org" id="note" rows="3" autofocus autocapitalize="sentences"
           placeholder="Leave blank for none"></textarea></div>
         <div class="sheet-buttons"><button data-a="cancel">Cancel</button>
         <button class="primary" data-a="save">Save</button></div>`,
        (e, done) => {
          if (e.target.closest("[data-a]")?.dataset.a === "save") done(sheet.querySelector("#note").value.trim());
        });
      if (note === null) return;
    }
  } catch (e) {
    return toast(e.message, true);
  }
  run(keyword.toLowerCase(), ids, [], note || null);
}

// TASK, when it's one: its file's keywords, its own pressed.
async function chooseState(ids, task = null) {
  const kw = await pickState(`State${what(ids)}`, task?.keywords ?? keywords, task?.done_keywords ?? doneKeywords,
                             task?.keyword_keys ?? keywordKeys, task?.keyword);
  if (task && kw === (task.keyword ?? "")) return;
  if (kw) setState(ids, kw);
  else if (kw === "") run("nokeyword", ids);
}

async function choosePriority(ids, current) {
  const p = await pickPriority(`Priority${what(ids)}`, current);
  if (p && p !== current) run("pri", ids, [p]);
}

// A tab of the page's own: TAB (a saved one, by its link) to rename, move or
// remove; else the view shown, saved as one, labelled.  The config's tabs
// are changed in config.toml.
async function tabSheet(tab = null) {
  const query = listQuery ?? "", shown = query === "" ? defaultView : query;
  tab ??= [...tabs.querySelectorAll("a")].find(a => a.dataset.query === shown) ?? null;
  if (tab && !tab.classList.contains("saved")) return toast(`${tab.textContent} is from config.toml: change it there`);
  const change = async body => {
    try {
      drawTabs((await post("/api/tabs", body)).tabs);
      return true;
    } catch (e) {
      toast(e.message, true);
      return false;
    }
  };
  if (!tab) {
    if (!shown) return;
    const label = await askField("Save as a tab", "tab-label", `<div class="hint">${esc(shown)}</div>
       <input id="tab-label" value="${esc(shown)}" autofocus autocomplete="off" autocapitalize="off" aria-label="Its label">`);
    if (label) await change({op: "add", label, query: shown});
    return;
  }
  // ◀ ▶ move it and keep the sheet: a tab is often moved more than one place.
  for (let label = tab.textContent;;) {
    const r = await ask(
      `<div class="sheet-title">Tab: ${esc(label)}</div><div class="hint">${esc(tab.dataset.query)}</div>
       <input id="tab-label" value="${esc(label)}" autofocus autocomplete="off" autocapitalize="off" aria-label="Its label">
       <div class="sheet-buttons"><button data-a="move" data-step="-1" aria-label="Move left">◀</button>
        <button data-a="move" data-step="1" aria-label="Move right">▶</button>
        <button data-a="remove" class="danger">Remove</button><button data-a="cancel">Cancel</button>
        <button class="primary" data-a="save">Rename</button></div>`,
      (e, done) => {
        const b = e.target.closest("[data-a=move], [data-a=remove], [data-a=save]");
        if (b) done({a: b.dataset.a, step: Number(b.dataset.step), to: sheet.querySelector("#tab-label").value.trim()});
      });
    if (!r) return;
    if (r.a === "move") {
      if (!await change({op: "move", label, step: r.step})) return;
      tab = [...tabs.querySelectorAll("a.saved")].find(a => a.textContent === label);
      continue;
    }
    if (r.a === "remove") return change({op: "remove", label});
    if (r.to !== label) await change({op: "rename", label, to: r.to});
    return;
  }
}

// help in the box: the CLI's own text (the summary, or a topic), as in a
// terminal; ? is the keys'.
function showHelp(text, topic) {
  ask(`<div class="sheet-title">${topic ? `help ${esc(topic)}` : "orgwarrior: the box's commands"}</div>
    <div class="hint">In the box, leave out "orgwarrior": <kbd>8a done</kbd>, <kbd>add Buy milk s:fri</kbd>.${
      topic ? "" : ` <kbd>help TOPIC</kbd> for one in full: help dates, help refile…`}</div>
    <pre class="help">${esc(text)}</pre>
    <div class="sheet-buttons"><button data-a="cancel" autofocus>Close</button></div>`, () => {});
  sheet.querySelector(".sheet-body").scrollTop = 0;  // focusing Close scrolled it to the end
}

// A new title, for the keys' r (the task page renames in place).
async function chooseRename(id, task) {
  const title = await askField("Rename", "rn-title",
    `<input id="rn-title" value="${esc(task.title)}" autofocus autocapitalize="sentences" autocomplete="off">`,
    "Rename", "A title, please");
  if (title && title !== task.title) run("rename", [id], [title]);
}

// The query box runs what the orgwarrior command takes, parsed by the
// server as the CLI parses it: a view or a task to go to, else done here.
// False on a mistake, so the line stays to be fixed.
async function runLine(line) {
  let r;
  try {
    r = await post("/api/run", {line});
  } catch (e) {
    toast(e.message, true);
    return false;
  }
  if ("help" in r) {
    q.value = listQuery ?? "";
    showHelp(r.help, r.topic);
  } else if ("view" in r) location.hash = `#/v/${encodeURIComponent(r.view)}`;
  else if (r.task) location.hash = `#/t/${encodeURIComponent(r.task)}`;
  else {
    q.value = listQuery ?? "";
    if (r.confirm) confirmThen(r.confirm, r.ids);
    else if (r.added) {
      added(r.added.id, addedTitle(r.added.heading));
      route(true);
    } else {
      const already = r.done.filter(x => x.already).length;
      toast(already ? `${plural(already, "task")} already there` : "Done");
      settle(r.verb, r.done);
    }
  }
  return true;
}

// A note on its own, org's "Note taken on"; several tasks get the same one.
async function chooseNote(ids) {
  const text = await askField(`Note${what(ids)}`, "note",
    `<div class="org-edit">${ORG_TOOLS}<textarea class="org" id="note" rows="4" autofocus autocapitalize="sentences"></textarea></div>`,
    "Save", "Type the note first");
  if (text) run("note", ids, [], text);
}

// One task: the fields start as its timestamp and are sent whole (<...>), so
// what's shown is what's saved, an emptied repeat included.  Several: plain
// words, and each keeps its own repeater unless one is typed.
async function chooseDate(ids, verb, task = null) {
  const stamp = task?.[verb === "sched" ? "scheduled" : "deadline"];
  const date = await pickDate(`${verb === "sched" ? "Schedule" : "Deadline"}${what(ids)}`, verb,
                              stamp ? parseStamp(stamp) : {}, task ? "" : "Repeaters already there stay, unless you type one.");
  if (date) run(verb, ids, [date.date ? (task ? `<${date.date}>` : date.date) : date]);
}

// One task: its own tags start on and save as the difference.  Several: cycle mode.
async function chooseTags(ids, current = null, inherited = []) {
  const tags = await orToast(fetchTags());
  if (!tags) return;
  const single = current !== null;
  const st = await pickTags(`Tags${what(ids)}`, tags, single ? "set" : "cycle", current || [], inherited);
  if (!st) return;
  const args = single ? tagArgs(st, current) : [...st].map(([t, s]) => s + t);
  if (args.length) run("tag", ids, args);
}

// The usual target ([refile] usual) first, marked, so Enter or one tap takes
// it; then the headings; the files' top levels last.
async function chooseRefile(ids) {
  const found = await orToast(api(`/api/refile-targets?ids=${ids.map(encodeURIComponent).join(",")}`));
  if (!found) return;
  let {targets, usual} = found;
  const top = t => !t.includes(" › ");
  targets = [...(usual ? [usual] : []), ...targets.filter(t => t !== usual && !top(t)), ...targets.filter(t => t !== usual && top(t))];
  const pending = ask(
    `<div class="sheet-title">Refile${what(ids)} to</div>
     <input id="rf-filter" type="search" placeholder="${usual ? "Filter, or Enter for the usual" : "Filter, or Enter for the first"}" autocapitalize="off" spellcheck="false" data-kbfocus>
     <div class="list">${targets.map(t => `<button data-t="${esc(t)}"${t === usual ? ` class="usual"` : ""}>${esc(placeLabel(t))}${
       t === usual ? ` <span class="usual-tag">usual</span>` : ""}</button>`).join("")}
     <button data-new class="new-heading">+ New heading…</button></div>`,
    (e, done) => {
      if (e.target.closest("[data-new]")) return done({new: true});
      const b = e.target.closest("[data-t]");
      if (b) done(b.dataset.t);
    });
  sheet.oninput = e => { if (e.target.id === "rf-filter") filterTargets(e.target); };
  filterTargets(sheet.querySelector("#rf-filter"));
  const target = await pending;
  if (target?.new) return newHeading(ids);
  if (target) run("refile", ids, [target]);
}

// A heading to refile into that isn't there yet (a project, say), made and
// refiled into at once.  Where it can go: the top of each file in
// org-refile-targets, or under a target; config's [refile] new_in first.
async function newHeading(ids) {
  const found = await orToast(api(`/api/refile-places?ids=${ids.map(encodeURIComponent).join(",")}`));
  if (!found) return;
  const {places, new_in: newIn} = found;
  if (!places.length) return toast("Nowhere to put it: org-refile-targets names no file", true);
  const chosen = places.find(p => p === newIn) ?? places.find(p => newIn && p.includes(newIn)) ?? places[0];
  const pending = ask(
    `<div class="sheet-title">New heading for${what(ids) || " this task"}</div>
     <input id="nh-title" enterkeyhint="done" autocomplete="off" placeholder="Title" autofocus>
     <div class="field-label">In</div>
     <select id="nh-place">${places.map(p => `<option${p === chosen ? " selected" : ""}>${esc(p)}</option>`).join("")}</select>
     <div class="sheet-buttons"><button data-a="cancel">Cancel</button>
     <button class="primary" data-a="save">Refile into it</button></div>`,
    (e, done) => {
      if (e.target.closest("[data-a]")?.dataset.a !== "save") return;
      const title = sheet.querySelector("#nh-title").value.trim();
      if (!title) return sheet.querySelector("#nh-title").focus();
      done({title, place: sheet.querySelector("#nh-place").value});
    });
  sheet.querySelector("#nh-title").onkeydown = e => {
    if (e.key === "Enter") { e.preventDefault(); sheet.querySelector("[data-a=save]").click(); }
  };
  const answer = await pending;
  if (answer) run("refile", ids, [answer.place], null, answer.title);
}

// Reorder: the rows get ▲▼ and stop opening; moves show at once and are
// written together by Save, one write however many taps.  Cancel redraws.
function reorderClick(e, kids) {
  const b = e.target.closest("button");
  const order = kids.querySelector(".order");
  if (b.matches("[data-reorder]")) {
    kids.classList.add("reordering");
    kids.querySelector(".rows").classList.remove("clipped");  // every row, to move among
    kids.querySelector("[data-more]")?.remove();
    b.hidden = true;
    for (const row of kids.querySelectorAll(".rows > .task")) {
      const r = document.createElement("div");
      r.className = "task static";
      r.dataset.rid = row.dataset.id;
      r.innerHTML = `${row.innerHTML}<span class="moves"><button data-mv="-1" aria-label="Up">▲</button>` +
        `<button data-mv="1" aria-label="Down">▼</button></span>`;
      row.replaceWith(r);
    }
    kids.insertAdjacentHTML("beforeend", `<div class="sheet-buttons"><button data-a="cancel">Cancel</button>` +
      `<button class="primary" data-a="save">Save</button></div>`);
    return;
  }
  if (b.dataset.mv) {
    const row = b.closest("[data-rid]");
    const other = b.dataset.mv === "-1" ? row.previousElementSibling : row.nextElementSibling;
    if (other) b.dataset.mv === "-1" ? other.before(row) : other.after(row);
    order.value = [...kids.querySelectorAll("[data-rid]")].map(r => r.dataset.rid).join(" ");
    return;
  }
  pageForm = listForm = null;
  kids.classList.remove("reordering");  // so the redraw isn't skipped
  if (b.dataset.a === "save") return saveOrder(JSON.parse(kids.dataset.owner), order.value.split(" "));
  route(true);
}

async function saveOrder(owner, ids) {
  await orToast(post("/api/reorder", {...owner, ids}));
  route(true);
}

// Archive and kill name what they take, with any child headings.
async function confirmThen(verb, ids) {
  const tasks = await orToast(Promise.all(ids.map(id => api(`/api/task/${encodeURIComponent(id)}`))));
  if (!tasks) return;
  const kill = verb === "kill";
  const kids = tasks.reduce((n, t) => n + t.children.length, 0);
  const ok = await ask(
    `<div class="sheet-title">${kill ? "Kill" : "Archive"} ${ids.length === 1 ? "this task" : plural(ids.length, "task")}?</div>
     <ul class="confirm">${tasks.map(t => `<li>${esc(t.lines[0].text.replace(/^\*+\s*/, ""))}</li>`).join("")}</ul>
     ${kids ? `<div class="hint">With ${plural(kids, "child heading")}.</div>` : ""}
     ${kill ? `<div class="hint">Deleted from the file, subtree and all. There's no undo.</div>` : `<div class="hint">It moves to the archive file.</div>`}
     <div class="sheet-buttons"><button data-a="cancel"${kill ? " autofocus" : ""}>${fastHint("n")}Cancel</button>
     <button class="primary ${kill ? "danger" : ""}" data-a="yes"${kill ? "" : " autofocus"}>${fastHint("y")}${kill ? "Kill" : "Archive"}</button></div>`,
    (e, done) => { if (e.target.closest("[data-a=yes]")) done(true); });
  if (ok) run(verb, ids);
}

// The long-press menu's controls: what can be decided from the row alone, in
// the task page's order: its fields, then a note and where it lives, then the
// endings, Kill last.  The bar offers the same groups as a 3×3.  Renaming and
// editing the text are on the task's page, where it can be read.
function controlsHtml(task) {
  const b = (verb, label, cls = "") => `<button data-do="${verb}"${cls ? ` class="${cls}"` : ""}>${label}</button>`;
  return `${stateChips(task)}
    <div class="actions menu-clock">${clockingOn(task) ? b("clockout", "■ Clock out") : b("clockin", "⏱ Clock in")}</div>
    <div class="actions menu-fields">${b("pri", "Priority")}${b("sched", "Schedule")}${b("due", "Deadline")}${b("tags", "Tags")}</div>
    <div class="actions">${b("note", "Note")}${b("move", "Move…")}${b("refile", "Refile")}</div>
    <div class="actions">${b("select", "Select…")}${b("archive", "Archive")}${b("kill", "Kill", "danger")}</div>`;
}

function doControl(b, ids, task) {
  switch (b.dataset.do) {
    case "state": return b.dataset.kw === (task?.keyword ?? "") ? null
      : b.dataset.kw ? setState(ids, b.dataset.kw) : run("nokeyword", ids);
    case "states": return chooseState(ids, task);
    case "pri": return choosePriority(ids, task ? task.priority : undefined);
    case "note": return chooseNote(ids);
    case "sched": case "due": return chooseDate(ids, b.dataset.do, task);
    case "edit": return location.hash = `#/e/${encodeURIComponent(ids[0])}`;
    case "read": return location.hash = `#/r/${encodeURIComponent(ids[0])}`;
    case "check": return check(ids[0], b);
    case "tags": return chooseTags(ids, task ? task.tags : null, task ? task.inherited : []);
    case "refile": return chooseRefile(ids);
    case "move": return chooseMove(ids[0]);
    case "archive": case "kill": return confirmThen(b.dataset.do, ids);
    case "select": return enterSelection(ids[0]);
    case "open": return location.hash = `#/t/${encodeURIComponent(ids[0])}`;
    case "noteedit": return editNote(task, Number(b.dataset.n));
    case "effort": case "props": case "propedit": case "propnew":
      if (ids.length > 1 || !task) return toast("One task at a time", true);
      if (b.dataset.do === "effort") return chooseEffort(task);
      if (b.dataset.do === "props") return chooseProps(task);
      return b.dataset.do === "propnew" ? newProp(task) : editProp(task, b.dataset.name);
    case "notes": return ids.length > 1 ? toast("One task at a time", true) : chooseHistory(task);
    case "outline": return ids.length > 1 ? toast("One task at a time", true) : zoomTo(task.file, task.id);
    case "clockin": case "clockout": case "clockedit": case "clocks":
      if (ids.length > 1) return toast("One task at a time", true);
      // Out now; a clock past STALE asks when instead (now is wrong).
      if (b.dataset.do === "clockout") {
        const c = clockingOn(task) ?? {id: ids[0], minutes: 0};
        return c.start && runMinutes(c) >= STALE ? chooseClockOut(c) : clockOut(c);
      }
      if (b.dataset.do === "clockedit") return editClock(task, Number(b.dataset.n));
      return b.dataset.do === "clocks" ? chooseClock(task) : clockIn(task ?? {id: ids[0], title: ""});
  }
}

// ---- Moving in the outline: org's M-up/down, M-S-left/right ----

// One sheet for every move, from the task's page (Move) and a row's menu
// (Move…); the keys move at once (J K H L).  Each button acts at once and
// the sheet stays, saying where the task is now, so it can travel several
// steps; on a file's tree the row moves in view behind it.  A button that
// can't act (Out at the top level, Up for the first) is disabled.
const moveButtons = task => {
  const parent = task.parents.at(-1)?.title;
  // ON: the heading it's named for (null: the button can't act).
  const b = (verb, on, label, off) => `<button data-mv="${verb}"${on ? "" : " disabled"}>${on ? `${label} ${esc(on)}` : off}</button>`;
  return `<div class="hint">${parent ? `Now under <b>${esc(parent)}</b>` : "Now at the top level"}</div>
    <div class="move-list">${b("up", task.prev, "▲ Above", "▲ Up")}${b("down", task.next, "▼ Below", "▼ Down")}${
      b("promote", parent, "◀ Out of", "◀ Out")}${b("demote", task.prev, "▶ Into", "▶ In")}</div>`;
};

async function chooseMove(id) {
  let task = await orToast(api(`/api/task/${encodeURIComponent(id)}`)), busy = false;
  if (!task) return;
  await ask(
    `<div class="sheet-title">Move: ${esc(task.title)}</div><div class="move-body">${moveButtons(task)}</div>
     <div class="sheet-buttons"><button data-a="cancel">Done</button></div>`,
    async e => {
      const b = e.target.closest("[data-mv]");
      if (!b || busy) return;
      busy = true;
      try {
        const results = await post("/api/act", {ids: [task.id], verb: b.dataset.mv, args: []});
        justMoved = task.id;
        task = await api(`/api/task/${encodeURIComponent(task.id)}`);
        // In a file's tree, its parents unfolded: it stays in view.
        if (inFile()) {
          for (const p of task.parents) if (p.id) folds.add(p.id);
          keepFolds();
        }
        sheet.querySelector(".move-body").innerHTML = moveButtons(task);
        (sheet.querySelector(`[data-mv="${b.dataset.mv}"]:not([disabled])`) ?? sheet.querySelector("[data-mv]:not([disabled])"))?.focus();
        settle(b.dataset.mv, results);
      } catch (err) {
        toast(err.message, true);
      } finally {
        busy = false;
      }
    });
}

// ---- Long press: the same controls in a sheet ----

async function openMenu(id) {
  const task = await orToast(api(`/api/task/${encodeURIComponent(id)}`));
  if (!task) return;
  const b = await ask(
    `<div class="sheet-title menu-head"><span>${titleHtml(task.lines[0])}</span><button data-do="open">Open ›</button></div>
     ${controlsHtml(task)}`,
    (e, done) => { const b = e.target.closest("[data-do]"); if (b) done(b); });
  if (b) doControl(b, [task.id], task);
}

// ---- Marks ----

// As org's agenda and dired have them: a flag on rows, apart from the cursor,
// with no mode of their own.  While there are any (SELECTING), actions (the
// bar's, the keys') go to them, and a tap on a row marks or unmarks it (the
// way in on a phone: the menu's Select…).  Keys in keys.js; Ctrl-click
// toggles a row, Shift-click marks the rows up to it.
const selectBar = document.getElementById("selectbar");
const selected = new Set();
let selecting = false;

function enterSelection(firstId) {
  selected.clear();
  setMarked(firstId, true);
}

function leaveSelection() {
  markFrom = null;
  selecting = false;
  selected.clear();
  selectBar.hidden = true;
  for (const row of document.querySelectorAll(".task.picked")) row.classList.remove("picked");
}

const toggleSelected = id => setMarked(id, !selected.has(id));

function setMarked(id, on) {
  if (on) selected.add(id); else selected.delete(id);
  for (const row of document.querySelectorAll(`.task[data-id="${CSS.escape(id)}"]`))
    row.classList.toggle("picked", selected.has(id));
  selecting = selected.size > 0;
  if (!selecting) return leaveSelection();
  selectBar.hidden = false;
  selectBar.querySelector(".count").textContent = `${selected.size} marked`;
  // What's selected, by name: shown where there's room (side by side).
  selectBar.querySelector(".names").innerHTML = [...selected].map(id => {
    const title = list.querySelector(`.task[data-id="${CSS.escape(id)}"] .title`)?.cloneNode(true);
    title?.querySelectorAll(".tag").forEach(t => t.remove());
    return `<li>${esc(title?.textContent.trim() || id)}</li>`;
  }).join("");
}

selectBar.addEventListener("click", e => {
  const b = e.target.closest("[data-do]");
  if (b) return doControl(b, [...selected], null);
  if (e.target.closest("[data-a=cancel]")) leaveSelection();
});

// ---- Clocking: org's I and O ----

// The clocks running (/api/clock: the open CLOCK lines in the files, usually
// one), each with "today", its task's minutes clocked earlier today.  The
// header's strip shows the newest; its minutes, the server's, count on from
// when they were read (CLOCKREAD): never from its start, a time in the
// server's zone, which the browser's may not be (LibreWolf says UTC).
let running = [], clockRead = 0;
const clockStrip = document.getElementById("clock");
const STALE = 240;  // orgwarrior's: a clock running this long was likely forgotten
const hm = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
// "2026-10-20 14:05", the engine's: for days and differences only.
const clockDate = s => new Date(...s.split(/[- :]/).map((v, i) => Number(v) - (i === 1 ? 1 : 0)));
const runMinutes = c => c.minutes + Math.floor((Date.now() - clockRead) / 60000);
const shownClock = () => running.at(-1) ?? null;
const clockingOn = task => task && running.find(c => sameId(c.id, task.id)) || null;
const dayLabel = s => clockDate(s).toLocaleDateString(undefined, {weekday: "short", month: "short", day: "numeric"});

async function refreshClock() {
  if (document.body.dataset.mode) return;  // the capture page, signing in
  try {
    running = await api("/api/clock");
    clockRead = Date.now();
  } catch {
    return;  // the page's own requests say what's wrong
  }
  drawClock();
}

function drawClock() {
  const c = shownClock();
  clockStrip.hidden = !c;
  if (c) {
    const m = runMinutes(c), stale = m >= STALE;
    clockStrip.classList.toggle("stale", stale);
    clockStrip.querySelector(".clock-task").textContent = `⏱ ${c.title}`;
    clockStrip.href = `#/t/${encodeURIComponent(c.id)}`;
    clockStrip.querySelector(".clock-time").textContent = [c.effort_minutes == null ? hm(m) : `${hm(m)} / ${hm(c.effort_minutes)}`,
      c.today ? `${hm(c.today + m)} today` : "",
      stale ? "still on it?" : "", running.length > 1 ? `+${running.length - 1}` : ""].filter(Boolean).join(" · ");
  }
  markClocking();
  const b = currentTask && detail.querySelector(".clocked-total + button");
  if (b && b.dataset.do !== (clockingOn(currentTask) ? "clockout" : "clockin")) b.outerHTML = clockButton(currentTask);
}
// Its time ticks on the page; what's running is read again with each refresh.
setInterval(() => { if (running.length && document.visibilityState === "visible") drawClock(); }, 20000);

// A row clocking says so, on its second line (an outline's row: its title).
function markClocking() {
  for (const b of document.querySelectorAll(".clock-badge")) b.remove();
  for (const c of running)
    for (const row of document.querySelectorAll(".task[data-id]")) {
      if (!sameId(row.dataset.id, c.id)) continue;
      const badge = `<span class="clock-badge">⏱ ${hm(runMinutes(c))}</span>`;
      const id = row.querySelector(".meta .id");
      if (id) id.insertAdjacentHTML("beforebegin", badge);
      else row.querySelector(".title")?.insertAdjacentHTML("beforeend", badge);
    }
}

// TASK: {id, title}.  TIME: as orgwarrior takes it ("-15m", "14:30"); none, now.
// Done now, the toast offers Adjust: the time, set after.
async function clockIn(task, time = null) {
  const r = await orToast(post("/api/clock", {op: "in", id: task.id, time}));
  if (!r) return;
  const stopped = r.closed.length ? ` · ${r.closed.map(c => c.title).join(", ")} stopped` : "";
  toast(`Clocked in at ${r.clock.start.slice(11)}${stopped}`, false, null,
        time ? null : {label: "Adjust", run: () => adjustClock("start", r.clock)});
  route(true);
}

// C: a running clock ({id}, its task's).
async function clockOut(c, time = null) {
  const r = await orToast(post("/api/clock", {op: "out", id: c.id, time}));
  if (!r) return;
  toast(r.removed ? "Clocked out · 0:00, so org removed it" : `Clocked out at ${r.end.slice(11)} · ${hm(r.minutes)}`,
        false, null, time || r.removed ? null : {label: "Adjust", run: () => adjustClock("end", r)});
  route(true);
}

// When a clock starts or stops: now, a while ago, a while on (LATER: an
// end, fudged forward; a start can't be later than now), or a time typed.
// Each choice acts at once; the time field has Set.  {time} ("" for now),
// {discard}, {open}, or null.  STALE: the time field first, from the keys.
function pickClockTime(title, {hint = "", now = true, later = false, discard = false, open = false, stale = false} = {}) {
  const choice = t => `<button data-ct="${t}">${t.replace("-", "−")}</button>`;
  const pending = ask(
    `<div class="sheet-title">${esc(title)}</div>${hint ? `<div class="hint">${esc(hint)}</div>` : ""}
     <div class="chips">${["-15m", "-10m", "-5m"].map(choice).join("")}${
       now ? `<button data-ct=""${stale ? "" : " data-kbfocus"}>Now</button>` : ""}${
       later ? ["+5m", "+10m", "+15m"].map(choice).join("") : ""}</div>
     <div class="date-row"><label class="field"><span>At</span><input id="ct-at" type="time"${stale ? " data-kbfocus" : ""}></label></div>
     <div class="sheet-buttons">${discard ? `<button data-a="discard" class="danger" ${fastKey("x")}>${fastHint("x")}Discard</button>` : ""}${
       open ? `<button data-a="open">Open</button>` : ""}<button data-a="cancel">Cancel</button>
     <button class="primary" data-a="at">Set</button></div>`,
    (e, done) => {
      const b = e.target.closest("[data-ct], [data-a]");
      if (!b) return;
      if (b.dataset.ct !== undefined) return done({time: b.dataset.ct});
      if (b.dataset.a === "at") {
        const v = sheet.querySelector("#ct-at").value;
        return v ? done({time: v}) : toast("Pick a time, or a choice above", true);
      }
      if (b.dataset.a === "discard" || b.dataset.a === "open") done({[b.dataset.a]: true});
    });
  sheet.querySelector("#ct-at").onkeydown = e => {
    if (e.key === "Enter") e.preventDefault(), sheet.querySelector("[data-a=at]").click();
  };
  return pending;
}

// I: clocking in, the time asked first.
async function chooseClockIn(task) {
  const c = shownClock(), other = c && !sameId(c.id, task.id);
  const r = await pickClockTime(`Clock in · ${task.title}`,
                                {hint: other ? `Stops ${c.title} (${hm(runMinutes(c))})` : ""});
  if (r) clockIn(task, r.time || null);
}

// O, or ■ on a forgotten clock: clocking out, the time asked first.
async function chooseClockOut(c = shownClock()) {
  if (!c) return toast("No clock running");
  const m = runMinutes(c);
  const r = await pickClockTime(`Clock out · ${c.title}`, {hint: `Started ${c.start.slice(11)} · ${hm(m)}`,
                                                           later: true, discard: true, open: true, stale: m >= STALE});
  if (!r) return;
  if (r.open) return location.hash = `#/t/${encodeURIComponent(c.id)}`;
  if (r.discard) {
    if (await yesNo("Discard this clock?", `${c.title}, since ${c.start.slice(11)}: its line is removed.`, "Discard")
        && await orToast(post("/api/clock", {op: "cancel", id: c.id}))) toast("Clock discarded"), route(true);
    return;
  }
  clockOut(c, r.time || null);
}

// The toast's Adjust: the start of the clock just started, or the end of the
// one just stopped (its task's newest, clock 1).
async function adjustClock(which, c) {
  const r = await pickClockTime(`${which === "start" ? "Started" : "Stopped"} · ${c.title}`,
                                {now: false, later: which === "end"});
  if (!r?.time) return;
  if (await orToast(post("/api/clock-edit", {id: c.id, n: 1, [which]: r.time}))) toast("Saved"), route(true);
}

// A question, no on the left, yes on the right (y and n in a sheet, keys.js).
const yesNo = (title, hint, yes) => ask(
  `<div class="sheet-title">${esc(title)}</div><div class="hint">${esc(hint)}</div>
   <div class="sheet-buttons"><button data-a="cancel" autofocus>${fastHint("n")}Cancel</button>
   <button class="primary danger" data-a="yes">${fastHint("y")}${esc(yes)}</button></div>`,
  (e, done) => { if (e.target.closest("[data-a=yes]")) done(true); });

// A clock as a line: "14:05–14:47", an end on another day with its day.
const clockSpan = c => `${c.start.slice(11)}–${!c.end ? "" : c.end.slice(0, 10) === c.start.slice(0, 10)
  ? c.end.slice(11) : `${dayLabel(c.end)} ${c.end.slice(11)}`}`;

// l: the task's clocks, one picked to change.
async function chooseClock(task) {
  if (!task.clocks.length) return toast("No clocks on it yet: i clocks in");
  const n = await ask(
    `<div class="sheet-title">Clocks · ${esc(task.title)}</div>
     <div class="list">${task.clocks.map(c => `<button data-n="${c.n}"><span>${esc(dayLabel(c.start))} · ${
       esc(clockSpan(c))}</span> <span class="muted">${c.end ? "" : "running "}${hm(c.minutes)}</span></button>`).join("")}</div>
     <div class="sheet-buttons"><button data-a="cancel">Close</button></div>`,
    (e, done) => { const b = e.target.closest("[data-n]"); if (b) done(Number(b.dataset.n)); });
  if (n) editClock(task, n);
}

// One clock's start and end, as the date folds have them: the browser's own
// pickers.  Its line goes along, so a clock changed underneath is refused.
async function editClock(task, n) {
  const c = task.clocks.find(x => x.n === n);
  if (!c) return;
  const field = (label, input) => `<label class="field"><span>${label}</span>${input}</label>`;
  const row = (label, id, stamp) => `<div class="date-row">${field(label, `<input id="${id}-d" type="date" value="${stamp.slice(0, 10)}">`)}${
    field("Time", timeInput(`${id}-t`, stamp.slice(11)))}</div>`;
  const value = id => {
    const [d, t] = [`#${id}-d`, `#${id}-t`].map(s => sheet.querySelector(s)?.value);
    return d && t ? `${d} ${t}` : null;
  };
  const pending = ask(
    `<div class="sheet-title">Clock · ${esc(task.title)}</div>
     ${row("Start", "ce-s", c.start)}
     ${c.end ? row("End", "ce-e", c.end) : `<div class="hint">Running: clocking out ends it.</div>`}
     <div class="hint clock-length">${hm(c.minutes)}</div>
     <div class="sheet-buttons"><button data-a="delete" class="danger" ${fastKey("d")}>${fastHint("d")}Delete</button>
     <button data-a="cancel">Cancel</button><button class="primary" data-a="save" data-kbfocus>Save</button></div>`,
    (e, done) => {
      const b = e.target.closest("[data-a=delete], [data-a=save]");
      if (!b) return;
      if (b.dataset.a === "delete") return done({remove: true});
      const start = value("ce-s"), end = c.end ? value("ce-e") : null;
      if (!start || (c.end && !end)) return toast("A date and a time, please", true);
      done({start, end});
    });
  // How long, as the fields say.
  sheet.oninput = () => {
    const start = value("ce-s"), end = c.end ? value("ce-e") : null;
    const m = start && end ? Math.round((clockDate(end) - clockDate(start)) / 60000) : null;
    sheet.querySelector(".clock-length").textContent = m === null ? "" : m < 0 ? "It ends before it starts" : hm(m);
  };
  const r = await pending;
  if (!r || (r.remove && !await yesNo("Delete this clock?", `${dayLabel(c.start)} · ${clockSpan(c)}`, "Delete"))) return;
  const body = r.remove ? {remove: true} : {start: r.start, ...(r.end ? {end: r.end} : {})};
  if (await orToast(post("/api/clock-edit", {id: task.id, n, old: c.text, ...body}))) {
    toast(r.remove ? "Clock deleted" : "Saved");
    pageForm = null;
    route(true);
  }
}

// ---- History: notes and the rest of the log, each changed or deleted ----

// What a log item says, for its line: a state change's keyword (from the
// one before), else its first line without its time ("Rescheduled from
// [2026-10-19 Mon]"); a plain note nothing, its text says it.
function historyLabel(h, done = doneKeywords) {
  if (h.kind === "state" && h.state)
    return `<span class="kw" style="${styleFor(done.includes(h.state) ? "done" : "todo", h.state)}">${esc(h.state)}</span>${
      h.from ? `<span class="from">from ${esc(h.from)}</span>` : ""}`;
  if (h.kind === "note") return "";
  const label = h.kind === "done" ? "Closed" : h.heading.replace(h.time ?? "", "").replace(/\s+on\s*$/, "").replace(/"/g, "").trim();
  return `<span class="what">${esc(label)}</span>`;
}
const historyTime = h => (h.time || "").replace(/^[[<]|[\]>]$/g, "");

// Z: the task's history, one picked to change.
async function chooseHistory(task) {
  if (!task.history.length) return toast("No notes or history on it yet: z adds a note");
  const n = await ask(
    `<div class="sheet-title">History · ${esc(task.title)}</div>
     <div class="list">${task.history.map(h => `<button data-n="${h.n}">${historyLabel(h, task.done_keywords)} <span class="muted">${
       esc(historyTime(h))}</span>${h.text ? ` ${esc(h.text.split("\n")[0])}` : ""}</button>`).join("")}</div>
     <div class="sheet-buttons"><button data-a="cancel">Close</button></div>`,
    (e, done) => { const b = e.target.closest("[data-n]"); if (b) done(Number(b.dataset.n)); });
  if (n) editNote(task, n);
}

// One log item's text, raw, with the text tools; its first line stays as
// org wrote it.  From the keys, the text has the focus, its caret at the end
// (Esc once: the buttons' keys); not on touch, which would raise the keyboard
// over a sheet opened maybe to delete.  Its text as shown goes along, so a
// change underneath is refused.
async function editNote(task, n) {
  const h = task.history.find(x => x.n === n);
  if (!h) return;
  const label = historyLabel(h, task.done_keywords);
  const pending = ask(
    `<div class="sheet-title">${label ? `${label} · ` : "Note · "}${esc(historyTime(h))}</div>
     <div class="org-edit">${ORG_TOOLS}<textarea class="org" id="ne-text" rows="4" autocapitalize="sentences" data-kbfocus
       placeholder="${h.kind === "note" ? "" : "No note: leave blank"}">${textareaText(h.text)}</textarea></div>
     <div class="sheet-buttons"><button data-a="delete" class="danger" ${fastKey("d")}>${fastHint("d")}Delete</button>
     <button data-a="cancel">Cancel</button><button class="primary" data-a="save">Save</button></div>`,
    (e, done) => {
      const b = e.target.closest("[data-a=delete], [data-a=save]");
      if (b) done(b.dataset.a === "delete" ? {remove: true} : {text: sheet.querySelector("#ne-text").value});
    });
  const r = await pending;
  if (!r || (r.remove && !await yesNo(`Delete this ${h.kind === "note" ? "note" : "entry"}?`,
                                      h.text ? h.text.split("\n")[0] : h.heading, "Delete"))) return;
  if (!r.remove && r.text.trim() === h.text.trim()) return;
  if (await orToast(post("/api/note-edit", {id: task.id, n, old: h.raw, ...(r.remove ? {remove: true} : {text: r.text})}))) {
    toast(r.remove ? "Deleted" : "Saved");
    pageForm = null;
    route(true);
  }
}

// ---- Properties: any of them (C), Effort its own (E) ----

const EFFORTS = ["0:15", "0:30", "0:45", "1:00", "1:30", "2:00", "3:00", "4:00"];

// The estimate: ALLOWED (Effort_ALL's) where it's set, else common ones,
// each acting at once; another typed, with Set; Clear (SPC) "none".  The
// value, or null.  The task page's E and the card's.
function pickEffort(title, current, allowed = null) {
  const choices = allowed ?? EFFORTS;
  const pending = ask(
    `<div class="sheet-title">${title}</div>
     <div class="chips">${choices.map(v => `<button data-v="${esc(v)}" aria-pressed="${v === current}">${esc(v)}</button>`).join("")}</div>
     ${allowed ? "" : `<div class="date-row"><label class="field"><span>Other</span><input id="ef-other" placeholder="1:15, 2h"
       autocomplete="off" autocapitalize="off" value="${esc(current && !choices.includes(current) ? current : "")}"></label></div>`}
     <div class="sheet-buttons">${current ? `<button data-a="clear" ${fastKey(" ")}>${fastHint(" ")}Clear</button>` : ""}
     <button data-a="cancel">Cancel</button>${allowed ? "" : `<button class="primary" data-a="set">Set</button>`}</div>`,
    (e, done) => {
      const b = e.target.closest("[data-v], [data-a=clear], [data-a=set]");
      if (!b) return;
      if (b.dataset.v) return done(b.dataset.v);
      if (b.dataset.a === "clear") return done("none");
      const v = sheet.querySelector("#ef-other").value.trim();
      return v ? done(v) : toast("A duration, or a choice above", true);
    });
  sheet.querySelector("#ef-other")?.addEventListener("keydown", e => {
    if (e.key === "Enter") e.preventDefault(), sheet.querySelector("[data-a=set]").click();
  });
  return pending;
}

async function chooseEffort(task) {
  const found = await orToast(api(`/api/props?id=${encodeURIComponent(task.id)}&name=Effort`));
  if (!found) return;
  const r = await pickEffort(`Effort · ${esc(task.title)}`, task.effort, found.values);
  if (r && r !== task.effort) run("effort", [task.id], [r]);
}

// C: the task's properties, one picked to change, or a new one.
async function chooseProps(task) {
  const r = await ask(
    `<div class="sheet-title">Properties · ${esc(task.title)}</div>
     <div class="list">${task.properties.filter(p => p.name !== "Effort").map(p => `<button data-name="${esc(p.name)}">${esc(p.name)} <span class="muted">${
       esc(p.value)}</span></button>`).join("")}<button data-new class="new-heading">+ Property…</button></div>
     <div class="sheet-buttons"><button data-a="cancel">Close</button></div>`,
    (e, done) => { const b = e.target.closest("[data-name], [data-new]"); if (b) done(b.dataset.name ?? true); });
  if (r === true) newProp(task);
  else if (r) editProp(task, r);
}

// One property's value: its allowed values (NAME_ALL) as choices acting at
// once, else typed; Delete (d) removes it.
async function editProp(task, name) {
  const current = task.properties.find(p => p.name === name)?.value ?? "";
  const found = await orToast(api(`/api/props?id=${encodeURIComponent(task.id)}&name=${encodeURIComponent(name)}`));
  if (!found) return;
  const pending = ask(
    `<div class="sheet-title">${esc(name)} · ${esc(task.title)}</div>
     ${found.values ? `<div class="chips">${found.values.map(v => `<button data-v="${esc(v)}" aria-pressed="${v === current}">${esc(v)}</button>`).join("")}</div>` : ""}
     <input id="pr-value" value="${esc(current)}" aria-label="Value" autocomplete="off" autocapitalize="off" data-kbfocus>
     <div class="sheet-buttons"><button data-a="delete" class="danger" ${fastKey("d")}>${fastHint("d")}Delete</button>
     <button data-a="cancel">Cancel</button><button class="primary" data-a="save">Save</button></div>`,
    (e, done) => {
      const b = e.target.closest("[data-v], [data-a=delete], [data-a=save]");
      if (!b) return;
      if (b.dataset.v) return done({value: b.dataset.v});
      if (b.dataset.a === "delete") return done({remove: true});
      const v = sheet.querySelector("#pr-value").value.trim();
      return v ? done({value: v}) : toast("A value, or Delete", true);
    });
  sheet.querySelector("#pr-value").onkeydown = e => {
    if (e.key === "Enter") e.preventDefault(), sheet.querySelector("[data-a=save]").click();
  };
  const r = await pending;
  if (!r || (r.remove && !await yesNo(`Delete ${name}?`, `${name}: ${current}`, "Delete"))) return;
  if (r.remove) run("prop", [task.id], [name, "none"]);
  else if (r.value !== current) run("prop", [task.id], [name, r.value]);
}

// A property to add: its name (those in use offered), its value.
async function newProp(task) {
  const found = await orToast(api("/api/props"));
  if (!found) return;
  const r = await ask(
    `<div class="sheet-title">New property · ${esc(task.title)}</div>
     <datalist id="pr-names">${found.names.map(n => `<option value="${esc(n)}">`).join("")}</datalist>
     <div class="date-row"><label class="field"><span>Name</span><input id="pr-name" list="pr-names" autocomplete="off"
       autocapitalize="off" spellcheck="false" autofocus></label>
     <label class="field"><span>Value</span><input id="pr-new-value" autocomplete="off" autocapitalize="off"></label></div>
     <div class="sheet-buttons"><button data-a="cancel">Cancel</button><button class="primary" data-a="save">Add</button></div>`,
    (e, done) => {
      if (!e.target.closest("[data-a=save]")) return;
      const name = sheet.querySelector("#pr-name").value.trim(), value = sheet.querySelector("#pr-new-value").value.trim();
      if (!name || !value) return toast("A name and a value, please", true);
      done({name, value});
    });
  if (r) run("prop", [task.id], [r.name, r.value]);
}
