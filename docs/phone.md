# On a phone: installing it, and HTTPS

Open the address in the phone's browser. To get an app instead of a
tab (its own icon and window, no address bar), install it: in Chrome,
⋮ → **Install app** (on a desktop, the install icon at the end of the
address bar); on an iPhone, in Safari, ⋯ → **Share** → **Add to Home
Screen**, then open it and paste the key. On Android, if the menu only
offers "Add to home screen", that's a bookmark: the browser doesn't
consider the page secure. Browsers
install a page as an app only over HTTPS, and getting a certificate is
up to you. The options, roughly from least to most effort:

- **Plain HTTP.** It works as a tab. Chrome can be told to treat the
  address as secure anyway: `chrome://flags`, "Insecure origins treated
  as secure", add `http://10.0.0.5:22546`, relaunch. Per device and per
  browser, and Chrome may drop the flag in an update. The sign-in token
  then crosses your LAN readable.
- **A local certificate**, for the IP address itself (no domain needed):
  your own small CA signs it, you serve it with `--cert` and `--key`, and
  each device trusts the CA. [mkcert](https://github.com/FiloSottile/mkcert)
  does it in one line (`mkcert 10.0.0.5`), but its CA can vouch for any
  site, so its key is worth guarding like a password. With openssl the
  CA can be limited to your server's address, so a leaked key can't
  impersonate anything else:

  ```sh
  ip=10.0.0.5; cd ~/.local/share/orgwarrior-web/tls   # mkdir -p, chmod 700
  umask 077
  openssl ecparam -name prime256v1 -genkey -noout -out ca.key
  openssl req -x509 -new -key ca.key -sha256 -days 3650 -out ca.crt \
    -subj "/CN=orgwarrior-web CA" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "nameConstraints=critical,permitted;IP:$ip/255.255.255.255"
  openssl ecparam -name prime256v1 -genkey -noout -out server.key
  openssl req -new -key server.key -subj "/CN=$ip" |
    openssl x509 -req -CA ca.crt -CAkey ca.key -CAcreateserial -sha256 -days 1825 \
      -extfile <(printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:%s\n' $ip) \
      -out server.crt
  chmod 644 ca.crt server.crt
  ```

  Another address later (a VPN one): add it to the CA's `nameConstraints`
  and the server's `subjectAltName`, which means a new CA on each
  device. Installing `ca.crt`: on Android, Settings → Security → More
  security settings → Encryption & credentials → Install a certificate →
  CA certificate (it may then note that the network "may be monitored";
  that's the CA you added); on an iPhone, open the file (mail it to
  yourself), install the profile in Settings, then turn it on under
  Settings → General → About → Certificate Trust Settings (installed
  isn't trusted); on a Mac, add it to the System keychain in Keychain
  Access, then open it, Trust → "Always Trust" (again, added isn't
  trusted: Chrome says "Not secure" until then), and restart the
  browser; on Windows, Install Certificate → Local Machine → Trusted
  Root Certification Authorities (not the store Windows picks); on
  Arch, `sudo trust anchor ca.crt`, which
  Chrome and a Firefox using the system's NSS both read; a Firefox with
  its own: Settings → Certificates → View Certificates → Authorities →
  Import, "Trust this CA to identify websites". Opening an `https://`
  address is a new origin to the browser: sign in again with its own
  link, and reinstall the app.
- **A real domain.** If you already run a reverse proxy with certificates
  (Caddy, or `tailscale serve` on a tailnet), put orgwarrior-web behind
  it on 127.0.0.1 and leave TLS to the proxy.

On the network itself: a VPN like WireGuard or Tailscale encrypts the
traffic between your phone and the server, but on your home Wi-Fi, plain
HTTP crosses the LAN readable by anyone on it.

Once installed, the app is in Android's Share menu: share a link or some
text to it and the add page opens with it filled in.

## Signed out every time the app opens?

The browser is throwing the cookie away: Chrome's "Delete data sites have
saved to your device when you close all windows"
(`chrome://settings/content/siteData`) does that. Add the server's address
under "Allowed to save data on your device".
