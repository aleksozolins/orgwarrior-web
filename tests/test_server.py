"""The routes, against a stub engine (orgwarrior's own tests cover the real one)."""

import contextlib
import json
import shutil
import socket
import ssl
import subprocess
import threading
import time
import urllib.error
import urllib.request

import pytest

from orgwarrior.api import Orgwarrior, OrgwarriorError
from orgwarrior.config import Config
from orgwarrior_web.server import PREFIX, SavedTabs, make_server


class StubOrgwarrior:
    def __init__(self):
        self.config = Config(views={"inbox": "i"})
        self.queries = []
        self.down = False

    def ping(self):
        if self.down:
            raise OrgwarriorError("Emacs didn't answer within 3s (secret detail)")

    def views(self):
        return ["today", "week", "all", "inbox"]

    def view(self, query=""):
        self.queries.append(query)
        if query == "fridge":
            raise OrgwarriorError("Not a view, ID or date: fridge")
        return [{"text": "Today", "id": None, "spans": []}]

    def keywords(self, file=None):
        return {"keywords": ["TODO", "DONE"], "done": ["DONE"]}

    def tags(self):
        return ["@phone", "home"]

    def refile_targets(self, ids):
        self.queries.append(ids)
        return ["tasks.org › Tasks"]

    usual_target = Orgwarrior.usual_target  # the real matching: it reads only config

    def wants_note(self, ids, verb):
        return verb == "done"

    def outline(self, file):
        self.queries.append(file)
        return {"file": file, "children": []}

    def reorder(self, ids, parent=None, file=None):
        self.queries.append((ids, parent, file))
        return []

    def add_places(self, event=False):
        places = [("calendar.org", "calendar.org")] if event else [
            ("inbox.org › Inbox", "inbox.org"), ("projects.org", "projects.org")]
        return {"places": [{"label": l, "file": f} for l, f in places],
                "keywords": {"inbox.org": ["TODO"], "bugs.org": ["BUG"]}}

    def refile_places(self, ids):
        self.queries.append(ids)
        return ["tasks.org", "projects.org", "tasks.org › Tasks"]

    def act(self, ids, verb, args=(), note=None, new=None):
        self.queries.append((ids, verb, list(args), note, *([new] if new else [])))
        if verb == "nope":
            raise OrgwarriorError("Not a keyword or verb: nope")
        return [{"id": ids[0], "heading": "DONE x"}]

    def add(self, text=None, **fields):
        self.queries.append(fields or text)
        return {"id": "ab", "heading": text or fields["title"]}

    def check(self, task_id, n, text):
        self.queries.append(("check", task_id, n, text))
        return {"id": task_id, "heading": "TODO x [1/2]"}

    def set_entry(self, task_id, text, old):
        self.queries.append(("entry", task_id, text, old))
        return {"id": task_id, "heading": "TODO x"}

    def add_event(self, text=None, **fields):
        self.queries.append(("event", fields or text))
        return {"id": "cd", "heading": text or fields["title"]}

    def entries_with(self, prop, value):
        self.queries.append(("entries", prop, value))
        return [{"title": "Old", "keyword": "DONE", "done": True, "scheduled": None, "deadline": None,
                 "timestamp": None, "closed": "[2026-10-14 Wed 09:00]", "captured": "[2026-10-01 Thu 09:00]"},
                {"title": "Dinner", "keyword": None, "done": False, "scheduled": None, "deadline": None,
                 "timestamp": "<2026-10-23 Fri 19:00>", "closed": None, "captured": "[2026-10-13 Tue 08:00]"}]

    def calendar(self, days=365):
        return [{"id": "c1c0", "title": "Call dentist", "keyword": "NEXT", "done": False,
                 "habit": False, "tags": [], "category": "tasks",
                 "stamps": [{"kind": "scheduled", "start": "2026-10-14", "start_time": None,
                             "end": "2026-10-14", "end_time": None, "repeat": None,
                             "warning": None}]}]

    def clock(self):
        return [{"id": "c1", "title": "Call dentist", "start": "2026-10-20 14:05", "minutes": 12}]

    def clocks(self, task_id):
        today = __import__("datetime").date.today().isoformat()
        return {"clocks": [{"start": f"{today} 14:05", "end": None, "minutes": 12},
                           {"start": f"{today} 09:00", "end": f"{today} 09:40", "minutes": 40},
                           {"start": "2000-01-01 09:00", "end": "2000-01-01 10:00", "minutes": 60}]}

    def clock_in(self, task_id, time=None):
        self.queries.append(("in", task_id, time))
        return {"clock": {"id": task_id}, "closed": []}

    def clock_out(self, task_id=None, time=None):
        self.queries.append(("out", task_id, time))
        return {"id": task_id, "minutes": 3}

    def clock_cancel(self, task_id=None):
        self.queries.append(("cancel", task_id))
        return {"id": task_id}

    def clock_edit(self, task_id, n, start=None, end=None, old=None):
        self.queries.append(("edit", task_id, n, start, end, old))
        return {"clocks": []}

    def clock_remove(self, task_id, n, old=None):
        self.queries.append(("remove", task_id, n, old))
        return {"clocks": []}

    def report(self, words=""):
        self.queries.append(("report", words))
        return {"label": "today", "minutes": 0, "files": []}

    def props(self, task_id=None, name=None):
        self.queries.append(("props", task_id, name))
        return {"names": ["LOCATION", "STYLE"], "values": ["habit"] if name == "STYLE" else None}

    def note_edit(self, task_id, n, text, old=None):
        self.queries.append(("note", task_id, n, text, old))
        return []

    def note_remove(self, task_id, n, old=None):
        self.queries.append(("note-rm", task_id, n, old))
        return []

    def show(self, task_id, html=False):
        if task_id == "boom":
            raise RuntimeError("a bug")
        return {"id": task_id, "file": "tasks.org", "path": ["Tasks"], "lines": [], "children": [],
                **({"html": '<p onclick="x()">hi<script>bad()</script></p>'} if html else {})}


@contextlib.contextmanager
def serving(ow, *args, **kw):
    """make_server's server on 127.0.0.1, serving until the block ends."""
    server = make_server("127.0.0.1", 0, ow, *args, **kw)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        yield server
    finally:
        server.shutdown()


def key_in(out: str) -> str:
    """The token in the link `token add` printed."""
    return out.split("?key=")[1].split()[0]


@pytest.fixture
def web():
    ow = StubOrgwarrior()
    with serving(ow) as server:
        yield f"http://127.0.0.1:{server.server_port}", ow


def post(url, body, ctype="application/json"):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": ctype})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def get(url):
    try:
        with urllib.request.urlopen(url) as r:
            return r.status, r.headers["Content-Type"], r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers["Content-Type"], e.read()


def test_api(web):
    base, ow = web
    # The page lays out org's fields itself: the prefix is the server's, not the user's.
    assert ow.config.prefix_format == PREFIX and ow.config.tags == "inline"
    status, _, body = get(f"{base}/api/views")
    info = json.loads(body)
    # Which page files the answer goes with, for a page left open across an update.
    with urllib.request.urlopen(f"{base}/api/tags") as r:
        assert len(r.headers["X-Page-Version"]) == 12
    assert status == 200 and info["default"] == "today" and info["views"] == ["inbox"]
    # No [web.tabs]: orgwarrior's views.
    assert info["tabs"][-1] == {"label": "inbox", "query": "inbox"}
    assert info["colors"]["todo"] and info["keywords"] == ["TODO", "DONE"] and info["done"] == ["DONE"]
    status, _, body = get(f"{base}/api/view?q=wait%20%2B%40phone")
    assert status == 200 and ow.queries[-1] == "wait +@phone"
    assert json.loads(get(f"{base}/api/task/c1")[2])["id"] == "c1"
    status, ctype, body = get(f"{base}/api/view?q=fridge")
    assert status == 400 and ctype == "application/json"
    assert json.loads(body) == {"error": "Not a view, ID or date: fridge"}


def test_tab_row():
    from orgwarrior_web.server import tab_row
    ow = StubOrgwarrior()
    ow.config.web = {"tabs": {"today": "today", "home": " +@home "}}
    assert tab_row(ow) == [{"label": "today", "query": "today"}, {"label": "home", "query": "+@home"}]
    for bad in ({"tabs": {}}, {"tabs": {"x": 1}}, {"tabs": {"x": " "}}, {"tabs": ["today"]}, {"pills": {}}):
        ow.config.web = bad
        with pytest.raises(OrgwarriorError):
            tab_row(ow)


def test_static(web):
    base, _ = web
    status, ctype, body = get(f"{base}/")
    assert status == 200 and ctype.startswith("text/html") and b"app.js" in body
    assert get(f"{base}/app.js")[1].startswith("text/javascript")
    status, ctype, body = get(f"{base}/manifest.webmanifest")
    manifest = json.loads(body)
    assert status == 200 and ctype == "application/manifest+json"
    # What an installed app needs: every icon served, a maskable one among them.
    for icon in manifest["icons"]:
        assert get(f"{base}/{icon['src']}")[:2] == (200, icon["type"])
    assert any(i.get("purpose") == "maskable" for i in manifest["icons"])
    assert get(f"{base}/sw.js")[1].startswith("text/javascript")
    for path in ("/nope.js", "/../pyproject.toml", "/%2e%2e/server.py", "/server.py"):
        assert get(f"{base}{path}")[0] == 404


def test_healthz(web, capsys):
    base, ow = web
    assert get(f"{base}/healthz") == (200, "text/plain; charset=utf-8", b"ok\n")
    ow.down = True
    status, _, body = get(f"{base}/healthz")
    # The reason is the journal's, not the (unsigned-in) caller's.
    assert status == 503 and b"secret" not in body
    assert "secret detail" in capsys.readouterr().err


def test_actions(web):
    base, ow = web
    assert json.loads(get(f"{base}/api/tags")[2]) == ["@phone", "home"]
    assert json.loads(get(f"{base}/api/refile-targets?ids=c1,7f")[2]) == {"targets": ["tasks.org › Tasks"], "usual": None}
    assert ow.queries[-1] == ["c1", "7f"]
    ow.config.refile_usual = "tasks"  # [refile] usual: the page's first choice
    assert json.loads(get(f"{base}/api/refile-targets?ids=c1")[2])["usual"] == "tasks.org › Tasks"
    ow.config.refile_usual = None
    assert json.loads(get(f"{base}/api/refile-places?ids=c1")[2]) == {
        "places": ["tasks.org", "projects.org", "tasks.org › Tasks"], "new_in": None}
    post(f"{base}/api/act", {"ids": ["c1"], "verb": "refile", "args": ["projects.org"], "new": "Reno"})
    assert ow.queries[-1] == (["c1"], "refile", ["projects.org"], None, "Reno")
    assert json.loads(get(f"{base}/api/file?f=projects.org")[2])["file"] == "projects.org"
    post(f"{base}/api/reorder", {"ids": ["b", "a"], "file": "projects.org"})
    assert ow.queries[-1] == (["b", "a"], None, "projects.org")
    assert post(f"{base}/api/wants-note", {"ids": ["c1"], "verb": "done"}) == (200, True)
    status, results = post(f"{base}/api/act", {"ids": ["c1"], "verb": "done", "note": "booked"})
    assert status == 200 and results[0]["heading"] == "DONE x"
    assert ow.queries[-1] == (["c1"], "done", [], "booked")
    assert post(f"{base}/api/act", {"ids": ["c1"], "verb": "nope"}) == (
        400, {"error": "Not a keyword or verb: nope"})
    assert post(f"{base}/api/add", {"text": "TODO x"})[1]["id"] == "ab"
    assert post(f"{base}/api/check", {"id": "c1", "n": 2, "text": "memo"})[0] == 200
    assert ow.queries[-1] == ("check", "c1", 2, "memo")
    assert post(f"{base}/api/entry", {"id": "c1", "text": "new", "old": "old"})[0] == 200
    assert ow.queries[-1] == ("entry", "c1", "new", "old")
    assert post(f"{base}/api/nope", {})[0] == 404
    # A form post (what another site could make a browser send) is refused.
    assert post(f"{base}/api/act", {"ids": ["c1"], "verb": "done"},
                "application/x-www-form-urlencoded")[0] == 415


def test_add_fields(web):
    base, ow = web
    status, r = post(f"{base}/api/add", {"title": "fix d:3", "keyword": "NEXT", "tags": ["@phone"],
                                         "scheduled": "", "deadline": None, "body": "- a"})
    assert status == 200 and ow.queries[-1] == {"title": "fix d:3", "keyword": "NEXT", "tags": ["@phone"],
                                                "body": "- a"}
    status, r = post(f"{base}/api/add", {"event": True, "title": "dentist", "tags": [],
                                         "when": "fri 14:00-15:00"})
    assert status == 200 and ow.queries[-1] == ("event", {"title": "dentist", "when": "fri 14:00-15:00"})
    assert post(f"{base}/api/add", {"event": True, "text": "x @fri"})[1]["id"] == "cd"
    # Elsewhere than the inbox: a place, or under a heading.
    assert json.loads(get(f"{base}/api/add-places")[2]) == {
        "task": [{"label": "inbox.org › Inbox", "file": "inbox.org"},
                 {"label": "projects.org", "file": "projects.org"}],
        "event": [{"label": "calendar.org", "file": "calendar.org"}],
        "keywords": {"inbox.org": ["TODO"], "bugs.org": ["BUG"]}}
    post(f"{base}/api/add", {"title": "paint", "to": "projects.org"})
    assert ow.queries[-1] == {"title": "paint", "to": "projects.org"}
    post(f"{base}/api/add", {"title": "Garage", "keyword": "", "tags": []})
    assert ow.queries[-1] == {"title": "Garage", "keyword": ""}
    post(f"{base}/api/add", {"event": True, "title": "x", "when": "fri", "under": "c1"})
    assert ow.queries[-1] == ("event", {"title": "x", "when": "fri", "under": "c1"})


def test_saved_tabs(web, tmp_path):
    # Saved from the page, after the config's, marked so it can change them;
    # kept beside tokens.json (here, in memory), never in config.toml.
    base, ow = web
    tabs = lambda: json.loads(get(f"{base}/api/views")[2])["tabs"]
    change = lambda **b: post(f"{base}/api/tabs", b)
    config = tabs()
    assert all("saved" not in t for t in config)
    status, r = change(op="add", label="phone", query="+@phone")
    assert status == 200 and r["tabs"][-1] == {"label": "phone", "query": "+@phone", "saved": True}
    change(op="add", label="home", query="+@home")
    assert [t["label"] for t in tabs()[len(config):]] == ["phone", "home"]
    change(op="move", label="home", step=-1)
    change(op="rename", label="phone", to="calls")
    assert [t["label"] for t in tabs()[len(config):]] == ["home", "calls"]
    for body, says in [({"op": "add", "label": "home", "query": "x"}, "already"),
                       ({"op": "add", "label": config[0]["label"], "query": "x"}, "already"),
                       ({"op": "remove", "label": config[0]["label"]}, "config.toml"),
                       ({"op": "add", "label": "x", "query": " "}, "needs a query"),
                       ({"op": "remove", "label": "nope"}, "No saved tab")]:
        status, r = change(**body)
        assert status == 400 and says in r["error"], body
    change(op="remove", label="home")
    assert [t["label"] for t in tabs()[len(config):]] == ["calls"]
    # A file of its own, reread when it changes (another device's save).
    saved = SavedTabs(tmp_path / "tabs.json")
    saved.change("add", "a", [], "+a")
    assert json.loads((tmp_path / "tabs.json").read_text()) == [{"label": "a", "query": "+a"}]
    (tmp_path / "tabs.json").write_text('[{"label": "b", "query": "+b"}]')
    assert SavedTabs(tmp_path / "tabs.json").load()[0]["label"] == "b"


def test_run_line(web):
    # The query box: what the orgwarrior command takes, parsed as the CLI does.
    base, ow = web
    run = lambda line: post(f"{base}/api/run", {"line": line})
    assert run("fri") == (200, {"view": "fri"})
    assert run(" +@phone ") == (200, {"view": "+@phone"})
    assert run("projects.org") == (200, {"view": "projects.org"})
    assert run("inbox") == (200, {"view": "inbox"})
    assert run("c1") == (200, {"task": "c1"})
    status, r = run("add Walk the dog :@home: --to projects.org")
    assert status == 200 and r["added"]["id"] == "ab" and ow.queries[-1] == {"to": "projects.org"}
    status, r = run("c1 done -m 'Called them'")
    assert status == 200 and r["verb"] == "done" and ow.queries[-1] == (["c1"], "done", [], "Called them")
    assert run("c1 kill") == (200, {"confirm": "kill", "ids": ["c1"]})
    assert run("c1 kill --yes")[1]["verb"] == "kill"
    # help: the CLI's own text, the summary or a topic (aliases too).
    status, r = run("help")
    assert status == 200 and r["topic"] is None and "orgwarrior c1 done" in r["help"]
    assert "org-read-date" in run("help dates")[1]["help"] and run("help due")[1]["help"] == run("help dates")[1]["help"]
    assert "no help on 'nope'" in run("help nope")[1]["error"]
    assert "for a terminal" in run("help --man")[1]["error"]
    for line, says in [("c1 edit", "press e"), ("--version", "Not for this box"), ("c1 done -m 'oops", "Can't read"),
                       ("add", "needs a title"), ("-s other fri", "No --socket")]:
        status, r = run(line)
        assert status == 400 and says in r["error"], line


def test_errors_are_json(web, capfd):
    base, _ = web
    # orgwarrior's refusal: the page reads it, and so does the journal, without the query.
    assert get(f"{base}/api/view?q=fridge")[0] == 400
    assert "- /api/view: 'Not a view, ID or date: fridge'" in capfd.readouterr().err
    # A bug: still a JSON error, so the page can show it.
    status, ctype, body = get(f"{base}/api/task/boom")
    assert status == 500 and ctype == "application/json" and "RuntimeError: a bug" in json.loads(body)["error"]
    assert get(f"{base}/api/nope")[:2] == (404, "application/json")
    assert post(f"{base}/api/act", {"verb": "done"})[0] == 400


def test_stalled_connection(web):
    base, _ = web
    host, port = base.removeprefix("http://").split(":")
    stalled = socket.create_connection((host, int(port)))
    stalled.sendall(b"GET /api/views HTTP/1.1\r\n")  # and never the rest
    start = time.monotonic()
    assert get(f"{base}/api/views")[0] == 200  # not waiting for the stalled one
    assert time.monotonic() - start < 2
    stalled.close()


@pytest.mark.skipif(not shutil.which("openssl"), reason="needs openssl to make a certificate")
def test_tls(tmp_path):
    cert, key = tmp_path / "cert.pem", tmp_path / "key.pem"
    subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                    "-subj", "/CN=127.0.0.1", "-keyout", key, "-out", cert],
                   check=True, capture_output=True)
    with serving(StubOrgwarrior(), str(cert), str(key)) as server:
        port = server.server_port
        # A client that connects and never starts the handshake (Safari's
        # connections opened ahead) waits in its own thread: the next request
        # is served at once.
        stalled = socket.create_connection(("127.0.0.1", port))
        ctx = ssl.create_default_context(cafile=str(cert))
        ctx.check_hostname = False
        start = time.monotonic()
        with urllib.request.urlopen(f"https://127.0.0.1:{port}/api/views", context=ctx) as r:
            assert r.status == 200 and "tabs" in json.loads(r.read())
        assert time.monotonic() - start < 2
        stalled.close()
        # Plain HTTP to the TLS port fails for that client only.
        with pytest.raises(OSError):
            urllib.request.urlopen(f"http://127.0.0.1:{port}/api/views", timeout=2)
        with urllib.request.urlopen(f"https://127.0.0.1:{port}/", context=ctx) as r:
            assert r.status == 200


def test_tokens(tmp_path, monkeypatch, capsys):
    from orgwarrior_web.auth import Tokens
    from orgwarrior_web.server import main
    monkeypatch.setenv("XDG_STATE_HOME", str(tmp_path))
    tokens = Tokens()
    # Off loopback, a server nobody can sign in to won't start.
    with pytest.raises(OrgwarriorError, match="token add"):
        make_server("0.0.0.0", 0, StubOrgwarrior(), tokens=tokens)
    with serving(StubOrgwarrior(), tokens=tokens) as server:
        base = f"http://127.0.0.1:{server.server_port}"
        no_redirect = urllib.request.build_opener(type("NoRedirect", (urllib.request.HTTPRedirectHandler,), {
            "redirect_request": lambda *a: None}))

        name = f"orgwarrior_key_{server.server_port}"

        def call(path, cookie=None, bearer=None, cookie_name=None):
            req = urllib.request.Request(base + path)
            if cookie:
                req.add_header("Cookie", f"{cookie_name or name}={cookie}")
            if bearer:
                req.add_header("Authorization", f"Bearer {bearer}")
            try:
                with no_redirect.open(req) as r:
                    return r.status, r.headers
            except urllib.error.HTTPError as e:
                return e.code, e.headers
        assert call("/api/views")[0] == 200  # loopback, no tokens yet: open
        assert main(["token", "add", "phone", "--url", "http://h:1/"]) == 0
        token = key_in(capsys.readouterr().out)
        assert (tmp_path / "orgwarrior-web/tokens.json").stat().st_mode & 0o777 == 0o600
        assert token not in (tmp_path / "orgwarrior-web/tokens.json").read_text()
        assert main(["token", "add", "phone"]) == 1  # names are unique
        # Now one exists, the API wants it; the page itself doesn't.
        assert call("/api/views")[0] == 401
        assert call("/api/views", cookie="wrong")[0] == 401
        assert post(f"{base}/api/act", {"ids": ["c1"], "verb": "done"})[0] == 401
        assert call("/")[0] == 200 and call("/manifest.webmanifest")[0] == 200
        assert call("/healthz")[0] == 200
        # The link sets the cookie and drops the key from the address.
        status, headers = call(f"/?key={token}")
        assert status == 303 and headers["Location"] == "/"
        assert f"{name}={token};" in headers["Set-Cookie"]
        assert "HttpOnly" in headers["Set-Cookie"] and "SameSite=Strict" in headers["Set-Cookie"]
        assert call("/?key=wrong")[0] == 403
        status, headers = call("/api/views", cookie=token)
        assert status == 200 and token in headers["Set-Cookie"]  # renewed
        # Named per port: another instance on this address keeps its own.
        assert call("/api/views", cookie=token, cookie_name="orgwarrior_key_1")[0] == 401
        assert call("/api/views", cookie=token, cookie_name="orgwarrior_key")[0] == 401
        assert call("/api/tags", bearer=token)[0] == 200
        assert main(["token", "list"]) == 0 and "phone" in capsys.readouterr().out
        # The feed takes its key in the URL; a calendar key opens nothing else.
        assert main(["token", "add", "cal", "--calendar", "--url", "http://h:1"]) == 0
        cal = key_in(capsys.readouterr().out)
        status, headers = call(f"/calendar.ics?key={cal}")
        assert status == 200 and headers["Content-Type"] == "text/calendar; charset=utf-8"
        with no_redirect.open(f"{base}/calendar.ics?key={cal}") as r:
            assert f"URL:http://127.0.0.1:{server.server_port}/#/t/c1c0" in r.read().decode()
        assert call("/calendar.ics?key=wrong")[0] == 403 and call("/calendar.ics")[0] == 403
        assert call(f"/calendar.ics?key={token}")[0] == 200
        assert call("/api/views", bearer=cal)[0] == 401
        assert call(f"/?key={cal}")[0] == 403
        # Claude's key (orgwarrior-mcp's): none of the page, the feed included.
        assert main(["token", "add", "claude", "--mcp", "--url", "http://h:1"]) == 0
        out = capsys.readouterr().out
        mcp = out.split("Bearer ")[1].split()[0]
        assert "http://h:1/mcp" in out
        assert call("/api/views", bearer=mcp)[0] == 401 and call(f"/?key={mcp}")[0] == 403
        assert call(f"/calendar.ics?key={mcp}")[0] == 403
        # Revoked: out at once, and with none left it stays closed.
        assert main(["token", "revoke", "phone"]) == 0
        assert call("/api/views", cookie=token)[0] == 401
        assert main(["token", "revoke", "phone"]) == 1


def test_add_token(tmp_path, monkeypatch, capsys):
    """Someone else's device: adds to the inbox, marked FROM them, and sees nothing."""
    from orgwarrior_web.auth import Tokens
    from orgwarrior_web.server import main
    monkeypatch.setenv("XDG_STATE_HOME", str(tmp_path))
    ow = StubOrgwarrior()
    ow.config.web = {"name": "Sam"}
    with serving(ow, tokens=Tokens()) as server:
        base = f"http://127.0.0.1:{server.server_port}"

        def call(path, key, body=None):
            req = urllib.request.Request(base + path, headers={"Cookie": f"orgwarrior_key_{server.server_port}={key}"},
                                         data=None if body is None else json.dumps(body).encode(),
                                         method="GET" if body is None else "POST")
            req.add_header("Content-Type", "application/json")
            try:
                with urllib.request.urlopen(req) as r:
                    return r.status, json.loads(r.read()), r.headers
            except urllib.error.HTTPError as e:
                return e.code, json.loads(e.read()), e.headers
        assert main(["token", "add", "robin", "--add", "--url", "http://h:1"]) == 0
        out = capsys.readouterr().out
        robin = key_in(out)
        assert "paste the key" in out
        assert main(["token", "add", "cal", "--calendar"]) == 0
        cal = key_in(capsys.readouterr().out)
        assert main(["token", "add", "me"]) == 0
        me = key_in(capsys.readouterr().out)
        assert call("/api/sent", me)[0] == 401  # an add token's alone
        with pytest.raises(SystemExit):  # one scope or the other
            main(["token", "add", "x", "--add", "--calendar"])
        # What the page learns: whose list, and that it may only add.
        assert call("/api/views", robin)[:2] == (200, {"mode": "add", "name": "Sam"})
        for path in ("/api/view?q=all", "/api/task/c1", "/api/tags", "/api/refile-targets?ids=c1",
                     "/api/refile-places?ids=c1", "/api/file?f=x.org", "/api/add-places"):
            assert call(path, robin)[0] == 401, path
        assert call("/api/act", robin, {"ids": ["c1"], "verb": "done"})[0] == 401
        assert call("/api/run", robin, {"line": "add x"})[0] == 401
        assert call("/api/tabs", robin, {"op": "add", "label": "x", "query": "x"})[0] == 401
        assert call("/api/entry", robin, {"id": "c1", "text": "", "old": ""})[0] == 401
        status, _ = get(f"{base}/calendar.ics?key={robin}")[:2]
        assert status == 403
        # Adding: the server's inbox, its keyword, no tags, marked FROM robin.
        status, body, _ = call("/api/add", robin, {"title": "Dry cleaning", "scheduled": "sat",
                                                   "body": "Ticket's on the fridge"})
        assert (status, body) == (200, {"heading": "Dry cleaning"})  # no ID: nothing to open
        assert ow.queries[-1] == {"title": "Dry cleaning", "body": "Ticket's on the fridge",
                                  "scheduled": "sat", "deadline": None,
                                  "properties": {"FROM": "robin"}, "where": "task", "captured": True}
        call("/api/add", robin, {"event": True, "title": "Dinner", "when": "fri 19:00"})
        assert ow.queries[-1] == ("event", {"title": "Dinner", "when": "fri 19:00",
                                            "properties": {"FROM": "robin"}, "where": "task",
                                            "captured": True})
        # What she sent, newest first, without the list's workflow.
        status, sent, _ = call("/api/sent", robin)
        assert status == 200 and ow.queries[-1] == ("entries", "FROM", "robin")
        assert [e["title"] for e in sent] == ["Dinner", "Old"]
        assert sent[0]["event"] and sent[0]["when"] == "<2026-10-23 Fri 19:00>"
        assert "keyword" not in sent[0] and sent[1]["done"] and sent[1]["closed"]
        # Anything more is refused, not quietly dropped.
        n = len(ow.queries)
        for extra in ({"tags": ["x"]}, {"keyword": "NEXT"}, {"text": "TODO y :x:"}, {"to": "projects.org"}, {"under": "c1"}):
            status, body, _ = call("/api/add", robin, {"title": "y", **extra})
            assert status == 403 and "can't set" in body["error"], extra
        assert call("/api/add", robin, {"title": " "})[0] == 400
        # Headings in details would be tasks of their own, keywords, tags and all.
        status, body, _ = call("/api/add", robin, {"title": "y", "body": "fine\n** NEXT x :tag:"})
        assert status == 403 and "headings" in body["error"]
        assert len(ow.queries) == n
        # Inside a block, a * line is the block's: escaped, not a heading.
        assert call("/api/add", robin, {"title": "y", "body": "#+begin_src org\n* x\n#+end_src"})[0] == 200
        n = len(ow.queries)
        # A POST not signed in is refused before its body is read: one sending
        # it slowly holds nothing.
        slow = socket.create_connection(("127.0.0.1", server.server_port))
        slow.sendall(b"POST /api/act HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n"
                     b"Content-Length: 1000000\r\n\r\n{")
        slow.settimeout(5)
        assert slow.recv(100).startswith(b"HTTP/1.0 401")
        slow.close()
        for length in ("-1", str(5 << 20)):
            req = urllib.request.Request(base + "/api/act", data=b"{}", method="POST", headers={
                "Content-Type": "application/json", "Content-Length": length,
                "Cookie": f"orgwarrior_key_{server.server_port}={me}"})
            with pytest.raises(urllib.error.HTTPError) as e:
                urllib.request.urlopen(req)
            assert e.value.code == 413, length
        # Pasting the key signs in wherever the page is (an iPhone's home-screen app).
        status, body, headers = call("/api/sign-in", "", {"key": f" {robin} "})
        assert status == 200 and f"orgwarrior_key_{server.server_port}={robin};" in headers["Set-Cookie"]
        assert call("/api/sign-in", "", {"key": cal})[0] == 403
        assert call("/api/sign-in", "", {"key": "wrong"})[0] == 403
        # The link works for her too; the app is named for whose list it is.
        with urllib.request.urlopen(f"{base}/manifest.webmanifest") as r:
            assert json.loads(r.read())["name"] == "ow · Sam"


def test_instance_name():
    from orgwarrior.config import ConfigError
    from orgwarrior_web.server import instance_name
    ow = StubOrgwarrior()
    assert instance_name(ow) is None
    ow.config.web = {"name": " Sam "}
    assert instance_name(ow) == "Sam"
    for bad in ("", 3):
        ow.config.web = {"name": bad}
        with pytest.raises(ConfigError):
            instance_name(ow)


def test_task_html_sanitized(web):
    base, ow = web
    assert json.loads(get(f"{base}/api/task/c1?html=1")[2])["html"] == "<p>hi</p>"
    assert "html" not in json.loads(get(f"{base}/api/task/c1")[2])


def test_add_effort(web):
    base, ow = web
    post(f"{base}/api/add", {"title": "Paint", "effort": "1:30"})
    assert ow.queries[-1]["effort"] == "1:30"


def test_clock(web):
    base, ow = web
    # What's running, with the minutes its task had clocked earlier today.
    assert json.loads(get(f"{base}/api/clock")[2]) == [
        {"id": "c1", "title": "Call dentist", "start": "2026-10-20 14:05", "minutes": 12, "today": 40}]
    post(f"{base}/api/clock", {"op": "in", "id": "c1", "time": "-15m"})
    assert ow.queries[-1] == ("in", "c1", "-15m")
    post(f"{base}/api/clock", {"op": "out"})
    assert ow.queries[-1] == ("out", None, None)
    post(f"{base}/api/clock", {"op": "cancel", "id": "c1"})
    assert ow.queries[-1] == ("cancel", "c1")
    assert post(f"{base}/api/clock", {"op": "start"})[0] == 400
    post(f"{base}/api/clock-edit", {"id": "c1", "n": 2, "start": "2026-10-19 09:30", "old": "CLOCK: x"})
    assert ow.queries[-1] == ("edit", "c1", 2, "2026-10-19 09:30", None, "CLOCK: x")
    post(f"{base}/api/clock-edit", {"id": "c1", "n": 2, "remove": True})
    assert ow.queries[-1] == ("remove", "c1", 2, None)
    # A report: the box's query, its words to the engine; the box goes to it.
    assert json.loads(get(f"{base}/api/report?q=clocked%20week%20%2B%40phone")[2])["label"] == "today"
    assert ow.queries[-1] == ("report", "week +@phone")
    assert post(f"{base}/api/run", {"line": "clocked week"}) == (200, {"view": "clocked week"})
    # A property editor's names and allowed values.
    assert json.loads(get(f"{base}/api/props?id=c1&name=STYLE")[2]) == {"names": ["LOCATION", "STYLE"], "values": ["habit"]}
    assert ow.queries[-1] == ("props", "c1", "STYLE")
    # A note's text, or the note gone.
    post(f"{base}/api/note-edit", {"id": "c1", "n": 1, "text": "Rebooked", "old": "- Note"})
    assert ow.queries[-1] == ("note", "c1", 1, "Rebooked", "- Note")
    post(f"{base}/api/note-edit", {"id": "c1", "n": 1, "remove": True})
    assert ow.queries[-1] == ("note-rm", "c1", 1, None)


def test_keymap(web):
    """The page's keys in /api/views; [web.keys] checked at startup."""
    from orgwarrior.config import ConfigError
    from orgwarrior_web.server import key_table
    base, ow = web
    table = json.loads(get(f"{base}/api/views")[2])["keymap"]
    assert table["preset"] is None and {"name": "kill", "group": "The task", "what": "kill (asks first)",
                                        "keys": ["C-k"], "org": ["C-k"]} in table["actions"]
    ow = StubOrgwarrior()
    ow.config.web = {"keys": {"preset": "evil", "kill": "C-d"}}
    assert {a["name"]: a["keys"] for a in key_table(ow)["actions"]}["kill"] == ["C-d"]
    for bad in ({"kil": "x"}, {"kill": "C-w"}, "evil"):
        ow.config.web = {"keys": bad}
        with pytest.raises(ConfigError):
            key_table(ow)
