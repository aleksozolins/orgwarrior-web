// Shared by the browser tests, one file per section (tests/browser/*.js):
// Chrome, the page and the checks.  test_browser.py runs each section on its
// own throwaway daemon with fresh fixtures, so a section starts from the
// files as they are, not from what another left.  BASE is the open server,
// BROWSER where scripts/get-browser put Chrome.  Exits non-zero on a failure.
import puppeteer from "npm:puppeteer-core@24.10.0";

export const base = Deno.env.get("BASE");
export const PHONE = {width: 400, height: 800, isMobile: true, hasTouch: true};
export const WIDE = {width: 1280, height: 800};

// Run BODY with the helpers, on a page at VIEWPORT.  A check that throws (a
// selector never found) still closes Chrome on the way out.
export async function run(body, viewport = PHONE) {
  const dir = Deno.env.get("BROWSER");
  const browser = await puppeteer.launch({
    executablePath: `${dir}/chrome-headless-shell-linux64/chrome-headless-shell`,
    env: {...Deno.env.toObject(), LD_LIBRARY_PATH: `${dir}/lib`},
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const t = helpers(page);
  try {
    await body(t);
    if (errors.length) t.fail("page errors:", errors);
  } catch (e) {
    t.fail(e.message);
  } finally {
    await browser.close();
  }
  Deno.exit(t.failures() ? 1 : 0);
}

function helpers(page) {
  let failed = 0;
  const fail = (...what) => { failed++; console.log("FAIL", ...what); };
  const state = () => page.evaluate(() => ({
    hash: location.hash,
    q: document.getElementById("q").value,
    sheet: !document.getElementById("sheet").hidden,
    dialog: document.getElementById("discard").open,
    heading: document.querySelector("#detail .heading")?.textContent ?? "",
    // The task page's state: its pressed keyword.
    kw: document.querySelector("#detail [data-do=state][aria-pressed=true]")?.dataset.kw ?? "",
    toast: document.getElementById("toast").hidden ? "" : document.getElementById("toast").textContent,
    // What's shown: a hidden pane's text doesn't count.
    main: document.getElementById("main").innerText,
  }));
  // Polls until PRED holds for the page's state, or gives up after 3 s.
  async function expect(name, pred) {
    let s;
    for (const end = Date.now() + 3000; Date.now() < end;) {
      s = await state();
      if (pred(s)) return console.log("ok  ", name), s;
      await new Promise(r => setTimeout(r, 50));
    }
    fail(name, JSON.stringify({...s, main: s.main.slice(0, 120)}));
    return s;
  }
  // A plain check; a failure says where focus is and what the toast says.
  const check = async (what, ok) => {
    if (ok) return console.log("ok  ", what);
    fail(what, await page.evaluate(() => (document.activeElement?.outerHTML.slice(0, 100) ?? "none")
      + " | " + document.getElementById("toast").textContent));
  };
  const focusedIs = sel => page.evaluate(s => !!document.activeElement?.matches(s), sel);
  const idOf = text => page.$$eval(".task[data-id]", (rs, t) => rs.find(r => r.textContent.includes(t))?.dataset.id, text);
  return {
    page, base, fail, failures: () => failed, state, expect, check, focusedIs, idOf,
    // Scrolled to the middle first, as a person would: at the bottom edge the
    // floating + covers a right-hand button.
    tap: async sel => {
      // Hints kept through the last press go a moment later, shifting chips:
      // aim after they're gone, as a person sees the page settle.
      await page.waitForFunction(() => !document.body.classList.contains("hints-linger"));
      await page.waitForSelector(sel, {visible: true});
      await page.$eval(sel, e => e.scrollIntoView({block: "center"}));
      // A toast over it takes the tap (it dismisses): tapped away first, as a person would.
      if (await page.$eval(sel, e => {
        const t = document.getElementById("toast"), r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        return !t.hidden && !t.contains(e) && document.elementFromPoint(x, y)?.closest("#toast") !== null;
      })) await page.click("#toast .toast-msg");
      await page.click(sel);
    },
    go: hash => page.evaluate(h => location.hash = h, hash),
    back: () => page.evaluate(() => history.back()),
    typeInto: async (sel, text, clear = false) => {
      await page.waitForSelector(sel, {visible: true});
      if (clear) await page.$eval(sel, e => e.value = "");
      await page.type(sel, text);
    },
    // A field's value as a picker would set it.
    setValue: (sel, v) => page.$eval(sel, (i, v) => {
      i.value = v;
      i.dispatchEvent(new Event("input", {bubbles: true}));
    }, v),
    longPress: async text => {
      const id = await idOf(text);
      await page.$eval(`.task[data-id="${id}"]`, r => r.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true})));
      await expect("long press opens the menu", s => s.sheet);
    },
    // KEY with MODS held: "Control", or ["Alt", "Shift"].
    chord: async (mods, key) => {
      mods = [mods].flat();
      for (const m of mods) await page.keyboard.down(m);
      await page.keyboard.press(key);
      for (const m of mods.toReversed()) await page.keyboard.up(m);
    },
    shiftTab: async () => { await page.keyboard.down("Shift"); await page.keyboard.press("Tab"); await page.keyboard.up("Shift"); },
    waitFor: (fn, what, arg) => page.waitForFunction(fn, {timeout: 5000}, arg).then(() => check(what, true), () => check(what, false)),
    // Polls PRED (here, not in the page: it may fetch) for 5 s, then checks it.
    poll: async (what, pred) => {
      for (const end = Date.now() + 5000; Date.now() < end; await new Promise(r => setTimeout(r, 100)))
        if (await pred()) return check(what, true);
      await check(what, false);
    },
    // The row with TEXT clicked; again if a redraw replaced it under the click
    // ("Node is detached": a list refreshed in place just then).
    clickRow: async (text, opts = {}) => {
      for (let i = 0; ; i++) {
        try {
          return await page.click(`#list .task[data-id="${await idOf(text)}"]`, opts);
        } catch (e) {
          if (i > 4 || !/detached/.test(e.message)) throw e;
          await new Promise(r => setTimeout(r, 100));
        }
      }
    },
    post: (url, body) => page.evaluate((u, b) => fetch(u, {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify(b)}).then(r => r.json()), url, body),
    cursorId: () => page.$eval("#list .task.cursor", r => r.dataset.id).catch(() => null),
    // j or k until the cursor is on the row with TEXT, whichever way it is.
    cursorTo: async text => {
      for (let i = 0; i < 60; i++) {
        const [at, want] = await page.$$eval("#list .task[data-id]", (rs, t) =>
          [rs.findIndex(r => r.classList.contains("cursor")), rs.findIndex(r => r.textContent.includes(t))], text);
        if (want < 0) break;
        if (at === want) return;
        await page.keyboard.press(at < want ? "j" : "k");
      }
      await check(`the cursor reaches ${text}`, false);
    },
    taskOf: id => page.evaluate(i => fetch(`/api/task/${i}`).then(r => r.json()), id),
    sheetOpen: () => page.waitForSelector("#sheet:not([hidden])"),
    sheetGone: () => page.waitForFunction(() => document.getElementById("sheet").hidden),
  };
}
