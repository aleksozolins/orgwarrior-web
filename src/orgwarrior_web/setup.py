"""`orgwarrior-web cert` and `orgwarrior-web service`: the two setup steps
that were pages of instructions, each a command.

cert makes a CA that can vouch only for the addresses given (a leaked key
can't impersonate anything else) and a certificate for them, with openssl:
the stdlib can't make certificates.  service prints a unit for the
system's service manager with this command's own path filled in."""

import argparse
import ipaddress
import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path


def tls_dir() -> Path:
    """Where cert writes (XDG_DATA_HOME), and where /ca.crt reads from."""
    base = os.environ.get("XDG_DATA_HOME") or Path.home() / ".local/share"
    return Path(base) / "orgwarrior-web" / "tls"


def _constraint(ip) -> str:
    # openssl writes an IP name constraint as address/mask, the mask in full.
    return f"IP:{ip}/{ipaddress.ip_network(ip).netmask}"


def make_cert(addresses: list[str], folder: Path, force: bool = False) -> None:
    ips = [ipaddress.ip_address(a) for a in addresses]
    if not shutil.which("openssl"):
        raise RuntimeError("openssl isn't installed (it's on almost every system: try your package manager)")
    if (folder / "ca.crt").exists() and not force:
        raise RuntimeError(f"there's already a CA in {folder}. A new one means trusting it again "
                           "on every device. Use --force to replace it.")
    folder.mkdir(parents=True, exist_ok=True)
    folder.chmod(0o700)
    names = ",".join(f"IP:{ip}" for ip in ips)
    constraints = ",".join(f"permitted;{_constraint(ip)}" for ip in ips)

    def run(*args):
        subprocess.run(["openssl", *args], cwd=folder, check=True, capture_output=True)

    # Extensions from files and x509 -req, not req -addext: macOS's openssl
    # is LibreSSL, whose older versions have no -addext.
    exts = {"ca.ext": "basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\n"
                      f"nameConstraints=critical,{constraints}\nsubjectKeyIdentifier=hash\n",
            "server.ext": "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n"
                          f"extendedKeyUsage=serverAuth\nsubjectAltName={names}\n"
                          "subjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n"}
    old = os.umask(0o077)
    try:
        for name, text in exts.items():
            (folder / name).write_text(text)
        run("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", "ca.key")
        run("req", "-new", "-key", "ca.key", "-subj", "/CN=orgwarrior-web CA", "-out", "ca.csr")
        run("x509", "-req", "-in", "ca.csr", "-signkey", "ca.key", "-sha256", "-days", "3650",
            "-extfile", "ca.ext", "-out", "ca.crt")
        run("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", "server.key")
        run("req", "-new", "-key", "server.key", "-subj", f"/CN={ips[0]}", "-out", "server.csr")
        run("x509", "-req", "-in", "server.csr", "-CA", "ca.crt", "-CAkey", "ca.key",
            "-CAcreateserial", "-sha256", "-days", "1825", "-extfile", "server.ext", "-out", "server.crt")
    finally:
        os.umask(old)
        for name in (*exts, "ca.csr", "server.csr"):
            (folder / name).unlink(missing_ok=True)
    for public in ("ca.crt", "server.crt"):
        (folder / public).chmod(0o644)


def _tilde(path: Path) -> str:
    home = str(Path.home())
    return "~" + str(path)[len(home):] if str(path).startswith(home + "/") else str(path)


def cert_main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(
        prog="orgwarrior-web cert",
        description="Make a certificate so devices can reach the page over HTTPS, which a phone "
        "needs to install it as an app. It comes with its own small certificate authority (CA) "
        "that can only vouch for the addresses you give, which you then trust on each device.")
    ap.add_argument("address", nargs="+", help="the server's IP address on your network, "
                    "and any others it's reached at (a VPN address, say)")
    ap.add_argument("--dir", type=Path, default=None, help=f"where to write the files (default {tls_dir()})")
    ap.add_argument("--force", action="store_true", help="replace a CA made before")
    args = ap.parse_args(argv)
    folder = args.dir or tls_dir()
    try:
        make_cert(args.address, folder, args.force)
    except ValueError as e:
        print(f"orgwarrior-web cert: {e}. Give IP addresses, like 10.0.0.5", file=sys.stderr)
        return 1
    except (RuntimeError, OSError) as e:
        print(f"orgwarrior-web cert: {e}", file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as e:
        print(f"orgwarrior-web cert: openssl failed: {e.stderr.decode(errors='replace').strip()}", file=sys.stderr)
        return 1
    host, shown = args.address[0], _tilde(folder)
    print(f"Made a CA and a certificate for {', '.join(args.address)} in {shown}.\n\n"
          f"Serve the page with them:\n\n"
          f"  orgwarrior-web --host {host} --cert {shown}/server.crt --key {shown}/server.key\n\n"
          f"Then trust the CA on each device. Open https://{host}:22546/ca.crt on it\n"
          f"(the browser warns until the CA is trusted) and install the file. docs/phone.md\n"
          f"says how for Android, iPhone, Mac, Windows and Linux. Keep ca.key private:\n"
          f"it's what can make certificates for these addresses.")
    return 0


UNIT = """\
[Unit]
Description={name}
After=emacs.service
Wants=emacs.service

[Service]
ExecStart={command}
Environment=PATH={path}
Restart=on-failure

[Install]
WantedBy=default.target
"""

PLIST = """\
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>{name}</string>
  <key>ProgramArguments</key>
  <array>
{args}
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>{path}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>{log}</string>
</dict>
</plist>
"""


def _xml(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _systemd_quote(arg: str) -> str:
    return arg if arg and all(c.isalnum() or c in "-_./:=@%+," for c in arg) else \
        '"' + arg.replace("\\", "\\\\").replace('"', '\\"') + '"'


def service_text(command: str, options: list[str], platform: str = sys.platform,
                 name: str = "orgwarrior-web") -> tuple[str, str]:
    """The unit (or plist), what to do with it in comments at its top (one
    stream, so it reads in order piped or saved), and the command to start it.
    NAME is the program's: orgwarrior-mcp's service command uses this too."""
    client = shutil.which("emacsclient")
    dirs = [str(Path(client).parent)] if client else []
    dirs += [d for d in ("/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin")
             if d not in dirs and (platform == "darwin" or not d.startswith("/opt"))]
    path = ":".join(dirs)
    if platform == "darwin":
        log = str(Path.home() / f"Library/Logs/{name}.log")
        args = "\n".join(f"    <string>{_xml(a)}</string>" for a in [command, *options])
        where = f"~/Library/LaunchAgents/{name}.plist"
        start = f"launchctl bootstrap gui/$UID {where}"
        notes = [f"Save this as {where}, then start it:", f"  {start}",
                 "It starts at login from then on. After an upgrade:",
                 f"  launchctl kickstart -k gui/$UID/{name}", f"Its log is {log}."]
        plist = PLIST.format(name=name, args=args, path=path, log=_xml(log))
        head, sep, rest = plist.partition("<plist")  # comments after the XML declaration
        comment = "<!--\n" + "\n".join(f"  {_xml(n)}" for n in notes) + "\n-->\n"
        return head + comment + sep + rest, start
    start = f"systemctl --user daemon-reload && systemctl --user enable --now {name}"
    notes = [f"Save this as ~/.config/systemd/user/{name}.service, then start it:",
             f"  {start}",
             '  loginctl enable-linger "$USER"   # keeps it running when you\'re logged out',
             f"After an upgrade: systemctl --user restart {name}",
             f"Its log: journalctl --user -u {name}",
             "If your Emacs daemon isn't the emacs.service user unit, drop After= and Wants=."]
    unit = UNIT.format(name=name, command=" ".join(_systemd_quote(a) for a in [command, *options]), path=path)
    return "".join(f"# {n}\n" for n in notes) + "\n" + unit, start


WEB_EXAMPLE = ("--host 10.0.0.5 --cert ~/.local/share/orgwarrior-web/tls/server.crt \\\n"
               "    --key ~/.local/share/orgwarrior-web/tls/server.key")


def service_main(argv: list[str], server_parser: argparse.ArgumentParser,
                 name: str = "orgwarrior-web", example: str = WEB_EXAMPLE) -> int:
    """`NAME service [OPTION...]`, the options checked by NAME's own parser."""
    if argv[:1] in (["-h"], ["--help"]):
        print(f"usage: {name} service [OPTION...]\n\n"
              f"Print a service definition that runs {name} with these options, so it\n"
              "starts on its own and keeps running: a systemd user unit on Linux, a launch\n"
              "agent on a Mac. It uses this command's own path. For example:\n\n"
              f"  {name} service {example} \\\n"
              f"    > ~/.config/systemd/user/{name}.service\n\n"
              f"The options are {name}'s own ({name} --help).")
        return 0
    server_parser.parse_args(argv)  # the same options the server takes, checked now
    # Files as full paths: a service doesn't start in your home folder.
    options = [str(Path(a).expanduser().resolve()) if i and argv[i - 1] in ("--cert", "--key") else a
               for i, a in enumerate(argv)]
    command = shutil.which(name) or os.path.abspath(sys.argv[0])
    text, start = service_text(command, options, name=name)
    print(text, end="", flush=True)
    # Saved to a file, the comments aren't on screen: say what's next.
    try:
        to_file = stat.S_ISREG(os.fstat(sys.stdout.fileno()).st_mode)
    except (OSError, ValueError):  # no descriptor (captured)
        to_file = False
    if to_file:
        print(f"Written. To start it: {start}", file=sys.stderr)
    return 0
