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
