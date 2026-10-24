# Using it on a phone

Open the address in the phone's browser and you can use it as a tab. To
get an app instead, with its own icon and window and no address bar,
install it:

- **Chrome on Android**: ⋮ → **Install app**. On a desktop, it's the
  install icon at the end of the address bar.
- **iPhone**: in Safari, ⋯ → **Share** → **Add to Home Screen**. Then open
  the app and paste the key, since it doesn't share Safari's sign-in.

If Android's menu only offers "Add to home screen", that makes a
bookmark, not an app. It means the browser doesn't consider the page
secure. Browsers only install a page as an app over HTTPS, and getting a
certificate is up to you. Here are the options, from least to most
effort.

## Plain HTTP

It works fine as a tab. You can tell Chrome to treat the address as
secure anyway: open `chrome://flags`, find "Insecure origins treated as
secure", add `http://10.0.0.5:22546`, and relaunch. You'll have to do
this on each device and in each browser, and Chrome may drop the flag in
an update. Your sign-in token also crosses your network unencrypted.

## A certificate of your own

This gets you a certificate for the server's IP address, so no domain is
needed. Your own small certificate authority (CA) signs it, you serve it
with `--cert` and `--key`, and you tell each device to trust the CA.

```sh
orgwarrior-web cert 10.0.0.5
```

It writes `ca.crt`, `ca.key`, `server.crt` and `server.key` to
`~/.local/share/orgwarrior-web/tls/` and prints the options to serve them
with. The CA can only vouch for the addresses you give it, so even if its
key leaked, it couldn't be used to impersonate any other site. If the
server is reached at more than one address (a VPN address too, say), give
them all: `orgwarrior-web cert 10.0.0.5 10.8.0.1`. Adding one later means
running it again with `--force`, which makes a new CA to trust again on
each device.

To get `ca.crt` onto a device, open `https://10.0.0.5:22546/ca.crt` in its
browser. It warns that the connection isn't private, since the CA isn't
trusted yet. Go ahead anyway and download the file.

Then install `ca.crt` on each device:

- **Android**: Settings → Security → More security settings → Encryption
  & credentials → Install a certificate → CA certificate. Android may then
  warn that the network "may be monitored". That's just the CA you added.
- **iPhone**: open the file in Safari, then install the profile under
  Settings → General → VPN & Device Management. Then turn it on under
  Settings → General →
  About → Certificate Trust Settings. Until you do, it's installed but not
  trusted.
- **Mac**: add it to the System keychain in Keychain Access, open it, and
  set Trust to "Always Trust". Chrome says "Not secure" until you do.
  Restart the browser afterwards.
- **Windows**: Install Certificate → Local Machine → Trusted Root
  Certification Authorities. Pick that store yourself rather than letting
  Windows choose.
- **Linux**: on Arch or Fedora, `sudo trust anchor ca.crt`. On Debian or
  Ubuntu, `sudo cp ca.crt /usr/local/share/ca-certificates/orgwarrior-web.crt`
  and then `sudo update-ca-certificates`. Browsers don't always read the
  system's list: if Chrome or Firefox still warns, import the file in its
  own certificate settings (in Firefox, Settings → Certificates → View
  Certificates → Authorities → Import, and check "Trust this CA to
  identify websites").

The browser treats the `https://` address as a new site, so sign in again
with a link made for it, and reinstall the app.

## A real domain

If you already run a reverse proxy with certificates (Caddy, or
`tailscale serve` on a tailnet), run orgwarrior-web on 127.0.0.1 behind it
and let the proxy handle HTTPS.

## About the network

A VPN like WireGuard or Tailscale encrypts the traffic between your phone
and the server. On your home Wi-Fi without one, plain HTTP can be read by
anyone else on the network.

## Sharing to the app

Once it's installed on Android, the app shows up in the Share menu. Share
a link or some text to it, and the add page opens with it filled in.

## Signed out every time the app opens?

Your browser is deleting the cookie. Chrome's "Delete data sites have
saved to your device when you close all windows" setting
(`chrome://settings/content/siteData`) does this. Add the server's address
under "Allowed to save data on your device".
