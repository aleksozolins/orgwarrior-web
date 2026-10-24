// Structure: refile into a new heading, keywords on any heading, reorder,
// a file's outline, + Add and the + offering where you are, Move; a row
// acted on stays in place, dimmed, until a reload.
import {run, base, WIDE} from "./lib.js";

await run(async t => {
  const {page, fail, expect, check, idOf, tap, go, back, typeInto, waitFor, taskOf, sheetGone, longPress, clickRow, post, cursorTo} = t;
  await page.goto(`${base}/#/v/today`);
  await page.waitForSelector(".task[data-id]");
  // Long press → Schedule: the second sheet opens once the menu's is gone.
  await go("#/v/all");
  await page.waitForSelector(".task[data-id]");
  await longPress("Pay rent");
  await tap("#sheet [data-do=sched]");
  await tap("#sheet [data-d=tomorrow]");
  await expect("a date from the menu: the list reloads", s => !s.sheet && s.hash === "#/v/all" && s.main.includes("Pay rent"));
  await back();
  await expect("then Back leaves the view", s => s.hash !== "#/v/all");

  // Refile into a new heading: made where it's asked to go, the task under it,
  // and the task's path opens it, its tasks listed.
  await go("#/v/all");
  await page.waitForSelector(".task[data-id]");
  await go(`#/t/${await idOf("Buy batteries")}`);
  await expect("a task to refile", s => s.heading.includes("Buy batteries"));
  await tap("#detail [data-do=refile]");
  await tap("#sheet [data-new]");
  await page.waitForSelector("#nh-title", {visible: true});
  await page.select("#nh-place", "projects.org");
  await typeInto("#nh-title", "Kitchen reno");
  await page.keyboard.press("Enter");
  await expect("new heading: the task follows, under it", s => !s.sheet && s.heading.includes("Buy batteries")
    && /projects\.org › Kitchen reno/.test(s.main));
  await tap("#detail .where a:last-of-type");
  await expect("the path zooms into the project, its task listed", s => /projects\.org\s*›\s*Kitchen reno/.test(s.main)
    && /Buy batteries/.test(s.main));
  await tap("#list .crumbs a.here");
  await expect("the breadcrumb's heading: the project's page", s => s.heading.includes("Kitchen reno")
    && /Outline[\s\S]*Buy batteries/i.test(s.main) && !s.kw);
  // Any heading takes a keyword and gives it up again (C-c C-t, C-c C-t SPC).
  await tap("#detail [data-do=state][data-kw=TODO]");
  await expect("a project made a task", s => s.kw === "TODO" && s.heading.includes("Kitchen reno"));
  await tap("#detail [data-do=state][data-kw='']");
  await expect("...and a plain heading again", s => s.kw === "" && s.heading.includes("Kitchen reno")
    && !/TODO/.test(s.heading));
  await back();
  await back();
  await expect("Back, Back: the task again", s => s.heading.includes("Buy batteries"));

  // Reorder: ▲▼ move rows at once, Save writes them; leaving unsaved asks.
  const order = () => page.$$eval("#detail .kids .rows > .task .title", ts => ts.map(t => t.textContent.trim()));
  const pypi = await page.evaluate(async () => (await (await fetch("/api/file?f=projects.org")).json())
    .children[0].children.find(c => /Publish to PyPI/.test(c.text)).id);
  await go(`#/t/${pypi}`);
  await expect("a task with subtasks", s => s.heading.includes("Publish to PyPI"));
  await tap("#detail [data-reorder]");
  await tap("#detail .rows > .task:first-child [data-mv='1']");
  if ((await order()).join() !== "TODO Write a README,TODO Pick a license") fail("moved to", await order());
  await back();
  await expect("Back: a changed order asks", s => s.dialog);
  await tap("#discard button[value=keep]");
  await tap("#detail .kids [data-a=save]");
  await expect("Save: the new order, rows open again", s => !s.main.includes("▲") && /Write a README[\s\S]*Pick a license/.test(s.main));
  if (!(await page.$("#detail .rows > .task[data-id]"))) fail("rows not tappable after Save");

  // A file's outline is a view: its top-level headings, reordered the same way.
  await go("#/v/projects.org");
  await expect("the file's outline", s => s.hash === "#/v/projects.org" && /Orgwarrior[\s\S]*Kitchen reno/.test(s.main)
    && s.q === "projects.org");
  await tap("#list [data-reorder]");
  await tap("#list .rows > .task:last-child [data-mv='-1']");
  await tap("#reload");
  await expect("↻ with a changed order asks", s => s.dialog);
  await tap("#discard button[value=keep]");
  await tap("#list .kids [data-a=save]");
  await expect("file reordered", s => !s.main.includes("▲") && /Kitchen reno[\s\S]*Orgwarrior/.test(s.main));
  await tap("#list .kids [data-reorder]");
  await tap("#list .kids [data-a=cancel]");
  await expect("Cancel: as it was", s => !s.main.includes("▲") && !s.dialog && /Kitchen reno[\s\S]*Orgwarrior/.test(s.main));
  await tap(`#list .task[data-id="${await idOf("Kitchen reno")}"]`);
  await expect("a row opens its heading", s => s.heading.includes("Kitchen reno"));
  // + Add on an outline: the add page, Where set to that heading; back to it after.
  await tap("#detail .kids .add-here");
  await expect("+ Add: Where is the heading", s => s.hash.startsWith("#/add?under=")
    && /In projects\.org › Kitchen reno/i.test(s.main));
  await typeInto("#title", "Pick paint");
  await page.keyboard.press("Enter");
  await expect("added under it, back on its page", s => s.heading.includes("Kitchen reno")
    && /Outline[\s\S]*Pick paint/i.test(s.main));
  await tap(`#detail .task[data-id="${await idOf("Pick paint")}"]`);
  await expect("no children: no Outline, + Add heading in the adders", s => s.heading.includes("Pick paint")
    && !/Outline/i.test(s.main) && /\+ Add heading/.test(s.main));
  // The + on a task's page: the inbox still, the task offered beside it.
  await tap("#add");
  await expect("+ offers the task", s => s.hash.includes("offer=1") && /Under Pick paint/.test(s.main)
    && /In inbox\.org/i.test(s.main));
  await tap('#here [data-here^="u:"]');
  await expect("one tap: under it", s => /In projects\.org › Kitchen reno › Pick paint/i.test(s.main));
  await tap('#here [data-here=""]');
  await expect("and back", s => /In inbox\.org/i.test(s.main));
  await tap("#detail .back");
  await expect("as it was: leaves without asking", s => !s.dialog && s.heading.includes("Pick paint"));
  await go("#/v/projects.org");
  await page.waitForSelector("#list .kids .add-here");
  await tap("#list .kids .add-here");
  await expect("a file's + Add: its top level", s => /In projects\.org/i.test(s.main));
  await tap("#detail [data-df=where]");
  await tap('#sheet .list [data-t=""]');
  await expect("Where back to the default", s => /In inbox\.org/i.test(s.main));
  await tap("#detail [data-df=where]");
  await tap('#sheet .list [data-t="t:projects.org"]');
  await tap('#kind [data-kind=heading]');  // a plain heading: no keyword
  await typeInto("#title", "Garage");
  await page.keyboard.press("Enter");
  await expect("added at the file's top level", s => s.hash === "#/v/projects.org" && /Garage/.test(s.main));
  await tap(`#list .task[data-id="${await idOf("Garage")}"]`);
  await expect("...without a keyword", s => s.heading.includes("Garage") && s.kw === "");
  // Move: one sheet, from the task's page (Move) and a row's menu (Move…). Each
  // button acts at once and the sheet stays, saying where the task is now;
  // one that can't act is off.
  const sheetText = () => page.$eval("#sheet", x => x.textContent);
  const off = verb => page.$eval(`#sheet [data-mv="${verb}"]`, b => b.disabled);
  await tap('#detail [data-do="move"]');
  await page.waitForSelector("#sheet .move-list");
  await check("Move: at the top level, In and Up offered, Out and Down off", /Now at the top level/.test(await sheetText())
    && /▶ Into Orgwarrior/.test(await sheetText()) && /▲ Above Orgwarrior/.test(await sheetText())
    && await off("promote") && await off("down"));
  await tap('#sheet [data-mv="demote"]');
  await waitFor(() => /Now under Orgwarrior/.test(document.getElementById("sheet").textContent)
    && /◀ Out of Orgwarrior/.test(document.getElementById("sheet").textContent), "▶ In: now under Orgwarrior, the sheet still open");
  await expect("the page behind follows", s => /projects\.org › Orgwarrior/.test(s.main));
  await tap('#sheet [data-mv="promote"]');
  await waitFor(() => /Now at the top level/.test(document.getElementById("sheet").textContent), "◀ Out: the top level again");
  await tap("#sheet [data-a=cancel]");
  await sheetGone();
  // From a row's menu, on the file's tree: it lands in view, under its new parent.
  const drawnAt = await page.evaluate(() => loadedAt);
  await go("#/v/projects.org");
  await page.waitForFunction(t => loadedAt !== t && /Garage/.test(document.getElementById("list").textContent), {}, drawnAt);
  await clickRow("Garage", {button: "right"});
  await tap('#sheet [data-do="move"]');
  await page.waitForSelector("#sheet .move-list");
  await tap('#sheet [data-mv="demote"]');
  await waitFor(() => /Now under Orgwarrior/.test(document.getElementById("sheet").textContent), "the menu's Move…: In");
  await waitFor(() => [...document.querySelectorAll("#list .task[data-id]")].find(r => /Garage/.test(r.textContent))
    ?.style.getPropertyValue("--d") === "1", "behind the sheet, the tree shows it under Orgwarrior");
  await tap("#sheet [data-a=cancel]");
  await sheetGone();
  // Typed in the box, a file name is its outline too.
  await go("#/v/today");
  await page.waitForSelector(".task[data-id]");
  await typeInto("#q", "projects.org", true);
  await page.keyboard.press("Enter");
  await expect("typed: the outline", s => s.hash === "#/v/projects.org" && /Kitchen reno/.test(s.main));

  // A long body and a long outline: the first rows, the rest behind "Show …".
  const reno = await idOf("Kitchen reno");
  const before = (await taskOf(reno)).body;
  await post("/api/entry", {id: reno, old: before, text: before + Array.from({length: 30}, (_, i) => `Long line ${i}`).join("\n\n") + "\n"});
  for (let i = 0; i < 16; i++) await post("/api/add", {title: `Step ${i}`, under: reno});
  const renoNow = (await taskOf(reno)).id ?? reno;
  await go(`#/t/${renoNow}`);
  await page.waitForSelector("#detail .rendered.clipped");
  await check("a long text: its start, then Show all", (await page.$eval("#detail .rendered + .show-more", b => b.textContent)) === "Show all");
  await tap("#detail .rendered + .show-more");
  await check("Show all: the rest", await page.$eval("#detail .rendered", d => !d.classList.contains("clipped") && d.innerText.includes("Long line 29")));
  await check("a long outline: 12 shown, Show n more", await page.$$eval("#detail .kids .rows > .task", rs => rs.filter(r => r.offsetParent).length === 12)
    && /Show \d+ more/.test(await page.$eval("#detail [data-more]", b => b.textContent)));
  await tap("#detail [data-more]");
  await check("Show more: all of them", await page.$$eval("#detail .kids .rows > .task", rs => rs.every(r => r.offsetParent)));

  // Out of the view by an action: the row kept, dimmed, the cursor on it, so
  // the next key acts on it; a refile follows its new ID; g lets it go.
  await go("#/v/todo");
  await page.waitForFunction(() => document.querySelector("#list")?.textContent.includes("Buy batteries"), {timeout: 5000});
  await cursorTo("Buy batteries");
  const unfiled = await page.$eval("#list .task.cursor", r => r.dataset.id);
  await page.keyboard.press("t");
  await page.waitForSelector("#sheet [data-kw]");
  await page.keyboard.press("n");
  const keptRow = () => page.evaluate(() => {
    const r = [...document.querySelectorAll("#list .task.kept")].find(r => r.textContent.includes("Buy batteries"));
    return r && {id: r.dataset.id, text: r.textContent, cursor: r.classList.contains("cursor")};
  });
  await waitFor(() => [...document.querySelectorAll("#list .task.kept")].some(r => /NEXT/.test(r.textContent) && r.textContent.includes("Buy batteries")),
    "NEXT, out of the todo view: kept, its new state");
  await check("...the cursor on it", (await keptRow())?.cursor);
  await page.keyboard.press("w");
  await page.waitForSelector("#rf-filter");
  await page.keyboard.press("Enter");
  await waitFor(() => !document.querySelector("#rf-filter"), "refiled");
  await waitFor(before => (r => r && r.dataset.id !== before)(
    [...document.querySelectorAll("#list .task.kept")].find(r => r.textContent.includes("Buy batteries"))), "refiled: still kept, its new ID", unfiled);
  await check("...the cursor still on it", (await keptRow())?.cursor);
  await page.keyboard.press("g");
  await waitFor(() => !document.querySelector("#list")?.textContent.includes("Buy batteries"), "g: gone");
  // Side by side, the task open beside it: g reloads the list too.
  await page.setViewport(WIDE);
  await page.waitForFunction(() => document.querySelector("#list")?.textContent.includes("Learn to juggle"), {timeout: 5000});
  await cursorTo("Learn to juggle");
  await page.waitForFunction(() => /juggle/.test(document.querySelector("#detail")?.textContent ?? ""), {timeout: 5000});
  await page.keyboard.press("t");
  await page.waitForSelector("#sheet [data-kw]");
  await page.keyboard.press("n");
  await waitFor(() => [...document.querySelectorAll("#list .task.kept")].some(r => r.textContent.includes("Learn to juggle")),
    "side by side: kept");
  await page.keyboard.press("g");
  await waitFor(() => !document.querySelector("#list")?.textContent.includes("Learn to juggle"), "g with the task beside: gone");
});
