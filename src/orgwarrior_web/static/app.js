"use strict";

// The page's core: the API, the routes and history, the list and its rows.
// The rest, loaded after it: prefs.js, sheets.js, actions.js, taskpage.js,
// forms.js, draft.js, keys.js; names one of them gives are used only inside
// functions here, which run once they're all loaded.
//
// Routes live in the hash, so Android's back button walks views and tasks:
//   #/v/QUERY   a view, as `orgwarrior QUERY` (empty: the default view)
//   #/t/ID      one task
//   #/e/ID      its text below the heading, to edit
//   #/r/ID      its text alone, to read, full screen
//   #/add       the add page
// A view is drawn in the list pane, the rest in the detail pane.  Narrow, one
// shows at a time (CSS, by body[data-page]); from 1000 px both, side by side.
const main = document.getElementById("main");
const list = document.getElementById("list");
const detail = document.getElementById("detail");
const wide = matchMedia("(min-width: 1000px)");
const tabs = document.getElementById("tabs");
const q = document.getElementById("q");
let colors = {}, defaultView = "today", views = [];  // views: the config's [views] names
let keywords = [], doneKeywords = [];  // the user's TODO keywords, from /api/views
let keywordKeys = [];  // their fast keys (C-c C-t's), in the same order
let priorities = [];                   // and priorities, highest first
let warningDays = 14;                  // org-deadline-warning-days: a deadline shows this far ahead
let currentTask = null;                // the task on screen, on a task page

const esc = s => s.replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));

async function api(path, init) {
  let r;
  try {
    r = await fetch(path, init);
  } catch (e) {
    throw new Error("Can't reach orgwarrior-web: is the server up, and are you on the LAN/WireGuard?");
  }
  checkVersion(r.headers.get("X-Page-Version"));
  const body = await r.json().catch(() => { throw new Error(`orgwarrior-web answered ${r.status} ${r.statusText}`); });
  if (body && body.error) throw Object.assign(new Error(body.error), {status: r.status});
  return body;
}

// The page's files changed on the server since this page loaded (an update):
// reload at route()'s next draw, so never in the middle of what was tapped
// (a menu opening, an action), and never over a sheet or a form being typed.
let pageVersion = null, outdated = false;
function checkVersion(v) {
  if (!v) return;
  pageVersion ??= v;
  outdated ||= v !== pageVersion;
}
const reloadIfOutdated = () => outdated && !dirty() && sheet.hidden && !discardDialog.open && location.reload();

// What an address shows: its page, a view's query ("" on any other page),
// a task's (or its edit page's) ID.
const pageOf = h => h === "#/add" || h.startsWith("#/add?") ? "add"
  : h.startsWith("#/e/") ? "edit" : h.startsWith("#/r/") ? "read" : h.startsWith("#/t/") ? "task" : "view";
const viewOf = h => h.startsWith("#/v/") ? decodeURIComponent(h.slice(4)) : "";
const shownId = h => /^#\/[ter]\//.test(h) ? decodeURIComponent(h.slice(4)) : null;
const listError = e => list.innerHTML = `<div class="error">${esc(e.message)}</div>`;

// The open task closed: side by side the list and it are one entry (a row
// opened replaces it), so the list takes its place; else Back.
// A task opened from another's outline (`parent` in its entry) closes back to
// that one, as you came; else, side by side, to the list it was beside.
// FOLLOW (archived, killed): side by side, the row the cursor landed on
// (landAfter) shown beside instead of the empty pane.
function closeTask(follow = false) {
  if (history.state?.parent && navigated) history.back();
  else if (pageOf(location.hash) === "task" && wide.matches && listQuery !== null) {
    revealPreview = follow && cursor !== null;
    location.replace(`#/v/${encodeURIComponent(listQuery)}`);
  } else goBack();
}

// Back within the page; opened straight on a task or the add page, there's no
// page to go back to, so go to the default view instead of leaving.
let navigated = false;
function goBack() {
  if (navigated) history.back(); else location.replace("#/v/");
}

// What a form shows (field values, pressed chips, tags on or off), to tell
// whether leaving it would drop a change.  The tag filter is no change.
const formState = root => JSON.stringify(
  [...root.querySelectorAll("input:not([type=search]), textarea, select, [aria-pressed], .tagchip")]
    .map(e => e.matches("input, textarea, select") ? e.value : e.getAttribute("aria-pressed") ?? e.className));

// True if the user chose to drop their changes.  Back or Escape keeps editing.
const discardDialog = document.getElementById("discard");
function confirmDiscard() {
  return new Promise(resolve => {
    discardDialog.returnValue = "";
    // A close event comes a moment after the close: the last question's,
    // arriving once this one is open (Esc right after n), isn't the answer.
    discardDialog.onclose = () => discardDialog.open || resolve(discardDialog.returnValue === "discard");
    discardDialog.showModal();
  });
}

// The page on screen with fields (task, add, edit), as drawn: {hash, state}.
// Null once saved.  LISTFORM: the same for a file's outline in the list,
// whose order is a field.
let pageForm = null, listForm = null;
const dirty = () => (!!pageForm && formState(detail) !== pageForm.state) ||
  (!!listForm && formState(list) !== listForm.state);
// Discarded, the change is forgotten: the page can stay drawn, hidden, and
// would otherwise ask again on the next navigation.
async function leaveOk() {
  if (!dirty()) return true;
  if (!await confirmDiscard()) return false;
  pageForm = listForm = null;
  return true;
}

// config.toml's colors arrive as ANSI SGR parameters ("1;36", "38;2;r;g;b").
function sgrStyle(sgr) {
  if (!sgr) return "";
  const p = sgr.split(";").map(Number), css = [];
  for (let i = 0; i < p.length; i++) {
    const n = p[i];
    if (n === 1) css.push("font-weight:700");
    else if (n === 2) css.push("opacity:.65");
    else if (n === 3) css.push("font-style:italic");
    else if (n === 4) css.push("text-decoration:underline");
    else if (n >= 30 && n <= 37) css.push(`color:var(--c${n - 30})`);
    else if (n >= 90 && n <= 97) css.push(`color:var(--c${n - 82})`);
    else if (n >= 40 && n <= 47) css.push(`background:var(--c${n - 40})`);
    else if (n >= 100 && n <= 107) css.push(`background:var(--c${n - 92})`);
    else if ((n === 38 || n === 48) && p[i + 1] === 2) {
      css.push(`${n === 38 ? "color" : "background"}:rgb(${p[i + 2]},${p[i + 3]},${p[i + 4]})`);
      i += 4;
    }
  }
  return css.join(";");
}
const styleFor = (role, keyword) => sgrStyle((keyword && colors[keyword]) || colors[role]);

// TEXT[from, to) as HTML, colored by SPANS ([start, end, role, keyword], offsets into TEXT).
// HABIT: a habit's graph, each day marked with its role for the CSS to color.
// LINKS (the line's, from `show`) make a "link" span a real link, for the kinds a
// browser opens.  BOX ({n, text}, the line's checkbox from `show`) makes its
// "checkbox" span a button.
function painted(text, spans, from = 0, to = text.length, {links = [], box = null, habit = false} = {}) {
  let out = "", pos = from;
  const inside = spans.filter(s => s[0] >= from && s[1] <= to).sort((a, b) => a[0] - b[0]);
  for (const [s, e, role, kw] of inside) {
    if (s < pos) continue;
    out += esc(text.slice(pos, s));
    const part = text.slice(s, e);
    const link = role === "link" && links.find(l => l.start <= s && s < l.end);
    if (role === "tag")
      out += part.split(":").filter(Boolean).map(t => `<span class="tag">${esc(t)}</span>`).join("");
    else if (link && /^(https?|mailto):/i.test(link.url))
      out += `<a href="${esc(link.url)}" target="_blank" rel="noopener" style="${styleFor(role)}">${esc(part)}</a>`;
    else if (role === "checkbox" && box)
      out += `<button class="checkbox" data-do="check" data-n="${box.n}" data-text="${esc(box.text)}"
        style="${styleFor(role)}">${esc(part)}</button>`;
    else
      out += `<span class="${role === "todo" || role === "done" ? "kw" : ""}"${
        habit ? ` data-habit="${esc(role)}"` : ""} style="${styleFor(role, kw)}">${esc(part)}</span>`;
    pos = e;
  }
  return out + esc(text.slice(pos, to));
}

// An agenda item is "category\x1ftime\x1flabel\x1fheading" (server.PREFIX).  Without
// an ID (a diary line: holidays, %%(...) entries) it's shown the same, not tappable.
// A habit's consistency graph goes under the title, as org draws it, each day
// in the page theme's colors (style.css): the Emacs theme's, which the line
// carries too, are picked for Emacs's background, not the page's.
// The time before the title; the category and ID at its right (the
// category side by side only: a phone hasn't the room); a line above it only
// for a label that says something (In 2 d., Sched. 3x, Deadline), not the
// bare "Scheduled" (org's default leader: a day's view is nearly all of them).
// An event without a time says "all day" there.
function itemRow(line) {
  const t = line.text, parts = t.split("\x1f");
  const [open, close] = line.id
    ? [`<button class="task" data-id="${esc(line.id)}"${line.read_only ? " data-ro" : ""}>`, "</button>"]
    : [`<div class="task static">`, "</div>"];
  const habit = line.habit
    ? `<div class="habit">${painted(line.habit.text, line.habit.spans, 0, undefined, {habit: true})}</div>` : "";
  if (parts.length < 4) return `${open}<div class="title">${painted(t, line.spans)}</div>${habit}${close}`;
  const start = t.length - parts[3].length;
  const [category, time, label] = [parts[0], parts[1].replace(/\.+$/, "").trim() || (line.all_day ? "all day" : ""),
                                   parts[2].replace(/:\s*$/, "")].map(s => s.trim());
  const id = line.id ? `<span class="id">${esc(line.id)}</span>` : "";
  const said = label === "Scheduled" ? "" : label;
  return `${open}${said ? `<div class="meta"><span>${esc(said)}</span></div>` : ""}` +
    `<div class="title">${id}${category ? `<span class="cat">${esc(category)}</span>` : ""}${
      time ? `<span class="time">${esc(time)}</span>` : ""}${painted(t, line.spans, start)}</div>${habit}${close}`;
}

// A child heading on its parent's page: a row like an agenda item's, so tapping,
// long-press and multi-select work the same.
// TREE, in a file's view: {depth, fold}, fold being ▸ or ▾ for a heading
// with children (tapped, it folds or unfolds them), "" for one without.
function childRow(c, tree = null) {
  const kw = c.keyword
    ? `<span class="kw" style="${styleFor(c.done ? "done" : "todo", c.keyword)}">${esc(c.keyword)}</span> ` : "";
  const tags = c.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("");
  const depth = tree ? ` style="--d:${tree.depth}"` : "";
  const [open, close] = c.id
    ? [`<button class="task${tree ? " node" : ""}" data-id="${esc(c.id)}"${depth}${c.read_only ? " data-ro" : ""}>`, "</button>"]
    : [`<div class="task static${tree ? " node" : ""}"${depth}>`, "</div>"];
  const fold = tree ? `<span class="fold-tw"${tree.fold ? ` data-tw="${esc(c.id ?? "")}" aria-label="${
    tree.fold === "▾" ? "Fold" : "Unfold"}"` : ""}>${tree.fold}</span>` : "";
  return `${open}<div class="title">${fold}${kw}${esc(c.text)}${tags}</div>${close}`;
}

// A file's view folds as org's outline does: the headings unfolded show
// their children, indented under them.  Which are unfolded is kept per
// device and file (a phone would otherwise tap them open each time).
let fileTree = [], fileShown = null, folds = new Set(), justMoved = null;
// Zoomed into a heading (h, as org's narrowing): its ID, and once drawn the
// heading as a task's page names one ({id, file, title, parents}).
let fileZoom = null, zoomTask = null;
const foldsKey = file => `orgwarrior-folds:${file}`;
function readFolds(file) {
  try { return new Set(JSON.parse(localStorage.getItem(foldsKey(file)) || "[]")); } catch (e) { return new Set(); }
}
function keepFolds() {
  try { localStorage.setItem(foldsKey(fileShown), JSON.stringify([...folds])); } catch (e) {}
}
function treeRows(nodes, depth = 0) {
  return nodes.map(n => {
    const kids = n.children?.length && n.id ? n.children : null, open = kids && folds.has(n.id);
    return childRow(n, {depth, fold: kids ? (open ? "▾" : "▸") : ""}) +
      (open ? `<div class="sub">${treeRows(kids, depth + 1)}</div>` : "");
  }).join("");
}
// Every heading with children, all the way down (Shift-TAB unfolds them all).
const foldable = nodes => nodes.flatMap(n => n.children?.length && n.id ? [n.id, ...foldable(n.children)] : []);

function toggleFold(id, open = !folds.has(id)) {
  if (open) folds.add(id); else folds.delete(id);
  keepFolds();
  drawFile();
}

// A heading's children, or a file's top level (OWNER: {parent} or {file}),
// with + Add (the add page, put there: ADD, its hash) and Reorder; shown
// empty too, for + Add.  The order is a hidden field, so a changed one is a
// change to the page (formState) like any other.  "Outline", not
// "Subtasks": any heading can be one, a task or not.
// A task's outline past CLIP children shows the first SHOWN, the rest behind
// "Show n more" (hidden by CSS, so Reorder still has every row); a file's,
// a tree in the list, all.
const CLIP = 15, SHOWN = 12;  // SHOWN: .rows.clipped's nth-child too
// TITLE, a tree in the list: its line's own (a zoom's breadcrumb, else "Outline").
// In a read-only file (its rows' read_only): no + Add, no Reorder.
function kidsHtml(kids, owner, add, rows = kids.map(c => childRow(c)).join(""), title = null) {
  const ro = kids.some(c => c.read_only);
  const order = !ro && kids.length > 1 && kids.every(c => c.id);
  const clip = !title && owner.parent && kids.length > CLIP;
  return `<div class="kids" data-owner="${esc(JSON.stringify(owner))}">` +
    `<div class="section-title with-action">${title ?? sectionName("Outline", "outline", "outline")}${ro ? ""
      : `<a class="add-here" href="${esc(add)}"${hintAttr(owner.file ? "add-beside" : "add-under")}>+ Add</a>`}${
      order ? `<button data-reorder>Reorder</button>` : ""}</div>` +
    `<div class="rows${clip ? " clipped" : ""}">${rows}</div>` +
    (clip ? `<button class="show-more" data-more>Show ${kids.length - SHOWN} more</button>` : "") +
    (order ? `<input type="hidden" class="order" value="${esc(kids.map(c => c.id).join(" "))}">` : "") + `</div>`;
}

// Org's time grid: the empty hours are dropped, the now line kept, as a
// divider among the timed items, where org put it.
function gridRow(line) {
  const roles = line.spans.map(s => s[2]);
  if (!roles.includes("now")) return "";
  const time = line.spans.find(s => s[2] === "time");
  return `<div class="now"><span>now${time ? " " + esc(line.text.slice(time[0], time[1]).trim()) : ""}</span></div>`;
}
const gridLine = line => !line.id && line.spans.some(s => s[2] === "grid" || s[2] === "now");

// Each day's events without a time first, under its date line, as a
// calendar has them; org puts everything without a time after the grid.
function allDayFirst(lines) {
  const out = [];
  let at = -1;
  for (const l of lines) {
    if (l.date) out.push(l), at = out.length;
    else if (l.all_day && at >= 0) out.splice(at++, 0, l);
    else out.push(l);
  }
  return out;
}

// A day as "2026-10-12", and one moved by N days.
const isoDate = d => [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(v => String(v).padStart(2, "0")).join("-");
function shiftDate(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return isoDate(new Date(y, m - 1, d + n));
}

// The built-in week, which steps: `week DATE`, or `week` unless [views]
// makes it a custom command (a dashboard of other blocks too).
const weekQuery = q => /^week\s+\S/.test(q) || (q === "week" && !views.includes("week"));
const weekOf = iso => `week ${iso}`;

// STEP: "day", the view shows one day, so its date line gets ‹ › to the days
// around it; "week" (WEEK its first day), its header line, to the weeks.
function otherRow(line, step = null, week = null) {
  const t = line.text, roles = line.spans.map(s => s[2]);
  if (!t.trim()) return "";
  if (/^[─━-]{8,}$/.test(t.trim())) return `<div class="sep"></div>`;
  if (step === "week" && roles.includes("header"))
    return `<div class="head stepper">` +
      `<button data-go="${esc(weekOf(shiftDate(week, -7)))}" aria-label="Previous week"${hintAttr("earlier")}>‹</button>` +
      `<div class="pick" role="button" tabindex="0" aria-label="Go to a week"${hintAttr("date")}><span>${esc(t.trim())}</span>` +
      `<input type="date" tabindex="-1" aria-hidden="true" value="${week}" data-week></div>` +
      `<button data-go="${esc(weekOf(shiftDate(week, 7)))}" aria-label="Next week"${hintAttr("later")}>›</button></div>`;
  if (step === "day" && line.date)
    return `<div class="day stepper${roles.includes("today") ? " today" : ""}">` +
      `<button data-go="${shiftDate(line.date, -1)}" aria-label="Previous day"${hintAttr("earlier")}>‹</button>` +
      `<div class="pick" role="button" tabindex="0" aria-label="Go to a date"${hintAttr("date")}><span>${esc(t)}</span>` +
      `<input type="date" tabindex="-1" aria-hidden="true" value="${line.date}"></div>` +
      `<button data-go="${shiftDate(line.date, 1)}" aria-label="Next day"${hintAttr("later")}>›</button></div>`;
  if (roles.includes("today")) return `<div class="day today">${esc(t)}</div>`;
  if (roles.includes("date")) return `<div class="day">${esc(t)}</div>`;
  if (roles.includes("header")) return `<div class="head">${esc(t.trim())}</div>`;
  return `<div class="plain">${painted(t, line.spans)}</div>`;
}

// The task's pane with no task (side by side only: a phone never shows it
// empty): where to start, the full references a key away.  Its keys are
// the table's, so rebound ones read right.
function startHtml() {
  const k = name => keyHint(name) || "–";
  // Pairs as one key each side, every one: j k / n p / ↓ ↑.
  const pairs = (a, b) => keysOf(a).map((x, i) => `${keyLabel(x)} ${keysOf(b)[i] ? keyLabel(keysOf(b)[i]) : "–"}`).join(" / ") || "–";
  return `<div class="start"><div class="status">Pick a task, or:</div><dl class="keys">
  <dt>${esc(pairs("down", "up"))}</dt><dd>move, opening each beside · Esc back</dd>
  <dt>TAB</dt><dd>in an agenda, the task in its file; in a file, fold</dd>
  <dt>${esc(`${k("back")} ${k("forward")}`)}</dt><dd>back, forward: the lists and tasks shown</dd>
  <dt>${esc(["state", "priority", "tags", "schedule", "deadline", "refile"].map(k).join(" "))}</dt><dd>state, priority, tags, dates, refile</dd>
  <dt>${esc(`${k("clock-in")} / ${k("clock-out")}`)}</dt><dd>clock in / out · ${esc(`${k("clock-in-at")} ${k("clock-out-at")}`)} at a time · ${esc(k("clocks"))} its clocks</dd>
  <dt>${esc(k("add"))}</dt><dd>add field by field · ${esc(k("box"))} then add … in one line</dd>
  <dt>${esc(k("box"))}</dt><dd>the box: a view, a search, any orgwarrior command</dd>
  <dt>${esc(k("help"))}</dt><dd>every key · <kbd>help</kbd> in the box: every command</dd></dl></div>`;
}

// The view in the list pane (its query, once asked for), and on a phone where
// it was scrolled to, for coming back to it.
let listQuery = null, listScroll = 0, listSeq = 0;

// An agenda file as IDs name it is its outline, as `orgwarrior projects.org`
// (orgwarrior's FILE_RE).
const FILE_QUERY = /^[^\s"]+\.org$/;
// A heading of one, zoomed into (h): `projects.org::ID`, the page's own.
const ZOOM_QUERY = /^([^\s"]+\.org)::(\S+)$/;
const fileOf = query => query?.match(ZOOM_QUERY)?.[1] ?? (FILE_QUERY.test(query ?? "") ? query : null);
const zoomQuery = (file, id) => id ? `${file}::${id}` : file;
// A clock report, as `orgwarrior clocked week` (orgwarrior's Report).
const REPORT_QUERY = /^clocked(\s|$)/;
// What was closed: org leaves out its empty days, so one date line isn't one day's view.
const CLOSED_QUERY = /^closed(\s|$)/;

async function showView(query, quiet) {
  const zoom = query.match(ZOOM_QUERY);
  q.value = zoom ? zoom[1] : query;  // the box takes orgwarrior's queries: the file
  markTab(query);
  // Another list: the keys start over, unless TAB from an agenda sent the cursor along (reveal).
  if (query !== listQuery) [cursor, revealCursor] = [revealCursor, null];
  if (query !== listQuery || !quiet) kept = [];
  listQuery = query;
  if (FILE_QUERY.test(query) || zoom) return showFile(zoom?.[1] ?? query, quiet, zoom?.[2] ?? null);
  if (REPORT_QUERY.test(query)) return showReport(query, quiet);
  listForm = null;
  if (!quiet) list.innerHTML = `<div class="status">Loading…</div>`;
  const seq = ++listSeq, lines = allDayFirst(await api(`/api/view?q=${encodeURIComponent(query)}`));
  if (seq !== listSeq) return;  // a newer one was asked for: don't draw over it
  const dates = lines.filter(l => l.date).map(l => l.date);
  const step = CLOSED_QUERY.test(query) ? null
    : dates.length === 1 ? "day" : dates.length === 7 && weekQuery(query) ? "week" : null;
  const html = lines.map(l => gridLine(l) ? gridRow(l)
    : l.id || l.text.includes("\x1f") ? itemRow(l) : otherRow(l, step, dates[0])).join("");
  const empty = !lines.some(l => !gridLine(l) && (l.id || l.text.includes("\x1f")));
  list.innerHTML = html + (empty ? `<div class="status">Nothing here.</div>` : "");
  restoreKept();
  markPicked();
  markCurrent();
  if (clockReportOn && step) clockedUnder(seq, step === "day" ? dates[0] : `${dates[0]}..${shiftDate(dates[0], 6)}`);
}

// R's section under a day or a week: the tasks clocked in it, their time
// (against effort), each opening its task; nothing when nothing was.
async function clockedUnder(seq, span) {
  const r = await api(`/api/report?q=${encodeURIComponent(`clocked ${span}`)}`).catch(() => null);
  if (!r || seq !== listSeq) return;
  const tasks = r.files.flatMap(f => f.rows.filter((row, i) => !(f.rows[i + 1]?.depth > row.depth)));
  if (!tasks.length) return;
  list.insertAdjacentHTML("beforeend", `<div class="head clocked-head">Clocked<span class="report-time">${hm(r.minutes)}</span></div>` +
    tasks.map(row => {
      const title = `<div class="title">${esc(row.title)}<span class="report-time">${againstEffort(row.minutes, row.effort_minutes)}</span></div>`;
      return row.id ? `<button class="task" data-id="${esc(row.id)}">${title}</button>` : `<div class="task static">${title}</div>`;
    }).join(""));
  markPicked();
  markCurrent();
}

// After an action, the rows it acted on stay where they were, dimmed, as
// org's agenda keeps its lines until g: done in the inbox, then refiled from
// there.  Each {id, after (the row above's ID), index, html}; gone at a real
// reload (another view, ↻, back on the tab), or once the view has it again.
let kept = [];
function keepRows(results) {
  const rows = [...list.querySelectorAll(".task[data-id]")];
  for (const r of results) {
    const at = r.id ? rows.findIndex(row => sameId(row.dataset.id, r.old ?? r.id)) : -1;
    if (at < 0) continue;
    const row = rows[at].cloneNode(true), title = row.querySelector(".title");
    row.dataset.id = r.id;
    row.classList.add("kept");
    row.classList.remove("picked", "current", "cursor");
    for (const n of [...title.childNodes]) if (!n.matches?.(".id, .cat, .time")) n.remove();
    title.querySelector(".id")?.replaceChildren(r.id);
    const rest = r.keyword && r.heading.startsWith(r.keyword) ? r.heading.slice(r.keyword.length) : r.heading;
    title.insertAdjacentHTML("beforeend", (r.keyword
      ? `<span style="${styleFor(r.done ? "done" : "todo", r.keyword)}">${esc(r.keyword)}</span>` : "") + esc(rest));
    kept = kept.filter(k => !sameId(k.id, r.old ?? r.id));
    kept.push({id: r.id, after: rows[at - 1]?.dataset.id ?? null, index: at, html: row.outerHTML});
  }
}
function restoreKept() {
  const rows = () => [...list.querySelectorAll(".task[data-id]")];
  kept = kept.filter(k => !rows().some(r => sameId(r.dataset.id, k.id)));
  for (const k of [...kept].sort((a, b) => a.index - b.index)) {
    const prev = k.after && rows().find(r => sameId(r.dataset.id, k.after)), next = rows()[k.index];
    if (prev) prev.insertAdjacentHTML("afterend", k.html);
    else if (next) next.insertAdjacentHTML("beforebegin", k.html);
    else list.querySelector(".status")?.remove(), list.insertAdjacentHTML("beforeend", k.html);
  }
}

// The marks on the rows just drawn: still marked after a reload.
function markPicked() {
  for (const row of list.querySelectorAll(".task[data-id]"))
    row.classList.toggle("picked", selected.has(row.dataset.id));
}

// Side by side, the list's row for the task beside it.  IDs match as
// prefixes: an ID's length follows the other tasks'.
function markCurrent() {
  const open = shownId(location.hash);
  // A preview on its way (keys.js) is where the bar is: an earlier one landing
  // meanwhile mustn't pull it back to the task still loading.
  if (previewing && open && sameId(open, previewing)) previewing = null;
  const id = previewing ?? open;
  for (const row of list.querySelectorAll(".task[data-id]"))
    row.classList.toggle("current", !!id && (row.dataset.id.startsWith(id) || id.startsWith(row.dataset.id)));
  markClocking();
  markCursor();
}

// A file's outline, as a view: its top-level headings, in file order, to
// open or reorder.  Not redrawn while being reordered.
async function showFile(file, quiet, zoom = null) {
  if (quiet && list.querySelector(".reordering")) return;
  if (!quiet) list.innerHTML = `<div class="status">Loading…</div>`;
  const seq = ++listSeq, outline = await api(`/api/file?f=${encodeURIComponent(file)}`);
  if (seq !== listSeq) return;
  if (file !== fileShown) [fileShown, folds] = [file, readFolds(file)];
  [fileTree, fileZoom] = [outline.children, zoom];
  drawFile();
}

// The file's tree as it's folded, from what was fetched (folding needs no request).
// Zoomed, the heading's subtree as the tree, its path above as a breadcrumb;
// a heading gone (renamed: a new ID), the whole file.
function drawFile() {
  const file = fileShown, path = fileZoom ? zoomPath(fileTree, fileZoom) : null, here = path?.at(-1);
  zoomTask = here ? {id: here.id, file, title: here.text, parents: path.slice(0, -1).map(n => ({id: n.id, title: n.text}))} : null;
  const nodes = here ? here.children ?? [] : fileTree;
  list.innerHTML = (here ? kidsHtml(nodes, {parent: here.id}, addUnder(zoomTask), treeRows(nodes), crumbsHtml(file, path))
    : kidsHtml(fileTree, {file}, `#/add?to=${encodeURIComponent(file)}`, treeRows(fileTree), "Outline")) +
    (nodes.length ? "" : `<div class="status">${here ? "No headings under it yet." : "Nothing here."}</div>`);
  listForm = {hash: location.hash, state: formState(list)};
  markPicked();
  markCurrent();
  // What a key just moved: a moment's tint, so the eye finds where it landed.
  const moved = justMoved && [...list.querySelectorAll(".task[data-id]")].find(r => sameId(r.dataset.id, justMoved));
  justMoved = null;
  if (moved) {
    moved.classList.add("moved");
    setTimeout(() => moved.classList.remove("moved"), 1200);
  }
}

// The headings from the top down to ID's, or null.
function zoomPath(nodes, id) {
  for (const n of nodes) {
    if (n.id && sameId(n.id, id)) return [n];
    const below = n.children?.length ? zoomPath(n.children, id) : null;
    if (below) return [n, ...below];
  }
  return null;
}

// A zoom's line: ‹ out a level, the file and each heading above to zoom to,
// the heading itself opening its page.
function crumbsHtml(file, path) {
  const to = (id, text) => `<a class="crumb" href="#/v/${encodeURIComponent(zoomQuery(file, id))}">${esc(text)}</a>`;
  const here = path.at(-1), up = path.slice(0, -1).findLast(n => n.id)?.id ?? null;
  return `<span class="crumbs"><a class="crumb up" href="#/v/${encodeURIComponent(zoomQuery(file, up))}"${hintAttr("widen")}
    title="Out a level" aria-label="Out a level">‹</a>` +
    [to(null, file), ...path.slice(0, -1).map(n => n.id ? to(n.id, n.text) : `<span>${esc(n.text)}</span>`),
     `<a class="crumb here" href="#/t/${encodeURIComponent(here.id)}" title="Open it">${esc(here.text)}</a>`]
      .join(`<span class="crumb-sep">›</span>`) + `</span>`;
}

// A clock report: its span with ‹ › to the ones either side, each file and
// its headings as a tree, the time each holds (against its effort), rows
// opening their task.  Folded ones are kept per device, all open at first.
let reportShown = null;
const reportFoldsKey = "orgwarrior-report-folds";
let reportFolds = (() => { try { return new Set(JSON.parse(localStorage.getItem(reportFoldsKey) || "[]")); } catch { return new Set(); } })();
async function showReport(query, quiet) {
  if (!quiet) list.innerHTML = `<div class="status">Loading…</div>`;
  const seq = ++listSeq, r = await api(`/api/report?q=${encodeURIComponent(query)}`);
  if (seq !== listSeq) return;
  reportShown = {query, r};
  drawReport();
}
function toggleReportFold(key) {
  if (reportFolds.has(key)) reportFolds.delete(key); else reportFolds.add(key);
  try { localStorage.setItem(reportFoldsKey, JSON.stringify([...reportFolds])); } catch {}
  drawReport();
}
function drawReport() {
  const {r} = reportShown, match = r.match ? ` ${r.match}` : "";
  const step = (span, label, action) => span
    ? `<button data-go="${esc(`clocked ${span}${match}`)}" aria-label="${label}"${hintAttr(action)} data-step="${action}">${action === "earlier" ? "‹" : "›"}</button>` : "";
  const head = `<div class="head stepper report-head" data-home="${esc(`clocked ${{day: "today", week: "week", month: "month", year: "year"}[r.kind] ?? "today"}${match}`)}">` +
    `${step(r.prev, "Earlier", "earlier")}<div class="report-title"><span>Clocked · ${esc(r.label)}${esc(match)}</span>` +
    `<span class="report-time">${hm(r.minutes)}</span></div>${step(r.next, "Later", "later")}</div>`;
  const fold = (key, kids) => kids ? `<span class="fold-tw" data-rf="${esc(key)}" aria-label="${reportFolds.has(key) ? "Unfold" : "Fold"}">${
    reportFolds.has(key) ? "▸" : "▾"}</span>` : `<span class="fold-tw"></span>`;
  // Rows come flat, by depth: a row's children are those after it, deeper.
  const rows = (file, all) => {
    let html = "", skip = null;
    all.forEach((row, i) => {
      if (skip !== null && row.depth > skip) return;
      skip = null;
      const kids = all[i + 1]?.depth > row.depth, key = `${file}::${row.id ?? row.title}`;
      const time = againstEffort(row.minutes, row.effort_minutes);
      const title = `<div class="title">${fold(key, kids)}${esc(row.title)}<span class="report-time">${time}</span></div>`;
      html += row.id ? `<button class="task node" data-id="${esc(row.id)}" style="--d:${row.depth}">${title}</button>`
        : `<div class="task static node" style="--d:${row.depth}">${title}</div>`;
      if (kids && reportFolds.has(key)) skip = row.depth;
    });
    return html;
  };
  list.innerHTML = head + r.files.map(f => `<div class="report-file">${fold(`file:${f.file}`, f.rows.length)}${esc(f.file)}` +
    `<span class="report-time">${hm(f.minutes)}</span></div>${reportFolds.has(`file:${f.file}`) ? "" : rows(f.file, f.rows)}`).join("") +
    (r.files.length ? "" : `<div class="status">Nothing clocked.</div>`);
  markPicked();
  markCurrent();
}

// The tab whose query is shown (the default view's for a bare #/v/), if any.
function markTab(query) {
  const current = query === "" ? defaultView : query, all = [...tabs.querySelectorAll("a")];
  // A zoom is its own tab if saved as one, else its file's.
  const shown = all.some(a => a.dataset.query === current), mine = shown ? current : fileOf(current) ?? current;
  for (const a of all) a.classList.toggle("on", a.dataset.query === mine);
  // ＋: the view shown kept as a tab of its own, when it isn't one.
  const save = document.getElementById("savetab");
  if (save) save.hidden = query === null || shown;
}

// The tab row: the config's tabs, then the ones saved from the page (dashed,
// and changeable: tabSheet).
function drawTabs(list) {
  // Out of the Tab order (tabindex -1), as the logo: 1–9 and 0 reach them.
  tabs.innerHTML = list.map((t, i) => `<a href="#/v/${encodeURIComponent(t.query)}" data-query="${esc(t.query)}" tabindex="-1"${
    i < 10 ? hintAttr(`tab-${i + 1}`) : ""}${
    t.saved ? ` class="saved"` : ""}>${esc(t.label)}</a>`).join("") +
    `<button id="savetab" type="button" tabindex="-1" hidden aria-label="Save this view as a tab" title="Save this view as a tab">＋</button>`;
  markTab(listQuery);
  fadeTabs();
}

// QUIET: refresh what's shown in place (no "Loading…", same scroll position),
// both panes when they're side by side.  AGAIN: reload the view even if it's
// the one already in the list (↻), which otherwise comes back as it was.
// Entry keys: this page load's (entries outlive a reload), then a count.
let loadedAt = 0, entryKeys = 0, drawn = {};
const pageLoad = Math.random().toString(36).slice(2);
async function route(quiet = false, again = false) {
  if (document.body.dataset.mode) return;  // signing in, or an add token's one page
  const h = location.hash, y = window.scrollY, was = document.body.dataset.page;
  const page = pageOf(h);
  // What's running may have changed with it (an action, another machine, ↻).
  if (quiet || again) refreshClock();
  // A form isn't refreshed in place, nor a task page with something typed:
  // that would drop it.  The list beside it may be.
  if (quiet && (page === "add" || page === "edit" || (page === "task" && pageForm && formState(detail) !== pageForm.state))) {
    if (wide.matches && listQuery !== null) await showView(listQuery, true).catch(() => {});
    return;
  }
  if (!wide.matches && was === "view" && page !== "view") listScroll = y;
  // This entry's own key: a draw finishing after Back moved on mustn't write
  // its list into another entry (two can show the same task).
  const keep = fields => history.replaceState({...history.state, ...fields}, "");
  if (!history.state?.sheet && !history.state?.key)
    keep({key: `${pageLoad}.${++entryKeys}`, ...page === "task" && openedFrom && {parent: openedFrom}});
  openedFrom = null;
  // Its list, known already (a view's own, else the one beside): kept at once,
  // since Back can leave before the draw ends.
  const listNow = page === "view" ? viewOf(h) : listQuery;
  if (!history.state?.sheet && history.state?.list === undefined && listNow !== null) keep({list: listNow});
  // Read now, before any wait: by the end Back or ] may have moved to another
  // entry, whose state this draw mustn't take for its own.
  const entry = history.state?.key, remembered = history.state?.list;
  drawn = {key: entry, hash: h};
  const stale = () => drawn.key !== entry;  // a newer draw began: leave the page to it
  currentTask = pageForm = null;
  detail.onclick = detail.oninput = null;  // a page's own handlers (the add page's)
  document.body.dataset.page = page;
  try {
    if (page === "view") {
      const query = viewOf(h);
      // The list already drawn comes back as it was, and is refreshed underneath.
      const back = query === listQuery && !again;
      if (!revealPreview) detail.innerHTML = startHtml();  // TAB's task on its way: no flash of it
      if (!wide.matches) window.scrollTo(0, quiet ? y : back ? listScroll : 0);
      await showView(query, quiet || back);
      // TAB from an agenda, or the task beside archived or killed: the cursor's row shown beside.
      if (revealPreview) {
        revealPreview = false;
        moveCursor(0, true);
      }
    } else {
      if (!wide.matches) markTab(null);
      // Back on an entry made beside another list (past a TAB): that list,
      // asked for at once, beside the task.
      const other = wide.matches && typeof remembered === "string" && remembered !== listQuery;
      const listing = other && showView(remembered, false).catch(listError);
      if (page === "add") await showAdd();
      else if (page === "edit") await showEdit(shownId(h));
      else if (page === "read") await showRead(shownId(h), quiet);
      else await showTask(shownId(h), quiet);
      if (stale()) return;
      if (!wide.matches) window.scrollTo(0, quiet ? y : 0);
      else if (!quiet) detail.scrollTop = 0;
      markCurrent();
      // Side by side the list shows too: opened straight on a task, the default
      // view; refreshed in place, reloaded (↻), or after an add, which may be in it.
      const relist = justAdded !== null;
      if (again) kept = [];
      if (listing) await listing;
      else if (wide.matches && (listQuery === null || quiet || again || relist))
        await showView(listQuery ?? "", listQuery !== null).catch(listError);
    }
    if (stale()) return;
    loadedAt = Date.now();
    // The entry remembers its list: the address names a view or a task, never
    // both, and Back to a task must bring the list it was beside.
    if (entry && history.state?.key === entry && listQuery !== null) keep({list: listQuery});
  } catch (e) {
    // A task that's gone (archived, killed elsewhere): Back still there, for an installed app.
    (page === "view" ? list : detail).innerHTML = (page === "view" ? "" :
      `<button class="back" onclick="goBack()" data-hint="ESC">‹ Back</button>`) + `<div class="error">${esc(e.message)}</div>`;
  }
  reloadIfOutdated();  // what was just drawn was drawn by old code
}
// Widened with a task open and no list yet: fill it.
wide.addEventListener("change", () => {
  if (document.body.dataset.mode) return;  // the capture page (or signing in): no list to fill
  if (wide.matches && listQuery === null && document.body.dataset.page !== "view")
    showView("", false).catch(listError);
  else markTab(wide.matches || document.body.dataset.page === "view" ? listQuery : null);
});

// Back on the tab after a while: Syncthing may have changed the files, so
// refresh, unless a sheet is open (the user is mid-action).  Only after it
// was really hidden: some compositors flicker it many times a minute, and
// each flicker past 30 s redrew the page.
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") hiddenAt = Date.now();
  else if (sheet.hidden && Date.now() - hiddenAt > 5000 && Date.now() - loadedAt > 30000)
    kept = [], route(true);
});
// A now line left on screen goes stale: move it along every few minutes.
setInterval(() => {
  if (document.visibilityState === "visible" && sheet.hidden && list.querySelector(".now")
      && (wide.matches || document.body.dataset.page === "view"))
    route(true);
}, 5 * 60000);

// A long press on a row opens its menu.  Our own timer, not `contextmenu`, which
// browsers don't all fire on touch; moving (scrolling) cancels it.
let pressTimer = null, longPressed = false, pressX = 0, pressY = 0, pressMouse = false;
const pressRow = row => selecting ? toggleSelected(row.dataset.id) : openMenu(row.dataset.id);
main.addEventListener("pointerdown", e => {
  const row = e.target.closest(".task[data-id]");
  pressMouse = e.pointerType === "mouse";
  if (!row || e.button !== 0) return;  // a right-click is the contextmenu's
  longPressed = false;
  pressX = e.clientX; pressY = e.clientY;
  pressTimer = setTimeout(() => {
    longPressed = true;
    navigator.vibrate?.(15);
    pressRow(row);
  }, 450);
});
main.addEventListener("pointermove", e => {
  if (Math.hypot(e.clientX - pressX, e.clientY - pressY) > 10) clearTimeout(pressTimer);
});
for (const t of ["pointerup", "pointercancel", "pointerleave"]) main.addEventListener(t, () => clearTimeout(pressTimer));
// With a mouse, a right-click is the long press; on touch the browser's own
// long-press menu is swallowed, our timer having opened ours.
main.addEventListener("contextmenu", e => {
  const row = e.target.closest(".task[data-id]");
  if (!row) return;
  e.preventDefault();
  if (pressMouse) pressRow(row);
});

// A saved tab: a long press or a right-click changes it (tabSheet), the tap
// that ends a long press doesn't go to it.  ＋ saves the view shown as one.
let tabTimer = null, tabPressed = false;
tabs.addEventListener("pointerdown", e => {
  const tab = e.target.closest("a.saved");
  tabPressed = false;
  if (!tab || e.button !== 0) return;
  tabTimer = setTimeout(() => { tabPressed = true; navigator.vibrate?.(15); tabSheet(tab); }, 450);
});
for (const t of ["pointerup", "pointercancel", "pointerleave"]) tabs.addEventListener(t, () => clearTimeout(tabTimer));
tabs.addEventListener("scroll", () => clearTimeout(tabTimer));
tabs.addEventListener("click", e => {
  if (e.target.closest("#savetab")) return tabSheet();
  if (tabPressed) e.preventDefault(), tabPressed = false;
});
tabs.addEventListener("contextmenu", e => {
  const tab = e.target.closest("a.saved");
  if (!tab) return;
  e.preventDefault();
  if (!tabPressed) tabSheet(tab);  // a phone's long press: our timer opened it already
});


main.addEventListener("click", e => {
  if (e.target.closest("#selectbar")) return;  // its own handler: the selection, not the open task
  const go = e.target.closest("[data-go]");
  if (go) return location.hash = `#/v/${encodeURIComponent(go.dataset.go)}`;
  const more = e.target.closest("[data-more]");
  if (more) {
    more.previousElementSibling.classList.remove("clipped");
    return more.remove();
  }
  // The date between ‹ and ›: a date picker, to that day's agenda (or week's).
  const pick = e.target.closest(".pick");
  if (pick) {
    const input = pick.querySelector("input");
    input.onchange = () => {
      if (input.value) location.hash = `#/v/${encodeURIComponent("week" in input.dataset ? weekOf(input.value) : input.value)}`;
    };
    try { input.showPicker(); } catch { input.focus(); }
    return;
  }
  // A ▸ in a report: fold or unfold, the row not opened.
  const rf = e.target.closest("[data-rf]");
  if (rf) return toggleReportFold(rf.dataset.rf);
  // A ▸ in a file's tree: fold or unfold, the row not opened.
  const tw = e.target.closest("[data-tw]");
  if (tw) return toggleFold(tw.dataset.tw);
  const kids = e.target.closest(".kids");
  if (kids && e.target.closest("[data-reorder], .reordering button")) return reorderClick(e, kids);
  const control = e.target.closest("[data-do]");
  if (control && currentTask) return doControl(control, [currentTask.id], currentTask);
  const row = e.target.closest(".task[data-id]");
  if (!row) return;
  if (longPressed) return longPressed = false;
  // As a file manager: Ctrl (⌘) toggles a row's mark, Shift marks up to it.
  if (e.ctrlKey || e.metaKey) {
    // The row clicked is where a Shift-click's range then starts, as in a file manager.
    if (list.contains(row)) [cursor, cursorIndex] = [row.dataset.id, cursorRows().indexOf(row)];
    toggleSelected(row.dataset.id);
    return markCursor();
  }
  if (e.shiftKey && list.contains(row)) return markRange(row);
  if (selecting) return toggleSelected(row.dataset.id);
  openRow(row);
});
// Side by side, the list and the task beside it are one place: a row opened
// takes the entry's place (the list alone, or another task), so Back goes to
// the list and task shown before, never through each one looked at or the
// list alone.  A phone pushes: Back is to the list.
let openedFrom = null;  // the task whose outline a row was opened from: its entry's parent
async function openRow(row) {
  const hash = `#/t/${encodeURIComponent(row.dataset.id)}`;
  if (list.contains(row)) cursor = row.dataset.id;
  else if (pageOf(location.hash) === "task") openedFrom = currentTask?.id ?? null;
  if (!(wide.matches && list.contains(row))) return location.hash = hash;
  if (!await leaveOk()) return;
  // A sheet opened meanwhile (a key's, as a preview was on its way): replacing
  // the address now would take the sheet's history entry, and close it.
  if (!sheet.hidden) return;
  pageForm = null;
  location.replace(hash);
}
// The add page, under TASK: picked, or (OFFER) offered beside the default.
function addUnder(task, offer = false) {
  const label = [task.file, ...task.parents.map(p => p.title), task.title].join(" › ");
  return `#/add?under=${encodeURIComponent(task.id)}&file=${encodeURIComponent(task.file)}` +
    `&label=${encodeURIComponent(label)}${offer ? "&offer=1" : ""}`;
}

// The + (and + New, on a wide screen): the default place, with where you
// are (a task's page, a file's outline) offered as the other.
async function newTask() {
  const h = location.hash, query = viewOf(h);
  // Pressed while the task is still loading: read it here.
  const task = pageOf(h) === "task" &&
    (currentTask ?? await api(`/api/task/${encodeURIComponent(shownId(h))}`).catch(() => null));
  if (location.hash !== h) return;
  const zoomed = ZOOM_QUERY.test(query ?? "") && zoomTask;
  const hash = task || zoomed ? addUnder(task || zoomed, true)
    : FILE_QUERY.test(query) ? `#/add?to=${encodeURIComponent(query)}&offer=1` : "#/add";
  location.hash = hash;
}
document.getElementById("add").addEventListener("click", newTask);
// The logo goes home: the default view, at its top, the cursor gone; a
// phone's way back from anywhere.
document.querySelector(".brand").addEventListener("click", e => {
  e.preventDefault();
  if (document.body.dataset.mode) return;  // the capture page has nowhere else
  cursor = null;
  listScroll = 0;
  if (location.hash === "#/v/") route(); else location.hash = "#/v/";
  window.scrollTo(0, 0);
  list.scrollTop = 0;
});
// The header's height, for what sticks under it on a phone (the text tools).
new ResizeObserver(([h]) => document.documentElement.style.setProperty("--header-h", `${h.target.offsetHeight}px`))
  .observe(document.querySelector("header"));
document.getElementById("new").addEventListener("click", newTask);
// The box takes what the orgwarrior command does (runLine): a view, or
// `add …`, `ID… VERB …`.  A mistake keeps the line, to be fixed.
document.getElementById("search").addEventListener("submit", async e => {
  e.preventDefault();
  if (await runLine(q.value.trim())) q.blur(); else q.focus();
});
// The tab row scrolls sideways; its edge fades while there's more that way.
function fadeTabs() {
  tabs.classList.toggle("more", tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 1);
}
tabs.addEventListener("scroll", fadeTabs);
addEventListener("resize", fadeTabs);
document.getElementById("reload").addEventListener("click", async () => { if (await leaveOk()) route(false, true); });
async function navigate() {
  if (document.body.dataset.mode) return;
  // Already gone, by Back or a tab: on keep editing, put the URL back, page untouched.
  const form = pageForm ?? listForm;
  if (form && !await leaveOk()) return history.pushState(null, "", form.hash);
  navigated = true;
  if (selecting && !location.hash.startsWith("#/v/") && location.hash !== "") leaveSelection();
  route();
}
window.addEventListener("hashchange", navigate);
// Back to another entry with the same address (the task beside the agenda,
// then beside its file after TAB): no hashchange, so redraw here.  Not a
// sheet's entry, nor the entry already drawn (a sheet closing lands there).
window.addEventListener("popstate", () => {
  const key = history.state?.key;
  if (history.state?.sheet || !key || key === drawn.key || location.hash !== drawn.hash) return;
  navigate();
});

// Shared from another app (Android's Share menu, the manifest's
// share_target): its title, text and link, for the add page.  The first
// is the title, the others the body.
let shared = null;
{
  const params = new URLSearchParams(location.search);
  const parts = [...new Set(["title", "text", "url"].map(k => (params.get(k) || "").trim()).filter(Boolean))];
  if (parts.length) {
    shared = {title: parts[0], body: parts.slice(1).join("\n")};
    history.replaceState(null, "", "/#/add");
  }
}

// The other scripts run before DOMContentLoaded; the answer to /api/views can
// come sooner, and what it draws uses them.
const scriptsRun = new Promise(r => document.readyState === "loading"
  ? addEventListener("DOMContentLoaded", r, {once: true}) : r());
(async () => {
  try {
    const info = await api("/api/views");
    await scriptsRun;
    if (info.mode === "add") return showCapture(info.name);
    if (info.name) document.title = `ow · ${info.name}`;
    colors = info.colors;
    defaultView = info.default;
    views = info.views ?? [];
    keywords = info.keywords;
    doneKeywords = info.done;
    keywordKeys = info.keys ?? [];
    setKeys(info.keymap);
    priorities = info.priorities || [];
    warningDays = info.warning_days ?? warningDays;
    drawTabs(info.tabs);
  } catch (e) {
    if (e.status === 401) return showSignIn();
    return listError(e);
  }
  route();
  refreshClock();
})();

// Only in a secure context (HTTPS, or a browser told to treat this origin as one).
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
