# orgwarrior-web

The org agenda in a browser, phone first: a small web page over
orgwarrior's engine (`../orgwarrior`, `orgwarrior.api`). Org stays the
single source of truth and orgwarrior does all the org work through the
running Emacs daemon; this package serves JSON and a page. Published, so
nothing of anyone's setup is hardcoded. A `CLAUDE.local.md` beside this
file, never committed, holds the maintainer's deployment and to-do.

## Shape
- **A separate package**: orgwarrior stays the CLI and the engine; what
  this needs goes into `orgwarrior.api` only if it's generic. The routes
  are the page's, not an API; MCP will be a package of its own.
- **Dependencies: stdlib by default, not by rule**: a well-kept
  library, pinned, wherever it makes the code safer or much smaller,
  rewrites onto one included. The server is stdlib and works, so it
  stays. Not chosen: a framework (FastAPI) for its own sake: every
  request goes to one Emacs in turn anyway.
- **The server**: `ThreadingHTTPServer`, one request at a time past its
  request line (`Server.lock`): Emacs runs them in turn anyway. Not one
  connection at a time: Safari opens connections ahead and leaves them
  idle, and each held every other request for the 30 s timeout.
- **Files**: `server.py`, `auth.py` (tokens), `feed.py`, `sanitize.py`,
  `keymap.py`, `jsonfile.py` (tokens.json, tabs.json: reread when changed,
  written atomically). The page in `static/`, plain scripts sharing one
  scope, no build step, loaded in this order: `app.js` (API, routes,
  history, the list), `prefs.js`, `sheets.js` (`ask`, `toast`, pickers),
  `actions.js` (the flows on IDs, menu, marks, moves, clocking),
  `taskpage.js`, `forms.js` (add, capture, sign-in, edit, text tools),
  `draft.js` (c's card), `keys.js`. A name from a later file is used only
  inside functions (at top level it throws and blanks the page); the
  first draw waits for DOMContentLoaded (`scriptsRun`), since
  `/api/views` can answer first.
- **Phone first, one layout**: no separate desktop one (every feature
  twice). Desktop matters where Emacs isn't (a work machine).

## What org draws
- **Org lays out the fields**: the server's `prefix_format`
  `%c\x1f%t\x1f%s\x1f` makes each line category, time, label, heading,
  drawn as a two-line row. Separators but no ID: a diary line, not
  tappable. Colors are the engine's spans and `[colors]` (`sgrStyle`).
- **Now line**: the server turns the time grid on whatever the CLI's
  config says; the page drops empty hours and draws org's `now` line. A
  view showing it reloads in place every 5 minutes.
- **Links**: a "link" span is matched to the line's `links` by position,
  so the page never parses link syntax; only http(s)/mailto get an href.
  In a list they're only colored: the row's tap opens the task.
- **Day stepping**: ‹ › on a view with exactly one date line, and on the
  built-in week (by weeks; `week DATE` is the built-in even where
  `[views]` redefines `week`, and a dashboard gets no arrows). The date is
  the engine's `date`, never parsed from the text. On a week b f and B F
  all step a week, as org's agenda steps by its span.
- **Habits**: each day (`data-habit`, its role) in the page theme's own
  colors, not the Emacs theme's (picked for Emacs's background: Modus's
  glared on the light themes): clear `--c4`, ready `--c2`, alert `--c3`,
  overdue `--c1`, the color itself for org's full face, 45% over the
  background for its `-future` one, the dim variant org uses on every day
  but one done, today or overdue, past days included
  (`org-habit-build-graph`). Each glyph black or white by its day's
  lightness (CSS relative color). A `[colors]` role still wins.
- **Details** (task page): org's own HTML export (`show` with `html`,
  ~15 ms, no cache), made safe by `sanitize.py` (org's tags and classes
  only, http(s)/mailto links opening apart, scripts dropped): the text may
  be someone else's, and org passes raw HTML through. Source blocks
  colored by face name in the theme's colors; checkboxes wired back as
  buttons (`wireRendered`, `POST /api/check`, the item's text guarding
  against a list changed underneath).

## Server, sign-in, sharing
- **Tokens** (`auth.py`), named and scoped: `full`, `calendar` (the feed
  only, `/?key=` refused: it sits in a calendar app's settings), `add`,
  `mcp` (orgwarrior-mcp's: Claude's, none of the page).
  SHA-256 hashes (random tokens need no slow hash), `compare_digest`, in
  `$XDG_STATE_HOME/orgwarrior-web/tokens.json` (0600, reread: no
  restart), never config.toml (often in a dotfiles repo). `/?key=` sets the cookie
  and 303s to `/`, the key out of the history, never logged.
- The cookie is `orgwarrior_key_PORT`: browsers keep cookies by host, not
  port, so one name let two instances on one address replace each
  other's sign-in. HttpOnly, SameSite=Strict, Secure under `--cert`, 400
  days, renewed by `/api/views`. Only `/api/` wants it (or `Authorization:
  Bearer`): the page, scripts, icons and `/healthz` are public, since the
  manifest is fetched without cookies and a link from another app arrives
  without a Strict cookie. A 401 shows the sign-in page (`POST
  /api/sign-in`): an iPhone's home-screen app keeps cookies apart from
  Safari's, so a link opened in Safari never reaches it.
- Off loopback it won't start without a token; on loopback it's open
  until the tokens file exists (revoking them all doesn't reopen it),
  which is how tests and dev runs go. A token's name is an identity: log
  lines, and an add token's adds are `:FROM: <name>`. Not chosen: a
  password (weaker than a random token, typed on a phone); passkeys (need
  a domain and crypto outside the stdlib); a proxy only (supported by
  staying on loopback).
- **Add tokens** (Capture): someone adds to this list without seeing it.
  `/api/views` says only `{mode: "add", name}`; every route but `POST
  /api/add` refuses (a route wants `full` unless it says otherwise), and
  there the server decides (`Handler.add_for`): the inbox (events too:
  everything triaged in one place), the default keyword, no tags,
  `:FROM:`, always `:CAPTURED:`. Fields only, never add syntax (it
  carries keywords and tags); anything beyond title, dates and details is
  refused (403), not dropped, so a client never believes it set what it
  didn't; so are headings in the details (lines starting with `*`: tasks
  of their own, with keywords, tags and dates), the capture page saying
  so before sending. "Sent by you" (`/api/sent`, `entries_with` on `FROM`): plain
  facts, never the keyword (the list owner's workflow), body, tags or where it
  went; read again after each send and whenever they come back (an
  installed iOS app has no pull to refresh). Not chosen: per-task
  permissions; a feed of hers.
- **Tabs**: `[web.tabs]`, else today, week, all and `[views]`, then tabs
  saved from the page (for someone who edits no files) in
  `tabs.json` beside tokens.json, for every device of the instance; never
  written into config.toml (often in git, a dotfiles manager would undo it, and the
  stdlib can't write TOML).
- `[web] name`: the capture page's wording, the tab title and the
  installed app's name (`ow · Sam`), so two instances on one phone tell
  apart. `[web.tabs]`, `[web.keys]`, `[web.calendar]` checked at startup:
  a typo stops the server, not the page.
- **Calendar feed** (`feed.py`, the engine's `calendar` op; feed.py only
  writes text): open tasks and events, all-day end exclusive, timed ones
  floating (no time zone), repeaters as RRULEs (`.+`/`++` as plain ones:
  iCalendar can't say them), diary sexps one event a day for a year,
  UIDs the whole hash plus the stamp's kind (stable across fetches), a
  deadline's warning a VALARM. No cache: milliseconds. Any token in
  `?key=`, logged without it. Not chosen: importing someone's Google
  calendars (the user's setup, not this package's).
- **PWA**: the service worker exists only because browsers want one
  before offering Install: no caching (the agenda must be live). Share
  target: Android's Share menu → the add page, first part the title, the
  rest the body.
- **HTTPS** (`--cert`): the handshake deferred to the first read, inside
  the handler's thread and timeout: done in `accept()`, a client that
  never finished it would stop the server accepting.
- **Robustness**: a 30 s socket timeout; errors reach the page as JSON
  (orgwarrior's 400, its reason in the journal too, path only; bugs 500
  with a traceback in the journal); a task page that fails keeps ‹ Back; dropped,
  timed-out or plain-HTTP-to-TLS connections log nothing
  (`Server.handle_error`); POSTs are JSON only, which keeps other sites
  from posting (no CORS preflight answered), signed in and their body
  read (4 MB at most) before `Server.lock`: one not signed in, sending a
  body a byte at a time, held every request.
- **A page left open across an update** (an installed app sits in memory
  for days): every API answer carries `X-Page-Version` (a hash of the
  static files, read each time: page-only changes need no restart); a
  page seeing it change reloads at the end of its next `route()`, never
  on the answer to a tap, over a sheet, the discard dialog or a changed
  form.
- **Icon**: one drawing, three SVGs (plain, maskable at 82%, monochrome
  for themed icons), PNGs from them with `rsvg-convert`, the PNGs first in
  the manifest (a home screen can't use SVG). iOS fetches
  `apple-touch-icon.png` (180, full bleed) only from a publicly trusted
  certificate, else shows a letter. An installed app keeps the icon it
  was installed with.

## The page
### Panes, history, refresh
- `#list` and `#detail` in `main`, shown by `body[data-page]`; under
  1000 px (`wide`) one at a time, the other kept hidden, so Back to the
  list is instant and keeps its scroll. Side by side, a row opened
  replaces the entry (`openRow`, `location.replace`), so Back never walks
  through each task looked at; Esc, archive and kill close the task in
  place (`closeTask`: Back would leave the list), except one opened from
  another task's outline, whose entry has that task as `parent`: it
  closes back there, as you came. Selecting takes the
  task's pane (`#selectbar`), so one set of controls. Opened straight on
  a task, the list beside it is the default view; Back with nothing to go
  back to goes to the default view.
- **History**: the address names a view or a task, never both, so each
  entry remembers its list (`history.state.list`, written only into its
  own entry by `state.key`: two entries can show one task, and a draw can
  end after Back moved on). Two entries can share an address, and Back
  between them fires no hashchange: a popstate to an entry other than
  `drawn.key` redraws. A draw reads its entry before any wait and stops
  once a newer draw began (`[` then `]` quickly: the older one, finishing
  late, took the newer one's state). `[` or Esc while the address is
  ahead of the page is ignored (`addressAhead`: history.back changes the
  address before hashchange). Data arriving after the address moved on
  isn't drawn (`listSeq`). TAB's file view doesn't draw the empty pane
  while its task is on the way (`revealPreview`). A late popstate from a
  preview doesn't close a sheet opened since.
- **Refresh in place** (`route(true)`: no "Loading…", same scroll): after
  an action, and back on the tab after 30 s, hidden 5 s at least (some
  compositors flicker visibility: a redraw every 30 s all day) (Syncthing changes files
  underneath); never over a sheet, the add or edit page, or a task page
  with a field changed. While it runs the task page's controls ignore
  taps (no `currentTask`). An action redraws the page (`settle`); a
  refile's or rename's new ID is followed by `route(true)`, not a
  hashchange (a new ID can read the same).

### Forms and saving
- A tap that is a choice (a state, a quick date, Clear, a target, a box)
  acts at once; anything composed has Cancel and a button that saves. The
  task page saves field by field, never as a whole. Leaving with changes
  asks "Discard changes?" (`formState()` against what was drawn); Back or
  Esc there keeps editing, the address pushed back without a redraw.
- A sheet pushes a history entry, so Android's Back closes it, not the
  page; `ask()` resolves only once that entry is gone. A sheet from a
  sheet stacks, each entry its depth, so Back closes the top one. A
  sheet's text goes in its HTML (`textareaText`), not after: the
  snapshot holds it, so closing untouched doesn't ask.
- "Details" is the page's word for an entry's text everywhere; "body"
  stays the code's and the engine's.
- **Add**: the add page, the card and the capture page share their
  fields and sheets (`draftFieldsHtml`, `pickDraftField`) with the task
  page. They send fields, so nothing in a title is read as a date or tag.
  Where defaults to `[add]`'s place (sent as nothing: the server
  decides). The + on a heading's page or a file offers that place without
  picking it: the + stays the capture to the inbox, and guessing "under
  this" would misfile a capture made from an unrelated task. After an
  add you stay where you were, as org-capture returns you: the cursor on
  the new task if it's in the list, else the toast opens it.
- **Dates**: quick picks are sent as the word, read by org as in Emacs
  (`thu` on a Thursday is next week's). For one task the fields start as
  its timestamp and go as a whole `<...>` timestamp: what's shown is
  what's saved, an emptied repeater removed. Several tasks: plain words,
  each keeping its repeater. Repeaters and warnings are said in words
  (Repeat, On schedule `+`, Next one ahead `++`, After it's done `.+`;
  Show ahead, Hide until with the day they land on) and write the raw
  text under Other, which reads back into them where they can say it (a
  habit's `.+2d/4d` can't). Not chosen: typed 24-hour fields (they
  confused a 12-hour reader); a free-text line (two ways to say a date
  need a "which wins" rule).
- **Editing** (`#/e/ID`): raw text below the heading, saved whole by
  `set_entry` with the loaded text as `old`. Planning and leading drawers
  fold into boxes of their own (org fixes their order). Enter carries a
  list's indentation and bullet (`beforeinput`: Android keyboards don't
  report Enter as a key). The text tools type org (bold, a link, lists,
  blocks), keep the focus so the keyboard stays up, and use `insertText`
  so undo works. Headings typed in details (the editor, the add page, the
  card, the capture page) go under the task, after its own children
  (orgwarrior's engine); the page asks first, listing them
  (`confirmOutline`), since pasted text has Markdown's `* item` lines, and
  the toast says how many. Always "headings", never "tasks": a plain
  heading, no keyword, is one too. Not chosen: CodeMirror or any rendered editor (a
  WYSIWYG one rewrites what it doesn't model, drawers and spacing, in
  files Emacs reads).

### The task page
- The title tapped to edit in place: Enter saves, Esc cancels, no save on
  blur (a phone drops focus whenever the keyboard closes).
- One way to change each field, its sheet, everywhere: what's
  set as a link, what isn't as an adder. The state: a phone shows the full
  row of chips, side by side one chip before the title; both drawn, CSS
  showing one. Properties are one editor (the drawer as a section);
  Effort alone is a field, the one property the page gives meaning to
  (clocked time against it). Sections show only once they hold something.
- Details never shows the planning line (the fields have its dates;
  CLOSED is read only: org sets it on a done state). The tags sheet:
  inherited ones shown, not settable; each `{ }` group one of; filetags
  never offered.
- Each section with a list has a key that lists it as a sheet: History
  `Z`, Clocked `l`; Outline's, `h`, zooms the list into it instead (A
  file's view, below). The section's name is a control showing its key.
- History, Clocked: the latest three, the rest folded; each item opens a
  sheet to change or delete it. The log drawer isn't drawn in Details
  when it holds nothing else (`log_drawers`).
- Move is one sheet that stays open (a move is often one of several),
  always with the subtree. Not chosen: dragging on touch (it fights the
  scroll). Refile lists `[refile] usual` first, so Enter or one tap takes
  it (someone triaging didn't know which to pick); a file's top level reads
  "projects.org — top level" (a bare file name read like the paths).
- ⤢ or `V` reads Details full screen (`#/r/ID`); side by side the read
  page and the editor take the whole width, the list kept hidden for
  Back.

### Rows, marks, the keyboard
- **One set of flows** (`actions.js`) on a list of IDs, from the task
  page, a row's long press (our own 450 ms timer: `contextmenu` isn't
  reliable on touch) and the marks' bar. The bar leaves Move out (several
  scattered tasks moved at once rarely means one thing). An action
  refused for one mark is refused for all, the marks kept.
- **Keys as org's agenda has them**, where they fit; docs/keys.md says
  where they differ and why. No modes: keys act only outside a field. The
  keys never put focus into the task's pane (tried: j/k to a task, then
  Tab through its fields, was two models at once). Where there's no list
  (the read page, a phone's task page) they scroll.
- The cursor is an ID, prefix-matched, its row's index kept, so two
  headings sharing an ID don't swap and an archived row's place goes to
  the next. Side by side the row it lands on opens beside after 150 ms of
  no keys, one history entry for all of them.
- A key acts on the marks, else the cursor's row when it's meant
  (`cursorMeant`: nothing open beside it, it is the open task, or its
  preview is on the way), else the open task. With a task open that the
  cursor's row isn't (a child walked into from an outline, a link), the
  open one: a `C-k` once killed the parent under the cursor, its subtree
  and all. Kill's question focuses Cancel: Enter alone never deletes.
- **Keys of one's own**: `keymap.py`'s table of actions, org agenda's
  keys the defaults; `[web.keys]` a `preset`, then one's own over it, each
  layer taking its keys (and the starts of its sequences) from the ones
  under it. Checked at startup, sent as `/api/views`' `keymap`; the page
  dispatches on the action (`keyAction`) and draws every hint, the card's
  keys and `?` from it. Emacs's `kbd` notation, one canonical form both
  sides (`parse_sequence`, `eventKey`; a letter with C-/M- by `e.code`:
  Alt-j on a Mac types ∆). Sequences up to three keys, shown in the
  corner, no timeout; C-c with text selected stays the browser's copy.
  Fixed outside the table: Esc, Tab, keys inside sheets and pickers, Enter
  in a field, C-RET. docs/keys.md's table is generated and tested.
- **The evil preset** is evil-collection's org-agenda map (its
  single keys beat evil-org's `c t` and org's `C-c C-s`), for every
  action the page has; one it has no key for keeps the page's unless
  evil-collection uses that key, then org's own, else none. Each choice
  commented in `PRESETS`. Not chosen: evil-org's map, or both; presets
  made up to feel like Gmail or Todoist (their keymaps don't line up with
  org's actions); modal editing in text boxes.
- **Fast keys** in pickers are the user's org's (`TODO(t)`, `#+TAGS:
  @home(h)`) and win over hjkl there (a `SKIP(k)`). A fast key's Space
  swallows its own keyup: buttons fire on keyup, so it pressed what had
  the focus next.
- **Hints** (`data-hint`, drawn by CSS) show while the keys are in use,
  never on touch, and linger through a mouse press (`.hints-linger`):
  gone at once, chips shrink under the pointer and the click lands
  elsewhere. A hint keeps its own case under an uppercase title (`l`
  read as `L`, demote). In the list, section lines stick, and
  `scroll-padding-top` keeps a row scrolled into view below them.
- **Focus**: Tab on the list never moves the focus; the tabs, ＋ and the
  logo are out of the Tab order, and a header control clicked gives the
  focus up (else `j` walked the tabs and Enter clicked one again). A row
  of choices is one Tab stop (`tabOver`). A sheet keeps Tab inside and
  opens on its filter or field from the keys, never on touch (the
  keyboard would rise); fields open with the caret at the end. Esc
  cancels the innermost thing; in a field written in, the first Esc
  leaves it for its Save, so the sheet's keys work.
- Yes-or-no: no on the left, yes on the right, y and n; the safe one
  focused for kill and discard. The dialog's close event comes late: one
  arriving while the next question is open is ignored
  (`confirmDiscard`). Focus rings are `:focus-visible` only, and a
  focused button in a sheet always shows its ring from the keys.
- **Adding**: three ways, each its input's: the card (`c`, keys), the add
  page (touch, the share target), the box's one line (the syntax by
  heart). Not chosen: one add for all (the three stay).

### Clocking
- The header's strip shows only while a clock runs, so someone who
  never clocks never sees it; what runs is read on each refresh in place, not on each navigation.
  Not chosen: polling (the strip counts on from its start; another
  machine's clock shows at the next refresh). Past 4 hours it asks "still
  on it?" and ■ asks the time instead of using now.
- Lower case acts, upper case asks: `i` `o` clock in and out now,
  `I` `O` open the time sheet; on touch, Clock in/out act now and the
  toast's Adjust sets the time after (it edits clock 1, the newest). An
  end may be later than now, a start not.
- Reports are a query (`clocked SPAN`), so the box, a tab or `[views]`
  shows one; folds per device. `R` adds what was clocked under a day's or
  week's agenda, per device, off at first (a request more per view only
  when on).
- A file's view (one word ending in `.org`): the engine's `outline`, the
  whole tree in one request, folded as org's outline; folds kept per
  device and file. Agenda views stay flat, as org's are. Not chosen:
  ranger's columns or a third pane.
- **Zoom** (one navigator, not a sheet of children): `h` on any
  row or task shows its file's tree from that heading down, as org's
  narrowing (`projects.org::ID`, the page's own query: the box shows the
  file, the file's tab stays marked, T saves a zoom as a tab). The
  section line is a breadcrumb: ‹ (`^`) out a level, the cursor on the
  heading left; the file and each heading above zoom; the heading itself
  opens its page. A task page's parents zoom too, the task beside. Reorder
  and + Add act on the zoomed heading. Its ID gone (renamed), the whole
  file.

### Look
- Themes: CSS variables per theme, `--c0..--c15` the ANSI colors
  `[colors]` names; Modus Tinted by default, following the device (on
  Auto it sets no `data-theme`, so the first paint is right). Kept per
  device in localStorage as `family:mode`.
- Toasts at the top (what was tapped is usually lower down); a tap
  elsewhere dismisses one (taps going through it read as the toast in the
  way); a step it offers is a button of its own, `RET` its hint.
- The header's brand is as big as fits beside five tabs on a 412 px
  phone (a browser test checks). `[hidden]` always wins in the CSS.

### Routes
`/?key=`, `/calendar.ics`, `/healthz` (3 s, `ok` or 503 with the reason
in the journal), `/manifest.webmanifest`, and under `/api/`: `views`
(`keymap` too; an add token gets mode and name only), `sent`, `view?q=`,
`task/ID` (`?html=1`), `tags`, `refile-targets`, `refile-places`,
`add-places`, `file?f=`, `clock`, `report?q=`; POST `act`, `clock`,
`clock-edit`, `wants-note`, `check`, `entry`, `tabs`, `reorder`, `run`
(a line in orgwarrior's syntax, parsed by its own `cli.parse`; `help`
shows its help text), `add`, `sign-in`. Errors are `{"error"}`. The hash
routes the page (`#/v/QUERY`, `#/v/FILE::ID` a zoom, `#/t/ID`, `#/e/ID`,
`#/r/ID`, `#/add?…`), so Android's Back works.

## Published
- **Installed from GitHub with uv**, one install for both commands
  (`--no-sources --with-executables-from orgwarrior`). The dependency is
  orgwarrior's GitHub URL and `[tool.uv.sources]` keeps `../orgwarrior`
  for development; uv applies a project's sources even installing it
  from git (a missing path: the build fails), so the line says
  `--no-sources`, and the install receipt keeps it for `uv tool upgrade`
  (which takes the newest commits of both). One install, not two: see
  orgwarrior's engine stamp.
- **GPL-3.0-or-later**, both.
- **The READMEs** (complete, not walls of text): what it is with
  screenshots first, a quick start, a tour, the config table, sign-in;
  each long subject a paragraph and a link into `docs/` (`phone.md`,
  `calendar.md`, `keys.md`); orgwarrior's points at `help TOPIC`. Then
  Contributing, and Development ending with the disclosure (Claude used in
  development, all code reviewed by the author, every behavior tested): plain,
  and not at the top, where it could turn people off before they look.
- **Screenshots** (`scripts/screenshots`, Linux): `docs/demo`'s made-up
  org files, dates relative to today, on a throwaway daemon and server;
  the page on a desktop and a phone, the CLI in a pseudo-terminal drawn
  as a terminal window into orgwarrior's `docs/screenshots/`. The fonts a
  visitor sees (Roboto, JetBrains Mono, Noto Color Emoji, fetched into
  `~/.cache/orgwarrior-web/fonts`) through the run's own fontconfig, the
  page's CSS untouched. The demo daemon's habit faces are set to Modus
  Vivendi Tinted's colors: its only frame is colorless, where a theme's
  color specs don't apply. Run it after a change they show, and look at
  every one.

## Development
- `uv run pytest`: routes and feed against a stub engine (orgwarrior's
  suite tests the engine), and the page in headless Chrome
  (`test_browser.py`, a section a file in `tests/browser/`, helpers in
  `lib.js`; any page error fails a section). Each section has its own
  throwaway daemon with fresh fixtures and two servers: one open, one
  with tokens and `[web] name` (`SIGNED`, `ADD_KEY`); `keymap`'s run with the
  evil preset. Working on one area, run its section alone (`-k keyboard`)
  once per change; the whole suite once before a commit; again only for a
  failure that looks intermittent. Skipped until `scripts/get-browser` has
  fetched Chrome for Testing (and any libraries the machine lacks) into
  `~/.cache/orgwarrior-web/browser`.
- Writing browser checks:
  - Wait for what shows the action finished (the page drawn, a changed
    date, `loadedAt` moving, the new row), not the URL or the engine: the
    address moves before the page draws. `waitForNetworkIdle` never
    settles here.
  - A row clicked right after a navigation races the redraw ("Node is
    detached"): `clickRow` clicks again. `tap` scrolls its target to the
    middle (the floating + covers a bottom-right button), waits for
    lingering hints, and clears a toast first.
  - A navigation away from a changed form raises "Discard changes?": load
    the page fresh instead.
  - The fixtures have two "Take out trash" tasks (twins: a
    title alone picks neither): pick other rows. `innerText` gives section titles in
    capitals.
  - Colors: compare painted pixels (a canvas), not computed strings
    (`color-mix` gives `oklab()`, a variable `rgb()`).
  - Screenshots: `clip` renders unscrolled, so a sticky element shows only
    unclipped. A CSS-only change can be checked pixel for pixel: serve
    `git show HEAD:…/style.css` by request interception and compare
    full-page shots.
- `deno check` parses each file. For unused names, lint the files
  concatenated in load order (`deno lint --rules-tags=
  --rules-include=no-unused-vars`): one at a time, every cross-file name
  looks unused.
- `scripts/dev-web` (127.0.0.1:22599): the page against orgwarrior's dev
  daemon (started if needed), its config and a tokens file of its own, so
  open with the user's tokens present; the daemon writes org files only
  in its copy. `uv run orgwarrior-web` serves the user's own daemon on
  127.0.0.1:22546.
- Commit messages: no AI-attribution footers.
