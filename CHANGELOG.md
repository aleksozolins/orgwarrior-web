# Changelog

## 0.4.0 (2026-10-24)

Needs orgwarrior 0.4.0.

- **`orgwarrior-web cert ADDRESS`** makes the certificate a phone needs to
  install the page as an app, with a small CA that can only vouch for that
  address. It replaces the openssl commands in docs/phone.md.
- **`/ca.crt`**: a phone can download the CA straight from the server to
  install it.
- **`orgwarrior-web service`** prints a systemd unit, or a launch agent on
  a Mac, that keeps the server running, with the full paths filled in.
- The quick start is shorter: check your setup with `orgwarrior --check`,
  then three commands to reach it from your phone.
- Plainer wording everywhere a message can appear: the `token` command,
  the server's errors, config and key-binding mistakes, and the page's
  own notices.

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
