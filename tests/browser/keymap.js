// Keys rebound: this section's servers run with [web.keys] preset = "evil"
// (evil-collection's agenda keys) and move = "g m" (test_browser.py).
// Single keys where org's differ (s D T p r d), sequences (g j, g r), the
// corner showing one under way, a key that goes nowhere; the hints, ? and
// the card following the table; one's own key filling a gap.
import {run, base, WIDE} from "./lib.js";

await run(async t => {
  const {page, expect, check, go, chord, cursorId, sheetOpen, sheetGone, waitFor} = t;
  await page.setViewport(WIDE);
  await page.goto(`${base}/#/v/all`);
  await page.waitForSelector("#list .task[data-id]");
  const seq = async (...keys) => { for (const k of keys) await (Array.isArray(k) ? chord(...k) : page.keyboard.press(k)); };
  const sheetTitle = () => page.$eval("#sheet .sheet-title", s => s.textContent);
  const opens = async (keys, what, re) => {
    await seq(...keys);
    await sheetOpen();
    await check(what, re.test(await sheetTitle()));
    await page.keyboard.press("Escape");
    if (!(await page.evaluate(() => document.getElementById("sheet").hidden))) await page.keyboard.press("Escape");
    await sheetGone();
  };

  // ?: the table, the preset's keys marked as not org's.
  await page.keyboard.press("?");
  await page.waitForSelector("#sheet dl.keys");
  const row = name => page.$$eval("#sheet dl.keys dd", (dds, w) => {
    const dd = dds.find(d => d.textContent.startsWith(w));
    const dt = dd?.previousElementSibling;
    return dd && {keys: dt.childNodes[0].textContent.trim(), marked: !!dt.querySelector(".rebound")};
  }, name);
  await check("? says the preset", /the evil preset/.test(await page.$eval("#sheet", s => s.textContent)));
  const kill = await row("delete it");
  await check("? kill: d, marked", kill?.keys === "d" && kill.marked);
  const state = await row("set the state");
  await check("? state: t, org's, unmarked", state?.keys === "t" && !state.marked);
  await check("? an action without a key: –", (await row("list its notes and state changes"))?.keys === "–");
  await page.keyboard.press("Escape");
  await sheetGone();

  // j, and g j: down a row each; C-k up.
  await page.keyboard.press("j");  // the first press shows the cursor
  const first = await cursorId();
  await seq("g", "j");
  await check("g j: down a row", (await cursorId()) !== first && !!(await cursorId()));
  await chord("Control", "k");
  await check("C-k: up a row (not kill)", (await cursorId()) === first);

  // A sequence under way shows in the corner; Esc ends it, nothing done.
  await page.keyboard.press("g");
  await waitFor(() => /^g …$/.test(document.getElementById("keyseq").textContent)
    && !document.getElementById("keyseq").hidden, "g: g … in the corner");
  await page.keyboard.press("Escape");
  await waitFor(() => document.getElementById("keyseq").hidden && document.getElementById("sheet").hidden
    && document.querySelector("#list .task.cursor"), "Esc: the sequence ended, the cursor kept");
  await seq("g", "x");
  await waitFor(() => /g x isn't a key/.test(document.getElementById("toast").textContent), "g x: not a key, said");

  // evil-collection's single keys.
  await seq("d");
  await page.waitForSelector("#sheet [data-a=yes]");
  await check("d: kill asks", /Kill/.test(await page.$eval("#sheet", s => s.textContent)));
  await page.keyboard.press("n");
  await sheetGone();
  await opens(["T"], "T: tags", /Tags/);
  await opens(["s"], "s: schedule", /Schedule/);
  await opens(["D"], "D: deadline", /Deadline/);
  await opens(["p"], "p: priority", /Priority/);
  await opens(["R"], "R: rename", /Rename/);
  await opens(["g", "m"], "g m (one's own): move", /Move/);

  // RET opens it; the task page's hints are the table's.
  await page.waitForFunction(() => document.querySelector("#list .task.cursor"));
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => currentTask && document.querySelector("#detail [data-do=kill]"));
  const hint = sel => page.$eval(`#detail ${sel}`, b => b.dataset.hint ?? null).catch(() => null);
  await check("hints: kill d, refile r, archive A, move g m", await hint("[data-do=kill]") === "d"
    && await hint("[data-do=refile]") === "r" && await hint("[data-do=archive]") === "A" && await hint("[data-do=move]") === "g m");
  await check("hints: tags T, schedule s", await hint("[data-do=tags]") === "T" && await hint("[data-do=sched]") === "s");
  await check("hints: history has none", await hint(".section-name[data-do=notes]") === null);

  // C-o: back (vim's jump list), C-i forward.
  const task = await page.evaluate(() => location.hash);
  await go("#/v/today");
  await page.waitForFunction(() => /Day-agenda/.test(document.getElementById("list").textContent));
  await chord("Control", "o");
  await expect("C-o: back", s => s.hash === task);
  await page.waitForFunction(() => document.body.dataset.page === "task" && currentTask);  // drawn: back and forward wait for it
  await chord("Control", "i");
  await expect("C-i: forward", s => s.hash === "#/v/today");

  // H L: a day back and on; . today.
  await page.waitForFunction(() => document.querySelector("#list .stepper .pick input"));
  await page.keyboard.press("H");
  await expect("H: the day before", s => /^#\/v\/\d{4}-\d\d-\d\d$/.test(s.hash));
  await page.keyboard.press(".");
  await expect(".: today", s => /^#\/v\/\d{4}-\d\d-\d\d$/.test(s.hash) || s.hash === "#/v/today");

  // : opens the box, as vim's command line.
  await page.keyboard.press(":");
  await check(": the box", await page.evaluate(() => document.activeElement?.id === "q"));
  await page.keyboard.press("Escape");

  // c: the card; its keys are the table's (T for tags).
  await go("#/v/all");
  await page.waitForSelector("#list .task[data-id]");
  await page.keyboard.press("c");
  await page.waitForFunction(() => document.activeElement?.id === "dr-title");
  await page.keyboard.type("Hang the shelf");
  await page.keyboard.press("Escape");
  await check("the card shows T for tags", /T\s*tags/.test(await page.$eval("#sheet .draft-keys", d => d.textContent)));
  await page.keyboard.press("T");
  await page.waitForFunction(() => /Tags · Hang the shelf/.test(document.querySelector("#sheet .sheet-title")?.textContent ?? ""));
  await check("T in the card: its tags", true);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector("#sheet .draft"));
  await page.keyboard.press("Escape");
  await page.waitForSelector("#discard[open], #sheet[hidden]").catch(() => {});
  if (await page.$("#discard[open]")) await page.keyboard.press("y");
  await sheetGone();
});
