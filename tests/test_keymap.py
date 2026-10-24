"""keymap.py: the key syntax, the checks on [web.keys], the layers."""

import pytest

from orgwarrior_web import keymap
from orgwarrior_web.keymap import KeysError, parse_sequence, resolve


def keys(table):
    return {a["name"]: a["keys"] for a in table["actions"]}


@pytest.mark.parametrize("spec, canonical", [
    ("t", "t"), ("T", "T"), ("$", "$"), (",", ","), ("-", "-"),
    ("C-k", "C-k"), ("C-K", "C-S-k"), ("M-H", "M-S-h"), ("S-t", "T"),
    ("M-<down>", "M-<down>"), ("M-S-<left>", "M-S-<left>"), ("S-RET", "S-RET"),
    ("<return>", "RET"), ("<pageup>", "<prior>"), ("C--", "C--"),
    ("dd", "d d"), ("d d", "d d"), ("gr", "g r"), ("C-c C-s", "C-c C-s"), ("C-c C-x p", "C-c C-x p"),
])
def test_syntax(spec, canonical):
    assert parse_sequence(spec) == canonical


@pytest.mark.parametrize("spec, says", [
    ("<dwn>", "isn't a key"), ("S-1", "the character Shift makes"), ("C-C-k", "C- twice"),
    ("ESC", "the page keeps for itself"), ("TAB", "the page keeps for itself"), ("C-w", "the browser keeps"),
    ("C-S-t", "the browser keeps"), ("a b c d", "three keys at most"), ("", "empty"),
])
def test_bad_keys(spec, says):
    with pytest.raises(KeysError, match=says):
        parse_sequence(spec)


def test_defaults_are_org_agendas():
    k = keys(resolve({}))
    assert k["state"] == ["t"] and k["priority"] == [","] and k["kill"] == ["C-k"]
    assert k["down"] == ["j", "n", "<down>"] and k["promote"] == ["H", "M-S-<left>"]
    assert k["tab-10"] == ["0"] and k["priority-up"] == ["S-<up>"] and k["clock-cancel"] == ["X"]
    assert k["mark-toggle"] == ["M-m"] and k["clock-goto"] == []  # org's J is move-down here
    # Every default key once: the table can't clash with itself.
    flat = [s for ks in k.values() for s in ks]
    assert len(flat) == len(set(flat))


def test_own_keys_take_theirs_from_the_defaults():
    k = keys(resolve({"state": "s", "kill": ["d d"], "archive": []}))
    assert k["state"] == ["s"] and k["schedule"] == []   # s taken
    assert k["kill"] == ["d d"] and k["deadline"] == []  # d starts d d: taken too
    assert k["archive"] == []


@pytest.mark.parametrize("table, says", [
    ({"kil": "x"}, "no action 'kil'. Did you mean kill"),
    ({"kill": 3}, "a key"),
    ({"kill": "d", "state": "d"}, "the same key on two actions"),
    ({"kill": "d", "state": "d d"}, "one starts the other"),
    ({"kill": ["g", "g r"]}, "one starts the other"),
    ({"preset": "vim"}, "doesn't exist"),
    ({"kill": "C-w"}, r"\[web.keys\] kill: 'C-w' uses C-w, which the browser keeps"),
])
def test_bad_tables(table, says):
    with pytest.raises(KeysError, match=says):
        resolve(table)


def test_evil():
    table = resolve({"preset": "evil"})
    k = keys(table)
    assert table["preset"] == "evil" and "filter by tag" in table["unmatched"]
    # evil-collection-org-agenda.el's own keys.
    assert k["schedule"] == ["s"] and k["deadline"] == ["D"] and k["tags"] == ["T"] and k["priority"] == ["p"]
    assert k["refile"] == ["r"] and k["archive"] == ["A"] and k["kill"] == ["d"] and k["note"] == ["n"]
    assert k["earlier"] == ["H"] and k["later"] == ["L"] and k["date"] == ["J"] and k["refresh"] == ["g r", "g R"]
    assert k["clock-in"] == ["I"] and k["clock-cancel"] == ["X"] and k["clock-goto"] == ["g J"]
    assert k["down"][:2] == ["j", "g j"] and k["command"] == ["B"] and "x" in k["quit"]
    # Its rename key elsewhere; org's for moving (J H L are its).
    assert k["rename"] == ["R"] and k["move-down"] == ["M-<down>"] and k["promote"] == ["M-S-<left>"]
    # The page's, where evil-collection leaves the key alone.
    assert k["effort"] == ["E"] and k["add"] == ["c"] and k["state"] == ["t"]
    # Nothing in effect clashes: no key twice, none the start of another.
    flat = [s for ks in k.values() for s in ks]
    assert len(flat) == len(set(flat))
    assert not [(a, b) for a in flat for b in flat if b.startswith(a + " ")]


def test_evil_then_own():
    k = keys(resolve({"preset": "evil", "save-tab": "S-t", "note": ["n", "z"]}))
    assert k["save-tab"] == ["T"] and k["tags"] == []  # one's own takes T from the preset's tags
    assert k["note"] == ["n", "z"]


def test_every_preset_action_is_one():
    for name, preset in keymap.PRESETS.items():
        assert set(preset) <= set(keymap.BY_NAME), name


def test_readme_table_is_the_tables():
    """docs/keys.md's list of actions is keymap.readme_table()'s, as printed."""
    from pathlib import Path
    readme = (Path(__file__).parents[1] / "docs/keys.md").read_text()
    shown = readme.split("<!-- keys: python -m orgwarrior_web.keymap prints this table -->\n")[1].split("\n<!-- /keys -->")[0]
    assert shown == keymap.readme_table(), "run python -m orgwarrior_web.keymap and paste it into docs/keys.md"


def test_unmatched_says_evil_collections():
    """What the README and ? say evil-collection has that the page doesn't."""
    for key in ("show the entry", "save all", "filter by tag", "between blocks"):
        assert key in keymap.EVIL_UNMATCHED
