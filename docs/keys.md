# Keys of your own

The keys are org agenda's where they fit. Where the page's own
use matters more they differ on purpose, so an org user knows what to
expect:

| key | org agenda | here | why |
|---|---|---|---|
| `s` `d` | save all, day view | schedule, deadline | dates in one key (org's are `C-c C-s`, `C-c C-d`); nothing to save, the day is a tab |
| `w` | week view | refile | refile is frequent; the week is a tab |
| `j` `k` | go to date | down, up | as vim and most lists; `D` picks the date |
| `r` | refresh | rename | `g` refreshes, as in org |
| `c` `a` `A` | calendar, archive, append | add; add under, beside | adding matters more here; `$` archives, as in org |
| `i` `o` / `I` `O` | `I` `O` clock in, out now | now / at a time | lower case acts, upper case asks; `I` then Enter is still now |
| `J` `K` `H` `L` | clock goto, –, holidays, recenter | move the subtree | org agenda moves no subtrees; `M-↓` `M-↑` as org |
| `e` `E` | effort, entry text | edit the text, effort | editing is the common one |

`[web.keys]`, in the same config, changes them: a preset, then keys of
your own over it.

```toml
[web.keys]
preset = "evil"            # evil-collection's agenda keys (below)
kill = "C-d"               # a key
note = ["z", "C-c C-z"]    # several
archive = []               # none
```

- Keys are written as Emacs writes them: `t`, `T`, `$`, `C-k` (Ctrl),
  `M-<down>` (Alt, Option on a Mac), `s-k` (Cmd or Super), `M-S-<left>`,
  `RET`, `SPC`, `DEL`, `<prior>` (Page Up), `<f5>`. A sequence is its keys
  apart, `d d` or `C-c C-s`, three at most; a word of plain characters is
  a key a character, as in Emacs (`dd` is `d d`).
- A key you give an action replaces that action's keys, and takes the key
  from whichever action had it: `state = "s"` leaves schedule without one
  until you give it one. A key that starts a sequence of yours is taken
  too (`kill = "d d"` takes `d` from deadline).
- Checked at startup: an unknown action, a key that doesn't read as one,
  one key on two of your actions, or a key the browser keeps for itself
  (Ctrl-W, Ctrl-T, Ctrl-N) stops the server and says which.
- While a sequence is under way its keys so far show in the corner
  (`d …`); Esc, a click or a key that goes nowhere ends it.
- `?` lists every action with the keys in effect, those that aren't
  org's marked ·, and those without a key as –. The hints on the page
  show the keys in effect too.
- Not rebindable: Esc and Tab, the keys inside sheets and pickers (org's
  fast keys from your `#+TODO` and `#+TAGS`, the arrows, `y` and `n`),
  Enter in a field, Ctrl-Enter. Text boxes stay plain editing under any
  preset: no modal editing.
- For the instance (every device using it), not per device.
- `clock-goto` (open the task clocked in) has no key by default: org
  agenda's `J` moves down here, and the clock's strip opens it.

### The evil preset

The bindings come from
[evil-collection](https://github.com/emacs-evil/evil-collection)'s org
agenda keys: `modes/org-agenda/evil-collection-org-agenda.el` (the
evil-collection of 2026-09-27), its theme keys (`g r`, `Z Z`, `d`…) as its
`evil-collection.el` sets them. Every action the page has takes
evil-collection's key: `t` state, `s` schedule, `D` deadline, `T` tags, `p`
priority, `r` refile, `n` note, `A` archive, `d` kill (it asks), `H`/`L`
earlier and later, `J` go to a date, `I`/`O` clock in and out, `X` discard
the clock, `g J` the task clocked in, `m`/`u` mark, `B` the box for the
marked (its bulk action), `g r` refresh, `q`/`Z Z`/`x` quit, `j`/`k`,
`g j`/`g k`, `C-j`/`C-k` move. Where evil-collection has no key for an
action the page's key stays, unless evil-collection uses that key itself;
then org's own key for it, else none:

- Rename is `R`, evil-collection's rename key in its other modes (`r` is
  refile here).
- Moving is org's: `M-↓` `M-↑` `M-S-←` `M-S-→` (`J` `H` `L` are its date
  keys; `K` goes too, to keep the pair).
- From vim: `:` and `/` open the box; `C-o` and `C-i` go back and forward
  (vim's jump list: evil-collection's `[[` `]]` jump between blocks).

Under evil these have no key (give them one in `[web.keys]`): `history`
(`Z` starts `Z Z`), `move` (`v` starts its `v d`, `v w`…), `clock-in-at` and
`clock-out-at` (`I` and `O` act now; the toast's Adjust sets the time),
`clock-report` (`R` is rename; Preferences still has it), `add-beside` (`A`
is archive), `earlier-week` and `later-week` (`B` and `F` are its),
`save-tab` (`T` is tags; ＋ still does it).

What evil-collection binds that the page has nothing for: `SPC` (show the
entry), `S` (save all), `v d` `v w` `v m` `v y` (day, week, month, year
view), `f` `F` (filter by tag, filters off), `S-RET` `g o` (open a link),
`[[` `]]` (between blocks).

### Every action

<!-- keys: python -m orgwarrior_web.keymap prints this table -->
| action | org (default) | evil | what it does |
|---|---|---|---|
| `down` | `j`, `n`, `<down>` | `j`, `g j`, `C-j`, `<down>` | the next row (side by side: shown beside) |
| `up` | `k`, `p`, `<up>` | `k`, `g k`, `C-k`, `<up>` | the row before |
| `open` | `RET` | `RET` | open the row |
| `quit` | `q` | `q`, `Z Z`, `Z Q`, `x` | close the task, else back (Esc too, always) |
| `back` | `[` | `C-o` | back through what was shown (Alt-← too) |
| `forward` | `]` | `C-i` | forward again (Alt-→ too) |
| `state` | `t` | `t` | state |
| `priority` | `,` | `p` | priority |
| `priority-up` | `S-<up>` | `S-<up>` | priority up a step |
| `priority-down` | `S-<down>` | `S-<down>` | priority down a step |
| `tags` | `:` | `T` | tags |
| `schedule` | `s` | `s` | schedule |
| `deadline` | `d` | `D` | deadline |
| `effort` | `E` | `E` | effort: the estimate, clocked time shown against it |
| `note` | `z` | `n` | add a note |
| `history` | `Z` | – | its notes and history: change or delete one |
| `properties` | `C` | `C` | its properties: change, delete or add one |
| `outline` | `h` | `h` | zoom into it: its file's tree from there down, as org's narrowing |
| `rename` | `r` | `R` | rename |
| `edit` | `e` | `e` | edit its text |
| `read` | `V` | `V` | read its text full screen |
| `refile` | `w` | `r` | refile (type to filter) |
| `archive` | `$` | `A` | archive (asks first) |
| `kill` | `C-k` | `d` | kill (asks first) |
| `move` | `v` | – | move: a sheet of ▲ ▼ ◀ ▶ |
| `move-down` | `J`, `M-<down>` | `M-<down>` | down past the next heading |
| `move-up` | `K`, `M-<up>` | `M-<up>` | up past the one before |
| `promote` | `H`, `M-S-<left>` | `M-S-<left>` | out of its parent |
| `demote` | `L`, `M-S-<right>` | `M-S-<right>` | into the heading above |
| `clock-in` | `i` | `I` | clock in now |
| `clock-in-at` | `I` | – | clock in at a time |
| `clock-out` | `o` | `O`, `o` | clock out now (the clock running, wherever it is) |
| `clock-out-at` | `O` | – | clock out at a time |
| `clock-cancel` | `X` | `X` | discard the running clock (asks first) |
| `clock-goto` | – | `g J` | open the task clocked in |
| `clocks` | `l` | `l` | the task's clocks: change or delete one |
| `clock-report` | `R` | – | under a day's or week's agenda: what was clocked, on or off |
| `mark` | `m` | `m` | mark, moving down; actions go to the marked |
| `unmark` | `u` | `u` | unmark, moving down |
| `mark-toggle` | `M-m` | `M-m` | mark or unmark, moving down |
| `mark-range` | `M` | `M` | mark from the last mark to here: a range |
| `mark-all` | `*` | `*` | mark all |
| `unmark-all` | `U` | `U` | unmark all |
| `add` | `c` | `c` | add by keys: a card, then each field by its key, Enter adds |
| `add-under` | `a` | `a` | the same card, the new task under this one |
| `add-beside` | `A` | – | the same card, the new task beside this one |
| `earlier` | `b` | `H` | a day's agenda: the day before; a week's: the week before |
| `later` | `f` | `L` | the day after (a week's: the week after) |
| `earlier-week` | `B` | – | a day's agenda: a week back |
| `later-week` | `F` | – | a day's agenda: a week on |
| `today` | `.` | `.` | today (on a week's agenda, this week) |
| `date` | `D` | `J` | a day's or week's agenda: pick the date |
| `widen` | `^` | `^` | out of a zoom (h), a level up |
| `refresh` | `g` | `g r`, `g R` | refresh |
| `save-tab` | `T` | – | this view as a tab; on a saved tab, rename, move or remove it |
| `tab-1` | `1` | `1` | the 1st tab |
| `tab-2` | `2` | `2` | the 2nd tab |
| `tab-3` | `3` | `3` | the 3rd tab |
| `tab-4` | `4` | `4` | the 4th tab |
| `tab-5` | `5` | `5` | the 5th tab |
| `tab-6` | `6` | `6` | the 6th tab |
| `tab-7` | `7` | `7` | the 7th tab |
| `tab-8` | `8` | `8` | the 8th tab |
| `tab-9` | `9` | `9` | the 9th tab |
| `tab-10` | `0` | `0` | the 10th tab |
| `box` | `/` | `/`, `:` | the box: a view, a search, any orgwarrior command |
| `command` | `x` | `B` | the box, for this task (or the marked): done, sched mon… |
| `help` | `?` | `?` | this list |
| `preferences` | `P` | `P` | preferences: theme, light or dark, key hints |
<!-- /keys -->
