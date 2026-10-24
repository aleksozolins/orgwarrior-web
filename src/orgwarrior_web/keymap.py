"""The page's keys: every action it has a key for, org agenda's keys for
them (the defaults), the presets, and `[web.keys]` on top.

One table: the page dispatches on action names, draws its hints and `?`
from it, and the server checks the config against it at startup, so a
typo stops the server instead of leaving a key that does nothing.

Keys are written as Emacs writes them (`kbd`): `t`, `T`, `C-k`, `M-<down>`,
`M-S-<left>`, `RET`, `SPC`, `<prior>`; a sequence is its keys apart, `d d`
or `C-c C-s`, and a word of plain characters is one key a character (`dd`
is `d d`, as in Emacs).  What's fixed is left out: Esc and Tab, the keys
inside sheets and pickers (org's fast keys, the arrows, y and n), Enter
in a field, Ctrl-Enter; `FIXED` lists them for `?`.
"""

import re
from dataclasses import dataclass


class KeysError(ValueError):
    """A key or [web.keys] entry that can't be used; the message says why."""


@dataclass(frozen=True)
class Action:
    name: str
    group: str
    keys: tuple[str, ...]  # org agenda's, the default
    what: str


def _a(name, group, keys, what):
    return Action(name, group, tuple(keys), what)


# In the order `?` lists them.  The defaults are org agenda's keys where they
# fit; where the page's matter more it differs on purpose (docs/keys.md's
# list): s d schedule and deadline (org's save, day view), w refile (week
# view), j k (go to date), r rename (redo; g still), c a A adding (calendar,
# archive, append), i o now and I O asking (org's I O are now), J K H L
# moving (org agenda can't move subtrees), e edit and E effort (org's e
# effort, E entry text).
ACTIONS = [
    _a("down", "Moving", ["j", "n", "<down>"], "go to the next row (side by side, it opens beside the list)"),
    _a("up", "Moving", ["k", "p", "<up>"], "go to the previous row"),
    _a("open", "Moving", ["RET"], "open the row"),
    _a("quit", "Moving", ["q"], "close the task, or go back (Esc always does this too)"),
    _a("back", "Moving", ["["], "go back (Alt-← too)"),
    _a("forward", "Moving", ["]"], "go forward again (Alt-→ too)"),
    _a("state", "The task", ["t"], "set the state"),
    _a("priority", "The task", [","], "set the priority"),
    _a("priority-up", "The task", ["S-<up>"], "raise the priority"),
    _a("priority-down", "The task", ["S-<down>"], "lower the priority"),
    _a("tags", "The task", [":"], "set the tags"),
    _a("schedule", "The task", ["s"], "set the scheduled date"),
    _a("deadline", "The task", ["d"], "set the deadline"),
    _a("when", "The task", [">"], "set an event's date (its plain timestamp)"),
    _a("effort", "The task", ["E"], "set the effort estimate (clocked time is shown against it)"),
    _a("note", "The task", ["z"], "add a note"),
    _a("history", "The task", ["Z"], "list its notes and state changes, to change or delete one"),
    _a("properties", "The task", ["C"], "list its properties, to change, delete or add one"),
    _a("outline", "The task", ["h"], "zoom in, showing its file's tree from that heading down, like org's narrowing"),
    _a("rename", "The task", ["r"], "rename it"),
    _a("edit", "The task", ["e"], "edit its text"),
    _a("read", "The task", ["V"], "read its text full screen"),
    _a("refile", "The task", ["w"], "refile it (type to filter the targets)"),
    _a("archive", "The task", ["$"], "archive it (asks first)"),
    _a("kill", "The task", ["C-k"], "delete it (asks first)"),
    _a("move", "Moving it", ["v"], "open the move sheet (▲ ▼ ◀ ▶)"),
    _a("move-down", "Moving it", ["J", "M-<down>"], "move it down past the next heading"),
    _a("move-up", "Moving it", ["K", "M-<up>"], "move it up past the previous heading"),
    _a("promote", "Moving it", ["H", "M-S-<left>"], "move it out of its parent"),
    _a("demote", "Moving it", ["L", "M-S-<right>"], "move it under the heading above"),
    _a("clock-in", "Clocking", ["i"], "clock in now"),
    _a("clock-in-at", "Clocking", ["I"], "clock in at a time you pick"),
    _a("clock-out", "Clocking", ["o"], "clock out now, from whatever task is running"),
    _a("clock-out-at", "Clocking", ["O"], "clock out at a time you pick"),
    _a("clock-cancel", "Clocking", ["X"], "discard the running clock (asks first)"),
    _a("clock-goto", "Clocking", [], "open the task you're clocked in to"),
    _a("clocks", "Clocking", ["l"], "list the task's clocks, to change or delete one"),
    _a("clock-report", "Clocking", ["R"], "show or hide the time clocked under a day's or week's agenda"),
    _a("mark", "Marks", ["m"], "mark it and move down (actions then apply to the marked tasks)"),
    _a("unmark", "Marks", ["u"], "unmark it and move down"),
    _a("mark-toggle", "Marks", ["M-m"], "mark or unmark it and move down"),
    _a("mark-range", "Marks", ["M"], "mark everything from the last mark to here"),
    _a("mark-all", "Marks", ["*"], "mark all"),
    _a("unmark-all", "Marks", ["U"], "unmark all"),
    _a("add", "Adding", ["c"], "add a task from the keyboard (a card where each field has its key, Enter adds)"),
    _a("add-under", "Adding", ["a"], "add a task under this one"),
    _a("add-beside", "Adding", ["A"], "add a task beside this one"),
    _a("earlier", "Views", ["b"], "go to the previous day (or week, on a week's agenda)"),
    _a("later", "Views", ["f"], "go to the next day (or week, on a week's agenda)"),
    _a("earlier-week", "Views", ["B"], "on a day's agenda, go back a week"),
    _a("later-week", "Views", ["F"], "on a day's agenda, go forward a week"),
    _a("today", "Views", ["."], "go to today (or this week, on a week's agenda)"),
    _a("date", "Views", ["D"], "pick a date for a day's or week's agenda"),
    _a("widen", "Views", ["^"], "zoom out a level (after h)"),
    _a("refresh", "Views", ["g"], "reload the list"),
    _a("save-tab", "Views", ["T"], "save this view as a tab, or rename, move or remove a saved one"),
    *[_a(f"tab-{n}", "Views", [str(n % 10)], f"go to the {n}{'st' if n == 1 else 'nd' if n == 2 else 'rd' if n == 3 else 'th'} tab")
      for n in range(1, 11)],
    _a("box", "The page", ["/"], "go to the box, for a view, a search or any orgwarrior command"),
    _a("command", "The page", ["x"], "run a command on this task or the marked ones (done, sched mon…)"),
    _a("help", "The page", ["?"], "show this list"),
    _a("preferences", "The page", ["P"], "open preferences (theme, light or dark, key hints)"),
]
BY_NAME = {a.name: a for a in ACTIONS}

# Always these, whatever the table says (shown by `?` after the actions).
FIXED = [
    ("ESC", "cancel or close what you're in: a field, a sheet, a form, the open task, the cursor"),
    ("TAB", "in a file, fold or unfold; in an agenda, show the task in its file"),
    ("S-TAB", "in a file, fold or unfold everything"),
    ("← → ↑ ↓, h l k j", "between choices in a sheet"),
    ("a letter, SPC", "in a picker, pick that choice (org's fast keys), or none"),
    ("y / n", "answer yes or no"),
    ("C-RET", "save the form or sheet you're in"),
    ("help", "type in the box (/) to list every command, or help dates for one topic"),
]

# A preset: action -> its keys, replacing that action's defaults ([]: none);
# the rest keep theirs.  Each says where its keys come from.
PRESETS = {
    # evil-collection's org-agenda map (modes/org-agenda/evil-collection-org-agenda.el,
    # evil-collection 2026-09-27; its theme keys from evil-collection.el's
    # table), for every action the page has.  An action it has no key for
    # keeps the page's, unless evil-collection uses that key itself (alone or
    # as the start of a sequence); then org's own key for it, else none.  Two
    # from vim: : and / open the box, C-o and C-i go back and forward (vim's
    # jump list: evil-collection's [[ and ]] jump between blocks).
    "evil": {
        "down": ["j", "g j", "C-j", "<down>"],   # org-agenda-next-line; next-item (gj, C-j)
        "up": ["k", "g k", "C-k", "<up>"],       # org-agenda-previous-line; previous-item
        "quit": ["q", "Z Z", "Z Q", "x"],        # org-agenda-quit (q, ZZ); -exit (ZQ, x)
        "back": ["C-o"],                         # vim's jump list
        "forward": ["C-i"],
        "priority": ["p"],                       # org-agenda-priority
        "tags": ["T"],                           # org-agenda-set-tags
        "schedule": ["s"],                       # org-agenda-schedule
        "deadline": ["D"],                       # org-agenda-deadline
        "note": ["n"],                           # org-agenda-add-note
        "history": [],                           # Z starts its Z Z, Z Q
        "rename": ["R"],                         # its rename key in other modes (r R): r is refile here
        "refile": ["r"],                         # org-agenda-refile
        "archive": ["A"],                        # org-agenda-archive
        "kill": ["d"],                           # org-agenda-kill (its delete key; asks first)
        "move": [],                              # v starts its v d, v w, v m, v y
        "move-down": ["M-<down>"],               # org's: J is its go to date
        "move-up": ["M-<up>"],                   # org's (K dropped too, to keep the pair)
        "promote": ["M-S-<left>"],               # org's: H is its earlier
        "demote": ["M-S-<right>"],               # org's: L is its later
        "clock-in": ["I"],                       # org-agenda-clock-in
        "clock-in-at": [],                       # I clocks in now: the toast's Adjust instead
        "clock-out": ["O", "o"],                 # org-agenda-clock-out
        "clock-out-at": [],                      # O clocks out now: the toast's Adjust instead
        "clock-cancel": ["X"],                   # org-agenda-clock-cancel
        "clock-goto": ["g J"],                   # org-agenda-clock-goto
        "clock-report": [],                      # R is rename (above)
        "add-beside": [],                        # A is its archive
        "earlier": ["H"],                        # org-agenda-earlier
        "later": ["L"],                          # org-agenda-later
        "earlier-week": [],                      # B is its bulk action
        "later-week": [],                        # F is its filters off
        "date": ["J"],                           # org-agenda-goto-date (its jump key)
        "refresh": ["g r", "g R"],               # org-agenda-redo, -redo-all
        "save-tab": [],                          # T is its tags
        "box": ["/", ":"],                       # vim's search and command line
        "command": ["B"],                        # org-agenda-bulk-action: the box, for the marked
    },
}

# What evil-collection binds that the page has nothing for (docs/keys.md, `?`'s note).
EVIL_UNMATCHED = ("SPC (show the entry), S (save all), v d v w v m v y (day, week, month, year view), "
                  "f F (filter by tag, filters off), S-RET g o (open a link), [[ ]] (between blocks)")


# ---- Key syntax: Emacs's kbd, written back in one canonical form ----

NAMED = {"RET": "RET", "<return>": "RET", "SPC": "SPC", "TAB": "TAB", "<tab>": "TAB",
         "ESC": "ESC", "<escape>": "ESC", "DEL": "DEL", "<backspace>": "DEL",
         "<delete>": "<delete>", "<insert>": "<insert>", "<home>": "<home>", "<end>": "<end>",
         "<prior>": "<prior>", "<pageup>": "<prior>", "<next>": "<next>", "<pagedown>": "<next>",
         **{f"<{d}>": f"<{d}>" for d in ("up", "down", "left", "right")},
         **{f"<f{n}>": f"<f{n}>" for n in range(1, 13)}}
MODS = {"C": "C-", "M": "M-", "S": "S-", "s": "s-"}
MOD_ORDER = "CMSs"  # Emacs's order: C-M-S-s-

# Keys the browser keeps (a page can't stop them) and the page's own.
BROWSER_KEEPS = {"C-n", "C-t", "C-w", "C-q", "C-S-n", "C-S-t", "C-S-w", "C-S-q", "C-TAB", "C-S-TAB",
                 "C-<prior>", "C-<next>", "s-q", "s-w", "s-t", "s-n", "M-<f4>"}
PAGE_KEEPS = {"ESC", "TAB", "S-TAB"}


def parse_key(word: str) -> str:
    """One key (`C-k`, `M-S-<left>`, `T`) in its canonical form."""
    mods, rest = set(), word
    while len(rest) > 2 and rest[1] == "-" and rest[0] in MODS:
        if rest[0] in mods:
            raise KeysError(f"{word!r} has {rest[0]}- twice")
        mods.add(rest[0])
        rest = rest[2:]
    if rest in NAMED:
        base = NAMED[rest]
    elif len(rest) == 1 and rest.isprintable() and rest != " ":
        base = rest
        # A letter with C- or M- is the key, Shift apart (M-H is M-S-h); a
        # character alone is as typed (T, $), S- with one folded into it.
        if rest.isalpha() and rest.isupper() and mods & {"C", "M", "s"}:
            base, mods = rest.lower(), mods | {"S"}
        elif "S" in mods and not mods & {"C", "M", "s"}:
            if not rest.isalpha():
                raise KeysError(f"{word!r}: write the character Shift makes (like T or $), not S-")
            base, mods = rest.upper(), mods - {"S"}
    else:
        raise KeysError(f"{word!r} isn't a key. Write a character, RET SPC TAB ESC DEL, or a name "
                        "like <down> or <f5>, with C- M- S- s- in front if you want them")
    return "".join(MODS[m] for m in MOD_ORDER if m in mods) + base


def parse_sequence(spec: str) -> str:
    """A key or a sequence (`d d`, `dd`, `C-c C-s`), canonical: its keys apart."""
    words = spec.split()
    if not words:
        raise KeysError("a key can't be empty")
    keys = []
    for w in words:
        # A word of plain characters is one key a character, as kbd reads it.
        if w not in NAMED and not re.match(r"^([CMSs]-)+.", w) and len(w) > 1 and not w.startswith("<"):
            keys.extend(parse_key(c) for c in w)
        else:
            keys.append(parse_key(w))
    seq = " ".join(keys)
    for i, k in enumerate(keys):
        if k in PAGE_KEEPS:
            raise KeysError(f"{spec!r} uses {k}, which the page keeps for itself (Esc always cancels, Tab moves and folds)")
        if k in BROWSER_KEEPS:
            raise KeysError(f"{spec!r} uses {k}, which the browser keeps for itself")
    if len(keys) > 3:
        raise KeysError(f"{spec!r} is too long. A sequence can be three keys at most")
    return seq


def _keys_of(value, where: str) -> list[str]:
    """A config value, one key (a string) or several (a list; [] for none), as sequences."""
    if isinstance(value, str):
        specs = [value] if value.strip() else []
    elif isinstance(value, list) and all(isinstance(v, str) for v in value):
        specs = value
    else:
        raise KeysError(f'{where} has to be a key ("t"), a list of them (["t", "C-c C-t"]), or [] for none')
    try:
        return list(dict.fromkeys(parse_sequence(s) for s in specs))
    except KeysError as e:
        raise KeysError(f"{where}: {e}") from None


def _layer(table: dict, where: str) -> dict[str, list[str]]:
    """TABLE (action -> keys), checked: known actions, real keys, no key twice."""
    out, seen = {}, {}
    for name, value in table.items():
        if name not in BY_NAME:
            near = [a for a in BY_NAME if a.startswith(name[:3])][:3]
            raise KeysError(f"{where}: there's no action {name!r}" + (f". Did you mean {', '.join(near)}?" if near else ""))
        keys = _keys_of(value, f"{where} {name}")
        for i, k in enumerate(keys):
            for o in keys[i + 1:]:
                if _clashes(k, o):
                    raise KeysError(f"{where} {name}: {k!r} and {o!r} can't both be keys, since one starts the other")
        for k in keys:
            for other, theirs in seen.items():
                for o in theirs:
                    if o == k or o.startswith(k + " ") or k.startswith(o + " "):
                        raise KeysError(f"{where}: {k!r} ({name}) and {o!r} ({other}) "
                                        + ("are the same key on two actions" if o == k else "clash, since one starts the other"))
        seen[name] = keys
        out[name] = keys
    return out


def _clashes(a: str, b: str) -> bool:
    return a == b or a.startswith(b + " ") or b.startswith(a + " ")


def resolve(config: dict | None) -> dict:
    """The keys in effect: the defaults, then the preset, then the config's
    own ([web.keys]), each later one taking its keys from the earlier ones
    (a key, or the start of a sequence, the later one uses).  For the page:
    {"preset", "actions": [{name, group, what, keys, org}]}, keys and org
    (the defaults, for `?` to mark what's changed) as canonical sequences."""
    config = dict(config or {})
    preset = config.pop("preset", None)
    if preset is not None and preset not in PRESETS:
        raise KeysError(f"[web.keys] preset {preset!r} doesn't exist. The presets are: {', '.join(PRESETS)}")
    keys = {a.name: [parse_sequence(k) for k in a.keys] for a in ACTIONS}
    layers = ([(_layer(PRESETS[preset], f"preset {preset}"), f"preset {preset}")] if preset else []) \
        + [(_layer(config, "[web.keys]"), "[web.keys]")]
    for layer, _ in layers:
        taken = [k for ks in layer.values() for k in ks]
        for name in keys:
            if name not in layer:
                keys[name] = [k for k in keys[name] if not any(_clashes(k, t) for t in taken)]
        keys.update(layer)
    return {"preset": preset,
            "actions": [{"name": a.name, "group": a.group, "what": a.what, "keys": keys[a.name],
                         "org": [parse_sequence(k) for k in a.keys]} for a in ACTIONS],
            "fixed": FIXED,
            **({"unmatched": EVIL_UNMATCHED} if preset == "evil" else {})}


def readme_table() -> str:
    """docs/keys.md's table of actions: `python -m orgwarrior_web.keymap`
    prints it, and a test keeps the page's in step."""
    org, evil = resolve({}), {a["name"]: a["keys"] for a in resolve({"preset": "evil"})["actions"]}
    cell = lambda ks: ", ".join(f"`{k}`" for k in ks) or "–"
    rows = ["| action | org (default) | evil | what it does |", "|---|---|---|---|"]
    rows += [f"| `{a['name']}` | {cell(a['keys'])} | {cell(evil[a['name']])} | {a['what'].replace('|', '\\|')} |"
             for a in org["actions"]]
    return "\n".join(rows)


if __name__ == "__main__":
    print(readme_table())
