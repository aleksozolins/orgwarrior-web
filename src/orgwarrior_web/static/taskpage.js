"use strict";

// A task's page: its fields, each saved on its own, its text, outline and
// notes, then what's done after reading it.

// Its title (renamed in place) and state, what's set of its fields (each
// opening its sheet, as its key does) and what isn't (adders), its text
// with Edit, its outline, history and clocks (each only once it has some:
// the empty ones are a line of adders), and last what's done after reading
// it: move, refile, archive, kill.  A read-only task (its file isn't
// writable: a calendar's copy) the same to read, with none of the controls.
async function showTask(id, quiet) {
  if (!quiet) detail.innerHTML = `<div class="status">Loading…</div>`;
  const h = location.hash;
  const task = await api(`/api/task/${encodeURIComponent(id)}?html=1`);
  if (location.hash !== h) return;
  currentTask = task;
  const ro = task.read_only;
  // Its file shows it there (TAB); each parent zooms into it, this task among its headings.
  const where = [`<a href="#/v/${encodeURIComponent(task.file)}" data-reveal data-hint="TAB" title="Show it in its file">${esc(task.file)}</a>`, ...task.parents.map(p => p.id
    ? `<a href="#/v/${encodeURIComponent(zoomQuery(task.file, p.id))}" data-zoom="${esc(p.id)}">${esc(p.title)}</a>` : esc(p.title))].join(" › ");
  const [heading, ...rest] = task.lines;
  const text = detailsHtml(task, rest);
  const kids = task.children.length ? kidsHtml(task.children, {parent: task.id}, addUnder(task)) : "";
  const history = task.history.length ? (ro ? `<div class="section-title">History</div>`
    : `<div class="section-title with-action">${sectionName("History", "notes", "history")}<button data-f="note"${hintAttr("note")}>+ Note</button></div>`) +
    `<div class="detail notes">${ro ? "" : noteComposer()}${historyHtml(task)}</div>` : "";
  // Effort is a field of its own (E): not listed again here.
  const own = task.properties.filter(p => p.name !== "Effort");
  const props = own.length ? (ro ? `<div class="section-title">Properties</div>`
    : `<div class="section-title with-action">${sectionName("Properties", "props", "properties")}<button data-do="propnew">+ Property</button></div>`) +
    `<div class="detail props">${own.map(p => (ro ? `<div class="prop">` : `<button class="prop" data-do="propedit" data-name="${esc(p.name)}">`) +
      `<span class="name">${esc(p.name)}</span><span class="value">${esc(p.value)}</span>${ro ? "</div>" : "</button>"}`).join("")}</div>` : "";
  // The sections with nothing in them yet: their adders, one line.
  const adders = ro ? "" : [text ? "" : `<button data-do="edit"${hintAttr("edit")}>+ Add details</button>`,
    task.children.length ? "" : `<a class="add-here" href="${esc(addUnder(task))}"${hintAttr("add-under")}>+ Add heading</a>`,
    task.history.length ? "" : `<button data-f="note"${hintAttr("note")}>+ Note</button>`,
    task.clocks.length ? "" : clockButton(task),
    own.length ? "" : `<button data-do="propnew"${hintAttr("properties")}>+ Property</button>`].join("");
  detail.innerHTML = `<div class="stuck-title" aria-hidden="true">${esc(task.title)}</div>` +
    `<button class="back" onclick="goBack()" data-hint="ESC">‹ Back</button>` +
    `<div class="detail task-fields"><div class="where"><span class="id">${esc(task.id)}</span>${where}${
      task.from ? `<span class="from">from ${esc(task.from)}</span>` : ""}${
      // Its category, where it isn't the file's name (#+category:, a CATEGORY property).
      task.category && task.category !== task.file.replace(/^.*\//, "").replace(/\.org$/, "")
        ? `<span class="category">${esc(task.category)}</span>` : ""}${
      ro ? `<span class="read-only" title="Its file isn't writable: shown, never changed">read only</span>` : ""}</div>` +
    `${taskFieldsHtml(task, heading)}</div>` +
    (text ? `<div class="section-title with-action">Details<button data-do="read"${hintAttr("read")} title="Full screen"
       aria-label="Read it full screen">⤢</button>${ro ? "" : `<button data-do="edit"${hintAttr("edit")}>✎ Edit</button>`}</div>` +
      `<div class="detail">${text}</div>` : "") + kids +
    `${history}${task.clocks.length ? clocksHtml(task) : ""}${props}` +
    (adders ? `<div class="adders">${adders}</div>${task.history.length ? "" : `<div class="detail notes composer">${noteComposer()}</div>`}` : "") +
    (ro ? "" : `<div class="detail"><div class="actions page-actions"><button data-do="move"${hintAttr("move")}>Move</button>` +
    `<button data-do="refile"${hintAttr("refile")}>Refile</button><button data-do="archive"${hintAttr("archive")}>Archive</button>` +
    `<button data-do="kill" class="danger"${hintAttr("kill")}>Kill</button></div></div>`);
  if (!ro) wireTaskPage(task);
  wireRendered(detail, task);
  pageForm = {hash: location.hash, state: formState(detail)};
  // A clock running here that the page hasn't heard of (started elsewhere):
  // what runs, read again, so the strip and Clock out follow.
  if (task.clocks.some(c => !c.end) && !clockingOn(task)) refreshClock();
}

// Details: the text as org renders it (show's html, sanitized by the
// server), then the drawers other than what the page shows apart (the
// log, properties), each folded to a line as org shows them.
function detailsHtml(task, lines) {
  const drawers = foldDrawers(lines, task, true);
  return (task.html.trim() ? `<div class="rendered">${task.html}</div>` : "") + drawers;
}

// The rendered text's checkboxes as buttons (org's [ ] in its order, the
// order show's checkboxes number them: `/api/check` with its text, so a
// list changed underneath is refused), and a long one clipped behind
// "Show all".
function wireRendered(root, task, clip = true) {
  const box = root.querySelector(".rendered");
  if (!box) return;
  if (!task.read_only) [...box.querySelectorAll("li.on, li.off, li.trans")].forEach((li, i) => {
    const code = li.firstElementChild, cb = task.checkboxes[i];
    if (!cb || code?.tagName !== "CODE") return;
    const b = document.createElement("button");
    b.className = "checkbox";
    Object.assign(b.dataset, {do: "check", n: String(i + 1), text: cb.text});
    b.textContent = {on: "☑", off: "☐", trans: "◩"}[li.className] ?? "☐";
    b.setAttribute("aria-label", li.className === "on" ? "Done: tap to untick" : "Tap to tick");
    code.replaceWith(b);
  });
  if (clip && box.scrollHeight > 480) {
    box.classList.add("clipped");
    box.insertAdjacentHTML("afterend", `<button class="show-more" data-more>Show all</button>`);
  }
}

// #/r/ID: the text alone, to read, full screen (side by side too: the
// list and fields set aside); Edit a tap away, Back where it came from.
async function showRead(id, quiet) {
  if (!quiet) detail.innerHTML = `<div class="status">Loading…</div>`;
  const h = location.hash;
  const task = await api(`/api/task/${encodeURIComponent(id)}?html=1`);
  if (location.hash !== h) return;
  currentTask = task;
  detail.innerHTML = `<div class="read-page"><div class="read-bar"><button class="back" onclick="goBack()" data-hint="ESC">‹ Back</button>` +
    `${task.read_only ? "" : `<button data-do="edit"${hintAttr("edit")}>✎ Edit</button>`}</div>` +
    `<h1 class="read-title">${esc(task.title)}</h1>` +
    (task.html.trim() ? `<div class="rendered read">${task.html}</div>` : `<div class="status">No details yet.</div>`) +
    foldDrawers(task.lines.slice(1), task, true) + `</div>`;
  wireRendered(detail, task, false);
}

// The entry's body (LINES, the task's lines after the heading) with each drawer
// (:LOGBOOK:, :PROPERTIES:, ...) folded to one line, as org shows it; tap to open.
// Never the planning line or an event's date: the fields above show them.
// Past CLIP lines (a drawer one), the first SHOWN, the rest behind "Show all".
// DRAWERS: only the drawers, the body being drawn rendered instead.
function foldDrawers(lines, task, drawersOnly = false) {
  const items = [];  // a line's html, or {drawer: html}
  let drawer = null;
  const boxes = new Map(task.checkboxes.map((b, i) => [b.line, {n: i + 1, text: b.text}]));
  for (const [i, l] of lines.entries()) {
    if (i === 0 && /^(SCHEDULED|DEADLINE|CLOSED):/.test(l.text.trim())) continue;
    if (i + 1 === task.when_line) continue;  // the When field's
    const t = l.text.trim(),
      text = painted(l.text, l.spans, 0, undefined, {links: l.links, box: boxes.get(i + 1)});
    if (!drawer && /^:[\w-]+:$/.test(t) && t !== ":END:") {
      drawer = {name: t.slice(1, -1), lines: [text],
                hide: task.log_drawers?.includes(t.slice(1, -1)) || t === ":PROPERTIES:"};
    } else if (drawer) {
      drawer.lines.push(text);
      if (t === ":END:" && drawer.hide) drawer = null;
      else if (t === ":END:") {
        const n = drawer.lines.length - 2;
        items.push({drawer: `<details class="drawer"><summary>${esc(drawer.name)} <span>(${n} line${n === 1 ? "" : "s"})</span></summary>` +
          `<pre>${drawer.lines.join("\n")}</pre></details>`});
        drawer = null;
      }
    } else if (!drawersOnly) {
      items.push(text);
    }
  }
  if (drawer && !drawersOnly) items.push(...drawer.lines);  // no :END:, so not a drawer after all
  const draw = part => {
    let html = "", plain = [];
    const flush = () => { if (plain.length) html += `<pre>${plain.join("\n")}</pre>`; plain = []; };
    for (const it of part) if (it.drawer) flush(), html += it.drawer; else plain.push(it);
    flush();
    return html;
  };
  if (items.length <= CLIP) return draw(items);
  return draw(items.slice(0, SHOWN)) +
    `<details class="more-body"><summary>Show all · ${items.length} lines</summary>${draw(items.slice(SHOWN))}</details>`;
}

// A heading's state buttons: its file's keywords (a #+TODO line makes them its
// own), and "–" for none, as org lets any heading have one or not (C-c C-t).
function stateChips(task) {
  const done = task.done_keywords ?? doneKeywords, keys = task.keyword_keys ?? keywordKeys;
  // The state's key, then the keyword's fast key (t n): both pressed from the list.
  const hint = k => k && keyHint("state") ? ` data-hint="${esc(keyHint("state"))} ${k === " " ? "SPC" : esc(k)}"` : "";
  return `<div class="chips">${(task.keywords ?? keywords).map((k, i) =>
    `<button data-do="state" data-kw="${esc(k)}" aria-pressed="${task.keyword === k}"${hint(keys[i])}
      style="${styleFor(done.includes(k) ? "done" : "todo", k)}">${esc(k)}</button>`).join("")}${
    `<button data-do="state" data-kw="" aria-pressed="${!task.keyword}" aria-label="No keyword" title="No keyword: a plain heading"${hint(" ")}>–</button>`}</div>`;
}

// The heading's title alone: the keyword, priority and tags have their own controls.
function titleHtml(heading) {
  const {text, spans} = heading;
  let from = (/^\*+\s*/.exec(text) || [""])[0].length, to = text.length;
  for (const s of spans.filter(s => ["todo", "done", "priority"].includes(s[2])).sort((a, b) => a[0] - b[0]))
    if (s[0] <= from + 1) from = s[1] + /^\s*/.exec(text.slice(s[1]))[0].length;
  const tags = spans.find(s => s[2] === "tag");
  if (tags) to = text.slice(0, tags[0]).trimEnd().length;
  return painted(text, spans, from, to, {links: heading.links});
}

// The title (tap to rename), the state, then the fields: what's set, each
// a link to its sheet (the one its key opens), and what isn't, as adders.
// An event's date (show's when) is a field: offered on a plain heading, and
// on an event no Schedule or Deadline (it would show in the agenda twice).
function taskFieldsHtml(task, heading) {
  const stamp = t => esc(t.replace(/^<|>$/g, "")), event = task.when && !task.keyword;
  const fields = [["pri", "priority", "Priority", "+ Priority", task.priority && esc(task.priority)],
    ...(task.when || !task.keyword ? [["when", "when", "When", "+ When", task.when && stamp(task.when)]] : []),
    ...(event && !task.scheduled ? [] : [["sched", "schedule", "Scheduled", "+ Schedule", task.scheduled && stamp(task.scheduled)]]),
    ...(event && !task.deadline ? [] : [["due", "deadline", "Deadline", "+ Deadline", task.deadline && stamp(task.deadline)]]),
    ["effort", "effort", "Effort", "+ Effort", task.effort && esc(task.effort)],
    ["tags", "tags", "Tags", "+ Tags", task.tags.length && task.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")]];
  const kw = task.keyword;
  if (task.read_only) {  // what's set, as text: nothing to tap
    const set = fields.filter(f => f[4]).map(([, , label, , value]) => `<span class="field"><span class="label">${label}</span> ${value}</span>`);
    return `<div class="title-row">${kw ? `<span class="kw" style="${styleFor(task.done ? "done" : "todo", kw)}">${esc(kw)}</span>` : ""}<div class="heading">${titleHtml(heading)}</div></div>
      ${set.length ? `<div class="field-line">${set.join("")}</div>` : ""}`;
  }
  const set = fields.filter(f => f[4]).map(([verb, action, label, , value]) =>
    `<button data-do="${verb}"${hintAttr(action)}><span class="label">${label}</span> ${value}</button>`);
  const unset = fields.filter(f => !f[4]).map(([verb, action, , add]) => `<button data-do="${verb}"${hintAttr(action)}>${add}</button>`);
  // The state: side by side one chip before the title, opening the state
  // sheet (t, then its key); on a phone the full row, a tap to any (CSS).
  const chip = `<button class="state-chip" data-do="states"${hintAttr("state")} aria-label="State"${
    kw ? ` style="${styleFor(task.done ? "done" : "todo", kw)}"` : ""}>${kw ? esc(kw) : "–"}</button>`;
  // When it was closed: org's, set by a done state and gone when reopened, so shown, not changed.
  const closed = task.closed ? `<span class="closed"><span class="label">Closed</span> ${esc(task.closed.replace(/^\[|\]$/g, ""))}</span>` : "";
  return `<div class="title-row">${chip}<div class="heading" role="button" tabindex="0" aria-label="Rename"${hintAttr("rename")}>${titleHtml(heading)}</div></div>
    <div class="title-edit" data-unit="title" hidden>
     <input id="t-title" value="${esc(task.title)}" aria-label="Title" autocapitalize="sentences" enterkeyhint="done">
     <div class="sheet-buttons"><button data-f="cancel">Cancel</button><button class="primary" data-f="save">Save</button></div>
    </div>
    <div class="states">${stateChips(task)}</div>
    ${set.length || closed ? `<div class="field-line">${closed}${set.join("")}</div>` : ""}
    ${unset.length ? `<div class="adders fields">${unset.join("")}</div>` : ""}`;
}

// A section's name, a control too: the sheet its key opens (history, clocks),
// so the key shows on the page.
const sectionName = (name, verb, action) => `<button class="section-name" data-do="${verb}"${hintAttr(action)}>${name}</button>`;

// The task's history (show's): every log item, newest first, the latest
// three, the rest folded.  A note, or a state change with one, says it; one
// without (a state change, a reschedule) is a quiet line.  Each opens to be
// changed or deleted.
function historyHtml(task) {
  const tag = task.read_only ? "div" : "button";
  const one = h => `<${tag} class="note${h.text ? "" : " quiet"}"${task.read_only ? "" : ` data-do="noteedit" data-n="${h.n}"`}>` +
    `<div class="when">${historyLabel(h, task.done_keywords)}<span>${esc(historyTime(h))}</span></div>${
      h.text ? `<div class="text">${esc(h.text)}</div>` : ""}</${tag}>`;
  const [recent, older] = [task.history.slice(0, 3), task.history.slice(3)];
  return recent.map(one).join("") + (older.length
    ? `<details class="older"><summary>${older.length} older</summary>${older.map(one).join("")}</details>` : "");
}
// Minutes clocked, against the estimate where there is one ("0:50 / 1:00"),
// red once past it.
const againstEffort = (m, effort) => effort == null ? hm(m)
  : `<span class="${m > effort ? "over" : ""}">${hm(m)} / ${hm(effort)}</span>`;

// Clock in, or out when it's the one running (drawClock keeps it so).
const clockButton = task => task.read_only ? "" : clockingOn(task)
  ? `<button data-do="clockout"${hintAttr("clock-out")}>■ Clock out</button>` : `<button data-do="clockin"${hintAttr("clock-in")}>⏱ Clock in</button>`;

// Its clocks by day, newest first, each day its total and a tap on a clock to
// change it; Clock in (or out, running here) beside the title.  The latest
// three, the rest folded, as the history is.
function clocksHtml(task) {
  const total = task.clocks.reduce((n, c) => n + c.minutes, 0);
  const title = `<div class="section-title with-action">${sectionName("Clocked", "clocks", "clocks")}<span class="clocked-total">${
    task.clocks.length ? againstEffort(total, task.effort_minutes) : "none"}</span>${clockButton(task)}</div>`;
  const entry = (c, label = "") => `<button class="clock-entry" data-do="clockedit" data-n="${c.n}">` +
    `<span>${label}${esc(clockSpan(c))}</span><span>${c.end ? "" : "running "}${hm(c.minutes)}</span></button>`;
  const days = clocks => {
    const out = [];
    for (const c of clocks) {
      if (out.at(-1)?.date !== c.start.slice(0, 10)) out.push({date: c.start.slice(0, 10), clocks: []});
      out.at(-1).clocks.push(c);
    }
    return out;
  };
  // A day's total is the whole day's, even split by the fold.
  const all = days(task.clocks), dayTotal = date => all.find(d => d.date === date).clocks.reduce((n, c) => n + c.minutes, 0);
  const day = d => all.find(a => a.date === d.date).clocks.length === 1 ? entry(d.clocks[0], `${esc(dayLabel(d.date))} · `)
    : `<div class="clock-day"><div class="clock-total"><span>${esc(dayLabel(d.date))}</span><span>${hm(dayTotal(d.date))}</span></div>${
      d.clocks.map(c => entry(c)).join("")}</div>`;
  const [recent, older] = [task.clocks.slice(0, 3), task.clocks.slice(3)];
  return `${title}<div class="detail clocks">${days(recent).map(day).join("")}${older.length
    ? `<details class="older"><summary>${plural(older.length, "older clock")}</summary>${days(older).map(day).join("")}</details>` : ""}</div>`;
}

// A note, written as any org text is, with the text tools (a function:
// ORG_TOOLS is forms.js's, loaded after this).
const noteComposer = () => `<div class="note-edit" data-unit="note" hidden>
  <div class="org-edit">${ORG_TOOLS}<textarea class="org" id="t-note" rows="3" autocapitalize="sentences" aria-label="Note"></textarea></div>
  <div class="sheet-buttons"><button data-f="cancel">Cancel</button><button class="primary" data-f="save">Save</button></div></div>`;

// The title edits in place: Enter saves, Escape cancels; a link in it still
// opens.  + Note opens the note's box.  The fields are sheets (doControl).
function wireTaskPage(task) {
  const heading = detail.querySelector(".heading"), titleEdit = detail.querySelector("[data-unit=title]");
  const noteEdit = detail.querySelector("[data-unit=note]");
  const input = titleEdit.querySelector("input");
  const editTitle = on => {
    const had = titleEdit.contains(document.activeElement);
    heading.hidden = on;
    titleEdit.hidden = !on;
    if (on) input.focus(), input.setSelectionRange(input.value.length, input.value.length);  // a fix is usually at the end
    else if (had) heading.focus();
  };
  const revert = u => {
    if (u === titleEdit) input.value = task.title, editTitle(false);
    else noteEdit.querySelector("textarea").value = "", noteEdit.hidden = true;
  };
  const save = u => {
    if (u === noteEdit) {
      const text = noteEdit.querySelector("textarea").value.trim();
      return text ? run("note", [task.id], [], text) : revert(u);
    }
    const title = input.value.trim();
    if (!title) return toast("A title, please", true);
    return title === task.title ? revert(u) : run("rename", [task.id], [title]);
  };
  heading.onclick = e => { if (!e.target.closest("a")) editTitle(true); };
  heading.onkeydown = e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); editTitle(true); }
  };
  input.onkeydown = e => {
    if (e.key === "Enter") { e.preventDefault(); save(titleEdit); }
    if (e.key === "Escape") { e.preventDefault(); revert(titleEdit); }
  };
  detail.onclick = e => {
    if (e.target.closest("[data-f=note]")) {
      noteEdit.hidden = false;
      return noteEdit.querySelector("textarea").focus();
    }
    const f = e.target.closest("[data-f]");
    if (f) return f.dataset.f === "save" ? save(f.closest("[data-unit]")) : revert(f.closest("[data-unit]"));
  };
}
// The file in a task page's path: the task shown in it, as TAB does; a
// parent: zoomed into, the task among its headings.
detail.addEventListener("click", e => {
  const a = e.target.closest("a[data-reveal], a[data-zoom]");
  if (!a || !currentTask) return;
  e.preventDefault();
  if (a.dataset.zoom) zoomTo(currentTask.file, a.dataset.zoom, currentTask.id);
  else revealTask(currentTask);
});
// A long task page scrolled past its title: the title, one line, stuck at
// the pane's top (a copy: the real one is inside the fields, where sticky
// can't hold it); a click goes back up.
function stickTitle() {
  const bar = detail.querySelector(".stuck-title"), title = detail.querySelector(".task-fields .heading");
  if (!bar || !title) return;
  bar.classList.toggle("on", title.getBoundingClientRect().bottom < bar.getBoundingClientRect().bottom);
}
addEventListener("scroll", stickTitle, {passive: true});
detail.addEventListener("scroll", stickTitle, {passive: true});
detail.addEventListener("click", e => {
  if (!e.target.closest(".stuck-title.on")) return;
  if (wide.matches) detail.scrollTo({top: 0, behavior: "smooth"}); else window.scrollTo({top: 0, behavior: "smooth"});
});
