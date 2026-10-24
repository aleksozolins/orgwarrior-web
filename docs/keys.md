# Keys of your own

The keys follow org's agenda where they fit. A few differ on purpose,
where the page needs the key more. Here's what an org user should know:

| key | in org's agenda | here | why |
|---|---|---|---|
| `s` `d` | save all, day view | schedule, deadline | one key for dates (org's are `C-c C-s`, `C-c C-d`). There's nothing to save, and the day view is a tab. |
| `w` | week view | refile | refiling is common, and the week is a tab |
| `j` `k` | go to date, capture | down, up | like vim and most lists. `D` picks a date. |
| `r` | refresh | rename | `g` refreshes, as in org |
| `c` `a` `A` | calendar, archive, append | add, add under, add beside | adding matters more here. `$` archives, as in org. |
| `i` `o` / `I` `O` | `I` `O` clock in and out now | clock in and out now / at a time you pick | lower case acts, upper case asks. `I` then Enter still means now. |
| `J` `K` `H` `L` | clock goto, show or hide habits, holidays, recenter | move the subtree | org's agenda can't move subtrees. `M-↓` `M-↑` work too, as in org. |
| `e` `E` | effort, entry text | edit the text, effort | editing is the one you'll use more |

To change them, add `[web.keys]` to the config: a preset first, then any
keys of your own on top of it.

```toml
[web.keys]
preset = "evil"            # evil-collection's agenda keys (see below)
kill = "C-d"               # one key
note = ["z", "C-c C-z"]    # several
archive = []               # no key
```

- Write keys the way Emacs does: `t`, `T`, `$`, `C-k` (Ctrl), `M-<down>`
  (Alt, or Option on a Mac), `s-k` (Cmd or Super), `M-S-<left>`, `RET`,
  `SPC`, `DEL`, `<prior>` (Page Up), `<f5>`. A sequence is its keys with
  spaces between, like `d d` or `C-c C-s`, up to three keys. A word of
  plain characters means one key per character, as in Emacs, so `dd` is
  `d d`.
- Giving an action a key replaces that action's keys, and takes the key
  away from whatever action had it. `state = "s"` leaves schedule with no
  key until you give it one. A key that starts one of your sequences is
  taken too: `kill = "d d"` takes `d` from deadline.
- The server checks your keys when it starts. An unknown action, a key it
  can't read, the same key on two of your actions, or a key the browser
  keeps for itself (Ctrl-W, Ctrl-T, Ctrl-N) stops it with a message
  saying which.
- While you're partway through a sequence, the keys so far show in the
  corner (`d …`). Esc, a click, or a key that doesn't continue it cancels
  it.
- `?` lists every action with the keys in effect. Keys that aren't org's
  are marked ·, and actions without a key show –. The hints on the page
  show the keys in effect too.
- Some keys can't be changed: Esc and Tab, Enter in a field, Ctrl-Enter,
  and the keys inside sheets and pickers. Those are org's fast keys from
  your `#+TODO` and `#+TAGS`, the arrows, `y` and `n`, and the add card's
  `1` `2` `3` for task, event and heading. Text boxes always edit text
  normally, under any preset. There's no modal editing.
- The keys apply to the whole instance, on every device that uses it.
- `clock-goto` (open the task you're clocked in to) has no key by default,
  because org's `J` moves a task down here. Tap the clock in the header
  instead.

### The evil preset

These keys come from
[evil-collection](https://github.com/emacs-evil/evil-collection)'s org
agenda keys, `modes/org-agenda/evil-collection-org-agenda.el` as of
2026-09-27, plus the theme keys (`g r`, `Z Z`, `d`…) that its
`evil-collection.el` sets. Every action the page has uses
evil-collection's key: `t` state, `s` schedule, `D` deadline, `T` tags,
`p` priority, `r` refile, `n` note, `A` archive, `d` kill (it asks
first), `H`/`L` earlier and later, `J` go to a date, `I`/`O` clock in and
out, `X` discard the clock, `g J` the task clocked in, `m`/`u` mark, `B`
the box for the marked tasks (its bulk action), `g r` refresh, `q`/`Z Z`/`x`
quit, `j`/`k`, `g j`/`g k` and `C-j`/`C-k` to move.

Where evil-collection has no key for an action, the page's own key stays,
unless evil-collection uses that key for something else. Then it falls
back to org's own key, or no key at all:

- Rename is `R`, evil-collection's rename key in its other modes, since
  `r` is refile here.
- Moving uses org's keys, `M-↓` `M-↑` `M-S-←` `M-S-→`, because `J` `H` `L`
  are evil-collection's date keys. `K` goes too, to keep the pair.
- From vim: `:` and `/` open the box, and `C-o` and `C-i` go back and
  forward (vim's jump list), since evil-collection's `[[` `]]` jump
  between blocks.

Under evil, these have no key, so give them one in `[web.keys]` if you
want them: `history` (`Z` starts `Z Z`), `move` (`v` starts `v d`, `v
w`…), `clock-in-at` and `clock-out-at` (`I` and `O` act right away, and
the toast's Adjust sets the time), `clock-report` (`R` is rename, and
Preferences still has it), `add-beside` (`A` is archive), `earlier-week`
and `later-week` (`B` and `F` are taken), and `save-tab` (`T` is tags, and
＋ still does it).

evil-collection binds some keys the page has nothing for: `SPC` (show the
entry), `S` (save all), `v d` `v w` `v m` `v y` (day, week, month and year
views), `f` `F` (filter by tag, filters off), `S-RET` `g o` (open a link),
and `[[` `]]` (between blocks).

### Every action

<!-- keys: python -m orgwarrior_web.keymap prints this table -->
| action | org (default) | evil | what it does |
|---|---|---|---|
| `down` | `j`, `n`, `<down>` | `j`, `g j`, `C-j`, `<down>` | go to the next row (side by side, it opens beside the list) |
| `up` | `k`, `p`, `<up>` | `k`, `g k`, `C-k`, `<up>` | go to the previous row |
| `open` | `RET` | `RET` | open the row |
| `quit` | `q` | `q`, `Z Z`, `Z Q`, `x` | close the task, or go back (Esc always does this too) |
| `back` | `[` | `C-o` | go back (Alt-← too) |
| `forward` | `]` | `C-i` | go forward again (Alt-→ too) |
| `state` | `t` | `t` | set the state |
| `priority` | `,` | `p` | set the priority |
| `priority-up` | `S-<up>` | `S-<up>` | raise the priority |
| `priority-down` | `S-<down>` | `S-<down>` | lower the priority |
| `tags` | `:` | `T` | set the tags |
| `schedule` | `s` | `s` | set the scheduled date |
| `deadline` | `d` | `D` | set the deadline |
| `when` | `>` | `>` | set an event's date (its plain timestamp) |
| `effort` | `E` | `E` | set the effort estimate (clocked time is shown against it) |
| `note` | `z` | `n` | add a note |
| `history` | `Z` | – | list its notes and state changes, to change or delete one |
| `properties` | `C` | `C` | list its properties, to change, delete or add one |
| `outline` | `h` | `h` | zoom in, showing its file's tree from that heading down, like org's narrowing |
| `rename` | `r` | `R` | rename it |
| `edit` | `e` | `e` | edit its text |
| `read` | `V` | `V` | read its text full screen |
| `refile` | `w` | `r` | refile it (type to filter the targets) |
| `archive` | `$` | `A` | archive it (asks first) |
| `kill` | `C-k` | `d` | delete it (asks first) |
| `move` | `v` | – | open the move sheet (▲ ▼ ◀ ▶) |
| `move-down` | `J`, `M-<down>` | `M-<down>` | move it down past the next heading |
| `move-up` | `K`, `M-<up>` | `M-<up>` | move it up past the previous heading |
| `promote` | `H`, `M-S-<left>` | `M-S-<left>` | move it out of its parent |
| `demote` | `L`, `M-S-<right>` | `M-S-<right>` | move it under the heading above |
| `clock-in` | `i` | `I` | clock in now |
| `clock-in-at` | `I` | – | clock in at a time you pick |
| `clock-out` | `o` | `O`, `o` | clock out now, from whatever task is running |
| `clock-out-at` | `O` | – | clock out at a time you pick |
| `clock-cancel` | `X` | `X` | discard the running clock (asks first) |
| `clock-goto` | – | `g J` | open the task you're clocked in to |
| `clocks` | `l` | `l` | list the task's clocks, to change or delete one |
| `clock-report` | `R` | – | show or hide the time clocked under a day's or week's agenda |
| `mark` | `m` | `m` | mark it and move down (actions then apply to the marked tasks) |
| `unmark` | `u` | `u` | unmark it and move down |
| `mark-toggle` | `M-m` | `M-m` | mark or unmark it and move down |
| `mark-range` | `M` | `M` | mark everything from the last mark to here |
| `mark-all` | `*` | `*` | mark all |
| `unmark-all` | `U` | `U` | unmark all |
| `add` | `c` | `c` | add a task from the keyboard (a card where each field has its key, Enter adds) |
| `add-under` | `a` | `a` | add a task under this one |
| `add-beside` | `A` | – | add a task beside this one |
| `earlier` | `b` | `H` | go to the previous day (or week, on a week's agenda) |
| `later` | `f` | `L` | go to the next day (or week, on a week's agenda) |
| `earlier-week` | `B` | – | on a day's agenda, go back a week |
| `later-week` | `F` | – | on a day's agenda, go forward a week |
| `today` | `.` | `.` | go to today (or this week, on a week's agenda) |
| `date` | `D` | `J` | pick a date for a day's or week's agenda |
| `widen` | `^` | `^` | zoom out a level (after h) |
| `refresh` | `g` | `g r`, `g R` | reload the list |
| `save-tab` | `T` | – | save this view as a tab, or rename, move or remove a saved one |
| `tab-1` | `1` | `1` | go to the 1st tab |
| `tab-2` | `2` | `2` | go to the 2nd tab |
| `tab-3` | `3` | `3` | go to the 3rd tab |
| `tab-4` | `4` | `4` | go to the 4th tab |
| `tab-5` | `5` | `5` | go to the 5th tab |
| `tab-6` | `6` | `6` | go to the 6th tab |
| `tab-7` | `7` | `7` | go to the 7th tab |
| `tab-8` | `8` | `8` | go to the 8th tab |
| `tab-9` | `9` | `9` | go to the 9th tab |
| `tab-10` | `0` | `0` | go to the 10th tab |
| `box` | `/` | `/`, `:` | go to the box, for a view, a search or any orgwarrior command |
| `command` | `x` | `B` | run a command on this task or the marked ones (done, sched mon…) |
| `help` | `?` | `?` | show this list |
| `preferences` | `P` | `P` | open preferences (theme, light or dark, key hints) |
<!-- /keys -->
