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
    _a("down", "Moving", ["j", "n", "<down>"], "the next row (side by side: shown beside)"),
    _a("up", "Moving", ["k", "p", "<up>"], "the row before"),
    _a("open", "Moving", ["RET"], "open the row"),
    _a("quit", "Moving", ["q"], "close the task, else back (Esc too, always)"),
    _a("back", "Moving", ["["], "back through what was shown (Alt-← too)"),
    _a("forward", "Moving", ["]"], "forward again (Alt-→ too)"),
    _a("state", "The task", ["t"], "state"),
    _a("priority", "The task", [","], "priority"),
    _a("priority-up", "The task", ["S-<up>"], "priority up a step"),
    _a("priority-down", "The task", ["S-<down>"], "priority down a step"),
    _a("tags", "The task", [":"], "tags"),
    _a("schedule", "The task", ["s"], "schedule"),
    _a("deadline", "The task", ["d"], "deadline"),
    _a("effort", "The task", ["E"], "effort: the estimate, clocked time shown against it"),
    _a("note", "The task", ["z"], "add a note"),
    _a("history", "The task", ["Z"], "its notes and history: change or delete one"),
    _a("properties", "The task", ["C"], "its properties: change, delete or add one"),
    _a("outline", "The task", ["h"], "zoom into it: its file's tree from there down, as org's narrowing"),
    _a("rename", "The task", ["r"], "rename"),
    _a("edit", "The task", ["e"], "edit its text"),
    _a("read", "The task", ["V"], "read its text full screen"),
    _a("refile", "The task", ["w"], "refile (type to filter)"),
    _a("archive", "The task", ["$"], "archive (asks first)"),
    _a("kill", "The task", ["C-k"], "kill (asks first)"),
    _a("move", "Moving it", ["v"], "move: a sheet of ▲ ▼ ◀ ▶"),
    _a("move-down", "Moving it", ["J", "M-<down>"], "down past the next heading"),
    _a("move-up", "Moving it", ["K", "M-<up>"], "up past the one before"),
    _a("promote", "Moving it", ["H", "M-S-<left>"], "out of its parent"),
    _a("demote", "Moving it", ["L", "M-S-<right>"], "into the heading above"),
    _a("clock-in", "Clocking", ["i"], "clock in now"),
    _a("clock-in-at", "Clocking", ["I"], "clock in at a time"),
    _a("clock-out", "Clocking", ["o"], "clock out now (the clock running, wherever it is)"),
    _a("clock-out-at", "Clocking", ["O"], "clock out at a time"),
    _a("clock-cancel", "Clocking", ["X"], "discard the running clock (asks first)"),
    _a("clock-goto", "Clocking", [], "open the task clocked in"),
    _a("clocks", "Clocking", ["l"], "the task's clocks: change or delete one"),
    _a("clock-report", "Clocking", ["R"], "under a day's or week's agenda: what was clocked, on or off"),
    _a("mark", "Marks", ["m"], "mark, moving down; actions go to the marked"),
    _a("unmark", "Marks", ["u"], "unmark, moving down"),
    _a("mark-toggle", "Marks", ["M-m"], "mark or unmark, moving down"),
    _a("mark-range", "Marks", ["M"], "mark from the last mark to here: a range"),
    _a("mark-all", "Marks", ["*"], "mark all"),
    _a("unmark-all", "Marks", ["U"], "unmark all"),
    _a("add", "Adding", ["c"], "add by keys: a card, then each field by its key, Enter adds"),
    _a("add-under", "Adding", ["a"], "the same card, the new task under this one"),
    _a("add-beside", "Adding", ["A"], "the same card, the new task beside this one"),
    _a("earlier", "Views", ["b"], "a day's agenda: the day before; a week's: the week before"),
    _a("later", "Views", ["f"], "the day after (a week's: the week after)"),
    _a("earlier-week", "Views", ["B"], "a day's agenda: a week back"),
    _a("later-week", "Views", ["F"], "a day's agenda: a week on"),
    _a("today", "Views", ["."], "today (on a week's agenda, this week)"),
    _a("date", "Views", ["D"], "a day's or week's agenda: pick the date"),
    _a("widen", "Views", ["^"], "out of a zoom (h), a level up"),
    _a("refresh", "Views", ["g"], "refresh"),
    _a("save-tab", "Views", ["T"], "this view as a tab; on a saved tab, rename, move or remove it"),
    *[_a(f"tab-{n}", "Views", [str(n % 10)], f"the {n}{'st' if n == 1 else 'nd' if n == 2 else 'rd' if n == 3 else 'th'} tab")
      for n in range(1, 11)],
    _a("box", "The page", ["/"], "the box: a view, a search, any orgwarrior command"),
    _a("command", "The page", ["x"], "the box, for this task (or the marked): done, sched mon…"),
    _a("help", "The page", ["?"], "this list"),
    _a("preferences", "The page", ["P"], "preferences: theme, light or dark, key hints"),
]
BY_NAME = {a.name: a for a in ACTIONS}

# Always these, whatever the table says (shown by `?` after the actions).
FIXED = [
    ("ESC", "cancel, close: a field, a sheet, a form, the open task, the cursor"),
    ("TAB", "in a file: fold or unfold; in an agenda: the task in its file"),
    ("S-TAB", "in a file: fold or unfold everything"),
    ("← → ↑ ↓, h l k j", "between choices in a sheet"),
    ("a letter, SPC", "in a picker: that choice (org's fast keys); none"),
    ("y / n", "yes or no, in a question"),
    ("C-RET", "save the form or sheet you're in"),
    ("help", "in the box (/): every command it takes, help dates for one"),
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
            raise KeysError(f"{word!r}: {rest[0]}- twice")
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
                raise KeysError(f"{word!r}: write the character Shift makes, not S-")
            base, mods = rest.upper(), mods - {"S"}
    else:
        raise KeysError(f"{word!r} isn't a key: a character, RET SPC TAB ESC DEL, or <down> <f5>…, "
                        "after C- M- S- s- if any")
    return "".join(MODS[m] for m in MOD_ORDER if m in mods) + base


def parse_sequence(spec: str) -> str:
    """A key or a sequence (`d d`, `dd`, `C-c C-s`), canonical: its keys apart."""
    words = spec.split()
    if not words:
        raise KeysError("an empty key")
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
            raise KeysError(f"{spec!r}: {k} is the page's own (Esc always cancels, Tab moves and folds)")
        if k in BROWSER_KEEPS:
            raise KeysError(f"{spec!r}: the browser keeps {k}; a page can't have it")
    if len(keys) > 3:
        raise KeysError(f"{spec!r}: three keys at most")
    return seq


def _keys_of(value, where: str) -> list[str]:
    """A config value, one key (a string) or several (a list; [] for none), as sequences."""
    if isinstance(value, str):
        specs = [value] if value.strip() else []
    elif isinstance(value, list) and all(isinstance(v, str) for v in value):
        specs = value
    else:
        raise KeysError(f'{where}: a key ("t"), or a list of them (["t", "C-c C-t"]; [] for none)')
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
            raise KeysError(f"{where}: no action {name!r}" + (f" (there's {', '.join(near)})" if near else ""))
        keys = _keys_of(value, f"{where} {name}")
        for i, k in enumerate(keys):
            for o in keys[i + 1:]:
                if _clashes(k, o):
                    raise KeysError(f"{where} {name}: {k!r} and {o!r}: one starts the other")
        for k in keys:
            for other, theirs in seen.items():
                for o in theirs:
                    if o == k or o.startswith(k + " ") or k.startswith(o + " "):
                        raise KeysError(f"{where}: {k!r} ({name}) and {o!r} ({other}): "
                                        + ("one key, two actions" if o == k else "one starts the other"))
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
        raise KeysError(f"[web.keys] preset: {preset!r} isn't one ({', '.join(PRESETS)})")
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
