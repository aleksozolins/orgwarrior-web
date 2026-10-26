// Counts on tabs, and notifications set up from the page and the capture
// page (test_browser.py then has the server notice what was sent and done).
import {run, base} from "./lib.js";

await run(async t => {
  const {page, fail, expect, check, tap, typeInto, poll, post, sheetOpen, sheetGone} = t;
  const ntfy = Deno.env.get("NTFY"), signed = Deno.env.get("SIGNED"), addKey = Deno.env.get("ADD_KEY");
  const messages = () => fetch(ntfy).then(r => r.json());
  const ids = q => page.evaluate(q => fetch(`/api/view?q=${q}`).then(r => r.json())
    .then(rows => new Set(rows.filter(r => r.id).map(r => r.id)).size), q);
  const countOf = label => page.$$eval("#tabs a", (as, l) => as.find(a => a.textContent === l)?.dataset.count ?? null, label);

  // [web] counts: the all tab shows how many tasks it lists; the others none.
  await page.goto(`${base}/#/v/today`);
  await page.waitForSelector("#tabs a[data-counted]");
  const all = await ids("all");
  await poll(`the all tab counts its tasks (${all})`, async () => await countOf("all") === String(all));
  await check("...and only that one", (await page.$$eval("#tabs a[data-count]", as => as.length)) === 1);
  await check("...its label still its label", await page.$eval("#tabs a[data-counted]", a => a.textContent) === "all");
  // With key hints showing, the count and the tab's key side by side, in that order.
  await page.evaluate(() => document.body.dataset.hints = "always");
  const drawn = await page.$eval("#tabs a[data-counted]", a => {
    const b = getComputedStyle(a, "::before"), h = getComputedStyle(a, "::after");
    return [b.content, h.content, Number(b.order) < Number(h.order)];
  });
  await check(`the count and the key hint both show (${drawn})`,
    drawn[0] === `"${all}"` && /^"\d"$/.test(drawn[1]) && drawn[2]);
  await page.evaluate(() => document.body.dataset.hints = "typing");
  // One done: the count follows, at the next draw.
  // One that doesn't repeat: done, it leaves the view.
  const first = await page.evaluate(async () => {
    for (const r of (await fetch("/api/view?q=all").then(r => r.json())).filter(r => r.id)) {
      const task = await fetch(`/api/task/${r.id}`).then(r => r.json());
      if (![task.scheduled, task.deadline].some(d => /[.+]\+?\d/.test(d ?? ""))) return r.id;
    }
  });
  await post(`${base}/api/act`, {ids: [first], verb: "done"});
  await tap("#reload");
  await poll("done, the count goes down", async () => await countOf("all") === String(all - 1));

  // A saved tab counts once asked, from its sheet.
  await post(`${base}/api/tabs`, {op: "add", label: "phone", query: "+@phone"});
  await page.reload();
  await page.waitForSelector("#tabs a.saved");
  await page.$eval("#tabs a.saved", a => a.dispatchEvent(new MouseEvent("contextmenu", {bubbles: true, cancelable: true})));
  await sheetOpen();
  await tap("#sheet [data-a=count]");
  const phone = await ids("%2B%40phone");
  await check("the fixtures have @phone tasks", phone > 0);
  await poll("a saved tab's count, switched on", async () => await countOf("phone") === String(phone));
  // Esc leaves the label's field first, then closes.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await sheetGone();

  // Notifications, the owner's: a topic tested before it's kept.
  await tap("#gear");
  await page.waitForSelector("#notify:not([hidden])");
  await check("Allow (an iPhone's badge) isn't offered outside its home-screen app",
    await page.$eval("#notify [data-a=badge]", b => b.hidden));
  await check("Preferences: notifications off", (await page.$eval("#notify [data-a=notify]", b => b.textContent)).startsWith("Off"));
  await tap("#notify [data-a=notify]");
  await page.waitForSelector("#ntfy-topic");
  await tap("#sheet [data-a=new]");
  await check("New topic: a long random name (ntfy.sh's)",
    /^ow-[a-z0-9]{20}$/.test(await page.$eval("#ntfy-topic", i => i.value)));
  await check("the fields say what they take", (await page.$$eval("#sheet label", ls => ls.map(l => l.textContent).join("|")))
    .includes("its name on ntfy.sh, or its whole address"));
  await typeInto("#ntfy-topic", `${ntfy}/broken`, true);
  await tap("#sheet [data-a=save]");
  await expect("a topic that refuses: said, and back to the sheet", s => /refused it: forbidden/.test(s.toast) && s.sheet);
  await check("...what was typed kept", await page.$eval("#ntfy-topic", i => i.value) === `${ntfy}/broken`);
  await typeInto("#ntfy-topic", `${ntfy}/owner`, true);
  await tap("#sheet [data-a=save]");
  await expect("saved: a test message on its way", s => /test message/.test(s.toast));
  await poll("...and it came", async () => (await messages()).some(m => m.topic === "owner" && /sends you a task/.test(m.message)));
  await poll("Preferences say it's on", async () =>
    (await page.$eval("#notify [data-a=notify]", b => b.textContent)).includes("/owner"));
  await page.keyboard.press("Escape");
  await sheetGone();

  // A sender's, from the capture page, then something sent.
  await page.goto(`${signed}/?key=${addKey}`);
  await page.waitForSelector("#kind");
  await tap("#gear");
  await page.waitForSelector("#notify:not([hidden])");
  await tap("#notify [data-a=notify]");
  await page.waitForSelector("#ntfy-topic");
  await check("the capture page's wording: what the owner does",
    (await page.$eval("#sheet .hint", h => h.textContent)).includes("when Sam marks what you sent done"));
  await typeInto("#ntfy-topic", `${ntfy}/robin`, true);
  await tap("#sheet [data-a=save]");
  await poll("robin's test message came", async () => (await messages()).some(m => m.topic === "robin"));
  await page.keyboard.press("Escape");
  await sheetGone();
  await typeInto("#title", "Return library books");
  await tap("[data-a=add]");
  await expect("sent", s => s.main.includes("Sent to Sam: Return library books"));
  // Nothing is sent as it's added: the server notices on its own.
  if ((await messages()).some(m => m.title === "Return library books")) fail("a message before the watcher looked");
});
