"""Notifications through ntfy (ntfy.sh, or a server of one's own): a task
someone sent arriving tells the list's owner, and what they sent changing
state tells them.  The server notices on its own, once a minute, whatever
made the change (the page, the CLI, Emacs, Claude, Syncthing).  A message
is a task's title, its new state and the note written with it, never its
details.  Publishing is one JSON POST: no dependency."""

import datetime
import json
import re
import sys
import threading
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

from orgwarrior.config import ConfigError

from orgwarrior_web.jsonfile import JsonFile

INTERVAL = 60
# An arrival older than this is a task coming back (unarchived, a file
# restored), not news.
FRESH_DAYS = 2


class NotifyError(Exception):
    pass


def options(notify) -> dict:
    """[web.notify], checked: states (beyond the done ones) whose change
    tells the sender."""
    if not isinstance(notify, dict):
        raise ConfigError('[web.notify] has to be a table, like states = ["WAIT"]')
    if unknown := set(notify) - {"states"}:
        raise ConfigError(f"[web.notify] has no key {sorted(unknown)[0]!r}")
    states = notify.get("states", [])
    if not isinstance(states, list) or not all(isinstance(s, str) and s for s in states):
        raise ConfigError('[web.notify] states has to be a list of TODO keywords, like ["WAIT"]')
    return {"states": states}


TOPIC = re.compile(r"[-_A-Za-z0-9]{1,64}")
BAD_TOPIC = ("That isn't a topic. Give its name (letters, digits, - and _), like ow-x7k2q9, "
             "or for a server of your own its whole address, like https://ntfy.example.com/ow-x7k2q9")


def topic_url(text: str) -> str:
    """A topic as typed, its name alone (on ntfy.sh) or its whole address,
    as an address."""
    text = (text or "").strip().rstrip("/")
    if TOPIC.fullmatch(text):
        return f"https://ntfy.sh/{text}"
    topic_parts(text)
    return text


def topic_parts(url: str) -> tuple[str, str]:
    """(server, topic) of a topic's address: https://ntfy.sh/abc is
    ("https://ntfy.sh/", "abc"), where ntfy takes JSON for any topic."""
    parts = urlsplit((url or "").strip())
    path = parts.path.rstrip("/")
    topic = path.rsplit("/", 1)[-1]
    if parts.scheme not in ("http", "https") or not parts.netloc or not TOPIC.fullmatch(topic):
        raise NotifyError(BAD_TOPIC)
    return f"{parts.scheme}://{parts.netloc}{path[:-len(topic)]}", topic


def publish(to: dict, title: str, message: str, click: str | None = None, tags=()):
    """Send one message to TO ({"topic", "token"}); a NotifyError says why not."""
    server, topic = topic_parts(to["topic"])
    body = {"topic": topic, "title": title, "message": message}
    if click:
        body["click"] = click
    if tags:
        body["tags"] = list(tags)
    headers = {"Content-Type": "application/json"}
    if to.get("token"):
        headers["Authorization"] = f"Bearer {to['token']}"
    req = urllib.request.Request(server, json.dumps(body).encode(), headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
    except urllib.error.HTTPError as e:
        try:
            why = json.loads(e.read()).get("error") or e.reason
        except ValueError:
            why = e.reason
        raise NotifyError(f"{urlsplit(server).netloc} refused it: {why}") from None
    except (urllib.error.URLError, OSError) as e:
        raise NotifyError(f"Can't reach {urlsplit(server).netloc}: {getattr(e, 'reason', e)}") from None


class Subscriptions:
    """Where messages go, in notify.json beside tokens.json (0600: a topic's
    name is its password on ntfy.sh, and a token is one): {"owner": {...},
    "senders": {NAME: {...}}}, each {"topic", "token", "link"}, the link
    the page's address as its device knew it.  The owner's is set from a
    full token's page, a sender's from their add token's capture page."""

    def __init__(self, path: Path | None = None):
        self.file = path and JsonFile(path, dict, 0o600)
        self._data = {}

    def load(self) -> dict:
        return self.file.load() if self.file else self._data

    def get(self, sender: str | None) -> dict | None:
        data = self.load()
        return data.get("senders", {}).get(sender) if sender else data.get("owner")

    def set(self, sender: str | None, sub: dict | None):
        data = json.loads(json.dumps(self.load()))
        if sender:
            senders = data.setdefault("senders", {})
            if sub:
                senders[sender] = sub
            else:
                senders.pop(sender, None)
        elif sub:
            data["owner"] = sub
        else:
            data.pop("owner", None)
        if self.file:
            self.file.save(data)
        else:
            self._data = data


def _key(e: dict) -> str:
    # Who sent it and when: neither changes with a rename, a refile or a new state.
    return f"{e['value']}\x1f{e.get('captured') or ''}"


def _fresh(captured: str | None, today: datetime.date) -> bool:
    m = re.match(r"\[(\d{4}-\d\d-\d\d)", captured or "")
    return bool(m) and (today - datetime.date.fromisoformat(m[1])).days <= FRESH_DAYS


def changes(before: dict | None, entries: list[dict], states=(), today: datetime.date | None = None):
    """What happened between snapshot BEFORE and ENTRIES (entries_with's,
    FROM any): (the new snapshot, arrivals, [(entry, old keyword)] for
    entries now done or in STATES).  BEFORE None (the first run): nothing
    happened, it's only noted.  Entries are told apart by sender and
    CAPTURED, then title."""
    today = today or datetime.date.today()
    now: dict[str, list] = {}
    for e in entries:
        now.setdefault(_key(e), []).append(e)
    snapshot = {k: [[e["title"], e["keyword"]] for e in group] for k, group in now.items()}
    if before is None:
        return snapshot, [], []
    arrivals, changed = [], []
    for key, group in now.items():
        old = [list(o) for o in before.get(key, [])]
        pairs, new = [], []
        for e in group:
            match = next((o for o in old if o[0] == e["title"]), None)
            if match:
                old.remove(match)
                pairs.append((e, match[1]))
            else:
                new.append(e)
        # Renamed: one left on each side is the same task.
        if len(new) == len(old) == 1:
            pairs.append((new[0], old[0][1]))
            new = []
        arrivals += [e for e in new[len(old):] if not e["done"] and _fresh(e.get("captured"), today)]
        changed += [(e, was) for e, was in pairs
                    if e["keyword"] and e["keyword"] != was and (e["done"] or e["keyword"] in states)]
    return snapshot, arrivals, changed


class Watcher(threading.Thread):
    """Once a minute, what someone sent (FROM) compared with the snapshot
    in notify-seen.json, and messages for what changed.  The engine is
    asked under the server's lock, as a request would; messages go after."""

    def __init__(self, server, seen: Path | None = None, interval: float = INTERVAL, send=publish):
        super().__init__(daemon=True, name="notify")
        self.server, self.interval, self.send = server, interval, send
        self.seen = seen and JsonFile(seen, lambda: None)
        self._snapshot = None
        self._last_error = None
        self.stop = threading.Event()

    def run(self):
        while not self.stop.wait(self.interval):
            self.check()

    def check(self):
        h = self.server.RequestHandlerClass
        try:
            with self.server.lock:
                before = self.seen.load() if self.seen else self._snapshot
                snapshot, arrivals, changed = changes(before, h.ow.entries_with("FROM", None),
                                                      h.notify["states"])
                if self.seen:
                    self.seen.save(snapshot)
                else:
                    self._snapshot = snapshot
                messages = [m for m in (self.arrival(e) for e in arrivals) if m]
                messages += [m for m in (self.changed(h, e) for e, _ in changed) if m]
            self._last_error = None
        except Exception as e:  # Emacs down: once in the log, not every minute
            if str(e) != self._last_error:
                print(f"notify: {e}", file=sys.stderr)
                self._last_error = str(e)
            return
        for to, args in messages:
            try:
                self.send(to, *args)
            except NotifyError as e:
                print(f"notify: {args[0]!r} not sent: {e}", file=sys.stderr)

    def arrival(self, e: dict):
        """The owner's message for E, sent by someone else."""
        to = self.server.RequestHandlerClass.subscriptions.get(None)
        if not to:
            return None
        return to, (e["title"], f"From {e['value']}", f"{to['link'].rstrip('/')}/#/t/{e['id']}", ["inbox_tray"])

    def changed(self, h, e: dict):
        """The sender's message for E, now in a new state, with the note
        written as it changed (as the logbook has it), if any."""
        to = h.subscriptions.get(e["value"])
        # A revoked add token: they're cut off from this list, messages too.
        if not to or (h.tokens and (h.tokens.load().get(e["value"]) or {}).get("scope") != "add"):
            return None
        note = next((n["text"] for n in h.ow.show(e["id"]).get("notes", [])
                     if n.get("state") == e["keyword"]), None)
        who = f"{h.name} marked it" if h.name else "Marked"
        text = f"{who} {e['keyword']}." + (f"\n\n{note}" if note else "")
        return to, (e["title"], text, to["link"], ["white_check_mark"] if e["done"] else [])
