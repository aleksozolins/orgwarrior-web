"""orgwarrior-web cert, service and /ca.crt."""

import shutil
import ssl
import subprocess
import threading
import urllib.request

import pytest

from orgwarrior_web import setup
from orgwarrior_web.server import make_server, server_parser
from test_server import StubOrgwarrior

needs_openssl = pytest.mark.skipif(not shutil.which("openssl"), reason="needs openssl")


@needs_openssl
def test_cert_limited_to_its_addresses(tmp_path):
    folder = tmp_path / "tls"
    setup.make_cert(["127.0.0.1", "10.0.0.5"], folder)
    assert sorted(p.name for p in folder.iterdir()) == ["ca.crt", "ca.key", "ca.srl", "server.crt", "server.key"]
    assert oct(folder.stat().st_mode & 0o777) == "0o700" and oct((folder / "ca.key").stat().st_mode & 0o777) == "0o600"
    ext = subprocess.run(["openssl", "x509", "-in", folder / "ca.crt", "-noout", "-ext", "nameConstraints"],
                         capture_output=True, text=True, check=True).stdout
    assert "IP:127.0.0.1/255.255.255.255" in ext and "IP:10.0.0.5/255.255.255.255" in ext
    verify = subprocess.run(["openssl", "verify", "-CAfile", folder / "ca.crt", folder / "server.crt"],
                            capture_output=True, text=True)
    assert verify.returncode == 0
    # A CA made before stays, unless asked: devices trust it.
    with pytest.raises(RuntimeError, match="--force"):
        setup.make_cert(["127.0.0.1"], folder)
    setup.make_cert(["127.0.0.1"], folder, force=True)
    with pytest.raises(ValueError):
        setup.make_cert(["nonsense"], tmp_path / "other")


@needs_openssl
def test_served_with_ca_crt(tmp_path):
    """The certificate cert made works, and the server hands out its CA,
    and only that, without a sign-in."""
    folder = tmp_path / "tls"
    setup.make_cert(["127.0.0.1"], folder)
    server = make_server("127.0.0.1", 0, StubOrgwarrior(), str(folder / "server.crt"), str(folder / "server.key"))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        ctx = ssl.create_default_context(cafile=str(folder / "ca.crt"))
        base = f"https://127.0.0.1:{server.server_port}"
        with urllib.request.urlopen(f"{base}/ca.crt", context=ctx) as r:
            assert r.headers["Content-Type"] == "application/x-x509-ca-cert"
            assert r.read() == (folder / "ca.crt").read_bytes()
        with pytest.raises(urllib.error.HTTPError):
            urllib.request.urlopen(f"{base}/ca.key", context=ctx)
    finally:
        server.shutdown()


def test_no_ca_without_cert():
    server = make_server("127.0.0.1", 0, StubOrgwarrior())
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with pytest.raises(urllib.error.HTTPError) as e:
            urllib.request.urlopen(f"http://127.0.0.1:{server.server_port}/ca.crt")
        assert e.value.code == 404
    finally:
        server.shutdown()


def test_service_unit(monkeypatch):
    monkeypatch.setattr(setup.shutil, "which", lambda name: "/opt/emacs/bin/emacsclient")
    unit, start = setup.service_text("/home/sam/.local/bin/orgwarrior-web", ["--host", "10.0.0.5", "--name", "a b"], "linux")
    assert "ExecStart=/home/sam/.local/bin/orgwarrior-web --host 10.0.0.5 --name \"a b\"" in unit
    assert "Environment=PATH=/opt/emacs/bin:/usr/local/bin:/usr/bin:/bin" in unit
    assert unit.startswith("# Save this as ~/.config/systemd/user/orgwarrior-web.service")
    assert "systemctl --user enable --now orgwarrior-web" in start and f"#   {start}" in unit


def test_service_launch_agent(monkeypatch):
    monkeypatch.setattr(setup.shutil, "which", lambda name: "/opt/homebrew/bin/emacsclient")
    plist, start = setup.service_text("/opt/homebrew/bin/orgwarrior-web", ["--port", "22546"], "darwin")
    assert "<string>/opt/homebrew/bin/orgwarrior-web</string>\n    <string>--port</string>" in plist
    assert "<string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>" in plist
    assert start.startswith("launchctl bootstrap gui/$UID") and start in plist
    # Comments after the XML declaration, and never "--" inside one.
    assert plist.startswith("<?xml") and "<!--\n  Save this as" in plist
    assert "--" not in plist.split("<!--")[1].split("-->")[0]


def test_service_checks_options(capsys):
    with pytest.raises(SystemExit):
        setup.service_main(["--bogus"], server_parser())
    capsys.readouterr()
    assert setup.service_main(["--port", "22600"], server_parser()) == 0
    out = capsys.readouterr()
    assert "--port 22600" in out.out and out.err == ""  # not a file: the comments say it all
