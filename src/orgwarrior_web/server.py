"""The HTTP side: a few JSON routes over orgwarrior.api, and the static page."""

import argparse
import dataclasses
import datetime
import hashlib
import ipaddress
import json
import re
import shlex
import ssl
import sys
import threading
import traceback
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, HTTPServer, ThreadingHTTPServer
from importlib.resources import files
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from orgwarrior import cli
from orgwarrior import help as helpmod
from orgwarrior.api import Orgwarrior, OrgwarriorError
from orgwarrior.config import ConfigError

from orgwarrior_web import feed, keymap, notify, setup
from orgwarrior_web.auth import Tokens, default_path, token_main
from orgwarrior_web.jsonfile import JsonFile
from orgwarrior_web.sanitize import sanitize

# Org fills in the fields the page lays out itself: category, time of day,
# the "Scheduled:"-style label, then the heading.  \x1f never occurs in org text.
PREFIX = "%c\x1f%t\x1f%s\x1f"

STATIC = files("orgwarrior_web") / "static"
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
         ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
         ".webmanifest": "application/manifest+json"}

def page_version() -> str:
    """A hash of the page's files, sent with every API answer: a page still
    running code from before an update sees it change and reloads.  Read
    each time, since a page-only change needs no restart."""
    h = hashlib.sha1()
    for f in sorted(STATIC.iterdir(), key=lambda f: f.name):
        if f.is_file():
            h.update(f.name.encode() + b"\0" + f.read_bytes())
    return h.hexdigest()[:12]


# Named per port (orgwarrior_key_22546): browsers keep cookies by host, not
# port, so two instances on one address would replace each other's sign-in.
COOKIE = "orgwarrior_key"
# Chrome's cap, renewed by every page load (/api/views).
COOKIE_AGE = 400 * 24 * 3600


def web_orgwarrior(ow: Orgwarrior) -> Orgwarrior:
    """OW, with the agenda shaped for the page instead of a terminal.  The
    time grid is on for its now line; the page drops the empty hours."""
    ow.config = dataclasses.replace(ow.config, prefix_format=PREFIX, tags="inline",
                                    time_grid=True)
    return ow


def instance_name(ow: Orgwarrior) -> str | None:
    """[web] name: whose list this is ("Sam"), so someone adding to it
    (an add token) knows, and two installed apps tell apart."""
    name = ow.config.web.get("name")
    if name is not None and not (isinstance(name, str) and name.strip()):
        raise ConfigError('[web] name has to be text, saying whose list this is: name = "Sam"')
    return name.strip() if name else None


def key_table(ow: Orgwarrior) -> dict:
    """[web.keys] (a preset, and keys of one's own) over org agenda's: the
    page's keys, checked here so a mistake stops the server, not a key."""
    keys = ow.config.web.get("keys", {})
    if not isinstance(keys, dict):
        raise ConfigError('[web.keys] has to be a table, like preset = "evil" or kill = "d d"')
    try:
        return keymap.resolve(keys)
    except keymap.KeysError as e:
        raise ConfigError(str(e)) from None


def is_file_query(query: str) -> bool:
    """A file's outline (projects.org, projects.org::ID), not an agenda view."""
    return bool(re.fullmatch(r"\S+\.org(::\S+)?", query.strip()))


def tab_row(ow: Orgwarrior) -> list[dict]:
    """The page's tabs, [{"label", "query", "count"}]: [web.tabs] in the
    config (label = anything the query box takes, in order), else
    orgwarrior's views; count, from [web] counts, whether the tab shows how
    many tasks it lists.  Checked at startup, so a typo stops the server,
    not the page."""
    web = ow.config.web
    if unknown := set(web) - {"tabs", "calendar", "name", "keys", "counts", "notify"}:
        raise ConfigError(f"[web] has no key {sorted(unknown)[0]!r}")
    if "tabs" not in web:
        row = [{"label": v, "query": v} for v in ow.views()]
    else:
        tabs = web["tabs"]
        if not isinstance(tabs, dict) or not tabs or not all(
                isinstance(q, str) and q.strip() for q in tabs.values()):
            raise ConfigError('[web.tabs] has to map tab labels to queries, like next = "next"')
        row = [{"label": label, "query": query.strip()} for label, query in tabs.items()]
    counts = web.get("counts", [])
    if not isinstance(counts, list) or not all(isinstance(c, str) for c in counts):
        raise ConfigError('[web] counts has to be a list of tab labels, like counts = ["inbox"]')
    by_label = {t["label"]: t for t in row}
    for label in counts:
        if label not in by_label:
            raise ConfigError(f"[web] counts has {label!r}, which isn't one of the tabs")
        if is_file_query(by_label[label]["query"]):
            raise ConfigError(f"[web] counts has {label!r}, a file's outline: counts are for agenda views")
        by_label[label]["count"] = True
    return row


class SavedTabs:
    """Tabs saved from the page, [{"label", "query"}], after the config's:
    kept in the instance's state directory beside tokens.json, so every device
    of the instance has them (for someone who edits no files), reread when it
    changes.  Not written into config.toml: it's often in a dotfiles repo,
    whose manager would undo it, and the stdlib reads TOML but can't write it.  PATH None: kept
    in memory only (tests)."""

    def __init__(self, path: Path | None = None):
        self.file, self._tabs = path and JsonFile(path, list), []

    def load(self) -> list[dict]:
        return self.file.load() if self.file else self._tabs

    def change(self, op: str, label: str, config: list[dict], query: str | None = None,
               to: str | None = None, step: int = 0, count: bool = False) -> list[dict]:
        """Add (LABEL, QUERY), rename (LABEL to TO), move (LABEL by STEP),
        count (show how many tasks it lists, or not) or remove a saved tab;
        CONFIG's tabs are the config's, not changed here."""
        tabs = [dict(t) for t in self.load()]
        taken = {t["label"] for t in config} | {t["label"] for t in tabs}
        label, to = (label or "").strip(), (to or "").strip()
        at = next((i for i, t in enumerate(tabs) if t["label"] == label), None)
        if op == "add":
            query = (query or "").strip()
            if not label:
                raise OrgwarriorError("A tab needs a label")
            if label in taken:
                raise OrgwarriorError(f"There's a tab {label!r} already")
            if not query:
                raise OrgwarriorError("A tab needs a query")
            tabs.append({"label": label, "query": query})
        elif at is None:
            if label in {t["label"] for t in config}:
                raise OrgwarriorError(f"{label!r} comes from config.toml, so change it there")
            raise OrgwarriorError(f"There's no saved tab {label!r}")
        elif op == "rename":
            if not to:
                raise OrgwarriorError("A tab needs a label")
            if to != label and to in taken:
                raise OrgwarriorError(f"There's a tab {to!r} already")
            tabs[at]["label"] = to
        elif op == "move":
            j = at + (1 if step > 0 else -1)
            if 0 <= j < len(tabs):
                tabs[at], tabs[j] = tabs[j], tabs[at]
        elif op == "remove":
            del tabs[at]
        elif op == "count":
            if is_file_query(tabs[at]["query"]):
                raise OrgwarriorError("A count is for an agenda view, not a file's outline")
            tabs[at]["count"] = bool(count)
        else:
            raise OrgwarriorError(f"{op!r} isn't a change to a tab")
        if self.file:
            self.file.save(tabs)
        else:
            self._tabs = tabs
        return tabs


def url_path(path: str) -> str:
    """PATH without its query: `?key=` must never reach the journal."""
    return urlsplit(path).path


def is_loopback(host: str) -> bool:
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return host == "localhost"


class Handler(BaseHTTPRequestHandler):
    ow: Orgwarrior  # set by make_server
    tabs: list[dict]
    saved_tabs: "SavedTabs"
    calendar: dict  # [web.calendar], checked
    name: str | None  # [web] name
    keys: dict  # keymap.resolve's, [web.keys] over the defaults
    notify: dict  # [web.notify], checked
    subscriptions: notify.Subscriptions
    tokens: Tokens | None  # None: no sign-in at all
    open_without_tokens: bool  # on loopback, until the first token is made
    secure: bool
    who: str | None = None  # the token's name, once signed in
    scope: str = "full"  # the token's scope, once signed in
    cookie_token: str | None = None  # signed in by the cookie, to renew it
    renew: str | None = None  # a Set-Cookie for the response
    page: str | None = None  # page_version(), on API answers
    body: dict | None = None  # a POST's JSON, once read
    MAX_BODY = 4 << 20  # a details text pasted whole is well under this
    # A connection left idle (Safari opens them ahead) or dropped mid-request
    # (a network switch) holds its thread until then.
    timeout = 30

    # One request at a time past the request line: every one goes to the same
    # Emacs, which runs them in turn anyway.
    def do_GET(self):
        with self.server.lock:
            self.guarded(self.get)

    def do_POST(self):
        # Signed in and the body read before the lock: a client sending its
        # body a byte at a time holds only its own thread.
        self.body = None  # never an earlier request's, on a kept-alive connection
        self.guarded(self.read_post)
        if self.body is not None:
            with self.server.lock:
                self.guarded(self.post)

    def guarded(self, method):
        """Run METHOD; an orgwarrior error is the user's to read (400), anything
        else a bug (500, logged).  Either way the page gets JSON."""
        try:
            method(urlsplit(self.path))
        except OrgwarriorError as e:
            # Its reason too: the request line alone left a failing view unexplained.
            print(f"{self.who or '-'} {url_path(self.path)}: {str(e)[:300]!r}", file=sys.stderr)
            self.send_json({"error": str(e)}, 400)
        except (ValueError, KeyError, TypeError) as e:  # a malformed body
            self.send_json({"error": f"The page sent a request the server can't read ({type(e).__name__}: {e})"}, 400)
        except Exception as e:
            traceback.print_exc()
            self.send_json({"error": f"Something went wrong in orgwarrior-web ({type(e).__name__}: {e}). The server's log has the details"}, 500)

    def signed_in(self, scopes=("full",), key: str | None = None) -> bool:
        """Whether the request carries a known token of one of SCOPES (KEY,
        from the URL; the cookie; or `Authorization: Bearer` for other
        clients); sets self.who."""
        if self.tokens is None or (self.open_without_tokens and not self.tokens.path.exists()):
            return True
        token, auth = key, self.headers.get("Authorization", "")
        if not token and auth.startswith("Bearer "):
            token = auth.removeprefix("Bearer ").strip()
        elif not token:
            try:
                jar = SimpleCookie(self.headers.get("Cookie", ""))
                if morsel := jar.get(self.cookie_name):
                    token = self.cookie_token = morsel.value
            except CookieError:
                pass
        found = token and self.tokens.find(token)
        if not found or found[1] not in scopes:
            self.cookie_token = None
            self.wrong_scope = found[1] if found else None  # for refused() to say what it's for
            return False
        self.who, self.scope = found
        return True

    @property
    def cookie_name(self) -> str:
        return f"{COOKIE}_{self.server.server_port}"

    def key_cookie(self, token: str) -> str:
        # SameSite=Strict, and every API call is a same-site fetch; the page
        # itself needs no cookie, so opening a link from elsewhere still works.
        return (f"{self.cookie_name}={token}; Path=/; Max-Age={COOKIE_AGE}; HttpOnly; SameSite=Strict"
                + ("; Secure" if self.secure else ""))

    def device_key(self, token: str) -> tuple[tuple[str, str] | None, str | None]:
        """(name, scope) of TOKEN if it signs a device in, else why not."""
        found = self.tokens and self.tokens.find(token)
        if not found:
            return None, "Unknown or revoked key."
        if found[1] == "calendar":
            return None, "This key opens only the calendar feed."
        if found[1] == "mcp":
            return None, "This key is Claude's: it opens orgwarrior-mcp, not the page."
        return found, None

    def sign_in(self, token: str):
        """`/?key=TOKEN`, the link `token add` prints: set the cookie and go to
        the page, the key out of the address bar and history."""
        found, why = self.device_key(token)
        if why:
            return self.send_body(why.encode(), "text/plain; charset=utf-8", 403)
        self.who = found[0]
        self.send_response(303)
        self.send_header("Location", "/")
        self.send_header("Set-Cookie", self.key_cookie(token))
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    WRONG_SCOPE = {"add": "This key can only add to the inbox (POST /api/add).",
                   "calendar": "This key only opens the calendar feed (/calendar.ics).",
                   "mcp": "This key is for orgwarrior-mcp, not this page."}

    def refused(self):
        # Still 401, whatever the key: the page answers 401 with its sign-in screen.
        why = self.WRONG_SCOPE.get(getattr(self, "wrong_scope", None))
        self.send_json({"error": why or "This device isn't signed in. On the server, "
                        "`orgwarrior-web token add NAME` prints a link. Open it here."}, 401)

    def get(self, url):
        query = parse_qs(url.query)
        if url.path == "/" and "key" in query:
            return self.sign_in(query["key"][0])
        if url.path == "/calendar.ics":
            return self.send_calendar(query.get("key", [None])[0])
        if url.path == "/healthz":
            return self.send_health()
        if url.path == "/ca.crt":
            # Public: a phone fetches it before it trusts the certificate.
            try:
                body = self.ca_file.read_bytes()
            except (OSError, AttributeError):
                return self.send_body(b"No ca.crt beside the server's certificate.", "text/plain; charset=utf-8", 404)
            return self.send_body(body, "application/x-x509-ca-cert")
        if url.path == "/manifest.webmanifest":
            return self.send_manifest()
        if not url.path.startswith("/api/"):
            # The page, its scripts and icons hold nothing of the user's, and
            # browsers fetch the manifest without cookies.
            return self.send_static(url.path)
        if url.path == "/api/views":
            if not self.signed_in(("full", "add")):
                return self.refused()
            if self.cookie_token:
                self.renew = self.key_cookie(self.cookie_token)
            if self.scope == "add":  # nothing of the list's
                return self.send_json({"mode": "add", "name": self.name})
            return self.send_json({"mode": "full", "name": self.name, "tabs": self.all_tabs(),
                                   "default": self.ow.config.default_view,
                                   "views": list(self.ow.config.views),
                                   "colors": self.ow.config.colors, "keymap": self.keys,
                                   **self.ow.keywords()})
        if url.path == "/api/notify":
            if not self.signed_in(("full", "add")):
                return self.refused()
            return self.send_json(self.notify_state())
        if url.path == "/api/sent":
            # An add token's own; open (no tokens), there's no one to ask for.
            if not self.signed_in(("add",)) or self.scope != "add":
                return self.refused()
            return self.send_sent()
        if not self.signed_in():
            return self.refused()
        if url.path == "/api/tags":
            return self.send_json(self.ow.tags())
        if url.path == "/api/refile-targets":
            ids = query.get("ids", [""])[0].split(",")
            targets = self.ow.refile_targets([i for i in ids if i])
            # [refile] usual: the page's first choice, ready for one tap.
            return self.send_json({"targets": targets, "usual": self.ow.usual_target(targets)})
        if url.path == "/api/refile-places":
            ids = query.get("ids", [""])[0].split(",")
            return self.send_json({"places": self.ow.refile_places([i for i in ids if i]),
                                   "new_in": self.ow.config.refile_new_in})
        if url.path == "/api/add-places":
            task, event = self.ow.add_places(), self.ow.add_places(event=True)
            return self.send_json({"task": task["places"], "event": event["places"],
                                   "keywords": task["keywords"]})
        if url.path == "/api/file":
            return self.send_json(self.ow.outline(query.get("f", [""])[0]))
        if url.path == "/api/view":
            return self.send_json(self.ow.view(query.get("q", [""])[0]))
        if url.path == "/api/clock":
            return self.send_json(self.running_clocks())
        if url.path == "/api/counts":
            return self.send_json(self.tab_counts())
        if url.path == "/api/report":
            # The query as the box has it: `clocked week +@phone`.
            return self.send_json(self.ow.report(query.get("q", [""])[0].removeprefix("clocked").strip()))
        if url.path == "/api/props":
            return self.send_json(self.ow.props(query.get("id", [None])[0], query.get("name", [None])[0]))
        if url.path.startswith("/api/task/"):
            task_id = unquote(url.path.removeprefix("/api/task/"))
            # ?html=1: the text as org renders it, for the task page, made safe
            # (someone else's details, raw HTML org passes through).
            if query.get("html") == ["1"]:
                task = self.ow.show(task_id, html=True)
                task["html"] = sanitize(task.get("html", ""))
                return self.send_json(task)
            return self.send_json(self.ow.show(task_id))
        self.send_json({"error": "not found"}, 404)

    def read_post(self, url):
        """Check a POST and read its body into self.body; else answer it."""
        # JSON only: a cross-site page can't send that without a CORS preflight,
        # which this server never answers.
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            return self.send_json({"error": "The server only takes JSON"}, 415)
        if url.path != "/api/sign-in" and not self.signed_in(("full", "add")):
            return self.refused()
        length = int(self.headers.get("Content-Length", 0))
        if not 0 <= length <= self.MAX_BODY:
            return self.send_json({"error": "That's too much to send at once"}, 413)
        self.body = json.loads(self.rfile.read(length) or b"{}")

    def post(self, url):
        body = self.body
        if url.path == "/api/sign-in":
            return self.sign_in_posted(str(body["key"]))
        if url.path == "/api/notify":
            return self.send_json(self.set_notify(body))
        if self.scope == "add":
            return self.add_for(body) if url.path == "/api/add" else self.refused()
        if url.path == "/api/act":
            return self.send_json(self.ow.act(body["ids"], body["verb"], body.get("args", []),
                                              body.get("note"), body.get("new")))
        if url.path == "/api/tabs":
            self.saved_tabs.change(body["op"], body.get("label"), self.tabs, body.get("query"),
                                   body.get("to"), body.get("step", 0), body.get("count", False))
            return self.send_json({"tabs": self.all_tabs()})
        if url.path == "/api/run":
            return self.send_json(self.run_line(body["line"]))
        if url.path == "/api/reorder":
            return self.send_json(self.ow.reorder(body["ids"], body.get("parent"), body.get("file")))
        if url.path == "/api/check":
            return self.send_json(self.ow.check(body["id"], body["n"], body["text"]))
        if url.path == "/api/entry":
            return self.send_json(self.ow.set_entry(body["id"], body["text"], body["old"]))
        if url.path == "/api/clock":
            op, task_id, time = body["op"], body.get("id"), body.get("time")
            if op == "in":
                return self.send_json(self.ow.clock_in(task_id, time))
            if op == "out":
                return self.send_json(self.ow.clock_out(task_id, time))
            if op == "cancel":
                return self.send_json(self.ow.clock_cancel(task_id))
            raise cli.UsageError(f"Not a clock op: {op}")
        if url.path == "/api/clock-edit":
            if body.get("remove"):
                return self.send_json(self.ow.clock_remove(body["id"], body["n"], body.get("old")))
            return self.send_json(self.ow.clock_edit(body["id"], body["n"], body.get("start"),
                                                     body.get("end"), body.get("old")))
        if url.path == "/api/note-edit":
            if body.get("remove"):
                return self.send_json(self.ow.note_remove(body["id"], body["n"], body.get("old")))
            return self.send_json(self.ow.note_edit(body["id"], body["n"], body.get("text", ""), body.get("old")))
        if url.path == "/api/wants-note":
            return self.send_json(self.ow.wants_note(body["ids"], body["verb"]))
        if url.path == "/api/add":
            # Fields from the page's form; "text" (orgwarrior add syntax) for other clients.
            if body.get("event"):
                if "title" in body:
                    return self.send_json(self.ow.add_event(**{k: body[k] for k in (
                        "title", "tags", "when", "body", "to", "under") if body.get(k)}))
                return self.send_json(self.ow.add_event(body["text"]))
            if "title" in body:
                # Keyword "" is a plain heading, not the default.
                return self.send_json(self.ow.add(**{k: body[k] for k in (
                    "title", "keyword", "priority", "tags", "scheduled", "deadline", "body", "to", "under", "effort")
                    if body.get(k) or (k == "keyword" and body.get(k) == "")}))
            return self.send_json(self.ow.add(body["text"]))
        self.send_json({"error": "not found"}, 404)

    def sign_in_posted(self, token: str):
        """The key pasted into the page: the cookie, set in whatever holds
        the page.  An app on an iPhone's home screen keeps cookies apart from
        Safari's, so the `/?key=` link opened in Safari doesn't reach it."""
        found, why = self.device_key(token.strip())
        if why:
            return self.send_json({"error": why}, 403)
        self.who = found[0]
        self.renew = self.key_cookie(token.strip())
        self.send_json({"ok": True})

    # What an add token may send: a task or event, its dates and a body.
    ADD_FIELDS = {"title", "scheduled", "deadline", "body", "event", "when"}

    def add_for(self, body: dict):
        """An add token's add, made by the server whatever was sent: in the
        inbox ([add], events too, so it's all triaged), the default keyword,
        no tags, marked :FROM: <token name>.  Anything more is refused, not
        dropped, so a client never believes it set something it didn't."""
        if extra := sorted(k for k, v in body.items() if v and k not in self.ADD_FIELDS):
            return self.send_json({"error": f"This key can't set {', '.join(extra)}"}, 403)
        if not (body.get("title") or "").strip():
            return self.send_json({"error": "It needs a title"}, 400)
        # Headings in details would be tasks of their own, with keywords, tags
        # and dates this key can't set.
        if has_headings(body.get("body") or ""):
            return self.send_json({"error": "This key can't add headings, so a line of the details can't start with *"}, 403)
        fields = {k: body[k] for k in ("title", "body") if body.get(k)}
        # Always stamped: the list of what was sent is sorted by it.
        mark = {"properties": {"FROM": self.who}, "where": "task", "captured": True}
        if body.get("event"):
            r = self.ow.add_event(**fields, when=body.get("when"), **mark)
        else:
            r = self.ow.add(**fields, scheduled=body.get("scheduled") or None,
                            deadline=body.get("deadline") or None, **mark)
        self.send_json({"heading": r["heading"]})  # not its ID: nothing to open

    def tab_counts(self) -> dict:
        """{label: how many tasks it lists} for the tabs with a count; one
        whose query fails (a saved tab gone stale) is left out."""
        counts = {}
        for t in self.all_tabs():
            if t.get("count"):
                try:
                    counts[t["label"]] = len({r["id"] for r in self.ow.view(t["query"]) if r.get("id")})
                except OrgwarriorError:
                    pass
        return counts

    def notify_state(self) -> dict:
        """Where this device's person hears from: the list's owner (a full
        token) of what's sent to them, a sender (an add token) of what's
        done with what they sent.  The token never goes back to the page."""
        sub = self.subscriptions.get(self.who if self.scope == "add" else None)
        return {"on": bool(sub), "topic": sub and sub["topic"], "token": bool(sub and sub.get("token"))}

    def set_notify(self, body: dict) -> dict:
        """Turn notifications on (a test message sent first: a topic that
        doesn't work isn't kept) or off, for whoever this device is."""
        sender = self.who if self.scope == "add" else None
        if body.get("off"):
            self.subscriptions.set(sender, None)
            return self.notify_state()
        topic, link = str(body.get("topic") or "").strip(), str(body.get("link") or "")
        if not re.match(r"https?://", link):
            raise OrgwarriorError("The page didn't say its own address")
        old = self.subscriptions.get(sender) or {}
        # Left out: the token already kept, for the same topic.
        token = body["token"].strip() if isinstance(body.get("token"), str) else \
            old.get("token") if old.get("topic") == topic else None
        sub = {"topic": topic, "token": token or None, "link": link}
        whose = self.name or "the list's owner"
        try:
            notify.publish(sub, "Notifications are on",
                           f"You'll hear here when {whose} marks what you sent done." if sender
                           else "You'll hear here when someone sends you a task.")
        except notify.NotifyError as e:
            raise OrgwarriorError(str(e)) from None
        self.subscriptions.set(sender, sub)
        return self.notify_state()

    def all_tabs(self) -> list[dict]:
        """The config's tabs, then the saved ones (`saved`: the page can change them)."""
        return self.tabs + [{**t, "saved": True} for t in self.saved_tabs.load()]

    def run_line(self, line: str) -> dict:
        """A line as the orgwarrior command takes it, typed in the page's
        query box: {"view": QUERY} or {"task": ID} to go to, {"confirm":
        "kill", "ids"} for the page to ask first, {"help", "topic"} (the
        CLI's own help text), else what was done ({"added": ...} or
        {"done": [...], "verb"})."""
        try:
            words = shlex.split(line)
        except ValueError as e:
            raise cli.UsageError(f"Can't read that line: {e}") from None
        cmd, socket = cli.parse(words, self.ow.config)
        if socket:
            raise cli.UsageError("No --socket here: this page has its daemon")
        match cmd:
            case cli.View() | cli.Outline() | cli.Report():
                return {"view": line.strip()}
            case cli.Show(ids):
                return {"task": ids[0]}
            case cli.Add(text, event, to):
                return {"added": self.ow.add_event(text, to=to) if event else self.ow.add(text, to=to)}
            case cli.Help(man=True):
                raise cli.UsageError("help --man is the man page, for a terminal: orgwarrior help --man")
            case cli.Help(None):
                return {"help": helpmod.MAIN, "topic": None}
            case cli.Help(topic):
                text = helpmod.topic(topic, [k.lower() for k in self.ow.keywords()["keywords"]])
                if not text:
                    raise cli.UsageError(f"no help on {topic!r}; topics: {' '.join(helpmod.TOPICS)}")
                return {"help": text, "topic": topic}
            case cli.Act(ids, "kill", yes=False):
                return {"confirm": "kill", "ids": ids}
            case cli.Act(_, "edit" | "open" as verb):
                raise cli.UsageError(f"{verb} isn't for this box: "
                                     + ("press e" if verb == "edit" else "tap the link on the task's page"))
            case cli.Act(ids, verb, args, note, _, new):
                return {"done": self.ow.act(ids, verb, args, note, new), "verb": verb}
        raise cli.UsageError("Not for this box: ? lists the keys, help the commands")

    def running_clocks(self) -> list[dict]:
        """The clocks running, each with "today": the minutes its task was
        clocked earlier today (a second clock on it, the header's total)."""
        clocks = self.ow.clock()
        today = datetime.date.today().isoformat()
        for c in clocks:
            c["today"] = sum(e["minutes"] for e in self.ow.clocks(c["id"])["clocks"]
                             if e["end"] and e["start"].startswith(today))
        return clocks

    def send_sent(self):
        """What this add token sent (:FROM: its name), newest first, as plain
        facts: no keyword (the list owner's workflow), ID, body or tags."""
        sent = [{"title": e["title"], "done": e["done"], "event": e["keyword"] is None,
                 "scheduled": e["scheduled"], "deadline": e["deadline"],
                 "when": e["timestamp"] if e["keyword"] is None else None,
                 "closed": e["closed"], "sent": e["captured"]}
                for e in self.ow.entries_with("FROM", self.who)]
        # "[2026-10-15 Thu 10:33]" sorts as text, unstamped ones last; within
        # a minute, the later in the file (adds append) is the newer.
        order = sorted(range(len(sent)), key=lambda i: (sent[i]["sent"] or "", i), reverse=True)
        self.send_json([sent[i] for i in order])

    def send_manifest(self):
        # Named for whose list it is, so two installed apps tell apart.
        manifest = json.loads((STATIC / "manifest.webmanifest").read_text())
        if self.name:
            manifest["name"] = manifest["short_name"] = f"ow · {self.name}"
        self.send_body(json.dumps(manifest, ensure_ascii=False).encode(), TYPES[".webmanifest"])

    def send_calendar(self, key):
        # Calendar apps can't sign in: the key is in the feed's URL.
        if not self.signed_in(("full", "calendar"), key):
            return self.send_body(b"Unknown or revoked key.", "text/plain; charset=utf-8", 403)
        base = f"{'https' if self.secure else 'http'}://{self.headers.get('Host', 'localhost')}"
        body = feed.ics(self.ow.calendar(), self.calendar, lambda i: f"{base}/#/t/{i}")
        self.send_body(body.encode(), "text/calendar; charset=utf-8")

    def send_health(self):
        # Public, like the page: the answer holds nothing of the user's, the
        # reason goes to the journal.  ping's short timeout keeps a hung
        # daemon from holding this one-request-at-a-time server.
        try:
            self.ow.ping()
        except OrgwarriorError as e:
            print(f"healthz: {e}", file=sys.stderr)
            return self.send_body(b"Emacs isn't answering\n", "text/plain; charset=utf-8", 503)
        self.send_body(b"ok\n", "text/plain; charset=utf-8")

    def send_json(self, obj, status=200):
        self.page = page_version()
        self.send_body(json.dumps(obj).encode(), "application/json", status)

    def send_static(self, path):
        name = "index.html" if path == "/" else path.lstrip("/")
        f = STATIC / name
        suffix = "." + name.rsplit(".", 1)[-1]
        if "/" in name or suffix not in TYPES or not f.is_file():
            return self.send_body(b"not found", "text/plain", 404)
        self.send_body(f.read_bytes(), TYPES[suffix])

    def send_body(self, body: bytes, ctype: str, status=200):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if self.renew:
            self.send_header("Set-Cookie", self.renew)
        if self.page:
            self.send_header("X-Page-Version", self.page)
        self.end_headers()
        self.wfile.write(body)

    def log_request(self, code="-", size="-"):
        # The feed's URL holds its key: its path alone.
        if urlsplit(self.path).path == "/calendar.ics":
            return self.log_message('"%s /calendar.ics" %s', self.command, code)
        super().log_request(code, size)

    def log_message(self, fmt, *args):
        # Only the API and the feed: `/?key=` must never reach the journal.
        path = urlsplit(getattr(self, "path", "")).path
        if not (path.startswith("/api/") or path == "/calendar.ics"):
            return
        super().log_message("%s " + fmt, self.who or "-", *args)


def has_headings(text: str) -> bool:
    """Whether TEXT has lines org reads as headings: not inside a #+begin_
    block, whose lines the engine escapes, as org does."""
    block = False
    for line in text.split("\n"):
        if re.match(r"[ \t]*#\+end_", line, re.I):
            block = False
        elif re.match(r"[ \t]*#\+begin_", line, re.I):
            block = True
        elif not block and re.match(r"\*+([ \t]|$)", line):
            return True
    return False


# A thread per connection: a connection opened and left idle (Safari's) holds
# only its own thread, not every other request, for the 30 s timeout.
class Server(ThreadingHTTPServer):
    daemon_threads = True
    lock = threading.Lock()

    def handle_error(self, request, client_address):
        # A phone that dropped off, timed out or spoke plain HTTP to the TLS
        # port is network noise, not a bug worth a traceback.
        if not isinstance(sys.exc_info()[1], OSError):
            super().handle_error(request, client_address)


def make_server(host: str, port: int, ow: Orgwarrior, cert: str | None = None,
                key: str | None = None, tokens: Tokens | None = None,
                saved_tabs: SavedTabs | None = None,
                subscriptions: notify.Subscriptions | None = None) -> HTTPServer:
    """With TOKENS, the API wants a signed-in device; only on loopback, and
    until the first token is made (revoking them all doesn't reopen it), is
    it open."""
    loopback = is_loopback(host)
    if tokens is not None and not loopback and not tokens.load():
        raise OrgwarriorError(f"no device can sign in yet. Off this machine ({host}) a token is "
                              "needed first: orgwarrior-web token add NAME")
    handler = type("BoundHandler", (Handler,), {
        "ow": web_orgwarrior(ow), "tabs": tab_row(ow), "tokens": tokens,
        "saved_tabs": saved_tabs or SavedTabs(),
        "calendar": feed.options(ow.config.web.get("calendar", {})), "name": instance_name(ow),
        "keys": key_table(ow), "notify": notify.options(ow.config.web.get("notify", {})),
        "subscriptions": subscriptions or notify.Subscriptions(),
        "open_without_tokens": loopback, "secure": bool(cert),
        # The CA `orgwarrior-web cert` made, beside the certificate.
        "ca_file": Path(cert).with_name("ca.crt") if cert else None})
    server = Server((host, port), handler)
    if cert:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert, key)
        # The handshake waits for the first read, inside the handler's thread
        # and its timeout: done in accept(), a client that never finishes it
        # would stop the server accepting for good.
        server.socket = ctx.wrap_socket(server.socket, server_side=True,
                                        do_handshake_on_connect=False)
    return server


def server_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        prog="orgwarrior-web", description="Serve your org agenda as a web page, built for a phone "
        "first. Each device signs in with its own token (orgwarrior-web token --help).",
        epilog="Setting it up: `orgwarrior-web token` makes sign-in links, `orgwarrior-web cert` "
        "makes a certificate for HTTPS, and `orgwarrior-web service` prints a service that keeps "
        "it running. Each takes --help.")
    ap.add_argument("--host", default="127.0.0.1",
                    help="the address to listen on (default 127.0.0.1, which is open until you "
                    "make a token; any other address needs one)")
    ap.add_argument("--port", type=int, default=22546, help="the port (default 22546)")
    ap.add_argument("-s", "--socket", help="the Emacs server socket's name, if it isn't the default")
    ap.add_argument("--cert", help="a TLS certificate (PEM) to serve HTTPS, which a phone needs "
                    "to install the page as an app")
    ap.add_argument("--key", help="the certificate's private key (PEM), if it isn't in the --cert file")
    return ap


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv[:1] == ["token"]:
        return token_main(argv[1:])
    if argv[:1] == ["cert"]:
        return setup.cert_main(argv[1:])
    if argv[:1] == ["service"]:
        return setup.service_main(argv[1:], server_parser())
    ap = server_parser()
    args = ap.parse_args(argv)
    if args.key and not args.cert:
        ap.error("--key needs --cert")
    try:
        state = default_path().parent
        server = make_server(args.host, args.port, Orgwarrior(socket=args.socket),
                             args.cert, args.key, Tokens(), SavedTabs(state / "tabs.json"),
                             notify.Subscriptions(state / "notify.json"))
    except (OrgwarriorError, OSError, ValueError) as e:  # ssl.SSLError is an OSError
        print(f"orgwarrior-web: {e}", file=sys.stderr)
        return 1
    scheme = "https" if args.cert else "http"
    print(f"orgwarrior-web on {scheme}://{args.host}:{args.port}/", file=sys.stderr)
    notify.Watcher(server, state / "notify-seen.json").start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0
