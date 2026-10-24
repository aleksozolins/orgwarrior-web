// The task's page on a phone: rename, the fields' sheets, notes, dates, the menu's sheets,
// the edit page and its tools, the add page.
import {run, base} from "./lib.js";

await run(async t => {
  const {page, fail, state, expect, check, focusedIs, idOf, tap, go, back, typeInto, setValue, longPress, taskOf} = t;
  await page.goto(`${base}/#/v/all`);
  await page.waitForSelector(".task[data-id]");

  // Rename: the title edits in place.  Escape puts it back; Enter saves, and
  // the page follows the new ID.
  const dentist = await idOf("dentist");
  await go(`#/t/${dentist}`);
  await tap("#detail .heading");
  await typeInto("#t-title", " x");
  await page.keyboard.press("Escape");
  await expect("title: Escape puts it back", s => s.heading.includes("dentist") && !s.heading.includes(" x"));
  if (await page.$eval("#t-title", e => e.value.endsWith(" x"))) fail("the title kept what was typed");
  await tap("#detail .heading");
  await typeInto("#t-title", "Call the dentist back", true);
  await page.keyboard.press("Enter");
  const task = (await expect("title: Enter renames, the page follows",
    s => s.heading.includes("Call the dentist back") && s.hash !== `#/t/${dentist}` && !s.sheet)).hash;

  // The fields: what's set, a link to its sheet; what isn't, an adder.  The
  // tags' sheet asks before dropping a change; saved, the tag shows.
  const field = verb => page.$eval(`#detail .task-fields [data-do=${verb}]`, b => b.textContent.replace(/\s+/g, " ").trim());
  await check("no priority: an adder", (await field("pri")) === "+ Priority");
  const tagsBefore = await field("tags");
  await tap("#detail [data-do=tags]");
  await page.waitForSelector("#sheet .tagchip");
  await tap("#sheet .tagchip:not(.inherited):not(.on)");
  await tap("#sheet [data-a=cancel]");
  await expect("a changed tags sheet asks", s => s.dialog);
  await tap("#discard button[value=keep]");
  await tap("#sheet [data-a=save]");
  await expect("saved", s => !s.sheet && s.hash === task);
  await page.waitForFunction(b => { const t = document.querySelector("#detail .task-fields [data-do=tags]")?.textContent.replace(/\s+/g, " ").trim();
    return t && t !== b && t.startsWith("Tags "); }, {timeout: 5000}, tagsBefore);
  await check("the tags link shows the change", true);

  // Priority: chips in a sheet, each acting at once; the title leaves the cookie out.
  await tap("#detail [data-do=pri]");
  await tap("#sheet [data-pri=B]");
  await expect("priority set at once", s => !s.sheet && !s.heading.includes("[#"));
  await page.waitForFunction(() => document.querySelector("#detail .task-fields [data-do=pri]")?.textContent.replace(/\s+/g, " ").trim() === "Priority B"
    && currentTask?.priority === "B", {timeout: 5000});
  await check("the field says B", true);
  await tap("#detail [data-do=pri]");
  await tap("#sheet [data-pri=none]");
  await page.waitForFunction(() => document.querySelector("#detail .task-fields [data-do=pri]")?.textContent.trim() === "+ Priority");
  await check("priority removed: an adder again", true);

  // A note: typed where it will show, kept on "keep editing", first once saved.
  await tap("[data-f=note]");
  await typeInto("#t-note", "Called, left voicemail");
  await back();
  await expect("Back: a half-typed note asks", s => s.dialog);
  await tap("#discard button[value=keep]");
  await expect("keep editing: the note stays", s => !s.dialog && s.hash === task);
  await tap("[data-unit=note] [data-f=save]");
  await expect("the note shows, newest first, in its history",
    s => s.hash === task && /history[\s\S]*Called, left voicemail/i.test(s.main));
  if (await page.$eval("[data-unit=note]", u => !u.hidden)) fail("the note box stayed open");

  // A quick date is a choice: it saves at once.  (+1w always changes it.)
  const before = await field("sched");
  await tap("#detail [data-do=sched]");
  await tap("#sheet [data-d='+1w']");
  await page.waitForFunction(b => document.querySelector("#detail .task-fields [data-do=sched]")?.textContent.replace(/\s+/g, " ").trim() !== b, {}, before);
  await check("quick date saves at once", /^Scheduled \d{4}-/.test(await field("sched")));

  // The sheet starts as the timestamp; a repeater, then a time range from the pickers.
  await tap("#detail [data-do=sched]");
  await tap("#sheet [data-rep=every]");
  await t.setValue("#p-rn", "2");
  await tap("#sheet [data-a=set]");
  await page.waitForFunction(() => /\+2w/.test(document.querySelector("#detail .task-fields [data-do=sched]")?.textContent));
  await check("a repeater set", true);
  await tap("#detail [data-do=sched]");
  if (await page.$eval("#p-t", e => e.type) !== "time") fail("not the browser's time picker");
  await setValue("#p-t", "14:30");
  await setValue("#p-e", "16:00");
  await tap("#sheet [data-a=set]");
  await page.waitForFunction(() => /14:30-16:00/.test(document.querySelector("#detail .task-fields [data-do=sched]")?.textContent));
  await check("a time range from the pickers, the repeater kept", /\+2w/.test(await field("sched")));

  // The menu's sheets: Back closes one, not the page; with changes it asks first.
  await go("#/v/all");
  await page.waitForSelector(".task[data-id]");
  await longPress("Pay rent");
  if (await page.$("#sheet [data-do=rename], #sheet [data-do=edit]")) fail("rename or edit in the menu");
  // A note from the menu, a sheet of its own once the menu's is gone.
  await tap("#sheet [data-do=note]");
  await typeInto("#sheet #note", "Rent goes up in March");
  await tap("#sheet [data-a=save]");
  await expect("a note from the menu", s => !s.sheet && s.hash === "#/v/all");
  await go(`#/t/${await idOf("Pay rent")}`);
  await expect("...shows on the task", s => s.main.includes("Rent goes up in March"));
  await go("#/v/all");
  await page.waitForSelector(".task[data-id]");
  await longPress("Pay rent");
  await tap("#sheet [data-do=tags]");
  await expect("tags sheet open", s => s.sheet);
  await back();
  await expect("Back: untouched sheet closes, page stays", s => !s.sheet && !s.dialog && s.hash === "#/v/all");
  await longPress("Pay rent");
  await tap("#sheet [data-do=tags]");
  await tap("#sheet .tagchip:not(.inherited)");
  await back();
  await expect("Back: changed sheet asks", s => s.sheet && s.dialog);
  await tap("#discard button[value=keep]");
  await expect("keep editing: sheet and page stay", s => s.sheet && !s.dialog && s.hash === "#/v/all");
  await tap("#sheet [data-a=cancel]");
  await expect("Cancel: changed sheet asks", s => s.dialog);
  await tap("#discard button[value=discard]");
  await expect("discard: sheet closes, page stays", s => !s.sheet && s.hash === "#/v/all");
  await longPress("Pay rent");
  await tap("#sheet [data-do=sched]");
  await page.mouse.click(200, 20);
  await expect("tap outside: untouched sheet closes", s => !s.sheet && s.hash === "#/v/all");
  await go(task);
  await expect("back on the task", s => s.hash === task && s.heading);

  // The edit page: Back with changes asks, keep editing keeps the text, Save doesn't ask.
  await tap("[data-do=edit]");
  const edit = (await expect("edit page", s => s.hash.startsWith("#/e/"))).hash;
  await typeInto("#entry", "\nmore");
  await back();
  await expect("Back: changed edit page asks", s => s.dialog);
  await tap("#discard button[value=keep]");
  await expect("keep editing: still there, text kept", s => s.hash === edit && !s.dialog);
  if (!(await page.$eval("#entry", e => e.value)).endsWith("more")) fail("text lost");
  // The planning line and drawers fold away; the body has the text tools.
  const parts = await page.$$eval("details[data-part] > summary", ss => ss.map(x => x.textContent.trim()));
  if (parts.length !== 2 || !parts[0].startsWith("Planning: SCHEDULED") || !/^:LOGBOOK: \(\d+\)$/.test(parts[1]))
    fail("the folds:", parts);
  const entryValue = () => page.$eval("#entry", e => e.value.trim());
  const selectText = t => page.$eval("#entry", (e, t) => { const i = e.value.indexOf(t); e.focus(); e.setSelectionRange(i, i + t.length); }, t);
  await selectText("more");
  await tap(".org-edit [data-tool=bold]");
  if (await entryValue() !== "*more*") fail("bold:", await entryValue());
  if (await page.evaluate(() => document.activeElement.id) !== "entry") fail("a tool took the focus");
  await tap(".org-edit [data-tool=box]");
  if (await entryValue() !== "- [ ] *more*") fail("checkbox on:", await entryValue());
  await tap(".org-edit [data-tool=box]");
  if (await entryValue() !== "*more*") fail("checkbox off:", await entryValue());
  await page.$eval("#entry", e => e.setSelectionRange(e.value.length, e.value.length));
  await tap(".org-edit [data-tool=link]");
  await typeInto("#l-url", "example.org");
  await typeInto("#l-text", "site");
  await tap("#sheet [data-a=save]");
  await page.waitForFunction(() => document.getElementById("sheet").hidden);
  if (!(await entryValue()).endsWith("[[https://example.org][site]]")) fail("link:", await entryValue());
  await tap("[data-a=save]");
  await expect("Save: back to the task, no question", s => !s.dialog && s.hash === task && s.main.includes("more"));
  const saved = (await taskOf(task.slice(4))).body;
  if (!/^SCHEDULED: .*\n:LOGBOOK:\n[\s\S]*\n:END:\n\n\*more\*\[\[https:\/\/example\.org\]\[site\]\]$/.test(saved))
    fail("saved as one entry:", JSON.stringify(saved));

  // The add page: untouched, Back just leaves; with a title, ‹ Back asks.
  await go("#/add");
  await page.waitForSelector("#title");
  await back();
  await expect("untouched add page leaves quietly", s => !s.dialog && s.hash === task && s.heading);
  // Esc in a field: out of it, to Add (Enter ready); Esc again leaves, asking.
  await go("#/add");
  await typeInto("#title", "x");
  await page.keyboard.press("Escape");
  await check("Esc in the title: out of it, on Add, still the add page", await focusedIs(".add-page [data-a=add]")
    && page.url().includes("#/add") && !(await page.$eval("#discard", d => d.open)));
  await page.keyboard.press("Escape");
  await expect("Esc again: leaving asks", s => s.dialog);
  await tap("#discard button[value=keep]");
  await expect("kept", s => !s.dialog && s.hash === "#/add");
  await page.$eval("#title", i => i.value = "");
  await typeInto("#title", "x");
  await tap("button.back");
  await expect("‹ Back: changed add page asks", s => s.dialog);
  await tap("#discard button[value=discard]");
  await expect("discard leaves", s => !s.dialog && s.hash === task && s.heading);

  // Adding: what's set shows as the task page shows it, what isn't as adders,
  // each opening the task page's sheet; Enter in the title adds.
  await go("#/add");
  await typeInto("#title", "Buy milk");
  const fieldText = f => page.$eval(`#detail [data-df=${f}]`, b => b.textContent.replace(/\s+/g, " ").trim());
  await check("unset: adders", (await fieldText("tags")) === "+ Tags" && (await fieldText("sched")) === "+ Schedule");
  await tap("#detail [data-df=tags]");
  await tap("#sheet [data-t]");
  await tap("#sheet [data-a=save]");
  await page.waitForFunction(() => /^Tags /.test(document.querySelector("#detail [data-df=tags]")?.textContent.trim() ?? ""));
  await check("a tag picked: the Tags link shows it", true);
  await tap("#detail [data-df=sched]");
  await tap("#sheet [data-d=tomorrow]");
  await page.waitForFunction(() => /Scheduled tomorrow/.test(document.querySelector("#detail [data-df=sched]")?.textContent ?? ""));
  await check("a quick date: Scheduled tomorrow", true);
  await page.focus("#title");
  await page.keyboard.press("Enter");
  await expect("Enter in the title adds", s => !s.dialog && s.hash === task && s.heading);
  await go("#/v/all");
  await expect("the new task is there", s => s.main.includes("Buy milk"));
  await go(task);

  // An event: its date a field, When, never Details' text, and no Schedule
  // or Deadline; in the editor a fold of its own, saved back where it was.
  await go("#/v/today");
  await page.waitForSelector(".task[data-id]");
  const appt = await idOf("Dentist appointment");
  await go(`#/t/${appt}`);
  await page.waitForSelector("#detail .task-fields [data-do=when]");
  await go(`#/e/${appt}`);
  await page.waitForSelector("#entry");
  const stamp = (await taskOf(appt)).when;
  await check("the editor: When folded apart, the text box empty",
    await page.$$eval("#detail details.fold", (fs, w) => fs.length === 1 && fs[0].querySelector("summary").textContent.startsWith("When")
      && fs[0].querySelector("textarea").value === w, stamp) && (await entryValue()) === "");
  await typeInto("#entry", "At the clinic");
  await tap("[data-a=save]");
  await expect("saved", s => !s.dialog && s.hash === `#/t/${appt}` && s.main.includes("clinic"));
  if ((await taskOf(appt)).body !== `${stamp}\nAt the clinic`) fail("saved:", JSON.stringify((await taskOf(appt)).body));
  await check("an event: When, no Schedule or Deadline, Details without the date",
    /^When /.test(await field("when")) && !(await page.$("#detail .task-fields [data-do=sched], #detail .task-fields [data-do=due]"))
      && await page.$eval("#detail .rendered", r => r.textContent.trim() === "At the clinic"));
  await tap("#detail [data-do=when]");
  await tap("#sheet [data-d=tomorrow]");
  const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString("sv-SE");
  await page.waitForFunction(d => document.querySelector("#detail .task-fields [data-do=when]")?.textContent.includes(d), {timeout: 5000}, tomorrow);
  await check("When moved the date, the text kept",
    new RegExp(`^<${tomorrow} [^ >]+>\\nAt the clinic$`).test((await taskOf(appt)).body));

  // A read-only file (a calendar a script exports): its tasks to read, no
  // controls; the menu says so, the editor's address goes to the page.
  await Deno.chmod(`${Deno.env.get("ORGWARRIOR_FIXTURE_DEST")}/calendar.org`, 0o444);
  await page.reload();
  await page.waitForSelector("#detail .where .read-only");
  await check("read only: said so, nothing to change, Details to read",
    await page.$("#detail .where .read-only") && !(await page.$("#detail [data-do]:not([data-do=read]), #detail .heading[role=button], #detail .adders"))
      && /^When /.test(await page.$eval("#detail .field-line", f => f.textContent.trim())));
  await go(`#/e/${appt}`);
  await expect("its editor goes to its page", s => s.hash === `#/t/${appt}` && !s.main.includes("Save"));
  await go("#/v/week");
  await page.waitForSelector(`.task[data-id="${appt}"][data-ro]`);
  await longPress("Dentist appointment");
  await check("its menu: Open, nothing to change",
    await page.$eval("#sheet", s => s.textContent.includes("is read only, because") && !s.querySelector("[data-do]:not([data-do=open])")));
  await page.keyboard.press("Escape");
  await expect("closed", s => !s.sheet);
});
