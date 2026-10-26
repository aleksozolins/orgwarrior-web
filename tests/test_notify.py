"""Notifications: what counts as news, publishing to ntfy, the routes, the watcher."""

import datetime
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from orgwarrior.api import OrgwarriorError
from orgwarrior_web import notify
from orgwarrior_web.notify import NotifyError, Subscriptions, Watcher, changes, topic_parts
from test_server import StubOrgwarrior, post, serving

TODAY = datetime.date(2026, 10, 25)


def entry(title, keyword="TODO", done=False, value="robin", captured="[2026-10-25 Sun 09:00]", id="a1"):
    return {"id": id, "value": value, "title": title, "keyword": keyword, "done": done,
            "captured": captured}


def test_changes():
    first = [entry("Dry cleaning"), entry("Old", captured="[2026-09-01 Tue 09:00]")]
    # The first look only notes what's there.
    snap, arrivals, changed = changes(None, first, today=TODAY)
    assert arrivals == changed == []
    # Sent since: news; one with an old CAPTURED is a task coming back.
    later = [*first, entry("Gutters", captured="[2026-10-25 Sun 09:30]"),
             entry("Unarchived", captured="[2026-08-01 Sat 09:00]")]
    snap, arrivals, changed = changes(snap, later, today=TODAY)
    assert [e["title"] for e in arrivals] == ["Gutters"] and changed == []
    # Two in one minute, told apart by title.
    snap, arrivals, _ = changes(snap, [*later, entry("Second", captured="[2026-10-25 Sun 09:30]")], today=TODAY)
    assert [e["title"] for e in arrivals] == ["Second"]
    # Done, and renamed too: the same task (its sender and CAPTURED).
    now = [entry("Dry cleaning, both shirts", "DONE", True), *later[1:]]
    snap, arrivals, changed = changes(snap, now, today=TODAY)
    assert arrivals == [] and [(e["title"], was) for e, was in changed] == [("Dry cleaning, both shirts", "TODO")]
    # A state of the owner's workflow tells nobody, unless it's listed.
    now[1] = entry("Old", "NEXT", captured="[2026-09-01 Tue 09:00]")
    assert changes(snap, now, today=TODAY)[2] == []
    now[1] = entry("Old", "WAIT", captured="[2026-09-01 Tue 09:00]")
    assert [e["keyword"] for e, _ in changes(snap, now, ("WAIT",), today=TODAY)[2]] == ["WAIT"]


def test_topic_parts():
    # A name alone is ntfy.sh's; a whole address, any server's.
    assert notify.topic_url(" ow-abc_1 ") == "https://ntfy.sh/ow-abc_1"
    assert notify.topic_url("https://push.example.com/mine/") == "https://push.example.com/mine"
    with pytest.raises(NotifyError, match="like ow-"):
        notify.topic_url("ntfy.sh/abc")
    assert topic_parts("https://ntfy.sh/ow-abc_1") == ("https://ntfy.sh/", "ow-abc_1")
    assert topic_parts(" https://push.example.com/ntfy/mine/ ") == ("https://push.example.com/ntfy/", "mine")
    for bad in ("", "ntfy.sh/abc", "https://ntfy.sh/", "ftp://ntfy.sh/abc", "https://ntfy.sh/a b"):
        with pytest.raises(NotifyError):
            topic_parts(bad)


@pytest.fixture
def ntfy():
    """A stand-in ntfy: what was posted, and a refusal for topic "no"."""
    got = []

    class H(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            got.append((self.path, self.headers.get("Authorization"), body))
            status, answer = (403, b'{"error":"forbidden"}') if body["topic"] == "no" else (200, b"{}")
            self.send_response(status)
            self.send_header("Content-Length", str(len(answer)))
            self.end_headers()
            self.wfile.write(answer)

        def log_message(self, *a):
            pass

    server = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}", got
    server.shutdown()


def test_publish(ntfy):
    base, got = ntfy
    notify.publish({"topic": f"{base}/abc", "token": "tk_1"}, "Gutters", "From robin", "https://h/#/t/a1", ["inbox_tray"])
    assert got == [("/", "Bearer tk_1", {"topic": "abc", "title": "Gutters", "message": "From robin",
                                         "click": "https://h/#/t/a1", "tags": ["inbox_tray"]})]
    with pytest.raises(NotifyError, match="refused it: forbidden"):
        notify.publish({"topic": f"{base}/no"}, "x", "y")
    with pytest.raises(NotifyError, match="Can't reach"):
        notify.publish({"topic": "http://127.0.0.1:9/abc"}, "x", "y")


def test_options():
    assert notify.options({}) == {"states": []}
    assert notify.options({"states": ["WAIT"]}) == {"states": ["WAIT"]}
    for bad in ({"states": "WAIT"}, {"state": []}, []):
        with pytest.raises(OrgwarriorError):
            notify.options(bad)


def test_routes(tmp_path, monkeypatch, capsys):
    """The owner's topic from a full token, a sender's from their add token,
    each tested before it's kept; the token never sent back."""
    from orgwarrior_web.auth import Tokens
    from orgwarrior_web.server import main
    monkeypatch.setenv("XDG_STATE_HOME", str(tmp_path))
    sent = []

    def fake(to, title, message, click=None, tags=()):
        if "broken" in to["topic"]:
            raise NotifyError("ntfy.sh refused it: no")
        sent.append((to, title, message))
    monkeypatch.setattr(notify, "publish", fake)
    ow = StubOrgwarrior()
    ow.config.web = {"name": "Sam"}
    subs = Subscriptions(tmp_path / "notify.json")
    with serving(ow, tokens=Tokens(), subscriptions=subs) as server:
        base = f"http://127.0.0.1:{server.server_port}"
        main(["token", "add", "robin", "--add"])
        robin = capsys.readouterr().out.split("?key=")[1].split()[0]
        main(["token", "add", "me"])
        me = capsys.readouterr().out.split("?key=")[1].split()[0]

        def call(path, key, body=None):
            import urllib.request
            req = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(),
                                         headers={"Cookie": f"orgwarrior_key_{server.server_port}={key}",
                                                  "Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req) as r:
                    return r.status, json.loads(r.read())
            except urllib.error.HTTPError as e:
                return e.code, json.loads(e.read())
        assert call("/api/notify", robin) == (200, {"on": False, "topic": None, "token": False})
        status, body = call("/api/notify", robin, {"topic": "robins", "link": "https://sam.example/"})
        assert status == 200 and body == {"on": True, "topic": "https://ntfy.sh/robins", "token": False}
        assert "when Sam marks what you sent done" in sent[-1][2]
        assert subs.get("robin") == {"topic": "https://ntfy.sh/robins", "token": None, "link": "https://sam.example/"}
        assert subs.get(None) is None  # robin's, not the owner's
        # The owner's, with a token for a server of one's own.
        status, body = call("/api/notify", me, {"topic": "https://ntfy.sh/sams", "token": "tk_9", "link": "https://sam.example/"})
        assert body["token"] is True and "tk_9" not in json.dumps(body)
        assert "someone sends you a task" in sent[-1][2]
        # Same topic, no token sent: the one kept stays.
        call("/api/notify", me, {"topic": "https://ntfy.sh/sams", "link": "https://sam.example/"})
        assert subs.get(None)["token"] == "tk_9"
        # A topic that doesn't work isn't kept.
        status, body = call("/api/notify", me, {"topic": "https://ntfy.sh/broken", "link": "https://sam.example/"})
        assert status == 400 and "refused" in body["error"] and subs.get(None)["topic"] == "https://ntfy.sh/sams"
        assert call("/api/notify", me, {"off": True})[1]["on"] is False and subs.get(None) is None
        assert (tmp_path / "notify.json").stat().st_mode & 0o777 == 0o600


def test_counts():
    from orgwarrior_web.server import tab_row
    ow = StubOrgwarrior()
    ow.config.web = {"tabs": {"today": "today", "inbox": "inbox", "projects": "projects.org"}, "counts": ["inbox"]}
    assert [t.get("count", False) for t in tab_row(ow)] == [False, True, False]
    for bad in (["nope"], ["projects"], "inbox"):
        ow.config.web["counts"] = bad
        with pytest.raises(OrgwarriorError):
            tab_row(ow)


def test_counts_route(monkeypatch):
    ow = StubOrgwarrior()
    ow.config.web = {"tabs": {"today": "today", "inbox": "inbox"}, "counts": ["inbox"]}
    ow.view = lambda q="": [{"text": "Inbox", "id": None}, {"text": "a", "id": "a1"},
                            {"text": "b", "id": "b2"}, {"text": "b again", "id": "b2"}]
    with serving(ow) as server:
        base = f"http://127.0.0.1:{server.server_port}"
        import urllib.request
        with urllib.request.urlopen(f"{base}/api/counts") as r:
            assert json.loads(r.read()) == {"inbox": 2}
        # A saved tab counts once it's asked to; a file's outline can't.
        post(f"{base}/api/tabs", {"op": "add", "label": "home", "query": "+@home"})
        post(f"{base}/api/tabs", {"op": "count", "label": "home", "count": True})
        with urllib.request.urlopen(f"{base}/api/counts") as r:
            assert json.loads(r.read()) == {"inbox": 2, "home": 2}
        post(f"{base}/api/tabs", {"op": "add", "label": "p", "query": "projects.org"})
        assert post(f"{base}/api/tabs", {"op": "count", "label": "p", "count": True})[0] == 400


class Watched(StubOrgwarrior):
    def __init__(self):
        super().__init__()
        self.entries = []

    def entries_with(self, prop, value):
        assert (prop, value) == ("FROM", None)
        return self.entries

    def show(self, task_id, html=False):
        return {"id": task_id, "notes": [{"state": "WAIT", "text": "Which cleaners?"},
                                         {"state": "DONE", "text": "Picked up at noon"}]}


def test_watcher(tmp_path, monkeypatch, capsys):
    from orgwarrior_web.auth import Tokens
    monkeypatch.setenv("XDG_STATE_HOME", str(tmp_path))
    tokens = Tokens()
    tokens.add("robin", "add")
    ow = Watched()
    ow.config.web = {"name": "Sam", "notify": {"states": ["WAIT"]}}
    subs = Subscriptions()
    subs.set(None, {"topic": "https://ntfy.sh/sams", "token": None, "link": "https://sam.example/"})
    subs.set("robin", {"topic": "https://ntfy.sh/robins", "token": None, "link": "https://sam.example/"})
    sent = []
    with serving(ow, tokens=tokens, subscriptions=subs) as server:
        watcher = Watcher(server, tmp_path / "seen.json", send=lambda to, *a: sent.append((to["topic"], *a)))
        today = datetime.date.today().strftime("[%Y-%m-%d %a 09:00]")
        ow.entries = [entry("Dry cleaning", captured=today)]
        watcher.check()  # the first look: nothing sent
        ow.entries.append(entry("Gutters", captured=today.replace("09:00", "09:30"), id="g7"))
        watcher.check()
        assert sent == [("https://ntfy.sh/sams", "Gutters", "From robin", "https://sam.example/#/t/g7", ["inbox_tray"])]
        # Done: robin hears, with the note written then.
        ow.entries[0] = entry("Dry cleaning", "DONE", True, captured=today)
        watcher.check()
        assert sent[-1] == ("https://ntfy.sh/robins", "Dry cleaning", "Sam marked it DONE.\n\nPicked up at noon",
                            "https://sam.example/", ["white_check_mark"])
        # Kept on disk: a restart doesn't send it again.
        n = len(sent)
        Watcher(server, tmp_path / "seen.json", send=lambda to, *a: sent.append(a)).check()
        assert len(sent) == n
        # robin's key revoked: nothing more to robin.
        tokens.revoke("robin")
        ow.entries[1] = entry("Gutters", "WAIT", captured=today.replace("09:00", "09:30"), id="g7")
        watcher.check()
        assert len(sent) == n
        # Emacs down: said once in the log, not every minute.
        ow.entries_with = lambda *a: (_ for _ in ()).throw(OrgwarriorError("Emacs isn't running"))
        watcher.check()
        watcher.check()
        assert capsys.readouterr().err.count("Emacs isn't running") == 1
