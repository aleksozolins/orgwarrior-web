"use strict";

// Sheets and the pickers in them: ask() and toast(), states, priorities,
// dates, tags, places and a body, each a sheet that resolves with what was
// picked, for an action (actions.js) or a draft (draft.js).

const sheet = document.getElementById("sheet");
const toastEl = document.getElementById("toast");
let allTags = null;  // fetched once, for the tag sheets

const post = (path, body) => api(path, {method: "POST", headers: {"Content-Type": "application/json"},
                                         body: JSON.stringify(body)});
// What PROMISE gives, or null after a toast of its error.
async function orToast(promise) {
  try {
    return await promise;
  } catch (e) {
    toast(e.message, true);
    return null;
  }
}

// At the top, just under the header: what was tapped is usually lower down.
// OPEN, a task's ID: its button opens it; ACTION, {label, run}: a step after
// (a clock's Adjust).  The button, or Enter while it shows (keys.js), takes
// it (RET its hint); a tap anywhere else on the toast dismisses it, so what
// it covers (Back) is a tap away.
let toastTimer, toastAction = null;
const hideToast = () => { toastEl.hidden = true; toastAction = null; };
function toast(msg, isError = false, open = null, action = null) {
  toastEl.style.top = `${document.querySelector("header").getBoundingClientRect().bottom + 8}px`;
  toastAction = open ? () => location.hash = `#/t/${encodeURIComponent(open)}` : action?.run ?? null;
  // The message cut short with … where it's long (a title), never pushing the button off; an
  // opened task's ID after it, as the lists draw IDs.
  toastEl.innerHTML = `${isError ? `<span class="toast-mark" aria-hidden="true">⚠</span>` : ""}<span class="toast-msg"><span class="t">${
    esc(msg)}</span>${open ? `<span class="id">${esc(open)}</span>` : ""}</span>${
    toastAction ? `<button type="button" class="toast-act" data-hint="RET">${esc(open ? "Open" : action.label)}</button>` : ""}`;
  toastEl.className = isError ? "error" : "";
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, isError ? 6000 : toastAction ? 5000 : 2500);
}
toastEl.addEventListener("click", e => {
  const run = e.target.closest(".toast-act") && toastAction;
  hideToast();
  run?.();
});

// A sheet slides up over the page.  ask() resolves with what the handler
// passes to done(), or null when it's cancelled: Back, a tap outside or a
// Cancel button, each asking first if anything in it was changed.  It has a
// history entry of its own, so Back closes it instead of leaving the page;
// ask() resolves once that entry is gone, so what follows may navigate.
// SHEETDEPTH: how many are open, one over another (a link's sheet over a
// body's); each history entry says its depth.
let cancelSheet = null, sheetDepth = 0;
// DIRTY, if given: whether there's a change the form's fields don't show (a
// draft's picks), so cancelling asks first.
function ask(html, handler, dirty = () => false) {
  return new Promise(resolve => {
    // Asked from a sheet: that one is put aside, as it is, and back after.
    const under = sheet.hidden ? null : {body: sheet.firstElementChild, onclick: sheet.onclick,
      oninput: sheet.oninput, cancel: cancelSheet, focus: document.activeElement};
    under?.body.remove();
    const depth = ++sheetDepth;
    sheet.innerHTML = `<div class="sheet-body">${html}</div>`;
    sheet.hidden = false;
    history.pushState({sheet: depth}, "");
    const state = formState(sheet);
    const done = async value => {
      sheet.innerHTML = ""; sheet.onclick = sheet.oninput = null;
      sheet.hidden = !under;
      cancelSheet = null;
      if (history.state?.sheet === depth)
        await new Promise(r => { addEventListener("popstate", r, {once: true}); history.back(); });
      sheetDepth = depth - 1;
      if (under) {
        sheet.append(under.body);
        [sheet.onclick, sheet.oninput, cancelSheet] = [under.onclick, under.oninput, under.cancel];
        under.focus?.focus();
      }
      resolve(value);
    };
    cancelSheet = async (byBack = false) => {
      if ((formState(sheet) === state && !dirty()) || await confirmDiscard()) return done(null);
      if (byBack) history.pushState({sheet: depth}, "");  // still open: its entry back
    };
    sheet.onclick = e => e.target === sheet || e.target.closest("[data-a=cancel]")
      ? cancelSheet() : handler(e, done);
    // From the keyboard, a filter or the pressed choice, else the first button:
    // arrows and Enter pick from there.  Not on touch: a field would raise the keyboard.
    const first = sheet.querySelector("[autofocus]") ?? (keyboardOn()
      ? sheet.querySelector("[data-kbfocus], [aria-pressed=true]") ?? sheet.querySelector("button") : null);
    first?.focus();
    // A field opens with the caret after its text: what's typed adds to it.
    if (first?.matches("input, textarea")) try { first.setSelectionRange(first.value.length, first.value.length); } catch {}
  });
}
// Back (Android's) closes a sheet; a late popstate from a hash set before
// it opened doesn't: the sheet's own entry is still the current one.
addEventListener("popstate", () => { if ((history.state?.sheet ?? 0) < sheetDepth) cancelSheet?.(true); });

// TEXT as a textarea's content in HTML: in the HTML, so a sheet's snapshot
// (formState) holds it and closing untouched doesn't ask; after a newline,
// which HTML drops, so a leading one of TEXT stays.
const textareaText = text => `\n${esc(text)}`;

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const what = ids => ids.length === 1 ? "" : ` ${plural(ids.length, "task")}`;

// The pickers: each a sheet that returns what was picked (null: cancelled),
// for an action on tasks (choose*) or a new task's draft (draftTask).

// A state of KWS (DONE those of them done, KEYS their fast keys), CURRENT
// pressed; "" for none, labelled NONE (a new entry's: "– heading").
const pickState = (title, kws, done, keys, current, none = "–") => ask(
  `<div class="sheet-title">${title}</div>
   <div class="chips">${kws.map((k, i) => `<button data-kw="${esc(k)}" ${fastKey(keys[i])} aria-pressed="${current === k}" style="${styleFor(done.includes(k) ? "done" : "todo", k)}">${esc(k)}${fastHint(keys[i])}</button>`).join("")}<button data-kw="" ${fastKey(" ")} aria-label="No keyword" title="No keyword: a plain heading">${none}${fastHint(" ")}</button></div>`,
  (e, finish) => { const b = e.target.closest("[data-kw]"); if (b) finish(b.dataset.kw); });

// A priority, or "none".
const pickPriority = (title, current) => ask(
  `<div class="sheet-title">${title}</div>${priorityChips(current)}`,
  (e, finish) => { const b = e.target.closest("[data-pri]"); if (b) finish(b.dataset.pri); });

// A sheet of one field (FIELD, its id ID) and SAVE: what's typed, trimmed,
// or null.  EMPTY, if given, is said when nothing is (then nothing's done).
const askField = (title, id, field, save = "Save", empty = null) => ask(
  `<div class="sheet-title">${title}</div>${field}
   <div class="sheet-buttons"><button data-a="cancel">Cancel</button>
   <button class="primary" data-a="save">${save}</button></div>`,
  (e, done) => {
    if (!e.target.closest("[data-a=save]")) return;
    const v = sheet.querySelector(`#${id}`).value.trim();
    if (v || !empty) done(v); else toast(empty, true);
  });

// Org's fast keys on a choice (C-c C-t's, C-c ,'s, C-c C-q's): the key it
// answers to in a sheet (keys.js), and its hint, shown only there while the
// keys are in use.  SPC is none.
const fastKey = k => k ? `data-key="${esc(k)}"` : "";
const fastHint = k => k ? `<kbd class="fast">${k === " " ? "SPC" : esc(k)}</kbd>` : "";

// Date, time, an end time for a range, and what org writes after them: a
// repeater, and on a deadline a warning (show it 3 days before), on a
// scheduled date a delay (hide it until 2 days after).  KIND is sched, due
// or event (a repeater only: org ignores -3d on a plain timestamp).
const REPEATER = /^(\.\+|\+\+|\+)\d+[hdwmy](\/\d+[hdwmy])?$/;
const WARNING = /^--?\d+[hdwmy]$/;
const cookieHint = {sched: "repeat, delay: +1w -2d", due: "repeat, warn: +1w -3d", event: "repeat: +1w, .+3d"};

// The browser's own picker: shown 12- or 24-hour as the phone's language
// says, its value always "14:30", as org writes it.
const timeInput = (id, value) => `<input id="${id}" type="time" value="${value || ""}">`;

// Each field is labeled: iOS draws an empty date or time as a blank box.
// What org writes after the date (repeater, warning) is chosen in plain
// words (cookiesHtml); the raw text, ID-r, under Other.
function dateFields(id, kind, {time = true, value = {}} = {}) {
  const field = (label, input) => `<label class="field"><span>${label}</span>${input}</label>`;
  const date = field("Date", `<input id="${id}-d" type="date" value="${value.date || ""}">`);
  const start = time ? field("Time", timeInput(`${id}-t`, value.time)) : "";
  const until = time ? `<div class="date-row">${field("Until", timeInput(`${id}-e`, value.end))}</div>` : "";
  return `<div class="date-row">${date}${start}</div>${until}${cookiesHtml(id, kind, value.cookies || "")}`;
}

// ---- Repeaters and warnings, in words ----

// Org's repeaters say how the next date is found once it's done: from the
// date, one step even if late (+); stepping on till it's ahead, so missed
// ones are skipped (++); from the day it's done (.+).  A warning: on a
// deadline, how far ahead it shows (-3d); on a scheduled date, how long
// after the date it stays hidden (-2d).  An event's plain timestamp takes a
// repeater only.
const REPEAT_KINDS = [["+", "On schedule", "Each done moves it one {u}, even if late"],
                      ["++", "Next one ahead", "Skips missed ones, keeps the day"],
                      [".+", "After it's done", "Counted from the day you finish it"]];
const UNITS = [["d", "day"], ["w", "week"], ["m", "month"], ["y", "year"]];
// COOKIES as the controls can say them: {rep: {kind, n, unit} | null, warn: n | null},
// or null when something in it they can't (a habit's .+2d/4d, hours, --3d).
function readCookies(cookies) {
  const out = {rep: null, warn: null};
  for (const w of cookies.split(/\s+/).filter(Boolean)) {
    let m;
    if (!out.rep && (m = /^(\.\+|\+\+|\+)(\d+)([dwmy])$/.exec(w))) out.rep = {kind: m[1], n: Number(m[2]), unit: m[3]};
    else if (out.warn === null && (m = /^-(\d+)d$/.exec(w))) out.warn = Number(m[1]);
    else return null;
  }
  return out;
}
// A number with − and + beside it, chip-sized (the browser's spinners are
// specks on a phone); typed too, the phone's number pad.
const stepper = (id, value, min, placeholder = "") => `<span class="stepper-num">
  <button type="button" data-step="-1" data-for="${id}" aria-label="Fewer">−</button>
  <input id="${id}" type="number" min="${min}" inputmode="numeric" value="${value}" placeholder="${placeholder}">
  <button type="button" data-step="1" data-for="${id}" aria-label="More">+</button></span>`;
function cookiesHtml(id, kind, cookies) {
  const c = readCookies(cookies) ?? {rep: null, warn: null};
  const rep = c.rep ?? {kind: "+", n: 1, unit: "w"};
  // A deadline: how far ahead it shows (empty: org's default, said);
  // a scheduled date: how long after the date it stays out of the agenda.
  const ahead = kind === "event" ? "" : `<div class="cookie-block warn-row">
      <div class="field-label">${kind === "due" ? "Show ahead" : "Hide until"}</div>
      <div class="every-line">${stepper(`${id}-wn`, c.warn ?? "", 0, kind === "due" ? String(warningDays) : "0")}
        <span>${kind === "due" ? "days before" : "days after"}</span></div>
      <div class="hint warn-says"></div></div>`;
  return `<div class="cookies" data-for="${id}" data-kind="${kind}">
    <div class="cookie-block">
      <div class="field-label">Repeat</div>
      <div class="chips" id="${id}-rep"><button type="button" data-rep="none" aria-pressed="${!c.rep}">None</button>
        <button type="button" data-rep="every" aria-pressed="${!!c.rep}">Every</button></div>
      <div class="rep-every"${c.rep ? "" : " hidden"}>
        <div class="every-line">${stepper(`${id}-rn`, rep.n, 1)}
          <select id="${id}-ru" aria-label="Of what">${UNITS.map(([u, name]) =>
            `<option value="${u}"${u === rep.unit ? " selected" : ""}>${name}${rep.n === 1 ? "" : "s"}</option>`).join("")}</select></div>
        <div class="chips" id="${id}-rk">${REPEAT_KINDS.map(([k, label]) =>
          `<button type="button" data-rk="${k}" aria-pressed="${k === rep.kind}">${label}</button>`).join("")}</div>
        <div class="hint rep-says"></div>
      </div></div>
    ${ahead}
    <div class="hint cookie-custom" hidden>Set in Other below: the choices can't say it.</div>
    <div class="org-writes hint"></div>
    <details class="other"${cookies && !readCookies(cookies) ? " open" : ""}><summary>Other</summary>
      <input id="${id}-r" value="${esc(cookies)}" placeholder="${cookieHint[kind].split(": ")[1]}" aria-label="As org writes it"
        autocapitalize="off" autocomplete="off" spellcheck="false"></details>
  </div>`;
}
// The controls in ROOT write the raw text (ID-r), what's saved; typed there
// by hand, it's read back where they can say it.  The line under them
// shows the timestamp org will write.
function wireCookies(root, id) {
  const box = root.querySelector(`.cookies[data-for="${id}"]`);
  if (!box) return;
  const kind = box.dataset.kind, $ = s => root.querySelector(`#${id}-${s}`);
  const raw = $("r"), every = box.querySelector(".rep-every");
  const pressed = (row, attr) => row.querySelector("[aria-pressed=true]")?.dataset[attr];
  const unitName = () => UNITS.find(([u]) => u === $("ru").value)[1];
  const compose = () => {
    const parts = [];
    if (pressed($("rep"), "rep") === "every") parts.push(`${pressed($("rk"), "rk")}${Math.max(1, Number($("rn").value) || 1)}${$("ru").value}`);
    const w = $("wn")?.value.trim();
    if (w !== undefined && w !== "" && (kind === "due" || Number(w) > 0)) parts.push(`-${Math.max(0, Number(w) || 0)}d`);
    return parts.join(" ");
  };
  const show = () => {
    const custom = !!raw.value.trim() && !readCookies(raw.value);
    box.classList.toggle("custom", custom);
    box.querySelector(".cookie-custom").hidden = !custom;
    every.hidden = pressed($("rep"), "rep") !== "every";
    const k = REPEAT_KINDS.find(([x]) => x === pressed($("rk"), "rk"));
    box.querySelector(".rep-says").textContent = k ? `${k[2].replace("{u}", unitName())}.` : "";
    const plural = Number($("rn").value) !== 1;
    for (const o of $("ru").options) o.textContent = UNITS.find(([u]) => u === o.value)[1] + (plural ? "s" : "");
    // What org will write: the date with its day, the time, the rest.
    const [d, t, e] = ["d", "t", "e"].map(s => $(s)?.value || "");
    // Show ahead / Hide until, said with the day it lands on.
    const says = box.querySelector(".warn-says");
    if (says) {
      const typed = $("wn").value.trim(), n = typed === "" ? (kind === "due" ? warningDays : 0) : Math.max(0, Number(typed) || 0);
      const on = d && new Date(...d.split("-").map((v, i) => Number(v) - (i === 1 ? 1 : 0)));
      const shifted = on && new Date(on.getFullYear(), on.getMonth(), on.getDate() + (kind === "due" ? -n : n))
        .toLocaleDateString(undefined, {weekday: "short", month: "short", day: "numeric"});
      says.textContent = kind === "due"
        ? (n === 0 ? "In your agenda only on the day it's due."
          : `In your agenda from ${shifted ? `${shifted}, ` : ""}${n} day${n === 1 ? "" : "s"} before it's due${typed === "" ? " (your default)" : ""}.`)
        : (n === 0 ? "In your agenda from this date."
          : `Out of your agenda until ${shifted ? `${shifted}, ` : ""}${n} day${n === 1 ? "" : "s"} after this date.`);
    }
    const day = d ? new Date(...d.split("-").map((v, i) => Number(v) - (i === 1 ? 1 : 0)))
      .toLocaleDateString("en", {weekday: "short"}) : "";
    const stamp = d ? `<${[d, day, t && (e ? `${t}-${e}` : t), raw.value.trim()].filter(Boolean).join(" ")}>` : "";
    box.querySelector(".org-writes").innerHTML = stamp ? `Org writes <code>${esc(stamp)}</code>`
      : raw.value.trim() ? `After the date: <code>${esc(raw.value.trim())}</code>` : "";
  };
  // Read back into the controls: the raw text typed, or a sheet opened on a stamp.
  const load = () => {
    const c = readCookies(raw.value);
    if (!c) return show();
    for (const b of $("rep").children) b.setAttribute("aria-pressed", String((b.dataset.rep === "every") === !!c.rep));
    if (c.rep) {
      $("rn").value = c.rep.n;
      $("ru").value = c.rep.unit;
      for (const b of $("rk").children) b.setAttribute("aria-pressed", String(b.dataset.rk === c.rep.kind));
    }
    if ($("wn")) $("wn").value = c.warn ?? "";
    show();
  };
  const write = () => { raw.value = compose(); raw.dispatchEvent(new Event("input", {bubbles: true})); show(); };
  box.addEventListener("click", e => {
    const step = e.target.closest("[data-step]");
    if (step && !box.classList.contains("custom")) {
      const input = root.querySelector(`#${step.dataset.for}`), min = Number(input.min);
      const from = input.value === "" ? (input === $("wn") && kind === "due" ? warningDays : min) : Number(input.value);
      input.value = Math.max(min, from + Number(step.dataset.step));
      return input.dispatchEvent(new Event("input", {bubbles: true}));
    }
    const b = e.target.closest("[data-rep], [data-rk]");
    if (!b || box.classList.contains("custom")) return;
    for (const x of b.parentElement.children) x.setAttribute("aria-pressed", String(x === b));
    write();
  });
  box.addEventListener("input", e => {
    if (e.target === raw) return load();
    if (!box.classList.contains("custom") && e.target.matches(`#${id}-rn, #${id}-ru, #${id}-wn`)) write();
  });
  box.addEventListener("change", e => { if (e.target.matches(`#${id}-ru`) && !box.classList.contains("custom")) write(); });
  show();
  return show;  // the date and time change the line too: the sheet's own oninput calls it
}

// The date fields ID-d, -t, -e, -r: date, time, until, repeat and warning.
const dateValues = (root, id) => ["d", "t", "e", "r"].map(s => root.querySelector(`#${id}-${s}`)?.value.trim() || "");

// The fields as `orgwarrior` date syntax ("2026-10-16 14:00-15:30 +1w -3d"); ""
// if left empty; null, after a toast, if they don't make a date.
function readDate(root, id, kind) {
  const [d, t, e, r] = dateValues(root, id);
  const words = r.split(/\s+/).filter(Boolean);
  const repeaters = words.filter(w => REPEATER.test(w)), warnings = words.filter(w => WARNING.test(w));
  if (repeaters.length + warnings.length < words.length || repeaters.length > 1 || warnings.length > 1
      || (kind === "event" && warnings.length))
    return toast(`${cookieHint[kind].replace(/^r/, "R").replace(":", " should look like")}`, true), null;
  if (!d) return t || e || r ? (toast("Pick a date", true), null) : "";
  if (e && !t) return toast("Until needs a start time", true), null;
  return [d, t && (e ? `${t}-${e}` : t), ...repeaters, ...warnings].filter(Boolean).join(" ");
}

// "<2026-10-16 Fri 14:00-15:30 .+1w -2d>" as the fields' values.
function parseStamp(stamp) {
  const [date, ...rest] = stamp.replace(/^<|>$/g, "").split(/\s+/);
  const value = {date}, cookies = [];
  for (const w of rest) {
    const m = /^(\d{1,2}:\d\d)(?:-(\d{1,2}:\d\d))?$/.exec(w);
    if (m) [value.time, value.end] = [m[1].padStart(5, "0"), m[2]?.padStart(5, "0")];
    else if (REPEATER.test(w) || WARNING.test(w)) cookies.push(w);
  }
  value.cookies = cookies.join(" ");
  return value;
}

const QUICK = ["today", "tomorrow", "mon", "tue", "wed", "thu", "fri", "sat", "sun", "+1w", "+2w", "+1m"];

// A date for VERB (sched, due, event): a quick word, "none", or {date} as
// the fields give it.  VALUE: the fields' start; HINT a line under them.
// From the keys it opens on the quick dates (not Repeat's None, pressed).
function pickDate(title, verb, value = {}, hint = "") {
  const pending = ask(
  `<div class="sheet-title">${title}</div>
   <div class="chips">${QUICK.map((d, i) => `<button data-d="${d}"${i ? "" : " data-kbfocus"}>${d}</button>`).join("")}</div>
   ${dateFields("p", verb, {value})}
   ${hint ? `<div class="hint">${hint}</div>` : ""}
   <div class="sheet-buttons"><button data-a="clear" ${fastKey(" ")}>${fastHint(" ")}Clear</button><button data-a="cancel">Cancel</button>
   <button class="primary" data-a="set">Set</button></div>`,
  (e, finish) => {
    const b = e.target.closest("[data-d], [data-a]");
    if (!b) return;
    if (b.dataset.d) return finish(b.dataset.d);
    if (b.dataset.a === "clear") return finish("none");
    const d = readDate(sheet, "p", verb);
    if (d === "") return toast("Pick a date", true);
    if (d) finish({date: d});
  });
  const show = wireCookies(sheet, "p");
  // The sheet's own: ask() clears it as the sheet closes (a listener on the
  // sheet element would outlive it, and reach for fields gone).
  sheet.oninput = e => { if (e.target.matches?.("#p-d, #p-t, #p-e")) show?.(); };
  return pending;
}

// A tag picker for a sheet, in sections: Inherited (shown, not tappable), One of
// (each { } group, one tag at a time), Any of (the plain #+tags lines, then
// undeclared tags, folded when there are many).  A filter when there are lots.
// Mode "set": tags on or off.  Mode "cycle" (several tasks): a tap goes
// add (+), remove (−), leave alone.  ROOT: the element it's shown in.
function tagPicker(tags, mode, initial = [], inherited = [], root = sheet) {
  const state = new Map(initial.map(t => [t, "+"]));
  const groups = tags.groups;
  const declared = new Set(groups.flatMap(g => g.tags));
  const other = [...new Set([...tags.other, ...initial.filter(t => !declared.has(t))])];
  const fold = other.length > 12;
  const keyOf = new Map(tags.keys ?? []);
  const cls = t => `tagchip ${state.get(t) === "+" ? "on" : state.get(t) === "-" ? "off" : ""}`;
  const chip = t => `<button data-t="${esc(t)}" ${fastKey(keyOf.get(t))} class="${cls(t)}">${esc(t)}${fastHint(keyOf.get(t))}</button>`;
  // In place, not replaced: a chip toggled from the keyboard keeps the focus.
  const redraw = t => {
    const b = root.querySelector(`[data-t="${CSS.escape(t)}"]`);
    if (b) b.className = cls(t);
  };
  const mates = t => groups.find(g => g.exclusive && g.tags.includes(t))?.tags.filter(x => x !== t) || [];

  function tap(t) {
    const s = state.get(t);
    const next = mode === "set" ? (s ? undefined : "+") : (s === "+" ? "-" : s === "-" ? undefined : "+");
    if (next) state.set(t, next); else state.delete(t);
    if (next === "+") for (const m of mates(t)) if (state.get(m) === "+") { state.delete(m); redraw(m); }
    redraw(t);
  }

  const rows = gs => gs.map(g => `<div class="chips">${g.tags.map(chip).join("")}</div>`).join("");
  const section = (label, body) => `<div class="tag-section"><div class="tag-label">${label}</div>${body}</div>`;
  const oneOf = groups.filter(g => g.exclusive), anyOf = groups.filter(g => !g.exclusive);
  const html =
    (declared.size + other.length > 20 ? `<input id="tagfilter" type="search" placeholder="Filter tags" autocapitalize="off" spellcheck="false">` : "") +
    (inherited.length ? section("Inherited", `<div class="chips">${inherited.map(t => `<span class="tagchip inherited">${esc(t)}</span>`).join("")}</div>`) : "") +
    (oneOf.length ? section("One of", rows(oneOf)) : "") +
    section("Any of", rows(anyOf) +
      (fold ? `<button class="more" data-a="more">▸ ${other.length} more</button>` : "") +
      `<div class="chips" id="othertags"${fold ? " hidden" : ""}>${other.map(chip).join("")}</div>` +
      `<div class="date-row"><input id="newtag" placeholder="new tag" autocapitalize="off" spellcheck="false">
       <button data-a="new">Add</button></div>`);

  // A click inside the sheet; true if it was the picker's.
  function click(e) {
    const b = e.target.closest("[data-t], [data-a=more], [data-a=new]");
    if (!b) return false;
    if (b.dataset.t !== undefined) tap(b.dataset.t);
    else if (b.dataset.a === "more") { root.querySelector("#othertags").hidden = false; b.remove(); }
    else {
      const input = root.querySelector("#newtag");
      const t = input.value.trim().replace(/^:+|:+$/g, "");
      if (!/^[\p{L}\p{N}_@#%]+$/u.test(t)) { toast("A tag is letters, digits, _ @ # %", true); return true; }
      if (!declared.has(t) && !other.includes(t)) {
        other.push(t);
        root.querySelector("#othertags").insertAdjacentHTML("beforeend", chip(t));
      }
      root.querySelector("#othertags").hidden = false;
      if (state.get(t) !== "+") tap(t);
      input.value = "";
    }
    return true;
  }

  function filter(e) {
    if (e.target.id !== "tagfilter") return;
    const q = e.target.value.trim().toLowerCase();
    if (q) root.querySelector("#othertags").hidden = false;
    for (const b of root.querySelectorAll("[data-t]")) b.hidden = !b.dataset.t.toLowerCase().includes(q);
  }

  // Back to INITIAL, as drawn.
  function reset() {
    state.clear();
    for (const t of initial) state.set(t, "+");
    for (const b of root.querySelectorAll("[data-t]")) redraw(b.dataset.t);
  }

  return {html, click, filter, reset, state};
}

async function fetchTags() {
  allTags = allTags || await api("/api/tags");
  return allTags;
}

// A tag picker's state (tag → +) against CURRENT, as tag's +x -y.
const tagArgs = (state, current) => [...[...state.keys()].filter(t => !current.includes(t)).map(t => "+" + t),
                                     ...current.filter(t => !state.has(t)).map(t => "-" + t)];

// Tags, as tagPicker's MODE has them: its state (tag → + or -) when saved.
function pickTags(title, tags, mode, initial = [], inherited = []) {
  const picker = tagPicker(tags, mode, initial, inherited);
  const pending = ask(
    `<div class="sheet-title">${title}</div>
     ${mode === "cycle" ? `<div class="hint">Tap once to add, twice to remove.</div>` : ""}
     ${picker.html}
     <div class="sheet-buttons"><button data-a="cancel">Cancel</button>
     <button class="primary" data-a="save">Save</button></div>`,
    (e, finish) => {
      if (picker.click(e)) return;
      if (e.target.closest("[data-a=save]")) finish(picker.state);
    });
  sheet.oninput = picker.filter;
  return pending;
}

// A place as a list shows it: a file's top level says so ("projects.org —
// top level"), a bare file name reading too much like the headings' paths.
const placeLabel = label => label.includes(" › ") || !/\.org$/.test(label) ? label : `${label} — top level`;

// The refile sheet's filter: every word typed, in any order, as completion
// in Emacs matches (orderless); Enter takes the first left, drawn as chosen.
function filterTargets(input) {
  const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
  let first = null;
  for (const b of sheet.querySelectorAll(".list [data-t]")) {
    b.hidden = !words.every(w => b.textContent.toLowerCase().includes(w));
    if (!b.hidden && !first) first = b;
    b.classList.toggle("first", b === first);
  }
}

// A choice, so each acts at once.  "–" removes it: offered unless there's
// none to remove (CURRENT null; undefined for several tasks).
const priorityChips = current => `<div class="chips">${priorities.map(p =>
  `<button data-pri="${esc(p)}" ${fastKey(p.toLowerCase())} aria-pressed="${p === current}">${esc(p)}${fastHint(p.toLowerCase())}</button>`).join("")}${
  current === null ? "" : `<button data-pri="none" ${fastKey(" ")} aria-label="No priority">–${fastHint(" ")}</button>`}</div>`;

// Where an add can go: a filterable list, as refile's (every word, any
// order; Enter takes the first left; ↓ or Tab into the list).
const pickPlace = (title, options, current) => {
  const pending = ask(
    `<div class="sheet-title">${title}</div>
     <input id="rf-filter" type="search" placeholder="Filter, or Enter for the first" autocapitalize="off" spellcheck="false" data-kbfocus>
     <div class="list">${options.map(o => `<button data-t="${esc(o.value)}" aria-pressed="${o.value === current}">${esc(placeLabel(o.label))}</button>`).join("")}</div>`,
    (e, finish) => { const b = e.target.closest("[data-t]"); if (b) finish(options.find(o => o.value === b.dataset.t)); });
  sheet.oninput = e => { if (e.target.id === "rf-filter") filterTargets(e.target); };
  filterTargets(sheet.querySelector("#rf-filter"));
  return pending;
};

// A body, with the text tools; Ctrl-Enter saves it, Enter is a new line.
const pickBody = (text, title = "Details") => {
  const pending = ask(
    `<div class="sheet-title">${title}</div>
     <div class="org-edit">${ORG_TOOLS}<textarea class="org" id="dr-body" rows="6" autocapitalize="sentences" autofocus>${textareaText(text)}</textarea></div>
     <div class="sheet-buttons"><button data-a="cancel">Cancel</button><button class="primary" data-a="save">Save</button></div>`,
    (e, finish) => { if (e.target.closest("[data-a=save]")) finish(sheet.querySelector("#dr-body").value); });
  return pending;
};
