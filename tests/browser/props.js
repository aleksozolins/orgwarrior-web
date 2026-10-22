// Properties and effort: the drawer as its own section (C), a property
// added, changed and deleted; the effort (E) and clocked time against it.
import {run, base} from "./lib.js";

await run(async t => {
  const {page, expect, check, idOf, tap, go, typeInto, post, sheetOpen, sheetGone, waitFor} = t;
  await page.goto(`${base}/#/v/all`);
  await page.waitForSelector(".task[data-id]");
  const id = await idOf("Pay rent"), juggle = await idOf("Learn to juggle");
  await go(`#/t/${juggle}`);
  await expect("a bare task: + Effort and + Property among the adders", s => /\+ Effort/.test(s.main) && /\+ Property/.test(s.main));
  await go(`#/t/${id}`);
  await expect("its properties a section, the drawer not in Details", s =>
    /properties[\s\S]*CREATED[\s\S]*2026-09-01/i.test(s.main) && !/PROPERTIES \(/.test(s.main));

  // E: the effort, a choice acting at once.
  await page.keyboard.press("E");
  await sheetOpen();
  await tap("#sheet [data-v='0:30']");
  await waitFor(() => /Effort 0:30/.test(document.querySelector("#detail .task-fields [data-do=effort]")?.textContent.replace(/\s+/g, " ")),
                "E, 0:30: the effort set");
  // Clocked past it: against it, in red.
  await post("/api/clock", {op: "in", id, time: "-50m"});
  await post("/api/clock", {op: "out", id});
  await page.keyboard.press("g");
  await waitFor(() => /0:50 \/ 0:30/.test(document.querySelector("#detail .clocked-total")?.textContent)
    && document.querySelector("#detail .clocked-total .over"), "clocked against the effort, red past it");

  // C: a property added, changed, deleted.
  await page.waitForFunction(() => currentTask);
  await page.keyboard.press("C");
  await sheetOpen();
  await tap("#sheet [data-new]");
  await page.waitForSelector("#pr-name");
  await typeInto("#pr-name", "LOCATION");
  await typeInto("#pr-new-value", "the bank");
  await tap("#sheet [data-a=save]");
  await expect("added", s => /LOCATION\s*the bank/.test(s.main));
  await tap("#detail [data-do=propedit][data-name=LOCATION]");
  await page.waitForSelector("#pr-value");
  await typeInto("#pr-value", "the credit union", true);
  await page.keyboard.press("Enter");
  await expect("changed", s => /LOCATION\s*the credit union/.test(s.main));
  await tap("#detail [data-do=propedit][data-name=LOCATION]");
  await page.waitForSelector("#pr-value");
  await page.keyboard.press("d");  // opened by a tap: no focus in the field, so d is the sheet's
  await page.waitForSelector("#sheet [data-a=yes]");
  await page.keyboard.press("y");
  await expect("deleted", s => !/LOCATION/.test(s.main) && /CREATED/.test(s.main));
  await check("the effort a property too", (await t.taskOf(id)).properties.some(p => p.name === "Effort" && p.value === "0:30"));
  await sheetGone();

  // Effort when adding: the add page's sheet, and the card's E.
  await go("#/add");
  await page.waitForSelector("#title");
  await typeInto("#title", "Paint the hall");
  await tap("#detail [data-df=effort]");
  await tap("#sheet [data-v='0:45']");
  await page.waitForFunction(() => /Effort 0:45/.test(document.querySelector("#detail [data-df=effort]")?.textContent ?? ""));
  await check("the Effort link says it", true);
  await tap("#detail [data-a=add]");
  await expect("added", s => /Added/.test(s.toast));
  await page.keyboard.press("c");
  await page.waitForFunction(() => document.activeElement?.id === "dr-title");
  await page.keyboard.type("Hang the shelf");
  await page.keyboard.press("Escape");
  await page.keyboard.press("E");
  await page.waitForSelector("#sheet [data-v='0:30']");
  await page.click("#sheet [data-v='0:30']");
  await waitFor(() => /Effort 0:30/.test(document.querySelector("#sheet .draft")?.textContent ?? ""), "the card's E: its effort on the card");
  await page.keyboard.press("Enter");
  await expect("added from the card", s => /Added/.test(s.toast) && !s.sheet);
  const efforts = await page.evaluate(async () => {
    const lines = await (await fetch("/api/view?q=all")).json();
    const id = t => lines.find(l => l.text.includes(t))?.id;
    const show = async t => (await (await fetch(`/api/task/${id(t)}`)).json()).effort;
    return [await show("Paint the hall"), await show("Hang the shelf")];
  });
  await check("both with their effort", efforts[0] === "0:45" && efforts[1] === "0:30");

  // A closed task: CLOSED among the fields, read only; no planning line in Details.
  const dentist = (await post("/api/act", {ids: [await idOf("Call dentist")], verb: "done", args: [], note: "x"}))[0].id;
  await go(`#/t/${dentist}`);
  await expect("closed: when, among the fields", s => /Closed \d{4}-\d\d-\d\d \w+ \d\d:\d\d/.test(s.main) && /Scheduled /.test(s.main));
  await check("no planning line in Details", !(await page.$eval("#detail", e => /CLOSED:|SCHEDULED:/.test(e.innerText))));
});
