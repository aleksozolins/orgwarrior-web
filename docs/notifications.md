# Counts and notifications

orgwarrior-web can tell you what's waiting in two ways. A tab can show how
many tasks it lists, which is handy on your inbox. And through
[ntfy](https://ntfy.sh), a free notification app for Android and iPhone,
your phone can hear about tasks people share with you:

- when someone sends you a task (with an [add token](../README.md#sharing-your-list)),
- and, on their side, when you mark what they sent done.

Both are optional, and neither needs anything installed on the server.

## Counts on tabs

List the tabs that should show a count in your config, then restart
orgwarrior-web:

```toml
[web]
counts = ["inbox"]   # tab labels, from [web.tabs] or the default tabs
```

A tab you saved from the page gets one from its own sheet: long-press the
tab (or right-click it) and tap **Show how many it lists**. A count is the
number of tasks the tab's view lists, each counted once. It's updated
after every change you make, and every couple of minutes while the page
is open. A file's outline (`projects.org`) can't have one: counts are for
agenda views.

The installed app also shows the total on its icon, where the platform
allows it: an iPhone or iPad home-screen app (iOS 16.4 or later), and
apps installed from Chrome, Edge or Safari on a computer. Android doesn't
show badges for web apps. On an iPhone, the badge needs permission to
notify first: in the home-screen app, open ⚙ and tap **Allow the count
on the app's icon**. The
badge only changes while the page is open, so it can be behind until you
open the app. Notifications are what reach you when it's closed.

## Notifications

You'll need the ntfy app on your phone
([Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy),
also on F-Droid, or [iPhone](https://apps.apple.com/us/app/ntfy/id1625396347))
and a topic, which is the address messages are sent to. Topics on ntfy.sh
are free and need no account. Anyone who knows a topic's name can read
it, though, so the name works like a password. The page makes a long
random one for you.

### Hearing about what's sent to you

1. On your page, open ⚙, then **Notifications**, and tap **New topic**.
   Tap **Copy**, which copies the topic's name (the part after
   `ntfy.sh/`).
2. In the ntfy app, tap **+** and paste the name. For a server of your
   own, change the app's server to yours there too.
3. Back on the page, tap **Save**. A test message arrives in the app. If
   it can't be sent, the page says why and keeps the sheet open to fix it.

From then on, a task someone sends you arrives in the app about a minute
later, with its title and who sent it. Tapping it opens the task.

### Hearing back about what you sent

On the page you use to add to someone else's list, open ⚙ and set up
**Notifications** the same way. You can use the same topic as for your own
list. When the list's owner marks something you sent done, you hear its
title, its new state, and the note they wrote when they changed it, if
any. Tapping it opens the page with your sent list.

Done states always tell the sender. The list's owner can add other states
in their config, such as a waiting state that means "waiting on you":

```toml
[web.notify]
states = ["WAIT"]
```

### What's sent, and where it's kept

A message holds a task's title, its state, who sent it and the note
written with the change. It never holds the task's details. Messages to
ntfy.sh pass through its server, which keeps them for up to 12 hours, and
on an iPhone through Apple's push service too. For messages that stay on
your own machines, run your own ntfy server (below).

The topics live on the server in
`~/.local/state/orgwarrior-web/notify.json`, readable only by its user,
never in `config.toml`. **Turn off** in the same sheet removes one.
Revoking someone's add token stops their messages too.

### How the server notices

Once a minute, the server looks at every task that someone else sent (the
ones with a `:FROM:` property) and compares them with what it saw the
minute before. So it notices a change wherever it was made: on the page,
with the `orgwarrior` command, in Emacs, by Claude, or on another machine
whose changes arrive through a sync tool. What it saw last is kept in
`notify-seen.json` beside `notify.json`, so a restart doesn't send
anything twice, and changes made while it was stopped are still sent. A
task that comes back after more than two days (unarchived, or a file
restored) isn't announced as new.

### Your own ntfy server

Put the topic's full address (`https://ntfy.example.com/mytopic`) in the
sheet, and an access token if your server needs one. The token is kept on
the orgwarrior-web server and never sent back to the page. For messages to
reach an iPhone right away, a self-hosted ntfy server needs
`upstream-base-url: "https://ntfy.sh"` in its config: only a message's ID
goes through ntfy.sh then, and the app fetches the message from your
server. See [ntfy's docs](https://docs.ntfy.sh/install/) for the rest.

### Troubleshooting

- **Nothing arrives.** Check that the topic in the app is exactly the one
  in the sheet, and that the test message came. The server's log
  (`journalctl --user -u orgwarrior-web`) has a `notify:` line for each
  message it couldn't send, and one when Emacs didn't answer.
- **A message arrives late.** The server looks once a minute, and the app
  may hold messages while the phone saves battery. On Android, letting
  ntfy ignore battery optimization helps.
