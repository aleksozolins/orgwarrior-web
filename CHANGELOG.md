# Changelog

## 0.3.0 (2026-10-23)

Needs orgwarrior 0.3.0.

- **A tidier list**: each row is the time, then the task. Where it lives
  (its category) sits at the right on a desktop. The bare "Scheduled"
  line is gone (a day's view is nearly all of them); `In 2 d.`,
  `Sched. 3x` and deadlines still show. On a touch screen, rows have no
  IDs; a task's page still shows its own.
- **Read-only files**: a task in a file that isn't writable (a calendar a
  script exports to org) has the same page to read, with nothing to
  change; its menu offers Open only. The calendar feed leaves such files
  out, so a calendar app showing the original too doesn't show them twice.
- A task's page shows its category where it isn't the file's name
  (`#+category:`, a `CATEGORY` property).

## 0.2.0 (2026-10-22)

Needs orgwarrior 0.2.0.

- **An event's date as a field**: When on the task page (`>`), its own
  fold in the editor, never part of Details. An event offers no Schedule
  or Deadline.

## 0.1.0 (2026-10-22)

- First public release.
