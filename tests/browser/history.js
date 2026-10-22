// A task's history: notes and the rest of the log, the LOGBOOK left out, a
// note changed by a tap and deleted from the keys (Z, d, y); the clock's
// later choices; the menu's clock row.
import {run, base} from "./lib.js";

await run(async t => {
  const {page, state, expect, check, focusedIs, idOf, tap, go, longPress, sheetOpen, sheetGone, post, waitFor} = t;
  await page.goto(`${base}/#/v/all`);
  await page.waitForSelector(".task[data-id]");
  const id = await idOf("Call dentist");
  await post("/api/act", {ids: [id], verb: "done", args: [], note: "Booked"});
  await post("/api/act", {ids: [id], verb: "next", args: []});
  await post("/api/act", {ids: [id], verb: "note", args: [], note: "Bring the card"});
  await go(`#/t/${id}`);
  await expect("History: the notes and the state change, the LOGBOOK not drawn", s =>
    /history[\s\S]*Bring the card[\s\S]*NEXT\s*from DONE[\s\S]*Booked/i.test(s.main) && !/LOGBOOK/.test(s.main));
  await check("a state change without a note is a quiet line", (await page.$$("#detail .note.quiet")).length === 1);

  // Tapped: its text, changed.
  await tap("#detail .note[data-n='1']");
  await sheetOpen();
  await check("the note's text to change", (await page.$eval("#ne-text", e => e.value)) === "Bring the card");
  await page.$eval("#ne-text", e => e.value = "Bring the card and the form");
  await tap("#sheet [data-a=save]");
  await expect("saved", s => s.toast === "Saved" && /Bring the card and the form/.test(s.main));

  // From the keys: Z lists them, Enter opens one in its text, the caret at
  // the end; Esc leaves the text, a second Esc closes it untouched, unasked.
  const atEnd = () => page.evaluate(() => { const a = document.activeElement;
    return a?.id && a.selectionStart === a.value.length && a.value.length > 0 ? a.id : null; });
  await page.keyboard.press("Z");
  await sheetOpen();
  await check("Z: its history", (await page.$$("#sheet [data-n]")).length === 3);
  await page.keyboard.press("Enter");
  await page.waitForSelector("#ne-text");
  await check("in its text, the caret at the end", (await atEnd()) === "ne-text");
  await page.keyboard.press("Escape");
  await check("Esc: out of the text, the sheet still open", !(await focusedIs("textarea")) && (await state()).sheet);
  await page.keyboard.press("Escape");
  await expect("Esc again: closed, nothing asked", s => !s.sheet && !s.dialog);
  // r: the title, the caret at its end.
  await page.keyboard.press("r");
  await page.waitForSelector("#rn-title");
  await check("r: the caret at the title's end", (await atEnd()) === "rn-title");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await sheetGone();
  // Then into a note again, and out by its keys: d, then y.
  await page.keyboard.press("Z");
  await sheetOpen();
  await page.keyboard.press("Enter");
  await page.waitForSelector("#ne-text");
  await page.keyboard.press("Escape");
  await page.keyboard.press("d");
  await page.waitForSelector("#sheet [data-a=yes]");
  await page.keyboard.press("y");
  await expect("d, y: deleted", s => s.toast === "Deleted" && !/the form/.test(s.main));
  await check("two left", (await page.$$("#detail .note")).length === 2);

  // Every way to write a note has the text tools: + Note, z, the note a state asks for.
  await tap("#detail [data-f=note]");
  await check("+ Note: the text tools", !!(await page.$("#detail [data-unit=note] .org-tools [data-tool]")));
  await tap("#detail [data-unit=note] [data-f=cancel]");
  await page.keyboard.press("z");
  await sheetOpen();
  await check("z: the text tools", !!(await page.$("#sheet .org-tools [data-tool]")));
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await sheetGone();
  await tap("#detail [data-do=state][data-kw=DONE]");
  await page.waitForSelector("#sheet #note");
  await check("closing it: the text tools", !!(await page.$("#sheet .org-tools [data-tool]")));
  await page.$eval("#note", e => e.blur());
  await page.keyboard.press("Escape");
  await sheetGone();

  // Clocking out may end later than now; clocking in can't start later.
  await post("/api/clock", {op: "in", id});
  await page.keyboard.press("g");
  // ↻ redraws the page: its task is the keys' again once that's done.
  await page.waitForFunction(() => !document.getElementById("clock").hidden && currentTask);
  await page.keyboard.press("I");
  await sheetOpen();
  await check("I: nothing later than now", !(await page.$("#sheet [data-ct^='+']")));
  await page.keyboard.press("Escape");
  await sheetGone();
  await page.keyboard.press("O");
  await sheetOpen();
  await tap("#sheet [data-ct='+15m']");
  await expect("O, +15m: out fifteen minutes on", s => /Clocked out at \d\d:\d\d · 0:15/.test(s.toast));

  // The menu: Clock in on a row of its own.
  await go("#/v/all");
  await page.waitForSelector(".task[data-id]");
  await longPress("Pay rent");
  await waitFor(() => document.querySelector("#sheet .menu-clock [data-do=clockin]"), "the menu's clock row");
});
