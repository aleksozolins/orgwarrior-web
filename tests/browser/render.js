// Details as org renders them: bold, a table, a colored-by-name code block,
// a safe link, raw HTML made safe; a checkbox still ticks; ⤢ (and V) read
// it full screen, the list set aside side by side; e from there edits, the
// editor full width too.  Keys scroll what's read; the keys' sheet opens at
// its top; the text tools' code, numbered list and blocks; a habit's days
// in the page theme's colors, each glyph black or white.
import {run, base, WIDE} from "./lib.js";

await run(async t => {
  const {page, expect, check, idOf, tap, go, post, taskOf, waitFor, typeInto} = t;
  await page.setViewport(WIDE);
  await page.goto(`${base}/#/v/all`);
  await page.waitForSelector(".task[data-id]");
  const id = await idOf("Pay rent");
  const old = (await taskOf(id)).body;
  await post("/api/entry", {id, old, text: [
    "Transfer from *checking*, see [[https://example.org][the bank]].", "",
    "| month | amount |", "|-------+--------|", "| Oct   |   1200 |", "",
    "#+begin_src python", "print(1)  # a comment", "#+end_src", "",
    "#+begin_export html", "<script>window.pwned = 1</script><b onclick=\"x()\">raw</b>", "#+end_export", "",
    "- [ ] remember the memo line", ""].join("\n")});
  await page.keyboard.press("g");
  await go(`#/t/${id}`);
  await page.waitForSelector("#detail .rendered");
  const r = sel => page.$(`#detail .rendered ${sel}`);
  await check("bold as bold", !!(await r("b")));
  await check("a table, its cells", (await page.$$eval("#detail .rendered td", tds => tds.map(td => td.textContent.trim()).join())) === "Oct,1200");
  await check("a code block", !!(await r("pre.src-python")));
  await check("a link, opening apart", await page.$eval("#detail .rendered a", a => a.href === "https://example.org/" && a.target === "_blank"));
  await check("raw HTML made safe: no script, no handler", !(await r("script"))
    && await page.evaluate(() => !window.pwned && ![...document.querySelectorAll("#detail .rendered *")].some(e => e.getAttribute("onclick"))));
  await check("no planning line, no drawer", !/DEADLINE|CREATED|:PROPERTIES:/.test(await page.$eval("#detail .rendered", e => e.textContent)));

  // A checkbox: a button, ticked by a tap.
  await tap("#detail .rendered button.checkbox");
  await waitFor(() => document.querySelector("#detail .rendered li.on button.checkbox"), "the checkbox ticks");
  await check("...in the file", /- \[X\] remember the memo line/.test((await taskOf(id)).body));

  // ⤢: the read page, full screen; the list set aside side by side.
  await tap("#detail [data-do=read]");
  await expect("⤢: the read page", s => s.hash === `#/r/${id}` && /Pay rent/.test(s.main));
  await page.waitForFunction(() => document.body.dataset.page === "read" && document.querySelector(".read-page .rendered"));
  await check("its title and text, the list set aside", await page.$eval("#list", l => l.offsetParent === null)
    && !!(await page.$("#detail .read-page .rendered table")));
  await page.keyboard.press("e");
  await expect("e: the editor", s => s.hash === `#/e/${id}`);
  await page.waitForFunction(() => document.body.dataset.page === "edit" && document.querySelector("#entry"));
  await check("the editor full width too", await page.$eval("#list", l => l.offsetParent === null));
  await page.waitForFunction(() => document.activeElement?.id === "entry");  // loaded, its text focused
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect("Esc, Esc: back to reading", s => s.hash === `#/r/${id}`);
  await page.waitForFunction(() => document.body.dataset.page === "read" && document.querySelector(".read-page"));
  await page.keyboard.press("Escape");
  await expect("Esc: back to the task", s => s.hash === `#/t/${id}`);
  await page.waitForFunction(() => currentTask && document.querySelector("#detail .rendered"));
  // A refresh in place can still be under way (keys do nothing then, as taps): again, as a person would.
  for (let i = 0; i < 3 && !(await page.evaluate(i => location.hash === `#/r/${i}`, id)); i++) {
    await page.keyboard.press("V");
    await page.waitForFunction(i => location.hash === `#/r/${i}`, {timeout: 1000}, id).catch(() => {});
  }
  await waitFor(i => location.hash === `#/r/${i}`, "V: the read page", id);

  await page.waitForSelector("#detail .read-page button.back");  // drawn, not just the address moved
  await check("‹ Back shows its key", await page.$eval("#detail button.back", b => b.dataset.hint === "ESC"));

  // Keys scroll what's read: End, Home, j a line.
  await page.setViewport({width: 1280, height: 300});
  await page.waitForFunction(() => detail.scrollHeight > detail.clientHeight + 100);
  await page.keyboard.press("End");
  await waitFor(() => detail.scrollTop + detail.clientHeight >= detail.scrollHeight - 2, "End: the bottom");
  await page.keyboard.press("Home");
  await waitFor(() => detail.scrollTop === 0, "Home: the top");
  await page.keyboard.press("j");
  await waitFor(() => detail.scrollTop > 0, "j: a line down");

  // ?: the keys' sheet from its top, scrolled by the keys.
  await page.keyboard.press("?");
  await page.waitForSelector("#sheet dl.keys");
  const body = () => page.$eval("#sheet .sheet-body", b => [b.scrollTop, b.scrollHeight - b.clientHeight]);
  await check("? opens at the top", (await body())[0] === 0);
  await page.keyboard.press("End");
  await waitFor(() => { const b = document.querySelector("#sheet .sheet-body"); return b.scrollTop >= b.scrollHeight - b.clientHeight - 2; },
                "End: the sheet's bottom");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("sheet").hidden);
  await page.setViewport(WIDE);

  // The text tools: ~code~, a numbered list on and off, a quote, a code block in its language.
  await go(`#/e/${await page.evaluate(() => currentTask.id)}`);
  await page.waitForFunction(() => document.activeElement?.id === "entry");
  const set = (v, from = 0, to = v.length) => page.$eval("#entry", (e, v, f, t) => {
    e.value = v; e.dispatchEvent(new Event("input", {bubbles: true})); e.focus(); e.setSelectionRange(f, t); }, v, from, to);
  const value = () => page.$eval("#entry", e => e.value);
  const tool = n => page.click(`.org-edit [data-tool=${n}]`);
  await set("run x now", 4, 5); await tool("code");
  await check("~code~", await value() === "run ~x~ now");
  await set("a\nb"); await tool("num");
  await check("numbered", await value() === "1. a\n2. b");
  await page.$eval("#entry", e => e.setSelectionRange(0, e.value.length)); await tool("num");
  await check("numbered off", await value() === "a\nb");
  await set("a\nb", 1, 3); await tool("quote");
  await check("a quote around the lines", await value() === "#+begin_quote\na\nb\n#+end_quote");
  await set("print(1)"); await tool("src");
  await typeInto("#src-lang", "python");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.getElementById("sheet").hidden);
  await check("a code block, its language", await value() === "#+begin_src python\nprint(1)\n#+end_src");
  await set("one two", 3, 3); await tool("quote");
  await check("at the caret: lines of its own", await value() === "one\n#+begin_quote\n#+end_quote\n two");

  // A habit: its days in the theme's own colors (vivid: the color itself for
  // org's full faces, the -future ones dimmer), not the Emacs theme's; each
  // glyph black or white.
  const juggle = await page.evaluate(async () => {
    const lines = await (await fetch("/api/view?q=all")).json();
    return lines.find(l => l.text.includes("Learn to juggle")).id;
  });
  const day = n => { const d = new Date(Date.now() + n * 864e5);  // sv: the local date as YYYY-MM-DD (toISOString is UTC: tomorrow, evenings)
    return `${d.toLocaleDateString("sv")} ${d.toLocaleDateString("en-US", {weekday: "short"})}`; };
  await post("/api/entry", {id: juggle, old: (await taskOf(juggle)).body, text: [
    `SCHEDULED: <${day(0)} .+2d>`, ":PROPERTIES:", ":STYLE:    habit", ":END:", ":LOGBOOK:",
    `- State "DONE"       from "TODO"       [${day(-2)} 09:00]`,
    `- State "DONE"       from "TODO"       [${day(-4)} 09:00]`, ":END:", ""].join("\n")});
  await page.goto(`${base}/?habit#/v/today`);  // a fresh load: the editor above holds unsaved text
  await page.waitForSelector("#list .habit [data-habit]");
  const days = await page.$$eval("#list .habit [data-habit]", spans => {
    // Any CSS color as the pixel it paints: color-mix gives oklab(), a variable rgb().
    const ctx = Object.assign(document.createElement("canvas"), {width: 1, height: 1}).getContext("2d");
    const px = c => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].join(); };
    const theme = getComputedStyle(document.documentElement);
    const roles = {"habit-clear": "--c4", "habit-ready": "--c2", "habit-alert": "--c3", "habit-overdue": "--c1"};
    return spans.map(s => ({role: s.dataset.habit, text: s.textContent, fg: px(getComputedStyle(s).color),
      bg: px(getComputedStyle(s).backgroundColor), want: roles[s.dataset.habit] && px(theme.getPropertyValue(roles[s.dataset.habit]).trim())}));
  });
  const full = days.filter(d => !d.role.endsWith("-future"));  // org's full faces: done, today, overdue
  await check("a habit's days in the theme's own colors", full.length > 0 && full.every(d => d.bg === d.want));
  await check("its glyphs black or white", days.filter(d => /[*!]/.test(d.text))
    .every(d => d.fg === "0,0,0,255" || d.fg === "255,255,255,255"));

  // Headings in the details: asked first, then tasks under it, the toast saying how many.
  const dentist = await page.evaluate(async () => (await (await fetch("/api/view?q=all")).json())
    .find(l => l.text.includes("Call dentist")).id);
  await page.goto(`${base}/?outline#/e/${dentist}`);
  await page.waitForFunction(() => document.body.dataset.page === "edit" && document.querySelector("#entry"));
  await page.$eval("#entry", e => { e.value = "Ask about the cleaning.\n#+begin_example\n* not a task\n#+end_example\n* Find the insurance card\n** Check the expiry";
    e.dispatchEvent(new Event("input", {bubbles: true})); });
  await page.click("[data-a=save]");
  await page.waitForSelector("#sheet .outline-list");
  await check("the question lists them, the block's line left out", await page.$$eval("#sheet .outline-list li", ls => ls.map(l => l.textContent).join("|"))
    === "Find the insurance card|Check the expiry");
  await page.keyboard.press("n");
  await page.waitForFunction(() => document.getElementById("sheet").hidden);
  await check("n: still editing, nothing saved", await page.evaluate(() => location.hash.startsWith("#/e/"))
    && !(await taskOf(dentist)).children?.length);
  await page.click("[data-a=save]");
  await page.waitForSelector("#sheet [data-a=yes]");
  await page.keyboard.press("y");
  await waitFor(() => /Saved · 2 headings under it/.test(document.getElementById("toast").textContent), "y: saved, the toast says so");
  const kids = (await taskOf(dentist)).children ?? [];
  await check("the heading a task under it, its own under that", kids.length === 1 && /Find the insurance card/.test(kids[0].heading ?? kids[0].text ?? JSON.stringify(kids[0])));
  await check("the block's line still its text", /,\* not a task/.test((await taskOf(dentist)).body));

  // The card: asked at Add.
  await page.goto(`${base}/?card#/v/all`);
  await page.waitForSelector(".task[data-id]");
  await page.keyboard.press("c");
  await page.waitForFunction(() => document.activeElement?.id === "dr-title");
  await page.keyboard.type("Plan the trip");
  await page.keyboard.press("Escape");
  await page.keyboard.press("e");
  await page.waitForSelector("#dr-body");
  await page.$eval("#dr-body", e => { e.value = "* Book flights"; e.dispatchEvent(new Event("input", {bubbles: true})); });
  await page.keyboard.down("Control"); await page.keyboard.press("Enter"); await page.keyboard.up("Control");
  await page.waitForFunction(() => document.querySelector("#sheet .draft"));
  await page.keyboard.press("Enter");
  await page.waitForSelector("#sheet .outline-list");
  await page.keyboard.press("y");
  await waitFor(() => /Added Plan the trip · 1 heading under it/.test(document.getElementById("toast").textContent), "the card: added, one heading under it");

  // A task opened from its parent's outline, killed: back on the parent, not the empty pane.
  const parent = await page.evaluate(async () => (await (await fetch("/api/file?f=projects.org")).json()).children[0].id);
  await page.goto(`${base}/?kill#/t/${parent}`);
  await page.waitForFunction(() => currentTask && document.querySelector("#detail .kids .task[data-id]"));
  await page.click("#detail .kids .task[data-id]");
  await page.waitForFunction(p => currentTask && currentTask.id !== p, {}, parent);
  await page.click("#detail [data-do=kill]");
  await page.waitForSelector("#sheet [data-a=yes]");
  await page.click("#sheet [data-a=yes]");
  await waitFor(p => location.hash === `#/t/${p}` && currentTask?.id === p, "killed: back on its parent", parent);

  // h: the file's tree zoomed into the task; h on a row a level further, ^ out
  // a level with the cursor on where it was; the breadcrumb's heading opens it.
  const {cursorTo} = t;
  await page.goto(`${base}/?zoom#/t/${parent}`);
  await page.waitForFunction(() => currentTask && document.querySelector("#detail .section-name[data-do=outline]"));
  await page.keyboard.press("h");
  await waitFor(p => location.hash === `#/v/${encodeURIComponent(`projects.org::${p}`)}` && document.querySelector("#list .crumbs")
    && [...document.querySelectorAll("#list .task.node")].some(r => /Publish to PyPI/.test(r.textContent)), "h: zoomed into it", parent);
  const crumbs = () => page.$eval("#list .crumbs", c => c.textContent.replace(/\s+/g, " "));
  await check("its breadcrumb: the file, then it", /‹\s*projects\.org\s*›\s*Orgwarrior/.test(await crumbs()));
  await check("the box says the file", await page.$eval("#q", q => q.value) === "projects.org");
  await page.keyboard.press("j");
  await cursorTo("Publish to PyPI");
  await page.keyboard.press("h");
  await waitFor(() => /Orgwarrior[^›]*›\s*Publish to PyPI/.test(document.querySelector("#list .crumbs")?.textContent ?? "")
    && /Pick a license/.test(document.getElementById("list").textContent), "h on a row: a level down");
  await page.keyboard.press("^");
  await waitFor(() => !/Publish to PyPI\s*$/.test(document.querySelector("#list .crumbs")?.textContent ?? "")
    && /Publish to PyPI/.test(document.querySelector("#list .task.cursor")?.textContent ?? ""), "^: out a level, the cursor on it");
  await page.keyboard.press("^");
  await waitFor(() => location.hash === "#/v/projects.org" && !document.querySelector("#list .crumbs")
    && document.querySelector("#list .kids .section-title").textContent.startsWith("Outline"), "^ again: the whole file");
  await page.goBack();
  await waitFor(() => document.querySelector("#list .crumbs"), "Back: zoomed again");
  await page.click("#list .crumbs a.here");
  await waitFor(p => currentTask?.id === p, "the breadcrumb's heading: its page", parent);

  // A parent in a task's path: zoomed into, the task among its headings, beside.
  const pypi = await page.evaluate(async () => (await (await fetch("/api/file?f=projects.org")).json())
    .children[0].children.find(c => /Publish to PyPI/.test(c.text)));
  const license = pypi.children.find(c => /Pick a license/.test(c.text)).id;
  await page.goto(`${base}/?zoom-path#/t/${license}`);
  await page.waitForFunction(() => currentTask && document.querySelector("#detail .where a[data-zoom]"));
  await page.$$eval("#detail .where a[data-zoom]", as => as.at(-1).click());
  await waitFor(([p, l]) => listQuery === `projects.org::${p}` && currentTask?.id === l
    && document.querySelector("#list .crumbs") && document.querySelector("#list .task.current")?.dataset.id === l, "a parent in the path: zoomed, the task beside", [pypi.id, license]);

  // The last of its level killed beside: the cursor onto the one before it,
  // shown beside, not the empty pane.
  await cursorTo("Write a README");
  await waitFor(() => /Write a README/.test(document.querySelector("#detail .heading")?.textContent ?? ""), "the cursor's row beside");
  await page.keyboard.down("Control"); await page.keyboard.press("k"); await page.keyboard.up("Control");
  await page.waitForSelector("#sheet [data-a=yes]");
  await page.keyboard.press("y");
  await waitFor(l => currentTask?.id === l && document.querySelector("#list .task.cursor")?.dataset.id === l
    && !/Write a README/.test(document.getElementById("list").textContent), "killed: the one before it, beside", license);
});
