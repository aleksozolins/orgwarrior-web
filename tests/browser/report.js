// A clock report: `clocked` as a view, its tree and totals, folds kept,
// stepping (b, .), a row opening its task, from the box.
import {run, base} from "./lib.js";

await run(async t => {
  const {page, expect, check, idOf, tap, go, post, waitFor} = t;
  await page.goto(`${base}/#/v/all`);
  await page.waitForSelector(".task[data-id]");
  const juggle = await idOf("Learn to juggle"), dentist = await idOf("Call dentist");
  await post("/api/act", {ids: [juggle], verb: "effort", args: ["0:30"]});
  await post("/api/clock", {op: "in", id: juggle, time: "-50m"});
  await post("/api/clock", {op: "in", id: dentist, time: "-10m"});
  await post("/api/clock", {op: "out"});

  await go("#/v/clocked");
  // Clocking in on the dentist stopped the juggling at the same time: 0:40 and 0:10.
  await expect("today: the files, the tree, the totals", s => /Clocked · [^\n]*\n0:50/.test(s.main)
    && /tasks\.org\s*0:50/.test(s.main) && /Learn to juggle\s*0:40 \/ 0:30/.test(s.main) && /Call dentist\s*0:10/.test(s.main));
  await check("past its effort, red", !!(await page.$("#list .report-time .over")));

  // Folded, and still folded on the next load.
  await tap("#list [data-rf='file:tasks.org']");
  await expect("a file folded", s => !/Learn to juggle/.test(s.main) && /tasks\.org/.test(s.main));
  await page.reload();
  await expect("still folded after a reload", s => /tasks\.org/.test(s.main) && !/Learn to juggle/.test(s.main));
  await tap("#list [data-rf='file:tasks.org']");
  await expect("unfolded", s => /Learn to juggle/.test(s.main));

  // b: the day before; . back to today.
  await page.keyboard.press("b");
  await expect("b: yesterday, nothing clocked", s => /^#\/v\/clocked%20\d{4}-\d\d-\d\d$/.test(s.hash) && /Nothing clocked/.test(s.main));
  await page.keyboard.press(".");
  await expect(".: today again", s => s.hash === "#/v/clocked%20today" && /Learn to juggle/.test(s.main));

  // R: under today's agenda, what was clocked; kept on a reload; R again, gone.
  await go("#/v/today");
  await page.waitForSelector("#list .task[data-id]");
  await page.keyboard.press("R");
  await waitFor(() => /Clocked\s*0:50/.test(document.querySelector("#list .clocked-head")?.textContent ?? "")
    && /Learn to juggle/.test(document.getElementById("list").textContent.split("Clocked").at(-1)), "R: what was clocked, under the day");
  await page.reload();
  await page.waitForSelector("#list .clocked-head");
  await check("still on after a reload", true);
  await page.keyboard.press("R");
  await waitFor(() => !document.querySelector("#list .clocked-head"), "R again: gone");
  await go("#/v/clocked");
  await page.waitForSelector(".report-file");

  // A row opens its task.
  await tap(`#list .task[data-id="${juggle}"]`);
  await expect("a row opens its task", s => s.heading.includes("Learn to juggle"));

  // From the box, a week.
  await go("#/v/all");
  await page.waitForSelector("#list .task[data-id]");
  await page.keyboard.press("/");
  await page.$eval("#q", q => q.value = "clocked week");
  await page.keyboard.press("Enter");
  await waitFor(() => location.hash === "#/v/clocked%20week" && /Clocked · week/.test(document.getElementById("list").textContent),
                "the box: clocked week, a view");
});
