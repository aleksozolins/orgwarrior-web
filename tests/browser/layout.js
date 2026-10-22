// Layout: desktop and phone, the instant Back, two panes side by side,
// selecting beside a task, the header on a phone, a stale page reloading.
import {run, base, PHONE, WIDE} from "./lib.js";

await run(async t => {
  const {page, fail, expect, idOf, tap, go, back} = t;
  await page.goto(`${base}/#/v/all`);
  await page.waitForSelector(".task[data-id]");
  // On a desktop: a right-click is the long press, Escape is Back for a sheet,
  // / goes to the query box, and the page is a centered column.
  await page.click(`.task[data-id="${await idOf("juggle")}"]`, {button: "right"});
  await expect("right-click opens the menu", s => s.sheet);
  await page.keyboard.press("Escape");
  await expect("Escape closes it", s => !s.sheet && s.hash === "#/v/all");
  await page.keyboard.press("/");
  if (!(await page.evaluate(() => document.activeElement.id === "q"))) fail("/ didn't focus the box");
  // Under 1000 px (a phone on its side, a narrow window): one centered column.
  await page.setViewport({width: 900, height: 800});
  const width = await page.$eval("main", m => m.getBoundingClientRect().width);
  if (width > 720) fail("main is", width, "wide at 900");

  // On a phone, Back to the list is instant: the same list, where it was
  // scrolled to, no "Loading…".
  await page.setViewport({width: 400, height: 300, isMobile: true, hasTouch: true});
  await go("#/v/all");
  await page.waitForSelector(".task[data-id]");
  await page.evaluate(() => window.scrollTo(0, 200));
  const y = await page.evaluate(() => window.scrollY);
  await page.$eval(`#list .task[data-id="${await idOf("Package from mom")}"]`, r => r.click());
  await expect("phone: a row opens its task", s => s.hash.startsWith("#/t/") && s.heading);
  await page.evaluate(() => {
    window.sawLoading = false;
    new MutationObserver(() => window.sawLoading ||= /Loading/.test(document.getElementById("list").textContent))
      .observe(document.getElementById("list"), {childList: true, subtree: true});
  });
  await back();
  await expect("phone: Back shows the list", s => s.hash === "#/v/all" && s.main.includes("juggle"));
  if (await page.evaluate(() => window.sawLoading)) fail("Back showed Loading…");
  const y2 = await page.evaluate(() => window.scrollY);
  if (y2 !== y || y === 0) fail("scrolled to", y2, "not", y);

  // From 1000 px: the list and the task side by side.
  await page.setViewport(WIDE);
  await go("#/v/all");
  await page.waitForSelector("#list .task[data-id]");
  if (await page.$("#detail .back")) fail("a task pane on a view");
  const juggle = await idOf("juggle"), mom = await idOf("Package from mom");
  await page.click(`#list .task[data-id="${juggle}"]`);
  await expect("wide: a row opens beside the list", s => s.heading.includes("juggle") && s.main.includes("Pay rent"));
  // No corner +: + New, by the box.
  if (await page.$eval("#add", b => b.offsetParent !== null)) fail("wide: the corner + shows");
  await tap("#new");
  await expect("+ New beside a task offers it", s => s.hash.includes("offer=1") && /Under .*juggle/i.test(s.main));
  await page.goBack();
  await expect("back to the task", s => s.heading.includes("juggle") && !s.dialog);
  if (await page.$("#detail details.fold"))
    fail("wide: the task page has no folds, its fields open sheets");
  if (!(await page.$eval(`#list .task[data-id="${juggle}"]`, r => r.classList.contains("current"))))
    fail("the open task's row isn't marked");
  // Another row replaces it: Back closes the pane rather than going through each.
  await page.click(`#list .task[data-id="${mom}"]`);
  await expect("wide: another row replaces it", s => s.heading.includes("Package from mom"));
  const closedAt = await page.evaluate(() => loadedAt);
  await page.keyboard.press("Escape");
  await expect("wide: Esc closes the task in place, the list stays", s => s.hash === "#/v/all" && !s.heading && s.main.includes("juggle"));
  await page.waitForFunction(t => loadedAt !== t, {}, closedAt);  // its refresh underneath done: the rows redrawn
  // An action in the task pane shows in the list.
  await page.click(`#list .task[data-id="${juggle}"]`);
  await expect("wide: open again", s => s.heading.includes("juggle"));
  // Side by side the state is one chip before the title, the row hidden: it opens the sheet.
  if (await page.$eval("#detail .task-fields .states", e => e.offsetParent !== null)) fail("wide: the full state row shows");
  await tap("#detail .state-chip");
  await tap("#sheet [data-kw=NEXT]");
  await expect("wide: the list follows an action", s => s.kw === "NEXT"
    && /NEXT\s+Learn to juggle/.test(s.main.split("Learn to juggle")[0].slice(-40) + "Learn to juggle"));
  // Opened straight on a task, the list beside it is the default view.
  await page.goto("about:blank");  // a fresh load: to the same page, goto only changes the hash
  await page.goto(`${base}/#/t/${juggle}`);
  await expect("wide: a task link brings a list", s => s.heading.includes("juggle") && s.main.includes("Day-agenda"));
  // Selecting with a task open: the selection takes the task's pane, its
  // actions go to the selected tasks only, and Escape gives the task back.
  await page.click(`#list .task[data-id="${mom}"]`, {button: "right"});
  await tap("#sheet [data-do=select]");
  await page.click(`#list .task[data-id="${await idOf("Pay rent")}"]`);
  await expect("wide: selecting shows in the task's pane", s => !s.sheet && s.main.includes("2 marked"));
  const [bar, pane] = await page.evaluate(() => ["#selectbar", "#detail"].map(sel => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.width)];
  }));
  if (bar[0] !== pane[0] || bar[1] !== pane[1]) fail("the selection isn't over the task's pane", bar, pane);
  if (!(await page.$eval("#selectbar .names", e => e.textContent.includes("Package from mom"))))
    fail("the selection doesn't name its tasks");
  await page.keyboard.press("Escape");
  await expect("wide: Escape ends it, the task is back", s => !s.main.includes("marked") && s.heading.includes("juggle"));
  await page.click(`#list .task[data-id="${mom}"]`, {button: "right"});
  await tap("#sheet [data-do=select]");
  await tap("#selectbar [data-do=states]");
  await tap("#sheet [data-kw=TODO]");
  await expect("wide: a state from the selection", s => !s.sheet && !s.main.includes("marked")
    && /TODO\s+Package from mom/.test(s.main));
  await expect("wide: ...and not on the open task", s => s.heading.includes("Learn to juggle") && s.kw === "NEXT");

  // Narrowed, the task alone; widened again, both.
  await page.setViewport({width: 600, height: 800});
  await expect("narrowed: the task alone", s => s.heading.includes("juggle") && !s.main.includes("Day-agenda"));
  await page.setViewport(WIDE);
  await expect("widened: both again", s => s.main.includes("Day-agenda"));
  await page.setViewport(PHONE);

  // Kill's confirmation: Cancel kills nothing.
  await go("#/v/all");
  await page.waitForSelector(".task[data-id]");
  await go(`#/t/${await idOf("juggle")}`);
  await tap("[data-do=kill]");
  await tap("#sheet [data-a=cancel]");
  await expect("kill, Cancel: closed, task still there", s => !s.sheet && !s.dialog && s.heading.includes("juggle"));

  // The date between ‹ and ›: tapped, a picker, and the day chosen opens.
  await go("#/v/today");
  await page.waitForSelector(".day.stepper .pick");
  await page.click(".day.stepper .pick");
  await page.$eval(".day.stepper .pick input", i => {
    i.value = "2030-01-15";
    i.dispatchEvent(new Event("change", {bubbles: true}));
  });
  await expect("tap the date: to the day picked", s => s.hash === "#/v/2030-01-15" && s.main.includes("15 January 2030"));

  // The header's brand beside five tabs on a 412 px phone (a Pixel 9a), with room to spare.
  await page.setViewport({width: 412, height: 800, isMobile: true, hasTouch: true});
  const spare = await page.evaluate(() => {
    const tabs = document.getElementById("tabs"), bar = document.querySelector(".topbar");
    tabs.insertAdjacentHTML("beforeend", ["inbox", "active"].map(t => `<a href="#">${t}</a>`).join(""));
    const cs = getComputedStyle(bar), brand = document.querySelector(".brand").getBoundingClientRect().width;
    const room = bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - brand - parseFloat(cs.columnGap);
    for (const a of [...tabs.children].slice(-2)) a.remove();
    return room - tabs.scrollWidth + 0;
  });
  if (spare < 10) fail("the header is too tight beside five tabs:", spare, "px");
  await page.setViewport(PHONE);

  // A page left open across an update reloads itself, but not mid-action.
  const loaded = await page.evaluate(() => loadedAt);
  await go("#/v/all");
  await page.waitForFunction(t => loadedAt > t, {}, loaded);  // the view's own load done first
  await page.evaluate(() => { window.marker = true; pageVersion = "old"; });
  await page.click(`.task[data-id="${await idOf("juggle")}"]`, {button: "right"});
  await expect("stale page: a sheet open", s => s.sheet);
  await page.evaluate(() => api("/api/tags"));
  if (!(await page.evaluate(() => window.marker))) fail("reloaded with a sheet open");
  await page.keyboard.press("Escape");
  await page.click("#reload");
  await page.waitForFunction(() => !window.marker && document.querySelector(".task[data-id]"));
  console.log("ok   stale page: reloads itself once nothing's open");

});
