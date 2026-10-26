"use strict";

// Preferences, kept per device: the theme and the key hints, in a drawer.

// Preferences: a drawer like the others (the ⚙, or P), so the keys work in it
// as anywhere; the page behind not dimmed, to see a theme as it's picked.
// Its controls live in the header's #settings, moved into the drawer and back,
// their handlers with them.
const gear = document.getElementById("gear"), settings = document.getElementById("settings");
async function openSettings() {
  if (!sheet.hidden) return;
  const pending = ask(`<div class="sheet-title">Preferences</div><div class="settings-slot"></div>
    <div class="sheet-buttons"><button data-a="cancel">Close</button></div>`, () => {});
  sheet.classList.add("clear");
  sheet.querySelector(".settings-slot").append(settings);
  settings.hidden = false;
  readNotify();
  gear.setAttribute("aria-expanded", "true");
  (settings.querySelector('[aria-checked="true"]') ?? settings.querySelector("button"))?.focus();
  await pending;
  settings.hidden = true;
  document.querySelector("header").append(settings);
  sheet.classList.remove("clear");
  gear.setAttribute("aria-expanded", "false");
}
gear.addEventListener("click", openSettings);

// The theme is this phone's choice, so it's kept in the browser, not on the
// server: a theme, and Auto (the device's light or dark), Light or Dark where
// it has both.  Each is a data-theme in style.css; Modus on Auto is none
// (the CSS follows the device itself, so the first paint is right).
const THEMES = {modus: ["modus-operandi-tinted", "modus-vivendi-tinted"], gruvbox: ["gruvbox-light", "gruvbox-dark"],
                solarized: ["solarized-light", "solarized-dark"], dracula: [null, "dracula"], nord: [null, "nord"]};
const darkDevice = matchMedia("(prefers-color-scheme: dark)");
let theme = {family: "modus", mode: "auto"};
// Kept as "family:mode"; anything else is Modus on Auto.
function readTheme(saved) {
  const [family, mode] = (saved ?? "").split(":");
  return THEMES[family] && ["auto", "light", "dark"].includes(mode) ? {family, mode} : {family: "modus", mode: "auto"};
}
function applyTheme() {
  const [light, dark] = THEMES[theme.family];
  const mode = light ? theme.mode : "dark";  // dark-only themes: their one mode
  const name = theme.family === "modus" && mode === "auto" ? ""
    : mode === "dark" || (mode === "auto" && darkDevice.matches) ? dark : light;
  if (name) document.documentElement.dataset.theme = name;
  else delete document.documentElement.dataset.theme;
  for (const b of document.querySelectorAll("#themes button"))
    b.setAttribute("aria-checked", String(b.dataset.family === theme.family));
  document.getElementById("modes").innerHTML = (light ? ["auto", "light", "dark"] : ["dark"]).map(m =>
    `<button type="button" data-mode="${m}" aria-checked="${m === mode}">${m[0].toUpperCase() + m.slice(1)}</button>`).join("");
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  document.querySelector('meta[name="theme-color"]').content = bg;
}
try { theme = readTheme(localStorage.getItem("orgwarrior-theme")); } catch (e) {}
applyTheme();
// A theme picked keeps the mode: Auto stays Auto.
document.getElementById("settings").addEventListener("click", e => {
  const b = e.target.closest("#themes [data-family], #modes [data-mode]");
  if (!b) return;
  if (b.dataset.family) theme.family = b.dataset.family;
  else theme.mode = b.dataset.mode;
  applyTheme();
  try { localStorage.setItem("orgwarrior-theme", `${theme.family}:${theme.mode}`); } catch (e) {}
  // Re-drawn: focus back on the same button, for the keys.
  document.querySelector(b.dataset.family ? `#themes [data-family="${b.dataset.family}"]` : `#modes [data-mode="${b.dataset.mode}"]`)?.focus();
});
darkDevice.addEventListener("change", applyTheme);
// R: under a day's or a week's agenda, what was clocked in it (org agenda's
// R); per device, off at first.
let clockReportOn = false;
try { clockReportOn = localStorage.getItem("orgwarrior-clockreport") === "on"; } catch (e) {}
function applyClockReport() {
  for (const b of document.querySelectorAll("#clockreport [data-cr]"))
    b.setAttribute("aria-checked", String((b.dataset.cr === "on") === clockReportOn));
}
function setClockReport(on) {
  clockReportOn = on;
  try { localStorage.setItem("orgwarrior-clockreport", on ? "on" : "off"); } catch (e) {}
  applyClockReport();
  if (listQuery !== null) showView(listQuery, true).catch(listError);
}
applyClockReport();
document.getElementById("clockreport").addEventListener("click", e => {
  const b = e.target.closest("[data-cr]");
  if (b) setClockReport(b.dataset.cr === "on");
});
// Notifications (ntfy, docs/notifications.md): kept on the server, which
// sends them, for whoever this device is: the list's owner hears what's sent
// to them, an add token's person what's done with what they sent.
// OWNERNAME: whose list an add token adds to (showCapture's).
let notifyState = null, ownerName = null;
const notifyBox = document.getElementById("notify");
async function readNotify() {
  try { notifyState = await api("/api/notify"); } catch (e) { notifyState = null; }
  notifyBox.hidden = !notifyState;
  const b = notifyBox.querySelector("[data-a=notify]");
  b.textContent = notifyState?.on ? `On: ${topicShown(notifyState.topic)}` : "Off: set up…";
  b.setAttribute("aria-checked", String(!!notifyState?.on));
  // An iPhone's home-screen app (navigator.standalone, Apple's own) shows a
  // badge only once it may notify, asked from a tap; elsewhere a badge needs
  // nothing, or there's none (Android), and asking would only offer notifications.
  notifyBox.querySelector("[data-a=badge]").hidden = !(tabs.querySelector("a[data-counted]")
    && navigator.standalone === true && "setAppBadge" in navigator && window.Notification?.permission === "default");
}
notifyBox.querySelector("[data-a=badge]").addEventListener("click", async () => {
  await Notification.requestPermission().catch(() => {});
  readNotify();
  refreshCounts();
});
// A topic as the ntfy app knows it: its name on ntfy.sh (the app's own
// server), else its whole address.  The server takes either.
const topicShown = t => t.startsWith("https://ntfy.sh/") ? t.slice("https://ntfy.sh/".length) : t;
// A topic's name is its password on ntfy.sh: long and random.
function newTopic() {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  return "ow-" + [...crypto.getRandomValues(new Uint8Array(20))].map(n => abc[n % abc.length]).join("");
}
async function notifySheet() {
  const capture = document.body.dataset.mode === "add";
  let topic = notifyState?.topic ? topicShown(notifyState.topic) : "";
  for (;;) {
    const r = await ask(`<div class="sheet-title">Notifications</div>
      <div class="hint">${capture ? `Hear on your phone when ${esc(ownerName ?? "the list's owner")} marks what you sent done, with any note.`
        : "Hear on your phone when someone sends you a task."}</div>
      <ol class="hint steps"><li>Install the ntfy app.</li><li>Tap New topic, then Copy.</li>
       <li>In the app, tap + and paste it.</li><li>Tap Save here. A test message arrives in the app.</li></ol>
      <label class="field-label" for="ntfy-topic">Topic: its name on ntfy.sh, or its whole address on a server of your own</label>
      <input id="ntfy-topic" value="${esc(topic)}" placeholder="ow-x7k2q9" autocomplete="off"
       autocapitalize="off" spellcheck="false">
      <div class="chips"><button data-a="new">New topic</button><button data-a="copy">Copy</button></div>
      <label class="field-label" for="ntfy-token">Access token: only for a server of your own that asks for one</label>
      <input id="ntfy-token" type="password" autocomplete="off" placeholder="${notifyState?.token ? "Kept: type a new one to change it" : "None"}">
      <div class="sheet-buttons">${notifyState?.on ? `<button data-a="off" class="danger">Turn off</button>` : ""}
       <button data-a="cancel">Cancel</button><button class="primary" data-a="save">Save</button></div>`,
      async (e, done) => {
        const b = e.target.closest("[data-a=new], [data-a=copy], [data-a=off], [data-a=save]"), field = sheet.querySelector("#ntfy-topic");
        if (!b) return;
        if (b.dataset.a === "new") return field.value = newTopic();
        // The name, what the app asks for (its server is a setting of its own there).
        if (b.dataset.a === "copy") {
          const text = field.value.trim().replace(/\/+$/, "").split("/").pop();
          return navigator.clipboard?.writeText(text).then(() => toast(`Copied ${text}`), () => field.select());
        }
        done({a: b.dataset.a, topic: field.value.trim(), token: sheet.querySelector("#ntfy-token").value.trim()});
      });
    if (!r) return;
    try {
      if (r.a === "off") await post("/api/notify", {off: true});
      else await post("/api/notify", {topic: r.topic, link: `${location.origin}/`, ...r.token && {token: r.token}});
      toast(r.a === "off" ? "Notifications are off" : "Saved: a test message is on its way");
      return readNotify();
    } catch (e) {
      toast(e.message, true);
      topic = r.topic;  // back to the sheet, to fix it
    }
  }
}
notifyBox.querySelector("[data-a=notify]").addEventListener("click", notifySheet);
// Key hints beside the controls: while the keys are in use (body.keyboard),
// always, or never; per device.
function applyHints(mode) {
  document.body.dataset.hints = mode;
  for (const b of document.querySelectorAll("#hints [data-hints]"))
    b.setAttribute("aria-checked", String(b.dataset.hints === mode));
}
try { applyHints(localStorage.getItem("orgwarrior-hints") || "typing"); } catch (e) { applyHints("typing"); }
document.getElementById("hints").addEventListener("click", e => {
  const b = e.target.closest("[data-hints]");
  if (!b) return;
  applyHints(b.dataset.hints);
  try { localStorage.setItem("orgwarrior-hints", b.dataset.hints); } catch (e) {}
});
