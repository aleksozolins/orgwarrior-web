// Clocking: in from the menu, the strip, the toast's Adjust, out on the
// task page, its clocks edited and deleted; then the keys (i I o O l, d).
import {run, base} from "./lib.js";

const iso = d => [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(v => String(v).padStart(2, "0")).join("-");
const yesterday = iso(new Date(Date.now() - 86400000));

await run(async t => {
  const {page, expect, check, idOf, tap, go, setValue, waitFor, longPress, cursorTo, sheetOpen, sheetGone} = t;
  const strip = () => page.$eval("#clock", c => c.hidden ? "" : c.textContent.replace(/\s+/g, " ").trim());
  // A browser in another time zone than the server's (LibreWolf says UTC):
  // a clock just started is still 0:00.
  await page.emulateTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone === "Pacific/Kiritimati"
    ? "America/Anchorage" : "Pacific/Kiritimati");
  await page.goto(`${base}/#/v/all`);
  await page.waitForSelector(".task[data-id]");
  await check("no clock, no strip", (await strip()) === "");

  // The menu's Clock in: the strip, the row's badge, a toast offering Adjust.
  await longPress("Learn to juggle");
  await tap("#sheet [data-do=clockin]");
  await waitFor(() => /Learn to juggle/.test(document.querySelector("#clock .clock-task").textContent)
    && !document.getElementById("clock").hidden, "clocked in: the strip shows it");
  await waitFor(() => [...document.querySelectorAll(".task[data-id]")].some(r => /juggle/.test(r.textContent)
    && r.querySelector(".clock-badge")), "its row says so");
  await expect("the toast offers Adjust", s => /^Clocked in at \d\d:\d\d/.test(s.toast));
  await check("...a button of its own", (await page.$eval("#toast .toast-act", b => b.textContent)) === "Adjust");
  await check("just started, whatever the browser's zone", /^0:00/.test(await page.$eval("#clock .clock-time", e => e.textContent))
    && !(await page.$("#clock.stale")));
  await tap("#toast .toast-act");
  await sheetOpen();
  await tap("#sheet [data-ct='-15m']");
  await waitFor(() => /0:15/.test(document.querySelector("#clock .clock-time").textContent), "Adjust: started 15 minutes ago");

  // A toast without a step: a tap on it dismisses it.
  await page.evaluate(() => toast("Just saying"));
  await page.click("#toast");
  await check("a tap dismisses a toast", await page.$eval("#toast", t => t.hidden));

  // The strip opens the task: its Clocked section, running.
  await tap("#clock");
  await expect("the strip opens its task", s => s.heading.includes("Learn to juggle") && /Clocked[\s\S]*running \d+:\d\d/i.test(s.main));
  await check("the task page offers Clock out", !!(await page.$("#detail [data-do=clockout]")));

  // Clock out there: now, the clock listed, the strip gone.
  await tap("#detail [data-do=clockout]");
  await expect("Clock out on the task page", s => /Clocked out at \d\d:\d\d · 0:1[56]/.test(s.toast));
  await waitFor(() => document.getElementById("clock").hidden && document.querySelector("#detail [data-do=clockin]")
    && document.querySelector("#detail .clock-entry"), "the strip goes, the clock is listed, Clock in again");

  // A clock changed: yesterday, 9:00 to 10:30.
  await tap("#detail .clock-entry");
  await sheetOpen();
  await setValue("#ce-s-d", yesterday);
  await setValue("#ce-s-t", "09:00");
  await setValue("#ce-e-d", yesterday);
  await setValue("#ce-e-t", "10:30");
  await check("the sheet says how long", (await page.$eval("#sheet .clock-length", e => e.textContent)) === "1:30");
  await tap("#sheet [data-a=save]");
  await expect("saved: its new times", s => s.toast === "Saved" && /Clocked\s*1:30/i.test(s.main) && /09:00–10:30/.test(s.main));
  // Deleted, after asking: d, then y.
  await tap("#detail .clock-entry");
  await sheetOpen();
  await page.keyboard.press("d");
  await page.waitForSelector("#sheet [data-a=yes]");
  await page.keyboard.press("y");
  await expect("deleted: none left, Clock in among the adders", s => s.toast === "Clock deleted"
    && !/Clocked/i.test(s.main) && /\+ Note\s*⏱ Clock in/.test(s.main));

  // The keys: i on the cursor's task, O asks (Enter: now), l lists, o with none.
  await go("#/v/all");
  await page.waitForSelector(".task[data-id]");
  await cursorTo("Call dentist");
  await page.keyboard.press("i");
  await waitFor(() => /Call dentist/.test(document.querySelector("#clock .clock-task").textContent), "i: clocked in");
  await page.keyboard.press("O");
  await sheetOpen();
  await check("O: Now first", await page.evaluate(() => document.activeElement?.dataset.ct === ""));
  await page.keyboard.press("Enter");
  await waitFor(() => document.getElementById("clock").hidden && /Clocked out/.test(document.getElementById("toast").textContent),
                "Enter: out now");
  await page.keyboard.press("l");
  await sheetOpen();
  await check("l: its clocks", (await page.$$("#sheet [data-n]")).length === 1);
  await page.keyboard.press("Escape");
  await sheetGone();
  await page.keyboard.press("o");
  await expect("o with nothing running says so", s => s.toast === "No clock running");
  await page.keyboard.press("I");
  await sheetOpen();
  await page.keyboard.press("Escape");
  await sheetGone();
  await check("o doesn't open the row any more", (await page.evaluate(() => location.hash)) === "#/v/all");
  await check("Call dentist has its clock", (await t.taskOf(await idOf("Call dentist"))).clocks.length === 1);
});
