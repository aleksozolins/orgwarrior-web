// scripts/screenshots' browser half: the page on a desktop and a phone, and
// the command line's captures (CLI/*.ansi) drawn as a terminal window.  BASE
// is the demo server, BROWSER scripts/get-browser's Chrome; WEB_OUT and
// CLI_OUT where the PNGs go.
import puppeteer from "npm:puppeteer-core@24.10.0";
import {encodeBase64} from "jsr:@std/encoding@1.0.10/base64";

const env = name => Deno.env.get(name);
const [base, dir, cliDir, webOut, cliOut] = ["BASE", "BROWSER", "CLI", "WEB_OUT", "CLI_OUT"].map(env);
const browser = await puppeteer.launch({
  executablePath: `${dir}/chrome-headless-shell-linux64/chrome-headless-shell`,
  env: {...Deno.env.toObject(), LD_LIBRARY_PATH: `${dir}/lib`},
  args: ["--no-sandbox", "--font-render-hinting=none"],
});
const pause = ms => new Promise(r => setTimeout(r, ms));
const DESKTOP = {width: 1280, height: 800, deviceScaleFactor: 1.5};
const PHONE = {width: 412, height: 892, deviceScaleFactor: 2, isMobile: true, hasTouch: true};

// A fresh page as a device in light or dark (the page follows the device).
async function device(viewport, scheme) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.emulateMediaFeatures([{name: "prefers-color-scheme", value: scheme}]);
  page.on("pageerror", e => console.error("page error:", e.message));
  return page;
}
const settle = async page => { await page.evaluate(() => document.fonts.ready); await pause(400); };
const rowOf = (page, text) => page.waitForFunction(t =>
  [...document.querySelectorAll("#list .task[data-id]")].find(r => r.textContent.includes(t)), {}, text);

// The desktop: today's agenda, the report open beside it, its clock running.
{
  const page = await device(DESKTOP, "light");
  await page.goto(`${base}/#/v/today`);
  await (await rowOf(page, "quarterly report")).click();
  await page.waitForFunction(() => /quarterly report/.test(document.querySelector("#detail .heading")?.textContent ?? ""));
  await settle(page);
  await page.screenshot({path: `${webOut}/desktop.png`});
  await page.close();
}
// The keyboard, in the dark: the cursor and every control's key showing.
{
  const page = await device(DESKTOP, "dark");
  await page.goto(`${base}/#/v/today`);
  await rowOf(page, "Renew passport");
  for (const k of ["j", "j", "j"]) await page.keyboard.press(k);
  await page.waitForFunction(() => document.querySelector("#detail .heading"));
  await pause(300);
  await settle(page);
  await page.screenshot({path: `${webOut}/desktop-keys.png`});
  await page.close();
}
// The phone: today, a task, adding one, each its own shot, then the three
// side by side.
const phones = [];
for (const [name, go] of [
  ["phone-today", async page => { await page.goto(`${base}/#/v/today`); await rowOf(page, "Renew passport"); }],
  ["phone-task", async page => {
    await page.goto(`${base}/#/v/today`);
    await (await rowOf(page, "Pay rent")).click();
    await page.waitForFunction(() => /Pay rent/.test(document.querySelector("#detail .heading")?.textContent ?? ""));
  }],
  ["phone-add", async page => {
    await page.goto(`${base}/#/add`);
    await page.waitForSelector("#title");
    await page.type("#title", "Buy paint for the hallway");
    await page.$eval("#title", t => t.blur());
  }],
]) {
  const page = await device(PHONE, "dark");
  await go(page);
  await settle(page);
  await page.screenshot({path: `${webOut}/${name}.png`});
  phones.push(`${webOut}/${name}.png`);
  await page.close();
}
{
  const page = await browser.newPage();
  await page.setViewport({width: 1400, height: 900, deviceScaleFactor: 1});
  const img = p => `<img src="data:image/png;base64,${encodeBase64(Deno.readFileSync(p))}">`;
  await page.setContent(`<style>
    body { margin: 0; background: transparent; }
    .row { display: flex; gap: 40px; padding: 30px; width: max-content; }
    img { width: 412px; border-radius: 28px; box-shadow: 0 0 0 10px #1c1c22, 0 18px 40px rgb(0 0 0 / .35); }
  </style><div class="row">${phones.map(img).join("")}</div>`);
  await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
  await (await page.$(".row")).screenshot({path: `${webOut}/phones.png`, omitBackground: true});
  await page.close();
}

// The command line: each capture in a terminal window, Modus Vivendi's colors.
const ANSI = ["#595959", "#ff5f59", "#44bc44", "#d0bc00", "#2fafff", "#feacd0", "#00d3d0", "#d0d0d0",
              "#7f7f7f", "#ff6b55", "#00c06f", "#fec43f", "#79a8ff", "#b6a0ff", "#6ae4b9", "#ffffff"];
const xterm = n => n < 16 ? ANSI[n] : n < 232
  ? `rgb(${[(n - 16) / 36 | 0, ((n - 16) / 6 | 0) % 6, (n - 16) % 6].map(c => c ? c * 40 + 55 : 0).join()})`
  : `rgb(${Array(3).fill((n - 232) * 10 + 8).join()})`;
const escHtml = s => s.replace(/[&<>]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;"})[c]);
function ansiHtml(text) {
  let st = {}, out = "";
  const span = t => {
    const css = [st.fg && `color:${st.fg}`, st.bg && `background:${st.bg}`, st.bold && "font-weight:700",
                 st.dim && "opacity:.6", st.italic && "font-style:italic", st.underline && "text-decoration:underline"];
    return css.some(Boolean) ? `<span style="${css.filter(Boolean).join(";")}">${escHtml(t)}</span>` : escHtml(t);
  };
  for (const part of text.split(/(\x1b\[[0-9;]*m)/)) {
    const m = /^\x1b\[([0-9;]*)m$/.exec(part);
    if (!m) { out += span(part.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")); continue; }
    const codes = m[1] === "" ? [0] : m[1].split(";").map(Number);
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) st = {};
      else if (c === 1) st.bold = true; else if (c === 2) st.dim = true;
      else if (c === 3) st.italic = true; else if (c === 4) st.underline = true;
      else if (c === 22) st.bold = st.dim = false; else if (c === 23) st.italic = false; else if (c === 24) st.underline = false;
      else if (c >= 30 && c <= 37) st.fg = ANSI[c - 30]; else if (c >= 90 && c <= 97) st.fg = ANSI[c - 82];
      else if (c >= 40 && c <= 47) st.bg = ANSI[c - 40]; else if (c >= 100 && c <= 107) st.bg = ANSI[c - 92];
      else if (c === 39) st.fg = null; else if (c === 49) st.bg = null;
      else if (c === 38 || c === 48) {
        const key = c === 38 ? "fg" : "bg";
        if (codes[i + 1] === 5) st[key] = xterm(codes[i + 2]), i += 2;
        else if (codes[i + 1] === 2) st[key] = `rgb(${codes.slice(i + 2, i + 5).join()})`, i += 4;
      }
    }
  }
  return out;
}
for (const f of [...Deno.readDirSync(cliDir)].map(e => e.name).filter(n => n.endsWith(".ansi")).sort()) {
  const [cols, prompt, ...rest] = Deno.readTextFileSync(`${cliDir}/${f}`).split("\n");
  const body = rest.join("\n").replace(/\n+$/, "");
  const page = await browser.newPage();
  await page.setViewport({width: 1200, height: 900, deviceScaleFactor: 2});
  await page.setContent(`<style>
    body { margin: 0; background: transparent; }
    .pad { padding: 24px 28px 40px; width: max-content; }
    .win { width: max-content; border-radius: 12px; overflow: hidden; background: #0d0e1c;
      box-shadow: 0 0 0 1px #2b3045, 0 18px 40px rgb(0 0 0 / .35); }
    .bar { height: 34px; display: flex; align-items: center; gap: 8px; padding: 0 14px; background: #1d2235; }
    .bar i { width: 12px; height: 12px; border-radius: 50%; display: block; }
    .bar b { flex: 1; text-align: center; margin-right: 52px; font: 500 13px system-ui; color: #989898; }
    pre { margin: 0; padding: 16px 20px 20px; font: 15px/1.45 "JetBrains Mono", monospace; color: #ffffff;
      width: max-content; min-width: 64ch; max-width: ${cols}ch; white-space: pre; }
    .prompt { color: #79a8ff; }
  </style><div class="pad"><div class="win"><div class="bar"><i style="background:#ff5f59"></i><i style="background:#fec43f"></i>
    <i style="background:#44bc44"></i><b>${escHtml(prompt.slice(2))}</b></div>
    <pre><span class="prompt">$</span> ${escHtml(prompt.slice(2))}\n${ansiHtml(body)}</pre></div></div>`);
  await page.evaluate(() => document.fonts.ready);
  await (await page.$(".pad")).screenshot({path: `${cliOut}/cli-${f.replace(".ansi", "")}.png`, omitBackground: true});
  await page.close();
}
await browser.close();
