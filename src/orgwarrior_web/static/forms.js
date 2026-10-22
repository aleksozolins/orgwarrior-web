"use strict";

// Pages of their own with a form: adding (#/add), the capture page of an add
// token, signing in by pasting the key, and editing an entry's text (#/e/ID),
// with the text tools over their org text boxes.

// ---- Add: a page of its own (#/add), for the room ----

// The open keywords of FILE, from /api/add-places' PLACES (a #+TODO line
// makes a file's its own), else org's.
const openKeywords = (places, file) => places.keywords[file] ?? keywords.filter(k => !doneKeywords.includes(k));

// What /api/add takes for ENTRY, filed at WHERE, a place's value: "u:ID"
// under a heading, "t:LABEL" a place, "" the default.
function addRequest(where, {event, title, keyword, priority, tags, scheduled, deadline, when, body, effort}) {
  const place = where.startsWith("u:") ? {under: where.slice(2)} : where ? {to: where.slice(2)} : {};
  return event ? {event: true, title, tags, when, body, ...place}
    : {title, keyword, priority, tags, scheduled, deadline, body, effort, ...place};
}

// ---- A new entry's fields, as the task page shows a task's ----

// What a page's new entry D has set, each a link to its sheet, and what it
// hasn't, adders: the add page's and the capture page's, the sheets the
// task page and the card use.  FIELDS: which this page offers (the capture
// page has no tags, priority or effort).  An event's When, needed, says so
// until it's set.  Its state rides in a hidden field, so leaving with picks
// made asks (formState).
const DRAFT_FIELDS = {
  pri: ["Priority", "+ Priority", d => d.priority],
  sched: ["Scheduled", "+ Schedule", d => d.scheduled],
  due: ["Deadline", "+ Deadline", d => d.deadline],
  effort: ["Effort", "+ Effort", d => d.effort],
  tags: ["Tags", "+ Tags", d => d.tags.length && d.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")],
  body: ["Details", "+ Details", d => d.body.trim() && esc(d.body.trim().split("\n")[0])],
};
function draftFieldsHtml(d, fields, place = null) {
  const shown = fields.filter(f => d.event ? !["pri", "sched", "due", "effort"].includes(f) : true);
  const value = f => f === "body" || f === "tags" ? DRAFT_FIELDS[f][2](d) : DRAFT_FIELDS[f][2](d) && esc(DRAFT_FIELDS[f][2](d));
  const set = shown.filter(value).map(f => `<button data-df="${f}"><span class="label">${DRAFT_FIELDS[f][0]}</span> ${value(f)}</button>`);
  const unset = shown.filter(f => !value(f)).map(f => `<button data-df="${f}">${DRAFT_FIELDS[f][1]}</button>`);
  const when = d.event ? (d.when ? `<button data-df="when"><span class="label">When</span> ${esc(d.when)}</button>`
    : `<button data-df="when" class="needs">When: pick a date</button>`) : "";
  const where = place ? `<button data-df="where"><span class="label">In</span> ${esc(placeLabel(place.label))}</button>` : "";
  return `<input type="hidden" class="draft-state" value="${esc(JSON.stringify(d))}">` +
    (where || when || set.length ? `<div class="field-line">${where}${when}${set.join("")}</div>` : "") +
    (unset.length ? `<div class="adders fields">${unset.join("")}</div>` : "");
}

// The sheet for field F of D, D changed as picked.  TITLE, what's being
// added ("Buy paint"), names each sheet; OPTIONS the places (the add page's).
async function pickDraftField(d, f, title, options = null) {
  const about = label => `${label} · ${esc(title || (d.event ? "new event" : "new task"))}`;
  const words = v => v && v !== "none" ? (v.date ?? v) : null;
  if (f === "pri") {
    const p = await pickPriority(about("Priority"), d.priority);
    if (p) d.priority = p === "none" ? null : p;
  } else if (f === "sched" || f === "due" || f === "when") {
    const v = await pickDate(about({sched: "Scheduled", due: "Deadline", when: "When"}[f]), f === "when" ? "event" : f);
    const key = {sched: "scheduled", due: "deadline", when: "when"}[f];
    if (v) d[key] = words(v);
  } else if (f === "effort") {
    const v = await pickEffort(about("Effort"), d.effort);
    if (v) d.effort = v === "none" ? null : v;
  } else if (f === "tags") {
    const st = await pickTags(about("Tags"), await fetchTags(), "set", d.tags);
    if (st) d.tags = [...st.keys()];
  } else if (f === "body") {
    const b = await pickBody(d.body, about("Details"));
    if (b !== null) d.body = b;
  } else if (f === "where") {
    const o = await pickPlace(about("Where"), options, d.place.value);
    if (o) d.place = o;
  }
}

// An event can't be added without its When: asked at Add if not before.
// True once D can go.
async function draftReady(d, title) {
  if (!title) return toast("A title, please", true), false;
  if (d.event && !d.when) await pickDraftField(d, "when", title);
  return (!d.event || !!d.when) && await confirmOutline(d.body);
}

// The lines of an entry's text org reads as headings, outside #+begin_/
// #+end_ blocks (the engine escapes those, as org does): they become its
// children, as {depth, text}.
function outlineHeadings(text) {
  let block = false;
  const heads = [];
  for (const line of (text ?? "").split("\n")) {
    if (/^[ \t]*#\+end_/i.test(line)) block = false;
    else if (/^[ \t]*#\+begin_/i.test(line)) block = true;
    else if (!block && /^\*+([ \t]|$)/.test(line)) heads.push({depth: /^\*+/.exec(line)[0].length, text: line.replace(/^\*+\s*/, "")});
  }
  return heads;
}

// Before saving text with headings in it: they go under the entry, in its
// outline, after any it has (keyword or not: a plain heading is one too).
// Asked, not just done: text pasted from elsewhere has "* item" lines
// (Markdown's lists).  True to go on.
async function confirmOutline(text) {
  const heads = outlineHeadings(text);
  if (!heads.length) return true;
  const top = Math.min(...heads.map(h => h.depth));
  const list = heads.slice(0, 8).map(h => `<li style="margin-left:${(h.depth - top) * 1.2}em">${esc(h.text || "(no title)")}</li>`).join("");
  return await ask(`<div class="sheet-title">${heads.length === 1 ? "A heading" : `${heads.length} headings`} in the details</div>
    <div class="hint">Lines starting with * are headings to org: they go under it, in its outline, after any it has.</div>
    <ul class="outline-list">${list}${heads.length > 8 ? `<li class="muted">and ${heads.length - 8} more</li>` : ""}</ul>
    <div class="sheet-buttons"><button data-a="cancel">${fastHint("n")}Keep editing</button>
    <button class="primary" data-a="yes" autofocus>${fastHint("y")}Add them under it</button></div>`,
    (e, done) => { if (e.target.closest("[data-a=yes]")) done(true); }) === true;
}

// "2 headings under it", for an answer's new_children.
const underIt = n => n ? ` · ${n} ${n > 1 ? "headings" : "heading"} under it` : "";

// ---- Add: a page of its own (#/add), for touch ----

// A task (keyword), an event (no keyword, its When, filed where [add.event]
// says), or a heading: a task without the keyword (a project, a section, a
// note), named so "–" among the states isn't a riddle.  Where: config's
// [add] (or [add.event]) unless picked, from the refile places; "+ Add" on
// an outline presets it (#/add?under=ID&label=..., #/add?to=FILE).  The
// rest as the task page shows a task: what's set, links; what isn't, adders.
async function showAdd() {
  const h = location.hash, params = new URLSearchParams(h.split("?")[1] ?? "");
  const places = await api("/api/add-places");
  if (location.hash !== h) return;
  const preset = params.get("under")
    ? {value: `u:${params.get("under")}`, label: params.get("label"), file: params.get("file"),
       short: `Under ${params.get("label").split(" › ").at(-1)}`}
    : params.get("to") ? {value: `t:${params.get("to")}`, label: params.get("to"), file: params.get("to"),
                          short: params.get("to")} : null;
  // The first place is the default: sent as nothing, so the server decides.
  const options = kind => {
    const opts = places[kind].map((p, i) => ({value: i ? `t:${p.label}` : "", label: p.label, file: p.file}));
    if (preset && !opts.some(o => o.value === preset.value)) opts.unshift({value: preset.value, label: preset.label, file: preset.file});
    return opts;
  };
  const openIn = file => openKeywords(places, file);
  const d = {event: false, heading: false, keyword: null, priority: null, tags: [], scheduled: null, deadline: null,
             when: null, effort: null, body: "", place: null};
  // The + offers where it was pressed; "+ Add" on an outline picks it.
  d.place = options("task").find(o => o.value === (preset && !params.has("offer") ? preset.value : "")) ?? options("task")[0];
  const fields = ["pri", "sched", "due", "effort", "tags", "body"];
  detail.innerHTML = `<button class="back" onclick="goBack()" data-hint="ESC">‹ Back</button>
    <div class="detail add-page">
     <div class="chips" id="kind"><button data-kind="task" aria-pressed="true">Task</button>
       <button data-kind="event" aria-pressed="false">Event</button>
       <button data-kind="heading" aria-pressed="false" title="No keyword: a project, a section, a note">Heading</button></div>
     <input id="title" placeholder="Title" autocapitalize="sentences" enterkeyhint="done">
     <div class="chips" id="kws"></div>
     ${preset ? `<div id="here"><div class="field-label">Add to</div><div class="chips"></div></div>` : ""}
     <div class="add-fields"></div>
     <div class="sheet-buttons"><button onclick="goBack()">Cancel</button>
     <button class="primary" data-a="add">Add</button></div>
    </div>`;
  const title = () => detail.querySelector("#title").value.trim();
  // A keyword picked stays picked where the file has it, else the file's first.
  const draw = () => {
    const open = openIn(d.place.file);
    if (!open.includes(d.keyword)) d.keyword = open[0] ?? "";
    const kws = detail.querySelector("#kws");
    kws.hidden = d.event || d.heading;
    kws.innerHTML = open.map(k => `<button data-kw="${esc(k)}" aria-pressed="${k === d.keyword}" style="${styleFor("todo", k)}">${esc(k)}</button>`).join("");
    // The default and where the page was opened from, as chips: one tap apart.
    const chips = detail.querySelector("#here .chips");
    const usual = options(d.event ? "event" : "task").find(o => o.value === "");
    if (chips) chips.innerHTML = [[usual.value, usual.label], [preset.value, preset.short]]
      .map(([v, l]) => `<button data-here="${esc(v)}" aria-pressed="${d.place.value === v}">${esc(l)}</button>`).join("");
    detail.querySelector(".add-fields").innerHTML = draftFieldsHtml(d, fields, d.place);
  };
  draw();
  pageForm = {hash: location.hash, state: formState(detail)};
  // After pageForm: what was shared counts as typed, so leaving asks.
  if (shared) {
    detail.querySelector("#title").value = shared.title;
    d.body = shared.body;
    shared = null;
    draw();
  }
  detail.querySelector("#title").focus();
  // Enter in the title adds: the quick way, a title and nothing else.
  detail.querySelector("#title").onkeydown = e => {
    if (e.key !== "Enter" || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    detail.querySelector("[data-a=add]").click();
  };
  detail.onclick = async e => {
    const b = e.target.closest("[data-kind], [data-kw], [data-here], [data-df], [data-a=add]");
    if (!b) return;
    if (b.dataset.df) {
      await pickDraftField(d, b.dataset.df, title(), options(d.event ? "event" : "task"));
      return draw();
    }
    if (b.dataset.kind) {
      d.event = b.dataset.kind === "event";
      d.heading = b.dataset.kind === "heading";
      for (const k of detail.querySelectorAll("#kind button")) k.setAttribute("aria-pressed", String(k === b));
      // Events have a default place of their own; a place picked stays picked.
      const opts = options(d.event ? "event" : "task");
      d.place = opts.find(o => o.value === d.place.value && o.value) ?? (preset && d.place.value === preset.value ? d.place : opts[0]);
      return draw();
    }
    if (b.dataset.here !== undefined) {
      d.place = options(d.event ? "event" : "task").find(o => o.value === b.dataset.here) ?? d.place;
      return draw();
    }
    if (b.dataset.kw !== undefined) {
      d.keyword = b.dataset.kw;
      return draw();
    }
    if (!await draftReady(d, title())) return draw();
    draw();
    // Fields, not `orgwarrior add` syntax: nothing in the title is read as a date or tag.
    b.disabled = true;
    try {
      const r = await post("/api/add", addRequest(d.place.value, {...d, title: title(), keyword: d.heading ? "" : d.keyword,
        effort: d.effort || undefined}));
      added(r.id, title(), r.new_children);
      pageForm = null;
      goBack();
    } catch (err) {
      b.disabled = false;
      toast(err.message, true);
    }
  };
}

// ---- Capture: an add token's one page, adding to someone's list unseen ----

// The add page without anything of the list's (keywords, tags, the views):
// the server decides those.  Its fields as the add page's: Scheduled,
// Deadline (an event's When), Details.  NAME is whose list it is ([web]
// name).  Under the form, what this key has sent, read live from org:
// archived, it's gone.
function showCapture(name) {
  const whose = name ? `${name}'s list` : "Adding a task";
  document.body.dataset.mode = "add";
  document.title = name ? `ow · ${name}` : "orgwarrior";
  document.querySelector(".topbar").insertAdjacentHTML("beforeend", `<span class="whose">${esc(whose)}<small>${
    name ? `You can add to it; only ${esc(name)} sees it.` : "This key adds; it can't see the list."}</small></span>`);
  // Its ⚙ (the themes) beside them: the query box's row isn't shown here.
  document.querySelector(".topbar").append(gear);
  let lastSent = null, d;
  const fields = ["sched", "due", "body"];
  const title = () => detail.querySelector("#title").value.trim();
  // Clear shows once something's typed or picked: there's nowhere to go back to.
  const drawFields = () => {
    detail.querySelector(".add-fields").innerHTML = draftFieldsHtml(d, fields);
    detail.querySelector("[data-a=clear]").hidden = !(title() || d.scheduled || d.deadline || d.when || d.body.trim());
  };
  const draw = () => {
    d = {event: false, tags: [], scheduled: null, deadline: null, when: null, body: ""};
    detail.innerHTML = `<div class="detail add-page capture">
     <div class="chips" id="kind"><button data-kind="task" aria-pressed="true">Task</button>
       <button data-kind="event" aria-pressed="false">Event</button></div>
     <input id="title" placeholder="Short title; more goes in Details" autocapitalize="sentences" enterkeyhint="send">
     <div class="add-fields"></div>
     <div class="sheet-buttons"><button data-a="clear" class="clear" hidden>Clear</button>
      <button class="primary" data-a="add">${name ? `Add to ${esc(name)}'s list` : "Add"}</button></div>
     ${lastSent ? `<div class="sent-line">✓ Sent${name ? ` to ${esc(name)}` : ""}: ${esc(lastSent)}</div>` : ""}
     <div id="sent-list"></div>
    </div>`;
    if (shared) {
      detail.querySelector("#title").value = shared.title;
      d.body = shared.body;
      shared = null;
    }
    drawFields();
    detail.querySelector("#title").onkeydown = e => {
      if (e.key === "Enter") { e.preventDefault(); detail.querySelector("[data-a=add]").click(); }
    };
    detail.querySelector("#title").focus();
    loadSent();
  };
  const loadSent = async () => {
    try {
      const sent = await api("/api/sent");
      detail.querySelector("#sent-list").innerHTML = sentListHtml(sent, lastSent);
    } catch (err) {
      detail.querySelector("#sent-list").innerHTML = `<div class="error">${esc(err.message)}</div>`;
    }
  };
  // Back on the app: what the list's owner did since.  iOS has no pull to
  // refresh in an installed web app.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadSent();
  });
  detail.oninput = () => drawFields();
  detail.onclick = async e => {
    const b = e.target.closest("[data-kind], [data-df], [data-a=add], [data-a=clear]");
    if (!b) return;
    if (b.dataset.a === "clear") return draw();
    if (b.dataset.df) {
      await pickDraftField(d, b.dataset.df, title());
      return drawFields();
    }
    if (b.dataset.kind) {
      d.event = b.dataset.kind === "event";
      for (const k of detail.querySelectorAll("#kind button")) k.setAttribute("aria-pressed", String(k === b));
      return drawFields();
    }
    // Headings would be tasks of their own: the server refuses them from this key.
    if (outlineHeadings(d.body).length) return toast("A line of details can't start with * here", true);
    if (!await draftReady(d, title())) return drawFields();
    b.disabled = true;
    try {
      await post("/api/add", d.event ? {event: true, title: title(), when: d.when, body: d.body}
        : {title: title(), scheduled: d.scheduled, deadline: d.deadline, body: d.body});
      lastSent = title();
      draw();
    } catch (err) {
      b.disabled = false;
      toast(err.message, true);
    }
  };
  draw();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// An org timestamp as a person reads it: "<2026-10-17 Sat 14:00 +1w>" is
// "Sat 17 Oct 2:00 PM" (the time as the phone's language writes it); TIME
// false leaves the time out.
function stampText(stamp, time = true) {
  const m = /(\d{4})-(\d\d)-(\d\d)\s+([^\s>\]]+)(?:\s+(\d{1,2}:\d\d(?:-\d{1,2}:\d\d)?))?/.exec(stamp || "");
  if (!m) return "";
  const year = Number(m[1]) !== new Date().getFullYear() ? ` ${m[1]}` : "";
  const clock = t => new Date(2000, 0, 1, ...t.split(":").map(Number))
    .toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});
  return `${m[4]} ${Number(m[3])} ${MONTHS[m[2] - 1]}${year}${time && m[5] ? " " + m[5].split("-").map(clock).join("–") : ""}`;
}

// When it was sent, from :CAPTURED:: today, yesterday, a weekday this week, else the date.
function sentText(stamp) {
  const m = /(\d{4})-(\d\d)-(\d\d)\s+([^\s>\]]+)/.exec(stamp || "");
  if (!m) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today - new Date(m[1], m[2] - 1, m[3])) / 86400000);
  return days <= 0 ? "sent today" : days === 1 ? "sent yesterday"
    : days < 7 ? `sent ${m[4]}` : `sent ${stampText(stamp, false).replace(/^\S+ /, "")}`;
}

// What an add token sent (/api/sent, newest first) in plain words: dates,
// done or not; never the keyword, which is the list owner's workflow.
// JUST: the title just sent, marked.
function sentListHtml(sent, just) {
  if (!sent.length) return "";
  const status = e => {
    if (e.done) return `Done${e.closed ? " " + esc(stampText(e.closed, false)) : ""}`;
    if (e.event) return e.when ? `<span class="sched">${esc(stampText(e.when))}</span> · event` : "Event";
    const dates = [e.scheduled && `<span class="sched">Scheduled ${esc(stampText(e.scheduled))}</span>`,
                   e.deadline && `<span class="due">Due ${esc(stampText(e.deadline))}</span>`].filter(Boolean);
    return dates.length ? dates.join(" · ") : "Not scheduled yet";
  };
  let marked = false;
  const item = e => {
    const isNew = !marked && !e.done && e.title === just;
    marked ||= isNew;
    return `<div class="sent-item${e.done ? " done" : ""}${isNew ? " new" : ""}"><div class="t">${esc(e.title)}</div>
      <div class="s">${[status(e), esc(sentText(e.sent))].filter(Boolean).join(" · ")}</div></div>`;
  };
  const open = sent.filter(e => !e.done), done = sent.filter(e => e.done);
  return `<div class="section-title with-action">Sent by you<span class="count">${open.length} open</span></div>
    ${open.map(item).join("")}
    ${done.length ? `<details class="older"><summary>Done (${done.length})</summary>${done.map(item).join("")}</details>` : ""}`;
}

// ---- Signing in by pasting the key ----

// Not signed in: a field for the key (or the whole link).  For an app on
// an iPhone's home screen, which keeps cookies apart from Safari's, so the
// link opened in Safari never reaches it.
function showSignIn() {
  document.body.dataset.mode = "signin";
  detail.innerHTML = `<div class="detail signin">
    <p class="signin-title">This device isn't signed in.</p>
    <p class="hint">Paste the key you were given, or the whole link.</p>
    <input id="key" placeholder="Key or link" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go">
    <div class="sheet-buttons"><button class="primary" data-a="signin">Sign in</button></div>
  </div>`;
  const input = detail.querySelector("#key");
  const go = async () => {
    const v = input.value.trim(), m = /[?&]key=([^&#\s]+)/.exec(v);
    if (!v) return toast("Paste the key first", true);
    try {
      await post("/api/sign-in", {key: m ? decodeURIComponent(m[1]) : v});
      location.replace("/");
    } catch (err) {
      toast(err.message, true);
    }
  };
  input.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); go(); } };
  detail.onclick = e => { if (e.target.closest("[data-a=signin]")) go(); };
}

// ---- Edit: the entry's text below its heading, raw (#/e/ID) ----

// Planning line, drawers and body as they are in the file.  The engine saves
// them with one blank line before the body, and refuses if the entry changed
// since it was loaded.
async function showEdit(id) {
  const h = location.hash, task = await api(`/api/task/${encodeURIComponent(id)}`), [heading] = task.lines;
  if (location.hash !== h) return;
  const {parts, gap, body} = splitEntry(task.body);
  detail.innerHTML = `<button class="back" onclick="goBack()" data-hint="ESC">‹ Back</button>
    <div class="detail">
     <pre class="heading">${painted(heading.text, heading.spans)}</pre>
     ${parts.map((p, i) => `<details class="fold" data-part="${i}"><summary>${esc(p.label)}<span>${esc(p.summary)}</span></summary>
       <textarea class="org" spellcheck="false" aria-label="${esc(p.label)}"></textarea></details>`).join("")}
     <div class="org-edit">${ORG_TOOLS}
      <textarea class="org" id="entry" spellcheck="false" autocapitalize="sentences" aria-label="Details"></textarea></div>
     <div class="sheet-buttons"><button onclick="goBack()">Cancel</button>
     <button class="primary" data-a="save">Save</button></div>
    </div>`;
  // Not in the HTML: a leading newline would go.
  parts.forEach((p, i) => detail.querySelector(`[data-part="${i}"] textarea`).value = p.text);
  detail.querySelector("#entry").value = body;
  pageForm = {hash: location.hash, state: formState(detail)};
  if (keyboardOn()) detail.querySelector("#entry").focus();  // e: typing at once
  // The parts back in their order; an emptied one goes (a drawer removed).
  const joined = () => {
    const front = parts.map((_, i) => detail.querySelector(`[data-part="${i}"] textarea`).value.replace(/\s+$/, ""))
      .filter(Boolean).join("\n");
    const text = detail.querySelector("#entry").value;
    return !front ? text : text ? `${front}\n${gap || "\n"}${text}` : front;
  };
  detail.onclick = async e => {
    const b = e.target.closest("[data-a=save]");
    if (!b) return;
    if (!await confirmOutline(joined())) return detail.querySelector("#entry").focus();
    b.disabled = true;
    try {
      const r = await post("/api/entry", {id: task.id, text: joined(), old: task.body});
      toast(`Saved${underIt(r.new_children)}`);
      pageForm = null;
      goBack();
    } catch (err) {
      b.disabled = false;
      toast(err.message, true);
    }
  };
}

// The planning line and the drawers right below the heading, each a part of
// its own, and the body after them: org fixes that order, so they split
// cleanly.  A drawer further down stays in the body.  GAP is the blank
// lines between, kept as they were.
function splitEntry(text) {
  const lines = text.split("\n"), parts = [];
  let i = 0;
  if (/^\s*(SCHEDULED|DEADLINE|CLOSED):/.test(lines[0]))
    parts.push({label: "Planning", summary: `: ${lines[0].trim()}`, text: lines[i++]});
  while (i < lines.length && /^\s*:[\w-]+:\s*$/.test(lines[i]) && !/^\s*:END:\s*$/i.test(lines[i])) {
    const end = lines.findIndex((l, j) => j > i && /^\s*:END:\s*$/i.test(l));
    if (end < 0) break;
    parts.push({label: lines[i].trim(), summary: ` (${end - i - 1})`, text: lines.slice(i, end + 1).join("\n")});
    i = end + 1;
  }
  if (!parts.length) return {parts, gap: "", body: text};
  const rest = lines.slice(i).join("\n"), body = rest.replace(/^(?:[ \t]*\n)+/, "");
  return {parts, gap: rest.slice(0, rest.length - body.length), body};
}

// ---- The text tools: org syntax typed for you, over an org text box ----

const ORG_TOOLS = `<div class="org-tools" role="toolbar" aria-label="Formatting">
  <button type="button" data-tool="bold" aria-label="Bold"><b>B</b></button>
  <button type="button" data-tool="italic" aria-label="Italic"><i>I</i></button>
  <button type="button" data-tool="link" aria-label="Link"><svg viewBox="0 0 24 24" width="18" height="18" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/>
    <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/></svg></button>
  <button type="button" data-tool="code" aria-label="Code" title="Code: ~code~"><code>~</code></button>
  <button type="button" data-tool="box" aria-label="Checkbox">☐</button>
  <button type="button" data-tool="list" aria-label="List">•</button>
  <button type="button" data-tool="num" aria-label="Numbered list">1.</button>
  <button type="button" data-tool="src" aria-label="Code block" title="A code block: #+begin_src">&lt;/&gt;</button>
  <button type="button" data-tool="quote" aria-label="Quote" title="A quote: #+begin_quote">❝</button></div>`;

// Replace FROM..TO in TA with TEXT, then select SEL..SELEND.  insertText keeps
// the browser's undo; setRangeText is the fallback.
function editText(ta, from, to, text, sel, selEnd = sel) {
  ta.focus();
  ta.setSelectionRange(from, to);
  if (!document.execCommand("insertText", false, text)) {
    ta.setRangeText(text, from, to);
    ta.dispatchEvent(new Event("input", {bubbles: true}));
  }
  ta.setSelectionRange(sel, selEnd);
}

async function orgTool(tool, ta) {
  const {value, selectionStart: s, selectionEnd: e} = ta;
  if (tool === "bold" || tool === "italic" || tool === "code") {
    const m = {bold: "*", italic: "/", code: "~"}[tool];
    return editText(ta, s, e, m + value.slice(s, e) + m, s + 1, e + 1);
  }
  // A block (#+begin_src LANG, #+begin_quote) around the lines the selection
  // touches, or an empty one at the caret, the caret inside.
  if (tool === "src" || tool === "quote") {
    let lang = "";
    if (tool === "src") {
      const v = await ask(
        `<div class="sheet-title">Code block</div>
         <input id="src-lang" list="src-langs" placeholder="Language (optional): python, sh, emacs-lisp…"
           autocapitalize="off" autocomplete="off" spellcheck="false" autofocus>
         <datalist id="src-langs">${["sh", "python", "emacs-lisp", "javascript", "json", "sql", "yaml", "text"]
           .map(l => `<option value="${l}">`).join("")}</datalist>
         <div class="sheet-buttons"><button data-a="cancel">Cancel</button>
         <button class="primary" data-a="save">Add</button></div>`,
        (ev, done) => { if (ev.target.closest("[data-a=save]")) done(sheet.querySelector("#src-lang").value.trim()); });
      if (v === null) return ta.focus();
      lang = v ? ` ${v}` : "";
    }
    const kind = tool === "src" ? "src" : "quote";
    const from = value.lastIndexOf("\n", s - 1) + 1;
    let to = e > s ? value.indexOf("\n", value[e - 1] === "\n" ? e - 1 : e) : s;
    if (to < 0) to = value.length;
    const inner = e > s ? value.slice(from, to) : "";
    // A block has lines of its own: one broken at the caret for it.
    const lead = e > s || s === from ? "" : "\n", tail = e > s || !value[s] || value[s] === "\n" ? "" : "\n";
    const out = `${lead}#+begin_${kind}${lang}\n${inner}${inner && !inner.endsWith("\n") ? "\n" : ""}#+end_${kind}${tail}`;
    const start = e > s ? from : s, caret = start + lead.length + `#+begin_${kind}${lang}\n`.length + inner.length;
    return editText(ta, start, e > s ? to : s, out, inner ? start + out.length : caret);
  }
  if (tool === "link") {
    const link = await ask(
      `<div class="sheet-title">Link</div>
       <input id="l-url" type="url" inputmode="url" placeholder="https://…" autocapitalize="off" spellcheck="false" autofocus>
       <input id="l-text" placeholder="Text (optional)" value="${esc(value.slice(s, e))}">
       <div class="sheet-buttons"><button data-a="cancel">Cancel</button>
       <button class="primary" data-a="save">Add</button></div>`,
      (ev, done) => {
        if (!ev.target.closest("[data-a=save]")) return;
        const url = sheet.querySelector("#l-url").value.trim();
        if (!url) return toast("The address, please", true);
        // A bare example.org is a web address; file:, id: and the rest keep theirs.
        done({url: /^[a-z][\w+.-]*:/i.test(url) ? url : `https://${url}`,
              text: sheet.querySelector("#l-text").value.trim()});
      });
    if (!link) return ta.focus();
    const text = `[[${link.url}]${link.text ? `[${link.text}]` : ""}]`;
    return editText(ta, s, e, text, s + text.length);
  }
  // Checkbox and list: on the lines the selection touches, on, or off when all have it.
  const from = value.lastIndexOf("\n", s - 1) + 1;
  let to = value.indexOf("\n", e > s && value[e - 1] === "\n" ? e - 1 : e);
  if (to < 0) to = value.length;
  const lines = value.slice(from, to).split("\n").map(l =>
    l.match(/^([ \t]*)(?:([-+]|\d+[.)])[ \t]+(\[[ X-]\][ \t]*)?)?(.*)$/));
  const used = lines.length === 1 ? lines : lines.filter(m => m[2] || m[4].trim());
  // A numbered one counts on from 1, in the lines' order.
  const has = m => tool === "box" ? m[2] && m[3] : tool === "num" ? m[2] && /\d/.test(m[2]) && !m[3] : m[2] && !/\d/.test(m[2]) && !m[3];
  const off = used.every(has);
  let n = 0;
  const out = lines.map(m => {
    const [, indent, bullet, , rest] = m;
    if (!used.includes(m)) return m[0];
    if (off) return indent + rest;
    if (has(m)) return m[0];
    return indent + (tool === "box" ? (bullet && !/\d/.test(bullet) ? bullet : "-") + " [ ] " : tool === "num" ? `${++n}. ` : "- ") + rest;
  }).join("\n");
  editText(ta, from, to, out, s === e ? from + out.length : from, from + out.length);
}

// The buttons keep the focus in the box: the keyboard stays up, the selection kept.
for (const type of ["pointerdown", "mousedown"])
  document.addEventListener(type, e => { if (e.target.closest("[data-tool]")) e.preventDefault(); });
document.addEventListener("click", e => {
  const b = e.target.closest("[data-tool]");
  if (b) orgTool(b.dataset.tool, b.closest(".org-edit").querySelector("textarea"));
});

// Enter in an org text box carries the line's indentation and list bullet
// ("- ", "1. ", "- [ ] ") onto the next line; on an empty item it ends the list.
// beforeinput, not keydown: Android keyboards don't report Enter as a key.
document.addEventListener("beforeinput", e => {
  const ta = e.target;
  if (!ta.matches("textarea.org") || !["insertLineBreak", "insertParagraph"].includes(e.inputType)) return;
  const {value, selectionStart: at, selectionEnd} = ta;
  const start = value.lastIndexOf("\n", at - 1) + 1, line = value.slice(start, at);
  const [prefix, indent, bullet, box] = line.match(/^([ \t]*)(?:([-+]|\d+[.)])[ \t]+(\[[ X-]\][ \t]+)?)?/);
  if (bullet && prefix === line) {
    e.preventDefault();
    ta.setRangeText(indent, start, selectionEnd, "end");
    return;
  }
  const numbered = /^\d/.test(bullet ?? "");
  const next = indent + (bullet ? `${numbered ? parseInt(bullet, 10) + 1 + bullet.slice(-1) : bullet} ${box ? "[ ] " : ""}` : "");
  if (!next) return;
  e.preventDefault();
  ta.setRangeText("\n" + next, at, selectionEnd, "end");
});
