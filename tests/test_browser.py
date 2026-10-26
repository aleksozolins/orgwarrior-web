"""The page in a headless browser (tests/browser/*.js, a file a section)
against the real engine, on a throwaway daemon with orgwarrior's
fixtures.  Skipped unless
scripts/get-browser has fetched Chrome, deno is installed and orgwarrior is
a source checkout (its tests/ holds the fixtures)."""

import json
import os
import shutil
import subprocess
import threading
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import orgwarrior
import pytest

from orgwarrior.api import Orgwarrior
from orgwarrior.config import Config
from orgwarrior_web.auth import Tokens
from orgwarrior_web.notify import Subscriptions, Watcher
from orgwarrior_web.server import SavedTabs, make_server

BROWSER = Path(os.environ.get("ORGWARRIOR_WEB_BROWSER")
               or Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "orgwarrior-web/browser")
FIXTURES = Path(orgwarrior.__file__).resolve().parents[2] / "tests"


class FakeNtfy(BaseHTTPRequestHandler):
    """ntfy, as far as the page and the server use it: a POST is a message
    (topic "broken" refused), GET / lists them."""
    got: list

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        refused = body["topic"] == "broken"
        if not refused:
            self.got.append(body)
        self.answer(403 if refused else 200, {"error": "forbidden"} if refused else {})

    def do_GET(self):
        self.answer(200, self.got)

    def answer(self, status, obj):
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")  # read from the page's checks
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


SECTIONS = sorted(p.stem for p in Path(__file__).with_name("browser").glob("*.js") if p.stem != "lib")


# One section a test, each on a throwaway daemon of its own with fresh
# fixtures: a section starts from the files as they are, not from what
# another left, and `pytest -k keyboard` runs just one.
@pytest.mark.parametrize("section", SECTIONS)
def test_browser(section, tmp_path):
    if not (BROWSER / "chrome-headless-shell-linux64/chrome-headless-shell").exists():
        pytest.skip("no browser: run scripts/get-browser")
    if not shutil.which("deno") or not shutil.which("emacs"):
        pytest.skip("needs deno and emacs")
    if not (FIXTURES / "fixture-init.el").exists():
        pytest.skip("orgwarrior's fixtures not found (not a source checkout)")
    name, org = f"orgwarrior-web-test-{uuid.uuid4().hex[:8]}", tmp_path / "org"
    env = {**os.environ, "ORGWARRIOR_FIXTURE_DEST": str(org)}
    env.pop("ALTERNATE_EDITOR", None)  # no daemon -> emacsclient would launch it
    subprocess.run(["emacs", "-Q", f"--daemon={name}", "-l", str(FIXTURES / "fixture-init.el")],
                   env=env, check=True, capture_output=True, timeout=30)
    servers = []
    try:
        # keymap's servers run with the evil preset and a key of one's own over it.
        keys = {"keys": {"preset": "evil", "move": "g m"}} if section == "keymap" else {}
        counts = {"counts": ["all"]} if section == "notify" else {}
        config = Config(add_file=str(org / "inbox.org"), add_heading="Tasks", add_captured=True,
                        refile_usual="tasks", web={"name": "Sam", **keys, **counts})
        ntfy = HTTPServer(("127.0.0.1", 0), type("Ntfy", (FakeNtfy,), {"got": []}))
        threading.Thread(target=ntfy.serve_forever, daemon=True).start()
        servers.append(ntfy)
        subscriptions = Subscriptions(tmp_path / "notify.json")
        # Open (loopback, no tokens), and one that wants them, for signing in
        # and an add token's page.
        tokens = Tokens(tmp_path / "tokens.json")
        robin = tokens.add("robin", "add")
        for t in (None, tokens):
            servers.append(make_server("127.0.0.1", 0, Orgwarrior(config, name), tokens=t,
                                       saved_tabs=SavedTabs(tmp_path / "tabs.json"),
                                       subscriptions=subscriptions))
            threading.Thread(target=servers[-1].serve_forever, daemon=True).start()
        # Its first look, before the section sends anything.
        watcher = Watcher(servers[-1], tmp_path / "notify-seen.json")
        if section == "notify":
            watcher.check()
        proc = subprocess.run(
            ["deno", "run", "-A", str(Path(__file__).with_name("browser") / f"{section}.js")],
            env={**env, "BASE": f"http://127.0.0.1:{servers[1].server_port}",
                 "SIGNED": f"http://127.0.0.1:{servers[2].server_port}", "ADD_KEY": robin,
                 "NTFY": f"http://127.0.0.1:{ntfy.server_port}",
                 "BROWSER": str(BROWSER)},
            capture_output=True, text=True, timeout=180)
        print(proc.stdout)  # the checks, with -s
        assert proc.returncode == 0, proc.stdout + proc.stderr[-2000:]
        if section == "capture":
            # What she added landed in the inbox, marked as hers, the event too.
            inbox = (org / "inbox.org").read_text()
            assert inbox.count(":FROM: robin") == 2 and "** TODO Pick up dry cleaning" in inbox
            assert "** Dinner at Nonna's" in inbox
        if section == "notify":
            # What robin sent tells Sam (the owner's topic); done, it tells robin.
            got = ntfy.RequestHandlerClass.got
            n = len(got)
            watcher.check()
            assert [(m["topic"], m["title"], m["message"]) for m in got[n:]] == [
                ("owner", "Return library books", "From robin")]
            sent = next(e for e in Orgwarrior(config, name).entries_with("FROM", "robin")
                        if e["title"] == "Return library books")
            Orgwarrior(config, name).act([sent["id"]], "done", note="Dropped them off")
            watcher.check()
            assert [(m["topic"], m["message"]) for m in got[n + 1:]] == [
                ("robin", "Sam marked it DONE.\n\nDropped them off")]
    finally:
        for server in servers:
            server.shutdown()
        subprocess.run(["emacsclient", "--socket-name", name, "--eval", "(kill-emacs)"],
                       env=env, capture_output=True, timeout=10)
