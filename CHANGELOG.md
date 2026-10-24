# Changelog

## 0.4.1 (2026-10-24)

- **docs/calendar.md explains showing another calendar in your agenda**:
  get a Google, iCloud or work calendar's .ics link, convert it to a
  read-only org file with ical2orgpy, and update it on a schedule. Its
  events then show everywhere, can't be changed, and stay out of the
  feed. The README points to it.

## 0.4.0 (2026-10-24)

Needs orgwarrior 0.4.0.

Getting it onto a phone used to mean pasting openssl commands and writing
a service unit by hand. Now each step is a command.

### Setup commands

- **`orgwarrior-web cert ADDRESS…`** makes the certificate a phone needs
  to install the page as an app, with a small certificate authority (CA)
  that can only vouch for the addresses you give. Even if its key leaked,
  it couldn't impersonate any other site. It writes to
  `~/.local/share/orgwarrior-web/tls/`, prints the exact options to serve
  with, and won't replace an existing CA without `--force` (your devices
  trust that one). It uses only openssl options that macOS's LibreSSL
  supports too.
- **`/ca.crt`**: the server hands out the CA certificate next to its own,
  with no sign-in, so a phone can download and install it straight from
  the server.
- **`orgwarrior-web service [OPTION…]`** prints a systemd user unit, or a
  launch agent on a Mac, that runs orgwarrior-web with those options. It
  fills in the command's full path and a `PATH` that finds `emacsclient`,
  checks the options, and turns `--cert` and `--key` into full paths. What
  to do with it is in comments at the top, so it reads the same piped or
  saved, and it warns if it would point at uvx's temporary copy.

### Docs

- **A shorter quick start**: check your setup with `orgwarrior --check`,
  then three commands to reach it from your phone.
- docs/phone.md uses `cert` and `/ca.crt` in place of the openssl
  commands, and "Running it as a service" uses `service`.

### Clearer messages

- Plainer wording everywhere a message can appear: the `token` command
  and its help, the server's errors, mistakes in `[web]`, `[web.tabs]`,
  `[web.keys]` and `[web.calendar]`, and the page's own notices ("It's
  read only, because its file isn't writable").

## 0.3.1 (2026-10-24)

Needs orgwarrior 0.3.1.

- **All-day events come first**: an event with no time is listed at the
  top of its day, with "all day" where the time goes, like in a calendar.
- **Tasks don't vanish after you change them**: mark something done in
  the inbox and its row stays where it was, dimmed and showing its new
  state, with the cursor still on it, so you can refile it next. It goes
  away when the list reloads (another view, `g` or ↻, or coming back to
  the tab).
- **Add card keys**: `1` `2` `3` pick Task, Event or Heading from anywhere
  on the card except the title, and each field's key works wherever the
  focus is. Before, `e` meant both Event and Details.
- `g` and ↻ now reload the list too when a task is open beside it.
- The README, the docs and the key descriptions in `?` are rewritten to
  be shorter and clearer.

## 0.3.0 (2026-10-23)

Needs orgwarrior 0.3.0.

- **A tidier list**: each row shows the time, then the task, with its
  category on the right on a desktop. The plain "Scheduled" label is gone,
  since nearly everything in a day's view is scheduled. Labels like
  `In 2 d.`, `Sched. 3x` and deadlines still show. On a touch screen, rows
  don't show IDs, but a task's own page still does.
- **Read-only files**: a task in a file that isn't writable (a calendar a
  script exports to org) gets the same page, but with nothing to change,
  and its menu only offers Open. The calendar feed leaves these files
  out, so a calendar app that also shows the original doesn't show them
  twice.
- A task's page shows its category when it isn't the file's name (from
  `#+category:` or a `CATEGORY` property).

## 0.2.0 (2026-10-22)

Needs orgwarrior 0.2.0.

- **An event's date is its own field**: When on the task page (`>`), with
  its own section in the editor, separate from the text. Events don't
  offer Schedule or Deadline.

## 0.1.0 (2026-10-22)

- First public release.
