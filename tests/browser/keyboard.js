// The keyboard, side by side: org agenda's keys on the cursor's row, the box
// as a command line, C, the pickers, themes, days, the logo.
import {run, base, WIDE} from "./lib.js";

await run(async t => {
  const {page, expect, check, focusedIs, idOf, tap, go, chord, shiftTab, waitFor, cursorId, cursorTo,
         taskOf, sheetOpen, sheetGone, poll, clickRow, post} = t;
  await page.goto(`${base}/#/v/all`);
  await page.waitForSelector("#list .task[data-id]");
  const juggle = await idOf("juggle");
  await page.click(`#list .task[data-id="${juggle}"]`);
  await expect("juggle open beside the list", s => s.heading.includes("juggle"));
  // j, k: the cursor, each row shown beside (side by side), focus staying on the list.
  await page.keyboard.press("j");
  const first = await cursorId();
  await check("j: the cursor shows, on the open task's row", first === juggle && !!(await page.$("body.keyboard")));
  await page.keyboard.press("j");
  const second = await cursorId();
  await check("the open task's bar moves with the cursor, before the pane loads",
    await page.$eval("#list .task.cursor", r => r.classList.contains("current")));
  await waitFor(id => location.hash === `#/t/${id}` && document.querySelector("#detail .heading"), "j: the next row, shown beside", second);
  await check("focus never goes into the task's pane", !(await focusedIs("#detail *")));
  await waitFor(() => { const pri = document.querySelector("#detail .task-fields [data-do=pri]"), chips = [...document.querySelectorAll("#detail [data-do=state][data-hint]")];
    return pri && getComputedStyle(pri, "::after").content === '","' && chips.length && chips.every(b => b.dataset.hint.startsWith("t "));
  }, "the pane shows its keys: Priority , and the state chips t-");
  await page.keyboard.press("k");
  await waitFor(id => location.hash === `#/t/${id}`, "k: back up, shown", first);
  // Turning back while a preview loads: the bar never parts from the cursor,
  // an earlier preview landing late included.
  await page.evaluate(() => {
    window.split = 0;
    window.sampler = setInterval(() => {
      const c = document.querySelector("#list .task.cursor"), cur = [...document.querySelectorAll("#list .task.current")];
      if (c && (cur.length !== 1 || cur[0] !== c)) window.split++;
    }, 5);
  });
  for (const k of ["j", "j", "j"]) await page.keyboard.press(k);
  await new Promise(r => setTimeout(r, 170));  // its preview on its way
  await page.keyboard.press("k");
  const turned = await cursorId();
  await page.waitForFunction(id => location.hash === `#/t/${id}` && document.querySelector("#detail .heading"), {}, turned);
  await new Promise(r => setTimeout(r, 300));
  await check("j j j, a pause, k: the bar and the cursor together all along",
    await page.evaluate(() => (clearInterval(window.sampler), window.split)) === 0);
  await page.keyboard.press("Escape");
  await expect("Esc closes the task, one step back however many were shown", s => s.hash === "#/v/all" && !s.heading);
  await page.waitForFunction(() => document.body.dataset.page === "view");
  await page.keyboard.press("Escape");
  await check("Esc again: the cursor gone", !(await page.$("#list .task.cursor")));
  await check("nothing open: the pane says where to start", await page.$eval("#detail", d =>
    /Pick a task, or:/.test(d.textContent) && /every key/.test(d.textContent) && /help in the box/.test(d.textContent)
    && /j k \/ n p \/ ↓ ↑/.test(d.textContent) && /the task in its file/.test(d.textContent) && /back, forward/.test(d.textContent)));
  // Drawn from the key table, it reads as it did when its keys were written in (org's keys).
  await check("the start pane, word for word", await page.evaluate(() => startHtml()) === "<div class=\"start\"><div class=\"status\">Pick a task, or:</div><dl class=\"keys\">\n  <dt>j k / n p / ↓ ↑</dt><dd>move, opening each beside · Esc back</dd>\n  <dt>TAB</dt><dd>in an agenda, the task in its file; in a file, fold</dd>\n  <dt>[ ]</dt><dd>back, forward: the lists and tasks shown</dd>\n  <dt>t , : s d w</dt><dd>state, priority, tags, dates, refile</dd>\n  <dt>i / o</dt><dd>clock in / out · I O at a time · l its clocks</dd>\n  <dt>c</dt><dd>add field by field · / then add … in one line</dd>\n  <dt>/</dt><dd>the box: a view, a search, any orgwarrior command</dd>\n  <dt>?</dt><dd>every key · <kbd>help</kbd> in the box: every command</dd></dl></div>");
  // help in the box: the CLI's own text, the summary or a topic; j scrolls it.
  await page.keyboard.press("/");
  await page.keyboard.type("help");
  await page.keyboard.press("Enter");
  await sheetOpen();
  await check("help: the commands, the CLI's text", await page.$eval("#sheet", x =>
    /the box's commands/.test(x.textContent) && /orgwarrior c1 done/.test(x.querySelector("pre.help").textContent)));
  await check("it opens at the top", await page.$eval("#sheet .sheet-body", b => b.scrollTop === 0));
  await page.keyboard.press("j");
  await check("j scrolls it", await page.$eval("#sheet .sheet-body", b => b.scrollTop > 0 || b.scrollHeight <= b.clientHeight));
  await page.keyboard.press("Escape");
  await sheetGone();
  await page.keyboard.press("/");
  await page.keyboard.type("help dates");
  await page.keyboard.press("Enter");
  await sheetOpen();
  await check("help dates: that topic", await page.$eval("#sheet", x => /help dates/.test(x.textContent) && /org-read-date/.test(x.textContent)));
  await page.keyboard.press("Escape");
  await sheetGone();
  // t: the state sheet, on the current state; arrows or hjkl; Tab stays in; Esc closes.
  await page.keyboard.press("j");
  await page.keyboard.press("t");
  await sheetOpen();
  await check("t: the current state focused", await focusedIs('#sheet [aria-pressed="true"]'));
  await page.keyboard.press("l");
  await check("l: the next state", await focusedIs('#sheet [data-kw]:not([aria-pressed="true"])'));
  for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
  await check("Tab stays in the sheet", await focusedIs("#sheet *"));
  await page.keyboard.press("Escape");
  await sheetGone();
  // d: the quick dates are one Tab stop: Tab goes on to the date, Shift-Tab back.
  await page.keyboard.press("d");
  await sheetOpen();
  await check("d: a quick date focused", await focusedIs("#sheet [data-d]"));
  await page.keyboard.press("l");
  await page.keyboard.press("Tab");
  await check("Tab: past the quick dates, to the date", await focusedIs('#sheet input[type="date"]'));
  await shiftTab();
  await check("Shift-Tab: back on the quick dates", await focusedIs("#sheet [data-d]"));
  await page.keyboard.press("Escape");
  await sheetGone();
  // On the task's page side by side: the state is a chip before the title;
  // t (or the chip) opens its sheet on the current one.
  await page.keyboard.press("Enter");
  await page.waitForSelector("#detail .heading");
  await check("the state chip shows its keyword, the hint t", await page.$eval("#detail .state-chip",
    b => b.offsetParent !== null && b.dataset.hint === "t" && b.textContent.trim().length > 0));
  await page.keyboard.press("t");
  await sheetOpen();
  await check("t: the states, on the current one", await focusedIs('#sheet [data-kw][aria-pressed="true"]'));
  await page.keyboard.press("Escape");
  await sheetGone();
  await page.keyboard.press("?");
  await sheetOpen();
  await check("? lists the keys", await page.$eval("#sheet", e => /refile/.test(e.textContent) && /rename/.test(e.textContent)));
  await page.keyboard.press("Escape");
  await sheetGone();
  await page.keyboard.press("2");
  await expect("2: the second tab", s => s.hash !== "#/v/all" && s.hash.startsWith("#/v/"));
  await go("#/v/all");
  await page.waitForSelector("#list .task[data-id]");
  await page.click("#tabs a");  // the mouse on a tab, then the keys
  await page.waitForSelector("#list .task[data-id]");
  await page.keyboard.press("Tab");
  await check("Tab after a tab clicked: the focus out of the header, not on to the box", !(await focusedIs("header *")));
  await go("#/v/all");
  await page.waitForSelector("#list .task[data-id]");
  await page.keyboard.press("Tab");
  await check("Tab on a view just shown: the cursor shown, focus never in the header",
    !(await focusedIs("header *")) && !!(await page.$("#list .task.cursor")) && await page.evaluate(() => location.hash) === "#/v/all");

  // Saved tabs: T (or ＋) keeps the view shown as a tab, dashed apart from the
  // config's; T on it renames or removes it; the config's are changed in config.toml.
  await go("#/v/+@home");
  await page.waitForSelector("#list .task[data-id]");
  await check("a view that's no tab: ＋ offered", await page.$eval("#savetab", b => !b.hidden));
  await page.keyboard.press("T");
  await waitFor(() => document.activeElement?.id === "tab-label", "T: its label, the query to start");
  await page.$eval("#tab-label", i => i.value = "");
  await page.keyboard.type("home");
  await page.keyboard.press("Enter");
  await waitFor(() => [...document.querySelectorAll("#tabs a.saved")].some(a => a.textContent === "home" && a.classList.contains("on")),
    "saved: a dashed tab, the one shown");
  await check("＋ gone, it's a tab now", await page.$eval("#savetab", b => b.hidden));
  await page.keyboard.press("T");
  await waitFor(() => /Tab: home/.test(document.querySelector("#sheet .sheet-title")?.textContent ?? ""), "T on it: its sheet");
  await page.$eval("#tab-label", i => i.value = "");
  await page.keyboard.type("at home");
  await page.keyboard.press("Enter");
  await waitFor(() => [...document.querySelectorAll("#tabs a.saved")].some(a => a.textContent === "at home"), "renamed");
  await page.click("#tabs a.saved", {button: "right"});
  await waitFor(() => /Tab: at home/.test(document.querySelector("#sheet .sheet-title")?.textContent ?? ""), "right-click: the same sheet");
  await page.keyboard.press("Escape");  // out of its label, to Rename
  await check("Esc in its label: out of it, to Rename", await focusedIs("#sheet [data-a=save]"));
  await page.keyboard.press("Escape");
  await sheetGone();
  await page.keyboard.press("T");
  await sheetOpen();
  await page.click("#sheet [data-a=remove]");
  await waitFor(() => !document.querySelector("#tabs a.saved") && !document.getElementById("savetab").hidden, "removed, ＋ back");
  await go("#/v/all");
  await page.waitForSelector("#list .task[data-id]");
  await page.keyboard.press("T");
  await waitFor(() => /config\.toml/.test(document.getElementById("toast").textContent), "T on a config tab: change it in config.toml");

  // A tab clicked keeps the focus; the keys are the list's still: j moves
  // the cursor, not along the tabs, and Enter opens its row, not the tab.
  await page.click("#tabs a[data-query=week]");
  // The week drawn, not the rows of all still there: j on those is lost when it draws.
  await page.waitForFunction(() => location.hash === "#/v/week" && /Week-agenda/.test(document.getElementById("list").textContent)
    && document.querySelector("#list .task[data-id]"));
  await page.keyboard.press("j");
  await page.keyboard.press("j");
  await check("after a clicked tab, j moves the cursor", !!(await cursorId()) && !(await focusedIs("#tabs a")));
  const onRow = await cursorId();
  await page.keyboard.press("Enter");
  await waitFor(id => location.hash.startsWith(`#/t/${id}`), "Enter opens the cursor's row, not the tab", onRow);
  await go("#/v/all");
  await page.waitForSelector("#list .task[data-id]");

  // / then add: in the box, as the orgwarrior command takes it.
  await page.keyboard.press("/");
  await check("/: the box", await focusedIs("#q"));
  await page.$eval("#q", i => i.select());
  await page.keyboard.type("add Keyboard task :@home:");
  await page.keyboard.press("Enter");
  await waitFor(() => /Added/.test(document.getElementById("toast").textContent) && document.getElementById("q").value === "all"
    && document.getElementById("list").textContent.includes("Keyboard task"), "added from the box, the box the view again");
  await waitFor(() => /Keyboard task/.test(document.querySelector("#list .task.cursor")?.textContent ?? ""), "the cursor onto the new task");
  await check("the toast offers it: an Open button, RET its key", await page.$eval("#toast .toast-act",
    b => b.textContent === "Open" && b.dataset.hint === "RET"));
  await page.click("#toast .toast-act");
  await expect("tapped, the toast opens it", s => s.heading === "Keyboard task");
  await go("#/v/all");
  await page.waitForSelector("#list .task[data-id]");
  // x: a command in the box for the cursor's task.
  await cursorTo("Keyboard task");
  let kid = await cursorId();
  await page.keyboard.press("x");
  await check("x: the box, the task's ID typed", await page.$eval("#q", (i, id) => i.value === `${id} `, kid));
  await page.keyboard.type("next");
  await page.keyboard.press("Enter");
  await waitFor(() => /NEXT Keyboard task/.test(document.querySelector("#list .task.cursor")?.textContent ?? ""), "x … next: done from the box");
  await page.keyboard.press("x");
  await page.keyboard.type("frobnicate");
  await page.keyboard.press("Enter");
  await waitFor(() => document.activeElement.id === "q" && /frobnicate/.test(document.getElementById("q").value)
    && document.getElementById("toast").classList.contains("error"), "a mistake: the line kept, the error shown");
  await page.keyboard.press("Escape");
  await check("Esc: the box back to the view", await page.$eval("#q", i => i.value === "all") && !(await focusedIs("#q")));
  // r: rename, in a sheet.
  await page.keyboard.press("r");
  await waitFor(() => document.activeElement?.id === "rn-title", "r: the title in a sheet");
  await page.keyboard.press("End");
  await page.keyboard.type(" now");
  await page.keyboard.press("Enter");
  await waitFor(() => /Keyboard task now/.test(document.querySelector("#list .task.cursor")?.textContent ?? ""), "Enter renames it, the cursor following");
  // , priority: Space on the first.
  await page.keyboard.press(",");
  await sheetOpen();
  await page.keyboard.press(" ");
  await waitFor(() => /\[#A\]/.test(document.querySelector("#list .task.cursor")?.textContent ?? ""), ", Space: priority A");
  // : tags: a chip toggled keeps the focus; Ctrl-Enter saves.
  await page.keyboard.press(":");
  await sheetOpen();
  const tag = await page.evaluate(() => document.activeElement?.dataset.t);
  const wasOn = await page.$eval(`#sheet [data-t="${tag}"]`, b => b.classList.contains("on"));
  await page.keyboard.press(" ");
  await check("Space toggles a tag, focus kept", await focusedIs(`#sheet [data-t="${tag}"]`)
    && wasOn !== await page.$eval(`#sheet [data-t="${tag}"]`, b => b.classList.contains("on")));
  await chord("Control", "Enter");
  await sheetGone();
  await waitFor((t, on) => document.querySelector("#list .task.cursor")?.textContent.includes(t) !== on, "Ctrl-Enter saved the tags", tag);
  // Org's fast keys, as C-c C-t, C-c , and C-c C-q take them: a letter picks
  // (or toggles a tag), SPC is none, Enter saves the tags.
  const row = () => page.$eval("#list .task.cursor", r => r.textContent);
  await page.keyboard.press("t");
  await sheetOpen();
  await check("t: each state shows its key", await page.$eval('#sheet [data-kw="ACTIVE"] kbd.fast',
    k => k.textContent === "a" && getComputedStyle(k).display !== "none"));
  await page.keyboard.press("a");
  await waitFor(() => /ACTIVE .*Keyboard task now/.test(document.querySelector("#list .task.cursor")?.textContent ?? ""), "t a: ACTIVE at once");
  await page.keyboard.press("t");
  await sheetOpen();
  await page.keyboard.press("n");
  await waitFor(() => /NEXT .*Keyboard task now/.test(document.querySelector("#list .task.cursor")?.textContent ?? ""), "t n: NEXT");
  await page.keyboard.press(",");
  await sheetOpen();
  await page.keyboard.press("b");
  await waitFor(() => /\[#B\]/.test(document.querySelector("#list .task.cursor")?.textContent ?? ""), ", b: priority B");
  await page.keyboard.press(",");
  await sheetOpen();
  await page.keyboard.press(" ");
  await waitFor(() => !/\[#/.test(document.querySelector("#list .task.cursor")?.textContent ?? "["), ", SPC: no priority");
  const hadHome = /@home/.test(await row());
  await page.keyboard.press(":");
  await sheetOpen();
  await page.keyboard.press("h");
  await check(": h toggles @home (its #+tags key)", hadHome !== await page.$eval('#sheet [data-t="@home"]', b => b.classList.contains("on")));
  await page.keyboard.press("Enter");
  await sheetGone();
  await waitFor(had => /@home/.test(document.querySelector("#list .task.cursor")?.textContent ?? "") !== had, "Enter saves the tags", hadHome);
  // w: refile by typing, as Emacs completes.
  const unfiled = await cursorId();
  await page.keyboard.press("w");
  await waitFor(() => document.activeElement?.id === "rf-filter", "w: the filter focused");
  await check("the usual target first, marked; a file's top level said so", await page.$$eval("#sheet .list [data-t]", bs =>
    bs[0].classList.contains("usual") && /tasks\.org › Tasks/.test(bs[0].textContent) && /usual/.test(bs[0].textContent)
    && bs.some(b => /projects\.org — top level/.test(b.textContent)) && bs.at(-1).textContent.includes("top level")));
  await check("Enter's choice drawn: the usual", await page.$$eval("#sheet .list .first", bs => bs.length === 1 && bs[0].classList.contains("usual")));
  await page.keyboard.type("proj warr");
  await check("the filter narrows to one, now Enter's", await page.$$eval("#sheet [data-t]:not([hidden])", bs =>
    bs.length === 1 && /Orgwarrior/.test(bs[0].textContent) && bs[0].classList.contains("first")));
  await page.keyboard.press("Enter");
  await sheetGone();
  // Refiled, its ID is new (the file is part of it): the list redrawn, the cursor following.
  await page.waitForFunction(old => { const r = document.querySelector("#list .task.cursor");
    return r && r.dataset.id !== old && r.textContent.includes("Keyboard task now"); }, {timeout: 5000}, unfiled);
  kid = await cursorId();
  await check("refiled under Orgwarrior", (await taskOf(kid)).parents.some(p => p.title.startsWith("Orgwarrior")));
  await page.keyboard.press("v");
  await sheetOpen();
  await check("v: the Move sheet", !!await page.$("#sheet [data-mv=up]"));
  await page.keyboard.press("Escape");
  await sheetGone();
  // J K H L: moves, the subtree with it.
  const siblings = async () => (await taskOf((await taskOf(kid)).parents.at(-1).id)).children.map(c => c.text);
  const siblingsBefore = await siblings();
  await page.keyboard.press("K");
  await waitFor(() => /Now|Done/.test(document.getElementById("toast").textContent), "K: moved up");
  const after = await siblings();
  await check("one place up", after.indexOf(after.find(t => t.includes("Keyboard task"))) === siblingsBefore.findIndex(t => t.includes("Keyboard task")) - 1);
  await page.keyboard.press("J");
  await page.waitForFunction(() => !document.getElementById("toast").hidden);
  await page.keyboard.press("H");
  await waitFor(() => /Now at the top level/.test(document.getElementById("toast").textContent), "H: out of its parent");
  await page.keyboard.press("L");
  await waitFor(() => /Now under Orgwarrior/.test(document.getElementById("toast").textContent), "L: into the heading above again");
  // e: the edit page, its text focused; Ctrl-Enter saves.
  await page.keyboard.press("e");
  await waitFor(() => document.activeElement?.id === "entry", "e: the edit page, typing at once");
  await page.keyboard.type("Edited from the keys");
  await chord("Control", "Enter");
  await waitFor(() => !location.hash.startsWith("#/e/"), "Ctrl-Enter saved, back");
  await check("the text saved", (await taskOf(kid)).body.includes("Edited from the keys"));

  // Marks, as org's agenda: m and u move on down, M marks a range,
  // * all, U none; the keys then act on the marked.  Ctrl-click toggles one,
  // Shift-click marks up to it.
  await go("#/v/all");
  await page.waitForSelector("#list .task[data-id]");
  const marked = () => page.$$eval("#list .task.picked", rs => rs.map(r => r.dataset.id));
  const rowIds = () => page.$$eval("#list .task[data-id]", rs => rs.map(r => r.dataset.id));
  await cursorTo("juggle");  // the rows after it unique: two Take out trash share an ID, which no action takes
  const ids = await rowIds(), at = ids.indexOf(await cursorId());
  await page.keyboard.press("m");
  await page.keyboard.press("m");
  await check("m m: two marked, the cursor two rows on", (await marked()).join() === ids.slice(at, at + 2).join()
    && await cursorId() === ids[at + 2]);
  await check("the bar counts them", await page.$eval("#selectbar", b => !b.hidden && /2 marked/.test(b.textContent)));
  await page.keyboard.press("k");
  await page.keyboard.press("u");
  await check("k u: the second unmarked, on down", (await marked()).join() === ids[at] && await cursorId() === ids[at + 2]);
  await page.keyboard.press("m");
  await page.keyboard.press("j");
  await page.keyboard.press("M");
  await check("m j M: from the last m to the cursor", (await marked()).join() === [ids[at], ids[at + 2], ids[at + 3], ids[at + 4]].join());
  await check("each marked row has its bar, the open task's too", await page.$$eval("#list .task.picked",
    rs => rs.every(r => getComputedStyle(r).boxShadow.includes("inset"))));
  await page.keyboard.press(",");
  await sheetOpen();
  await page.keyboard.press("c");
  await page.waitForFunction(() => document.getElementById("sheet").hidden && !document.querySelector("#list .task.picked"));
  await waitFor(ws => ws.every(id => /\[#C\]/.test(document.querySelector(`#list .task[data-id="${id}"]`)?.textContent ?? "")),
    ", c on the marked: all four priority C, the marks gone", [ids[at], ids[at + 2], ids[at + 3], ids[at + 4]]);
  await page.keyboard.press("*");
  await check("*: all marked", (await marked()).length === ids.length);
  await page.keyboard.press("U");
  await check("U: none", (await marked()).length === 0 && await page.$eval("#selectbar", b => b.hidden));
  await page.keyboard.down("Control");
  await page.click(`#list .task[data-id="${ids[0]}"]`);
  await page.keyboard.up("Control");
  await check("Ctrl-click marks one", (await marked()).join() === ids[0]);
  await page.keyboard.down("Shift");
  await page.click(`#list .task[data-id="${ids[2]}"]`);
  await page.keyboard.up("Shift");
  await check("Shift-click: up to it", (await marked()).length === 3);
  await page.keyboard.press("Escape");
  await check("Esc: unmarked", (await marked()).length === 0);

  // c: a card at the bottom, filled with the keys and sheets a task's fields
  // have; only what's set shown; Enter adds.
  const card = () => page.$eval("#sheet .draft", d => d.textContent).catch(() => "");
  // A picker from the card says what it's for, the draft's title with it.
  const sheetTitled = t => page.waitForFunction(t => document.querySelector("#sheet .sheet-title")?.textContent.startsWith(t), {timeout: 5000}, t);
  // c: the card opens in its title, a task; typing is the title.
  const onKind = k => page.evaluate(k => document.activeElement?.matches(`.kinds-row [data-kindset="${k}"][aria-pressed=true]`), k);
  await page.keyboard.press("c");
  await waitFor(() => document.activeElement?.id === "dr-title", "c: the card, in its title");
  await check("...a task to start", /New task/.test(await page.$eval("#sheet .sheet-title", x => x.textContent)));
  await page.keyboard.type("Drafted by keys");
  await check("typed: the title", await page.$eval("#dr-title", i => i.value === "Drafted by keys" && document.activeElement === i));
  await page.keyboard.press("Enter");
  await check("Enter in the title: on to Add, focused, nothing added yet", await focusedIs("#sheet [data-a=add]"));
  // ↑ from the title: up to the kind; ↓ back.  A digit typed in the title is
  // the title's; 2 off it an event, the focus kept; its When by s.
  await page.focus("#dr-title");
  await page.keyboard.press("ArrowUp");
  await check("↑: up to the kind", await onKind("task"));
  await check("no @ among the card's keys", !(await page.$("#sheet [data-pick='@']")));
  await page.keyboard.press("ArrowDown");
  await page.keyboard.type(" 2");
  await check("2 in the title: typed", await page.$eval("#dr-title", i => i.value === "Drafted by keys 2")
    && /New task/.test(await page.$eval("#sheet .sheet-title", x => x.textContent)));
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Escape");
  await page.keyboard.press("2");
  await waitFor(() => /New event/.test(document.querySelector("#sheet .sheet-title")?.textContent ?? "")
    && document.activeElement?.matches("#sheet [data-a=add]") && document.querySelector("#dr-title").value === "Drafted by keys"
    && /s when/.test(document.querySelector("#sheet .draft-keys")?.textContent ?? "")
    && !/t state/.test(document.querySelector("#sheet .draft-keys")?.textContent ?? ""), "2 off the title: an event, the focus kept, its keys its own");
  await page.keyboard.press("3");
  await waitFor(() => /New heading/.test(document.querySelector("#sheet .sheet-title")?.textContent ?? "")
    && document.activeElement?.matches("#sheet [data-a=add]"), "3 off the title: a heading, the focus kept");
  await page.keyboard.press("2");
  await page.keyboard.press("s");
  await sheetTitled("When");
  await check("the picker names the draft", await page.$eval("#sheet .sheet-title", x => x.textContent === "When · Drafted by keys"));
  await page.keyboard.press("Enter");
  await waitFor(() => /When today/.test(document.querySelector("#sheet .draft")?.textContent ?? ""), "s: when today");
  // ↑ from the title, then → ←: the kind both ways, in place.
  await page.focus("#dr-title");
  await page.keyboard.press("ArrowUp");
  await check("↑ from the title: the kind", await onKind("event"));
  await page.keyboard.press("ArrowRight");
  await waitFor(() => /New heading/.test(document.querySelector("#sheet .sheet-title")?.textContent ?? "")
    && !/When/.test(document.querySelector("#sheet .draft")?.textContent ?? ""), "→: a heading, no When");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await waitFor(() => /New task/.test(document.querySelector("#sheet .sheet-title")?.textContent ?? ""), "← ←: back to a task");
  await page.click('#sheet .kinds-row [data-kindset="heading"]');
  await waitFor(() => /New heading/.test(document.querySelector("#sheet .sheet-title")?.textContent ?? ""), "a click: a heading");
  await page.focus('#sheet .kinds-row [aria-pressed=true]');
  await page.keyboard.press("1");
  await waitFor(() => /New task/.test(document.querySelector("#sheet .sheet-title")?.textContent ?? ""), "1 on the kind: a task");
  await check("...the focus on the kind still", await onKind("task"));
  await page.keyboard.press("t");
  await sheetTitled("State");
  await page.keyboard.press("n");
  await waitFor(() => /NEXT/.test(document.querySelector("#sheet .draft")?.textContent ?? ""), "t n: NEXT, back on the card");
  await page.keyboard.press(",");
  await sheetTitled("Priority");
  await page.keyboard.press("a");
  await waitFor(() => /\[#A\]/.test(document.querySelector("#sheet .draft")?.textContent ?? ""), ", a: priority A");
  await page.keyboard.press(":");
  await sheetTitled("Tags");
  await page.keyboard.press("h");
  await page.keyboard.press("Enter");
  await waitFor(() => [...document.querySelectorAll("#sheet .draft .tag")].some(t => t.textContent === "@home"), ": h Enter: tagged");
  await page.keyboard.press("s");
  await sheetTitled("Scheduled");
  await page.keyboard.press("l");
  await page.keyboard.press("Enter");
  await waitFor(() => /Scheduled tomorrow/.test(document.querySelector("#sheet .draft")?.textContent ?? ""), "s l Enter: tomorrow");
  await page.keyboard.press("s");
  await sheetTitled("Scheduled");
  await check("the date's Clear shows SPC, Set C-RET", await page.$eval("#sheet [data-a=clear] kbd.fast", k => k.textContent === "SPC")
    && await page.$eval("#sheet [data-a=set]", b => getComputedStyle(b, "::after").content === '"C-RET"'));
  await page.keyboard.press(" ");
  await waitFor(() => !/Scheduled/.test(document.querySelector("#sheet .draft")?.textContent ?? ""), "s SPC: cleared, its row gone");
  await page.keyboard.press("s");
  await sheetTitled("Scheduled");
  await page.keyboard.press("l");
  await page.keyboard.press("Enter");
  await waitFor(() => /Scheduled tomorrow/.test(document.querySelector("#sheet .draft")?.textContent ?? ""), "tomorrow again");
  await page.keyboard.press("w");
  await waitFor(() => document.activeElement?.id === "rf-filter", "w: Where, its filter focused");
  await page.keyboard.type("warr");
  await page.keyboard.press("ArrowDown");
  await check("↓: into the list, on the one left", await focusedIs("#sheet .list button") && /Orgwarrior/.test(await page.evaluate(() => document.activeElement.textContent)));
  await page.keyboard.press("Enter");
  await waitFor(() => /In projects\.org › Orgwarrior/.test(document.querySelector("#sheet .draft")?.textContent ?? ""), "Enter: there");
  await page.keyboard.press("e");
  await waitFor(() => document.activeElement?.id === "dr-body", "e: the body");
  await page.keyboard.type("Sketched first");
  // The text tools work in the sheet too, the link's sheet over it and gone again.
  await page.$eval("#dr-body", b => b.setSelectionRange(0, 8));
  await page.click("#sheet [data-tool=bold]");
  await check("bold in the body's sheet", await page.$eval("#dr-body", b => b.value === "*Sketched* first"));
  await page.$eval("#dr-body", b => b.setSelectionRange(b.value.length, b.value.length));
  await page.click("#sheet [data-tool=link]");
  await waitFor(() => document.activeElement?.id === "l-url", "the link's sheet, over the body's");
  await page.evaluate(() => history.back());
  await waitFor(() => !document.getElementById("l-url") && document.getElementById("dr-body")?.value === "*Sketched* first",
    "Back closes the link's sheet only, the body's kept");
  await page.click("#sheet [data-tool=link]");
  await waitFor(() => document.activeElement?.id === "l-url", "the link's sheet again");
  await page.keyboard.type("example.org");
  await page.click("#sheet [data-a=save]");
  await waitFor(() => /\*Sketched\* first\[\[https:\/\/example\.org\]\]$/.test(document.getElementById("dr-body")?.value ?? ""),
    "back on the body, the link added, its text kept");
  await chord("Control", "Enter");
  await waitFor(() => /Details \*Sketched\* first/.test(document.querySelector("#sheet .draft")?.textContent ?? ""), "Ctrl-Enter: its details kept, their first line shown");
  await check("the card shows it all", /NEXT \[#A\] @home/.test(await card()));
  await page.keyboard.press("Enter");
  await waitFor(() => document.getElementById("sheet").hidden && /Added/.test(document.getElementById("toast").textContent), "Enter adds it");
  await waitFor(() => /Drafted by keys/.test(document.querySelector("#list .task.cursor")?.textContent ?? ""),
    "back where it was, the cursor on the new task");
  const drafted = await taskOf(await cursorId());
  await check("as drafted: NEXT, A, @home, scheduled, under Orgwarrior, its body", drafted.keyword === "NEXT"
    && drafted.priority === "A" && drafted.tags.includes("@home") && !!drafted.scheduled
    && drafted.parents.some(p => p.title.startsWith("Orgwarrior")) && drafted.body.includes("*Sketched* first[[https://example.org]]"));
  await page.keyboard.press("Enter");
  await expect("Enter opens it", s => s.heading === "Drafted by keys");
  await go("#/v/all");
  await page.waitForSelector("#list .task[data-id]");

  // Esc on a card with something in it: Discard changes?, Keep focused, l and h between the two.
  await page.keyboard.press("c");
  await waitFor(() => document.activeElement?.id === "dr-title", "c again");
  await page.keyboard.type("Not this one");
  await page.keyboard.press("Escape");
  await check("Esc in the title: out of it, on Add, the card kept", await focusedIs("#sheet [data-a=add]")
    && !(await page.$eval("#discard", d => d.open)));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("discard").open);
  await check("Esc again: asks, Keep focused, its key shown", await focusedIs("#discard [value=keep]")
    && await page.$eval("#discard [value=keep] kbd.fast", k => k.textContent === "n" && getComputedStyle(k).display !== "none"));
  await page.keyboard.press("l");
  await check("l: on Discard", await focusedIs("#discard [value=discard]"));
  await page.keyboard.press("h");
  await check("h: back on Keep", await focusedIs("#discard [value=keep]"));
  await page.keyboard.press("n");
  await waitFor(() => !document.getElementById("discard").open && !document.getElementById("sheet").hidden, "n: kept, the card still there");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("discard").open);
  await page.keyboard.press("y");
  await waitFor(() => !document.getElementById("discard").open && document.getElementById("sheet").hidden, "y: dropped");
  // a: the card, the new task under the cursor's.
  await cursorTo("Drafted by keys");
  const parent = await cursorId();
  await page.keyboard.press("a");
  await waitFor(() => document.activeElement?.id === "dr-title"
    && /In .*Under Drafted by keys/.test(document.querySelector("#sheet .draft")?.textContent ?? ""), "a: the card, under the cursor's task");
  await page.keyboard.type("A child by keys");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await sheetGone();
  await poll("a: added as its child", async () => (await taskOf(parent)).children?.some(c => /A child by keys/.test(c.text)));
  // A: the card, beside the cursor's task: under the same parent.
  await waitFor(() => /A child by keys/.test(document.getElementById("list").textContent), "...and in the list, redrawn");
  await cursorTo("A child by keys");
  await page.keyboard.press("A");
  await waitFor(() => document.activeElement?.id === "dr-title"
    && /In Under Drafted by keys/.test(document.querySelector("#sheet .draft")?.textContent ?? ""), "A: the card, beside it");
  await page.keyboard.press("Escape");  // out of the title
  await page.keyboard.press("Escape");
  await sheetGone();
  // C-k: asks, Cancel focused (Enter alone never kills); Tab, Enter kills.  x … kill asks the same.
  await cursorTo("Drafted by keys");
  await chord("Control", "k");
  await waitFor(() => !document.getElementById("sheet").hidden, "C-k opens its sheet");
  await check("C-k asks, Cancel focused, its ring shown", await focusedIs("#sheet [data-a=cancel]")
    && await page.$eval("#sheet [data-a=cancel]", b => getComputedStyle(b).boxShadow !== "none"));
  await page.keyboard.press("l");
  await check("l: on Kill", await focusedIs("#sheet [data-a=yes]"));
  await page.keyboard.press("h");
  await check("h: back on Cancel", await focusedIs("#sheet [data-a=cancel]"));
  await page.keyboard.press("n");
  await sheetGone();
  await check("n: nothing killed", await page.$eval("#list", l => l.textContent.includes("Drafted by keys")));
  // Killed from its page beside the list: the list stays, not the view before it.
  await clickRow("Drafted by keys");
  await page.waitForFunction(() => /Drafted by keys/.test(document.querySelector("#detail .heading")?.textContent ?? ""));
  await chord("Control", "k");
  await sheetOpen();
  await page.keyboard.press("y");
  await waitFor(() => !document.getElementById("list").textContent.includes("Drafted by keys"), "killed");
  await waitFor(() => location.hash === "#/v/all", "...the task beside it closed, the list kept");
  await cursorTo("Keyboard task now");
  await page.keyboard.press("x");
  await page.keyboard.type("kill");
  await page.keyboard.press("Enter");
  await sheetOpen();
  await check("x … kill asks first, Cancel focused", await focusedIs("#sheet [data-a=cancel]"));
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await waitFor(() => !document.getElementById("list").textContent.includes("Keyboard task now"), "killed from the box");
  // Themes: a theme, then Auto / Light / Dark where it has both, kept per device.
  const themeIs = () => page.evaluate(() => [document.documentElement.dataset.theme ?? "", localStorage.getItem("orgwarrior-theme")]);
  await page.keyboard.press("P");
  await waitFor(() => /Preferences/.test(document.querySelector("#sheet .sheet-title")?.textContent ?? "")
    && document.activeElement?.closest("#themes"), "P: the preferences drawer, on the theme");
  await tap('#themes [data-family="gruvbox"]');
  await check("Gruvbox on Auto: the device's light", (await themeIs()).join() === "gruvbox-light,gruvbox:auto");
  await tap('#modes [data-mode="dark"]');
  await check("Dark", (await themeIs()).join() === "gruvbox-dark,gruvbox:dark");
  await tap('#themes [data-family="dracula"]');
  await check("Dracula: dark only, one mode offered", (await themeIs())[0] === "dracula"
    && (await page.$$eval("#modes button", bs => bs.map(b => b.textContent).join())) === "Dark");
  await tap('#themes [data-family="modus"]');
  await check("Modus keeps Dark", (await themeIs()).join() === "modus-vivendi-tinted,modus:dark");
  await tap('#modes [data-mode="auto"]');
  await check("Modus on Auto: no data-theme, the CSS follows the device", (await themeIs()).join() === ",modus:auto");
  await check("kept as family:mode; anything else is Modus on Auto", await page.evaluate(() =>
    JSON.stringify([readTheme("solarized:dark"), readTheme("nord"), readTheme(null)])) ===
    JSON.stringify([{family: "solarized", mode: "dark"}, {family: "modus", mode: "auto"}, {family: "modus", mode: "auto"}]));
  await page.keyboard.press("Escape");
  await waitFor(() => document.getElementById("sheet").hidden && document.getElementById("settings").hidden
    && document.getElementById("settings").parentElement.tagName === "HEADER", "Esc closes it, its controls back in the header");
  // A day's agenda by org's keys: f b a day, F B a week, . today.
  await go("#/v/2030-01-15");
  await page.waitForSelector(".day.stepper");
  await page.keyboard.press("f");
  await expect("f: the next day", s => s.hash === "#/v/2030-01-16");
  await page.waitForFunction(() => document.querySelector(".day.stepper .pick input")?.value === "2030-01-16");
  await page.keyboard.press("B");
  await expect("B: a week back", s => s.hash === "#/v/2030-01-09");
  await page.waitForFunction(() => document.querySelector(".day.stepper .pick input")?.value === "2030-01-09");
  await page.keyboard.press("b");
  await expect("b: the day before", s => s.hash === "#/v/2030-01-08");
  const todayIso = await page.evaluate(() => { const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; });
  await page.keyboard.press(".");
  await expect(". : today", s => s.hash === `#/v/${todayIso}`);
  // What was closed today: one date line, but not a day's agenda to step.
  await go("#/v/all");
  await waitFor(() => [...document.querySelectorAll("#list .task")].some(r => r.textContent.includes("juggle")), "all drawn");
  await post("/api/act", {ids: [await idOf("Learn to juggle")], verb: "done", args: [], note: "Did it"});
  await go("#/v/closed%20today");
  await waitFor(() => [...document.querySelectorAll("#list .task")].some(r => r.textContent.includes("juggle")), "closed today drawn");
  await check("closed: no ‹ ›", !(await page.$("#list .stepper")));
  await page.keyboard.press("f");
  await check("...and f doesn't step it", await page.evaluate(() => decodeURIComponent(location.hash)) === "#/v/closed today");
  await post("/api/act", {ids: [await idOf("Learn to juggle")], verb: "todo", args: []});  // open again for what follows
  // A week's agenda steps by weeks: ‹ › on its header, b f, its date picked, . this week.
  const shown = () => decodeURIComponent(location.hash);
  const weekDrawn = iso => page.waitForFunction(i => document.querySelector(".head.stepper .pick input")?.value === i, {}, iso);
  await go("#/v/week");
  await waitFor(() => document.querySelector(".head.stepper .pick input")?.value, "the week: ‹ › on its header");
  await go("#/v/week 2030-01-15");
  await weekDrawn("2030-01-15");
  await page.keyboard.press("f");
  await check("f: the next week", await page.evaluate(shown) === "#/v/week 2030-01-22");
  await weekDrawn("2030-01-22");
  await page.keyboard.press("B");
  await check("B: a week back too", await page.evaluate(shown) === "#/v/week 2030-01-15");
  await weekDrawn("2030-01-15");
  await tap('.head.stepper [aria-label="Previous week"]');
  await check("‹: the week before", await page.evaluate(shown) === "#/v/week 2030-01-08");
  await weekDrawn("2030-01-08");
  await tap(".head.stepper .pick");
  await page.$eval(".head.stepper .pick input", i => { i.value = "2030-03-04"; i.dispatchEvent(new Event("change", {bubbles: true})); });
  await check("its date picked: that week", await page.evaluate(shown) === "#/v/week 2030-03-04");
  await weekDrawn("2030-03-04");
  await page.keyboard.press(".");
  await check(". : this week", await page.evaluate(shown) === `#/v/week ${todayIso}`);
  // The logo goes home: the default view, the cursor gone.
  await go("#/v/all");
  await page.waitForSelector(`#list .task[data-id="${juggle}"]`);
  await cursorTo("juggle");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#detail .heading");
  await tap(".brand");
  await expect("the logo: home, the default view", s => s.hash === "#/v/" && !s.heading);
  await check("the cursor gone", !(await page.$("#list .task.cursor")));

  // Org agenda's keys for the steps: S-↑ the priority up, M-m a mark toggled, X discard the clock (asks).
  await go("#/v/all");
  await page.waitForSelector("#list .task[data-id]");
  await cursorTo("Learn to juggle");
  const pr = await cursorId();
  const before = (await taskOf(pr)).priority;
  await chord("Shift", "ArrowUp");
  await poll("S-↑: the priority a step up", async () => (await taskOf(pr)).priority !== before);
  await page.waitForFunction(() => document.querySelector("#list .task.cursor"));
  await chord("Alt", "m");
  await waitFor(() => document.querySelectorAll("#list .task.picked").length === 1, "M-m: marked");
  await page.keyboard.press("U");
  await post("/api/clock", {op: "in", id: pr});
  await page.keyboard.press("g");
  await page.waitForFunction(() => !document.getElementById("clock").hidden);
  await page.keyboard.press("X");
  await page.waitForSelector("#sheet [data-a=yes]");
  await check("X: discard the clock, asked", /Discard this clock/.test(await page.$eval("#sheet", s => s.textContent)));
  await page.keyboard.press("y");
  await waitFor(() => document.getElementById("clock").hidden, "...and gone");

  // The cursor on a parent's row, a child opened beside from its outline: keys
  // act on the child you're looking at, not the row (a kill once took the parent).
  await go("#/v/projects.org");
  await page.waitForSelector("#list .task[data-id]");
  await cursorTo("Orgwarrior");
  await page.waitForFunction(() => /Orgwarrior/.test(document.querySelector("#detail .heading")?.textContent ?? ""));
  await page.click("#detail .kids .task[data-id]:nth-child(2)");
  await page.waitForFunction(() => currentTask && !/Orgwarrior/.test(currentTask.title));
  const child = await page.evaluate(() => currentTask.title);
  await check("the cursor still on the parent's row", /Orgwarrior/.test(await page.$eval("#list .task.cursor", r => r.textContent)));
  await chord("Control", "k");
  await page.waitForSelector("#sheet [data-a=yes]");
  const asked = await page.$eval("#sheet", x => x.textContent);
  await check("C-k asks about the child, not the parent", asked.includes(child) && !/Orgwarrior/.test(asked));
  await page.keyboard.press("n");
  await sheetGone();
  await page.keyboard.press("x");
  await check("x: the child's ID in the box", await page.evaluate(() => q.value.trim() === currentTask.id));
  await page.keyboard.press("Escape");
}, WIDE);
