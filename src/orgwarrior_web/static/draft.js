"use strict";

// c: a new entry as a card at the bottom, opened in its title (a task by
// default; 1 2 3 off the title its kind, Task, Event, Heading), then filled
// with the keys and sheets used on tasks (t , : s d E w, e the body) from
// anywhere on the card but the title, only what's set shown.  Enter in the title goes on to Add;
// Enter adds; Esc drops it (asking, if anything's set).  Where: [add]'s
// place, the cursor's task offered next ("Under …"), or any refile place.
// AT picks one: "under" (a), a child of the cursor's task; "beside" (A), at
// its level, as org's M-RET (under its parent, or the file's top level; in a
// file with no task, its top).  The + keeps its add page.
async function draftTask(at = null) {
  const fetched = await orToast(Promise.all([fetchTags(), api("/api/add-places")]));
  if (!fetched) return;
  const [tags, places] = fetched;
  const target = await keyTargets().catch(() => null);
  const near = target?.ids.length === 1 && target.task ? target.task : null;
  if (at === "under" && !near) return toast("There's no task here to add under", true);
  const parent = near?.parents.at(-1);
  const home = near?.file ?? (inFile() ? fileShown : null);
  const beside = at !== "beside" ? null : parent?.id
    ? {value: `u:${parent.id}`, label: `Under ${parent.title}`, file: home}
    : home ? {value: `t:${home}`, label: home, file: home} : null;
  if (at === "beside" && !beside) return toast("There's no task or file here to add beside", true);
  const options = kind => {
    const all = [
      {value: "", label: places[kind][0].label, file: places[kind][0].file},
      ...(beside ? [beside] : []),
      ...(near ? [{value: `u:${near.id}`, label: `Under ${near.title}`, file: near.file}] : []),
      ...places[kind].slice(1).map(p => ({value: `t:${p.label}`, label: p.label, file: p.file}))];
    return all.filter((o, i) => all.findIndex(x => x.value === o.value) === i);
  };
  const openIn = file => openKeywords(places, file);
  const d = {title: "", keyword: openIn(places.task[0].file)[0] ?? "", priority: null, tags: [],
             scheduled: null, deadline: null, when: null, effort: null, event: false, place: options("task")[0], body: ""};
  if (at) {
    d.place = options("task").find(o => o.value === (at === "under" ? `u:${near.id}` : beside.value));
    d.keyword = openIn(d.place.file)[0] ?? "";
  }
  const fresh = JSON.stringify(d);
  const words = v => v && v !== "none" ? (v.date ?? v) : null;
  // The kind, a row at the top: the card opens in the title below it (a
  // task); ↑ or Shift-Tab from the title go up to it.  Its keys are digits,
  // the tabs' by default (nothing in a sheet); a field bound to one keeps it.
  const KINDS = ["task", "event", "heading"], cap = k => k[0].toUpperCase() + k.slice(1);
  const kind = () => d.event ? "event" : d.keyword ? "task" : "heading";
  const toTask = () => {
    d.event = false;
    d.when = null;
    if (!d.place.value) d.place = options("task")[0];  // the default follows the kind
  };
  const setKind = k => {
    if (k === kind()) return;
    if (k === "event") {
      d.event = true;
      if (!d.place.value) d.place = options("event")[0];
    } else {
      toTask();
      d.keyword = k === "heading" ? "" : d.keyword || (openIn(d.place.file)[0] ?? "");
    }
  };
  // Each kind's keys: an event has a When, not a state or two dates; a
  // heading no state.
  // Each field by the action it has on a task (its key from the table): an event's When is schedule's.
  const keysFor = k => [...(k === "task" ? [["state", "state"]] : []), ...(k !== "event" ? [["priority", "priority"]] : []),
    ["tags", "tags"], ...(k === "event" ? [["schedule", "when"]] : [["schedule", "scheduled"], ["deadline", "deadline"], ["effort", "effort"]]),
    ["refile", "where"], ["edit", "details"]];
  const parts = () => {
    const k = kind();
    // The keyword in its color, the priority, the tags as chips; then a row
    // for each field set, its label muted and its value plain, as the task
    // page shows what's set. Where it lands always; the keys below list the rest.
    const line = [k === "task" && d.keyword ? `<span class="kw" style="${styleFor("todo", d.keyword)}">${esc(d.keyword)}</span>` : "",
                  d.priority && k !== "event" ? `<span class="pri">[#${esc(d.priority)}]</span>` : "",
                  ...d.tags.map(t => `<span class="tag">${esc(t)}</span>`)].filter(Boolean).join(" ");
    const row = (label, value, unset = false) =>
      `<div class="dr-row"><span class="label">${label}</span> <span class="${unset ? "muted" : "value"}">${value}</span></div>`;
    const firstLine = d.body?.trim().split("\n")[0];
    return {
      title: `New ${k}`,
      kinds: KINDS.map((x, i) => `<button data-kindset="${x}" aria-pressed="${x === k}">${cap(x)}${fastHint(String(i + 1))}</button>`).join(""),
      draft: `${line ? `<div class="dr-head">${line}</div>` : ""}
        ${k === "event" ? row("When", esc(d.when ?? "pick a date"), !d.when)  // an event's is asked at Add if not set
          : [d.scheduled && row("Scheduled", esc(d.scheduled)), d.deadline && row("Deadline", esc(d.deadline)),
             d.effort && row("Effort", esc(d.effort))].filter(Boolean).join("")}
        ${row("In", esc(placeLabel(d.place.label)))}
        ${firstLine ? row("Details", esc(firstLine)) : ""}`,
      keys: keysFor(k).map(([action, label]) => `<span data-pick="${action}">${
        keyHint(action) ? `<kbd>${esc(keyHint(action))}</kbd> ` : ""}${label}</span>`).join(""),
    };
  };
  // The card redrawn in place (a kind switched), the title as typed.
  const paint = () => {
    const p = parts();
    sheet.querySelector(".sheet-title").textContent = p.title;
    sheet.querySelector(".kinds-row").innerHTML = p.kinds;
    sheet.querySelector(".draft").innerHTML = p.draft;
    sheet.querySelector(".draft-keys").innerHTML = p.keys;
  };
  const kindButton = () => sheet.querySelector(".kinds-row [aria-pressed=true]");
  let focusOn = "title";  // where the card opens: its title, then back from a picker
  for (;;) {
    const p = parts();
    const card = `<div class="sheet-title">${p.title}</div>
      <div class="chips kinds-row" role="radiogroup" aria-label="Kind">${p.kinds}</div>
      <input id="dr-title" value="${esc(d.title)}" placeholder="Title" autocomplete="off" autocapitalize="sentences">
      <div class="draft">${p.draft}</div>
      <div class="draft-keys">${p.keys}</div>
      <div class="sheet-buttons"><button data-a="cancel">Cancel</button>
       <button class="primary" data-a="add">Add</button></div>`;
    const titleEl = () => sheet.querySelector("#dr-title");
    const title = () => titleEl().value;
    const pending = ask(card, (e, finish) => {
      const k = e.target.closest("[data-kindset]");
      if (k) return setKind(k.dataset.kindset), paint(), kindButton().focus();
      const b = e.target.closest("[data-pick], [data-a=add]");
      if (b) finish({title: title(), pick: b.dataset.pick});
    }, () => title().trim() !== d.title.trim() || JSON.stringify({...d, title: ""}) !== JSON.stringify({...JSON.parse(fresh), title: ""}));
    // 1 2 3 anywhere on the card but the title; the focus stays where it was.
    sheet.querySelector(".sheet-body").onkeydown = e => {
      const n = /^[123]$/.exec(e.key)?.[0];
      if (!n || e.ctrlKey || e.metaKey || e.altKey || e.target === titleEl()
          || bindingsOf(keysFor(kind()).map(([action]) => action))[0].has(n)) return;
      e.preventDefault();
      const onRow = !!e.target.closest(".kinds-row");
      setKind(KINDS[n - 1]);
      paint();
      if (onRow) kindButton().focus();
    };
    // On the kinds: ← → step through them; Enter, Tab or ↓ back to the
    // title; the fields' keys work here too.
    const row = sheet.querySelector(".kinds-row");
    row.onkeydown = e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const at = KINDS.indexOf(kind()), step = {ArrowRight: 1, ArrowLeft: -1}[e.key];
      if (step) {
        e.preventDefault();
        setKind(KINDS[(at + step + 3) % 3]);
        paint();
        return kindButton().focus();
      }
      if (["Enter", "ArrowDown"].includes(e.key) || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        return titleEl().focus();
      }
    };
    // Enter in the title: on to Add, focused (Enter again adds); the keys work
    // from there.  Esc too: out of the field, the card kept (Esc again drops
    // it).  ↑: up to the kind.
    titleEl().onkeydown = e => {
      if (e.key === "ArrowUp") return e.preventDefault(), kindButton().focus();
      if (!(e.key === "Enter" && !e.ctrlKey && !e.metaKey) && e.key !== "Escape") return;
      e.preventDefault();
      sheet.querySelector("[data-a=add]").focus();
    };
    (focusOn === "title" || !d.title ? titleEl() : sheet.querySelector("[data-a=add]")).focus();
    focusOn = null;
    const r = await pending;
    if (!r) return;
    d.title = r.title;
    // Each picker says what it's for: the draft out of sight under it.
    const about = label => `${label} · ${esc(d.title.trim() || `new ${kind()}`)}`;
    const when = async () => {
      const v = await pickDate(about("When"), "event");
      if (v && v !== "none") d.when = words(v);
    };
    switch (r.pick) {
      case undefined: {  // Add
        if (!d.title.trim()) { toast("A title, please", true); continue; }
        if (d.event && !d.when) await when();  // an event's date, asked at the end if not before
        if (d.event && !d.when) continue;
        if (!await confirmOutline(d.body)) continue;
        try {
          const r = await post("/api/add", addRequest(d.place.value, {...d, title: d.title.trim()}));
          added(r.id, d.title.trim(), r.new_children);
          return route(true);
        } catch (e) {
          toast(e.message, true);
          continue;
        }
      }
      case "state": {
        const open = openIn(d.place.file);
        const kw = await pickState(about("State"), open, [], open.map(k => keywordKeys[keywords.indexOf(k)] ?? null), d.keyword, "– heading");
        if (kw !== null) d.keyword = kw;
        break;
      }
      case "priority": {
        const pr = await pickPriority(about("Priority"), d.priority);
        if (pr) d.priority = pr === "none" ? null : pr;
        break;
      }
      case "tags": {
        const st = await pickTags(about("Tags"), tags, "set", d.tags);
        if (st) d.tags = [...st.keys()];
        break;
      }
      case "schedule": case "deadline": {
        if (d.event) { await when(); break; }
        const sched = r.pick === "schedule";
        const v = await pickDate(about(sched ? "Scheduled" : "Deadline"), sched ? "sched" : "due");
        if (v) d[sched ? "scheduled" : "deadline"] = words(v);
        break;
      }
      case "refile": {
        const o = await pickPlace(about("Where"), options(d.event ? "event" : "task"), d.place.value);
        if (o) {
          d.place = o;
          // The keywords of the file it's going to: a #+TODO line makes a file's its own.
          if (d.keyword && !openIn(o.file).includes(d.keyword)) d.keyword = openIn(o.file)[0] ?? "";
        }
        break;
      }
      case "effort": {
        const v = await pickEffort(about("Effort"), d.effort);
        if (v) d.effort = v === "none" ? null : v;
        break;
      }
      case "edit": {
        const b = await pickBody(d.body, about("Details"));
        if (b !== null) d.body = b;
        break;
      }
    }
  }
}
