// Repeaters and warnings in words: the date sheet's choices write org's
// cookies (+, ++, .+; -3d), a stamp opens with them chosen, the line says
// what org will write, and what they can't say (a habit's) stays in Other.
import {run, base} from "./lib.js";

await run(async t => {
  const {page, check, idOf, tap, go, setValue, sheetOpen, sheetGone, post, waitFor} = t;
  await page.goto(`${base}/#/v/all`);
  await page.waitForSelector(".task[data-id]");
  const id = await idOf("Learn to juggle");
  await go(`#/t/${id}`);
  await page.waitForSelector("#detail .heading");
  const raw = () => page.$eval("#p-r", i => i.value);
  const writes = () => page.$eval("#sheet .org-writes", e => e.textContent);

  // Scheduled: every 1 week, next one ahead, hidden 2 days.
  await tap("#detail [data-do=sched]");
  await sheetOpen();
  await check("Repeat starts at None, the choices hidden", await page.$eval("#sheet .rep-every", e => e.hidden));
  await setValue("#p-d", "2030-03-03");
  await tap("#sheet [data-rep=every]");
  await check("Every: on schedule, a week", (await raw()) === "+1w");
  await tap('#sheet [data-rk="++"]');
  await check("Next one ahead: ++1w, and what it does", (await raw()) === "++1w"
    && /Skips missed ones/.test(await page.$eval("#sheet .rep-says", e => e.textContent)));
  await setValue("#p-wn", "2");
  await check("Hide until 2 days after: -2d", (await raw()) === "++1w -2d");
  await check("the line: what org will write", (await writes()) === "Org writes <2030-03-03 Sun ++1w -2d>");
  await tap("#sheet [data-a=set]");
  await waitFor(() => /2030-03-03 Sun \+\+1w -2d/.test(document.querySelector("#detail [data-do=sched]")?.textContent ?? ""),
                "saved as org writes it");

  // Opened again: the choices as the stamp says.
  await page.waitForFunction(() => currentTask?.scheduled?.includes("++1w"));
  await tap("#detail [data-do=sched]");
  await sheetOpen();
  await check("opened on it: Every, Next one ahead, 2", !(await page.$eval("#sheet .rep-every", e => e.hidden))
    && await page.$eval('#sheet [data-rk="++"]', b => b.getAttribute("aria-pressed") === "true")
    && (await page.$eval("#p-wn", i => i.value)) === "2");
  // After it's done, every 3 days; None takes it off.
  await tap('#sheet [data-rk=".+"]');
  await setValue("#p-rn", "3");
  await page.select("#p-ru", "d");
  await check("After it's done, every 3 days: .+3d", (await raw()) === ".+3d -2d");
  await tap("#sheet [data-rep=none]");
  await check("None: the repeater gone, the delay kept", (await raw()) === "-2d");
  await tap("#sheet [data-a=cancel]");
  await page.waitForSelector("#discard[open]");
  await tap("#discard button[value=discard]");
  await sheetGone();

  // A deadline: Show ahead, org's default said with the day it lands on; − and + step it; 0 the day itself.
  const says = () => page.$eval("#sheet .warn-says", e => e.textContent);
  await tap("#detail [data-do=due]");
  await sheetOpen();
  await setValue("#p-d", "2030-03-20");
  await check("Show ahead, empty: the default, its day", /^Show ahead/.test(await page.$eval("#sheet .warn-row", e => e.textContent.trim()))
    && /^In your agenda from \S.*, 14 days before it's due \(your default\)\.$/.test(await says()));
  await tap('#sheet [data-step="-1"][data-for=p-wn]');
  await check("−: one fewer than the default", (await page.$eval("#p-wn", i => i.value)) === "13" && (await raw()) === "-13d");
  await setValue("#p-wn", "0");
  await check("0: only on the day (-0d)", (await raw()) === "-0d" && /only on the day/.test(await says()));
  await tap('#sheet [data-step="1"][data-for=p-wn]');
  await tap('#sheet [data-step="1"][data-for=p-wn]');
  await check("+ +: 2 days, its day named", (await raw()) === "-2d" && /from \S.*, 2 days before/.test(await says()));
  await tap("#sheet [data-rep=every]");
  await tap('#sheet [data-step="1"][data-for=p-rn]');
  await check("Every, +: every 2 weeks, the unit plural", (await raw()) === "+2w -2d"
    && (await page.$eval("#p-ru", s => s.selectedOptions[0].textContent)) === "weeks");
  await tap("#sheet [data-a=cancel]");
  await page.waitForSelector("#discard[open]");
  await tap("#discard button[value=discard]");
  await sheetGone();

  // What the choices can't say (a habit's .+2d/4d): in Other, the choices set aside.
  await post("/api/act", {ids: [id], verb: "sched", args: ["<2030-03-03 Sun .+2d/4d>"]});
  await page.keyboard.press("g");
  await page.waitForFunction(() => currentTask?.scheduled?.includes(".+2d/4d"));
  await tap("#detail [data-do=sched]");
  await sheetOpen();
  await check("a habit's repeater: Other open, the choices set aside", await page.$eval("#sheet details.other", d => d.open)
    && await page.$eval("#sheet .cookies", c => c.classList.contains("custom")) && (await raw()) === ".+2d/4d");
  await tap("#sheet [data-a=set]");
  await waitFor(() => /\.\+2d\/4d/.test(document.querySelector("#detail [data-do=sched]")?.textContent ?? ""), "kept as it was");
});
