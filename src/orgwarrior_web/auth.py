"""Per-device tokens: each device gets its own random token, named, and the
server keeps only their hashes, in a state file (not the config, which
may live in a dotfiles repo).  `orgwarrior-web token add|list|revoke`."""

import argparse
import datetime
import hashlib
import hmac
import os
import re
import secrets
import sys
from pathlib import Path

from orgwarrior_web.jsonfile import JsonFile

NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,39}")


def default_path() -> Path:
    state = os.environ.get("XDG_STATE_HOME") or Path.home() / ".local/state"
    return Path(state) / "orgwarrior-web/tokens.json"


def digest(token: str) -> str:
    # A plain hash is enough: the tokens are random, 32 bytes, not passwords.
    return hashlib.sha256(token.encode()).hexdigest()


class Tokens:
    """The tokens file, {name: {"sha256", "scope", "created"}}, reread when it
    changes, so `token add`/`revoke` count without restarting the server."""

    def __init__(self, path: Path | None = None):
        self.file = JsonFile(path or default_path(), dict, 0o600)

    @property
    def path(self) -> Path:
        return self.file.path

    def load(self) -> dict:
        return self.file.load()

    def find(self, token: str) -> tuple[str, str] | None:
        """(name, scope) of TOKEN, or None.  Scope "full" opens everything,
        "calendar" only the feed, "add" only adding (someone else's device,
        adding to this list without seeing it), "mcp" only orgwarrior-mcp
        (Claude: none of the page)."""
        d = digest(token)
        found = None
        for name, t in self.load().items():
            if hmac.compare_digest(d, t["sha256"]):
                found = name, t["scope"]
        return found

    def add(self, name: str, scope: str = "full") -> str:
        if not NAME.fullmatch(name):
            raise ValueError(f"{name!r} can't be a token name. Use up to 40 letters, digits, _ . or -")
        tokens = dict(self.load())
        if name in tokens:
            raise ValueError(f"there's already a token {name!r}. Revoke it first, or pick another name")
        token = secrets.token_urlsafe(32)
        tokens[name] = {"sha256": digest(token), "scope": scope,
                        "created": datetime.date.today().isoformat()}
        self.file.save(tokens)
        return token

    def revoke(self, name: str):
        tokens = dict(self.load())
        if tokens.pop(name, None) is None:
            raise ValueError(f"there's no token {name!r} (token list shows them)")
        self.file.save(tokens)


def token_main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(
        prog="orgwarrior-web token",
        description="Manage the tokens that let devices sign in. Each device gets its own, "
        "so you can cut one off without the others. Changes take effect right away, "
        "with no restart.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    add = sub.add_parser("add", help="make a token for a device and print its sign-in link")
    add.add_argument("name", help="what it's for, like phone or laptop")
    scope = add.add_mutually_exclusive_group()
    scope.add_argument("--calendar", action="store_true",
                       help="for a calendar app: it opens the calendar feed and nothing else")
    scope.add_argument("--add", action="store_true",
                       help="for someone else: they can add to your inbox (marked FROM them) "
                       "but can't see your list")
    scope.add_argument("--mcp", action="store_true",
                       help="for Claude: it opens orgwarrior-mcp, not the page")
    add.add_argument("--url", help="the server's address, so it can print the whole link "
                     "(like https://10.0.0.5:22546)")
    sub.add_parser("list", help="list the tokens")
    rev = sub.add_parser("revoke", help="cut a device off")
    rev.add_argument("name")
    args = ap.parse_args(argv)
    tokens = Tokens()
    try:
        if args.cmd == "add":
            token = tokens.add(args.name, "calendar" if args.calendar else "add" if args.add
                               else "mcp" if args.mcp else "full")
            base = (args.url or "https://HOST:PORT").rstrip("/")
            if args.mcp:
                print(f"Connect Claude (or any MCP client) to {base}/mcp\n"
                      f"with this request header:\n\n"
                      f"  Authorization: Bearer {token}\n\n"
                      f"A client that takes only a URL can use this one:\n\n"
                      f"  {base}/mcp?key={token}\n")
            elif args.calendar:
                print(f"Subscribe to this in the calendar app (ICSx\u2075 on Android):\n\n"
                      f"  {base}/calendar.ics?key={token}\n")
            elif args.add:
                print(f"Send this link to {args.name}. Opened once, it stays signed in on that device,\n"
                      f"and it can only add to your inbox:\n\n"
                      f"  {base}/?key={token}\n\n"
                      f"On an iPhone, an app on the home screen doesn't share Safari's sign-in.\n"
                      f"Open the app and paste the key there (the part after key=).\n")
            else:
                print(f"Open this link once on {args.name}, and it stays signed in:\n\n"
                      f"  {base}/?key={token}\n\n"
                      f"On an iPhone, an app on the home screen doesn't share Safari's sign-in.\n"
                      f"Open the app and paste the key there (the part after key=).\n")
            print(f"The token isn't shown again. `orgwarrior-web token revoke {args.name}` cuts it off.")
        elif args.cmd == "list":
            listed = tokens.load()
            if not listed:
                print("There are no tokens yet. `orgwarrior-web token add NAME` makes one.")
            for name, t in listed.items():
                print(f"{name:20} {t['scope']:10} made {t['created']}")
        else:
            tokens.revoke(args.name)
            print(f"Revoked {args.name}.")
    except (ValueError, OSError) as e:
        print(f"orgwarrior-web token: {e}", file=sys.stderr)
        return 1
    return 0
