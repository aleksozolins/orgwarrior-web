// Sharing to the add page, signing in by paste, and an add token's capture
// page (test_browser.py then checks what it added landed in the inbox).
import {run, base} from "./lib.js";

await run(async t => {
  const {page, fail, expect, check, idOf, tap, go, typeInto, setValue, chord} = t;
  // Shared from another app (Android's Share menu): the add page, filled in.
  await page.goto("about:blank");
  await page.goto(`${base}/?title=${encodeURIComponent("A good article")}&text=${encodeURIComponent("https://example.org/a")}`);
  await page.waitForSelector("#title");
  if (await page.$eval("#title", e => e.value) !== "A good article"
      || !/Details https:\/\/example\.org\/a/.test(await page.$eval("#detail [data-df=body]", e => e.textContent.replace(/\s+/g, " "))))
    fail("the share didn't fill the add page");
  else console.log("ok   a share opens the add page, filled in");
  await expect("...and the address is clean", s => s.hash === "#/add" && !/title=/.test(page.url()));

  // Not signed in: paste the key, or the whole link.  Then an add token's page.
  const signed = Deno.env.get("SIGNED"), addKey = Deno.env.get("ADD_KEY");
  await page.goto(`${signed}/`);
  await page.waitForSelector("#key");
  await expect("not signed in: the paste field", s => s.main.includes("isn't signed in") && !s.main.includes("Day-agenda"));
  await typeInto("#key", "wrong");
  await tap("[data-a=signin]");
  await expect("a wrong key is refused", s => /Unknown or revoked/.test(s.toast));
  await typeInto("#key", `${signed}/?key=${addKey}`, true);
  await page.keyboard.press("Enter");
  await page.waitForSelector("#kind");
  const header = await page.$eval("header", h => h.innerText);
  if (!header.includes("Sam's list") || await page.$eval("#tabs", t => t.offsetParent !== null))
    fail("the capture page's header", header);
  else console.log("ok   signed in by pasting the link: whose list, no tabs");
  if (await page.$("#add:not([hidden])") && await page.$eval("#add", b => b.offsetParent !== null))
    fail("the + shows on the capture page");
  // Its ⚙: the themes, per device, as on the full page.
  await tap("#gear");
  await tap('#themes [data-family="nord"]');
  await check("the capture page picks a theme too", await page.evaluate(() => document.documentElement.dataset.theme === "nord"));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("settings").hidden);
  console.log("ok   Esc closes the ⚙");
  // Arrows and hjkl between Task and Event.
  await page.focus('#kind [data-kind="task"]');
  await page.keyboard.press("l");
  await check("l: to Event", await page.evaluate(() => document.activeElement.dataset.kind === "event"));
  await page.keyboard.press("h");
  await page.click("#title");
  // Clear: only once something's typed, and it empties the form.
  const clearShown = () => page.$eval("[data-a=clear]", b => !b.hidden);
  if (await clearShown()) fail("Clear on an empty form");
  await typeInto("#title", "Never mind");
  if (!(await clearShown())) fail("no Clear once typed");
  await tap("[data-a=clear]");
  if (await page.$eval("#title", e => e.value) || await clearShown())
    fail("Clear didn't empty the form");
  else console.log("ok   Clear empties the capture form");
  await typeInto("#title", "Pick up dry cleaning");
  await check("its adders: Schedule, Deadline, Details, nothing of the list's",
    (await page.$$eval("#detail [data-df]", bs => bs.map(b => b.dataset.df).join())) === "sched,due,body");
  await tap("#detail [data-df=sched]");
  await setValue("#p-d", "2030-01-15");
  await tap("#sheet [data-a=set]");
  await tap("#detail [data-df=body]");
  await typeInto("#dr-body", "Ticket is on the fridge");
  await tap("#sheet [data-a=save]");
  await page.waitForFunction(() => /Details Ticket/.test(document.querySelector("#detail [data-df=body]")?.textContent ?? ""));
  await tap("[data-a=add]");
  await expect("sent: a line, and it heads the list, scheduled", s =>
    /Sent to Sam: Pick up dry cleaning\s+Sent by you\s+1 open\s+Pick up dry cleaning\s+Scheduled Tue 15 Jan 2030 · sent today/i.test(s.main));
  if (await page.$eval("#title", e => e.value)) fail("the form wasn't cleared");
  await tap("[data-kind=event]");
  await typeInto("#title", "Dinner at Nonna's");
  await check("an event's When, needed, says so", /When: pick a date/.test(await page.$eval("#detail [data-df=when]", e => e.textContent)));
  await tap("#detail [data-df=when]");
  await setValue("#p-d", "2030-01-16");
  await setValue("#p-t", "19:00");
  await tap("#sheet [data-a=set]");
  await page.waitForFunction(() => /When 2030-01-16 19:00/.test(document.querySelector("#detail [data-df=when]")?.textContent ?? ""));
  await page.focus("#title");
  await page.keyboard.press("Enter");
  // The time as the phone's language writes it ("7:00 PM"), not org's 19:00.
  const seven = await page.evaluate(() => new Date(2000, 0, 1, 19).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"}));
  await expect("an event too, newest first, its time the phone's way", s =>
    s.main.includes(`Wed 16 Jan 2030 ${seven} · event · sent today`)
    && /2 open\s+Dinner at Nonna's[\s\S]*Pick up dry cleaning/i.test(s.main));
  if (!(await page.$eval(".sent-item.new .t", t => t.textContent === "Dinner at Nonna's")))
    fail("the event isn't marked just sent");
  // Nothing of the list's: a view's route is refused to this key.
  const leak = await page.evaluate(() => fetch("/api/view?q=all").then(r => r.status));
  if (leak !== 401) fail("an add token read a view:", leak);
  // On the list's side, her task says whose it is.
  await page.goto("about:blank");
  await page.goto(`${base}/#/v/all`);
  await page.waitForSelector(".task[data-id]");
  await go(`#/t/${await idOf("Pick up dry cleaning")}`);
  await expect("her task page says from robin", s => s.heading.includes("dry cleaning") && /from robin/.test(s.main));
});
