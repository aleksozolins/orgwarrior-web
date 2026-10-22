// A file's view as a tree, side by side: TAB folds (Shift-TAB all), folds kept
// per device, moves landing in place (J K H L, org's Alt-arrows), TAB from an
// agenda showing a task in its file; a phone's ▸.
import {run, base, WIDE, PHONE} from "./lib.js";

await run(async t => {
  const {page, expect, check, focusedIs, idOf, go, chord, shiftTab, waitFor, cursorTo} = t;
  const shown = text => page.$$eval("#list .task[data-id]", (rs, t) => rs.some(r => r.textContent.includes(t)), text);
  const depthOf = text => page.$$eval("#list .task[data-id]", (rs, t) =>
    rs.find(r => r.textContent.includes(t))?.style.getPropertyValue("--d"), text);
  const fresh = async hash => {
    await page.goto("about:blank");
    await page.goto(`${base}/${hash}`);
    await page.waitForSelector("#list .task[data-id]");
  };
  await fresh("#/v/projects.org");
  await cursorTo("Orgwarrior");
  await check("a heading with children: ▸, its children folded", await page.$eval("#list .task.cursor [data-tw]", s => s.textContent === "▸")
    && !(await shown("Write the spec")));
  await page.keyboard.press("Tab");
  await waitFor(() => /Write the spec/.test(document.getElementById("list").textContent), "TAB: unfolded, indented under it");
  await check("one level in", await depthOf("Write the spec") === "1" && !(await focusedIs("#detail *")));
  await page.keyboard.press("Tab");
  await waitFor(() => !/Write the spec/.test(document.getElementById("list").textContent), "TAB again: folded");
  await shiftTab();
  await waitFor(() => /Pick a license/.test(document.getElementById("list").textContent), "Shift-TAB: everything, all the way down");
  await check("two levels in", await depthOf("Pick a license") === "2");
  await shiftTab();
  await waitFor(() => !/Write the spec/.test(document.getElementById("list").textContent), "Shift-TAB again: all folded");
  // Kept on this device: back on the file, as it was left.
  await cursorTo("Orgwarrior");
  await page.keyboard.press("Tab");
  await fresh("#/v/projects.org");
  await check("reloaded: still unfolded", await shown("Write the spec"));

  // Moves land in place: L into the heading above (it unfolds), H back out.
  await cursorTo("Scaffold the package");
  await page.keyboard.press("L");
  await waitFor(() => { const r = [...document.querySelectorAll("#list .task[data-id]")].find(r => /Scaffold the package/.test(r.textContent));
    return r?.style.getPropertyValue("--d") === "2" && r.classList.contains("cursor"); }, "L: in under Write the spec, in view, the cursor on it");
  await check("the moved row tinted a moment", await page.$$eval("#list .task.moved", rs => rs.some(r => /Scaffold/.test(r.textContent))));
  await page.keyboard.press("H");
  await waitFor(() => [...document.querySelectorAll("#list .task[data-id]")].find(r => /Scaffold the package/.test(r.textContent))
    ?.style.getPropertyValue("--d") === "1", "H: out again, one level up");
  await chord(["Alt", "Shift"], "ArrowRight");
  await waitFor(() => [...document.querySelectorAll("#list .task[data-id]")].find(r => /Scaffold the package/.test(r.textContent))
    ?.style.getPropertyValue("--d") === "2", "Alt-Shift-→: org's M-S-→, the same");
  await chord(["Alt", "Shift"], "ArrowLeft");
  await waitFor(() => [...document.querySelectorAll("#list .task[data-id]")].find(r => /Scaffold the package/.test(r.textContent))
    ?.style.getPropertyValue("--d") === "1", "Alt-Shift-←: back out");
  const order = () => page.$$eval("#list .task[data-id]", rs => rs.map(r => r.textContent));
  const before = (await order()).findIndex(x => x.includes("Scaffold"));
  await chord("Alt", "ArrowUp");
  await waitFor(i => [...document.querySelectorAll("#list .task[data-id]")].findIndex(r => /Scaffold/.test(r.textContent)) === i - 1,
    "Alt-↑: one up among its siblings", before);
  await page.keyboard.press("J");
  await waitFor(i => [...document.querySelectorAll("#list .task[data-id]")].findIndex(r => /Scaffold/.test(r.textContent)) === i,
    "J: back down", before);

  // From an agenda, TAB: the task in its file, unfolded down to it, shown beside; Esc, Esc: back.
  await shiftTab();
  await shiftTab();
  await page.waitForFunction(() => !/Write the spec/.test(document.getElementById("list").textContent));
  await go("#/v/all");
  await page.waitForSelector("#list .task[data-id]");
  await cursorTo("Pick a license");
  await page.keyboard.press("Escape");  // the preview closed: from the list alone
  await page.waitForFunction(() => document.body.dataset.page === "view");
  await cursorTo("Pick a license");
  await page.keyboard.press("Tab");
  await waitFor(() => location.hash.startsWith("#/t/") || location.hash === "#/v/projects.org", "TAB on an agenda row: to its file");
  await waitFor(() => /Pick a license/.test(document.querySelector("#list .task.cursor")?.textContent ?? "")
    && /Orgwarrior[\s\S]*Publish to PyPI[\s\S]*Pick a license/.test(document.getElementById("list").textContent),
    "unfolded down to it, the cursor on it");
  await waitFor(() => /Pick a license/.test(document.querySelector("#detail .heading")?.textContent ?? ""), "and shown beside");
  await page.keyboard.press("Escape");
  await waitFor(() => location.hash === "#/v/projects.org", "Esc: the task closed, the file still");
  await page.waitForFunction(() => document.body.dataset.page === "view");
  await page.keyboard.press("Escape");
  await expect("Esc again: back to the agenda, as it was (its task beside)", s => /Global list of TODO/.test(s.main) && !/\.org/.test(s.q));
  // Back past a TAB, as a person goes: a tab by its number, j a few rows (each
  // shown beside), TAB to the file, the same task beside it; [ is the tab's
  // list and that task again (same address: no hashchange), ] the file.
  await page.keyboard.press("2");
  await page.waitForFunction(() => document.querySelector("#tabs a.on")?.dataset.hint === "2" && document.querySelector("#list .task[data-id]"));
  const second = await page.$eval("#tabs a.on", a => a.dataset.query);
  for (const k of ["j", "j", "j"]) await page.keyboard.press(k);
  await page.waitForFunction(() => location.hash.startsWith("#/t/") && document.querySelector("#detail .heading"));
  await new Promise(r => setTimeout(r, 300));
  const task = await page.evaluate(() => location.hash);
  await page.keyboard.press("Tab");
  await page.waitForFunction(t => location.hash === t && /\.org$/.test(document.getElementById("q").value), {}, task);
  await check("no list-alone stop on the way: the hints pane never drawn", !(await page.$("#detail .start")));
  await page.keyboard.press("[");
  await waitFor(([t, q]) => location.hash === t && document.querySelector("#tabs a.on")?.dataset.query === q
    && !/\.org$/.test(document.getElementById("q").value), "[: the tab's list again, the same task beside", [task, second]);
  await page.keyboard.press("]");
  await waitFor(t => location.hash === t && /\.org$/.test(document.getElementById("q").value), "]: the file again", task);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.body.dataset.page === "view");
  await go("#/v/all");
  await page.waitForFunction(() => /Pick a license/.test(document.getElementById("list").textContent));
  // The mouse's TAB: the file in a task page's path.
  await shiftTab();
  await page.waitForFunction(() => [...document.querySelectorAll("#list .task[data-id]")].some(r => /Pick a license/.test(r.textContent)));
  await go(`#/t/${await idOf("Pick a license")}`);
  await page.waitForSelector("#detail .where a[data-reveal]");
  await page.click("#detail .where a[data-reveal]");
  await waitFor(() => location.hash === "#/v/projects.org"
    && /Pick a license/.test(document.querySelector("#list .task.cursor")?.textContent ?? ""),
    "the path's file: the task in its file, unfolded down to it, the cursor on it");

  // A phone: tap the ▸.
  await page.setViewport(PHONE);
  await fresh("#/v/projects.org");
  const orgw = await page.$$eval("#list .task[data-id]", rs => rs.find(r => /Orgwarrior/.test(r.textContent))?.dataset.id);
  const unfolded = await page.$eval(`#list .task[data-id="${orgw}"] [data-tw]`, s => s.textContent === "▾");
  await page.click(`#list .task[data-id="${orgw}"] [data-tw]`);
  await waitFor(open => /Write the spec/.test(document.getElementById("list").textContent) !== open, "a phone: tapping ▸ folds or unfolds", unfolded);
  await check("...without opening the row", (await page.url()).includes("#/v/projects.org"));
}, WIDE);
