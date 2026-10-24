# The calendar feed

`/calendar.ics` is your agenda as a calendar you can subscribe to. It's
read only. It includes open tasks' scheduled dates, deadlines and plain
timestamps, events, repeats, and diary sexps (birthdays,
`%%(diary-float ...)`) for the coming year. A deadline's warning (`-3d`)
becomes an alarm. Each event links to its task's page, where you can
change it, and changes show up on the calendar's next refresh.

Done tasks, habits and read-only files are left out. A file that isn't
writable is treated as a copy of another calendar, like a Google calendar
that a script exports to org through vdirsyncer. A calendar app showing
both would show those events twice.

Calendar apps can't sign in, so the feed takes a token in its URL. Make
one just for the feed. It opens the feed and nothing else:

```sh
orgwarrior-web token add calendar --calendar --url https://10.0.0.5:22546
```

Then subscribe to the URL it prints:

- **Android**: [ICSx⁵](https://icsx5.bitfire.at/) (on F-Droid or Play)
  takes the URL and a refresh interval and adds it as a read-only
  calendar on the phone, so any calendar app can show it. Google
  Calendar's app hides calendars like this until you allow non-Google
  calendars in its settings. If you made your own certificate, the phone
  needs its CA installed ([phone.md](phone.md)). Refreshing every 15
  minutes to an hour is plenty, and each fetch takes milliseconds.
- **iPhone**: Settings → Calendar → Accounts → Add Account → Other → Add
  Subscribed Calendar. The CA has to be trusted first
  ([phone.md](phone.md)).
- **Desktop**: use a calendar app that fetches the feed itself, like
  Thunderbird ("On the Network"), GNOME Calendar, Evolution, or Apple
  Calendar with the location set to "On My Mac".
- **Google Calendar** ("From URL") and iCloud fetch from their own
  servers. They need a public HTTPS address (a tunnel, for example), only
  refresh every few hours to once a day, and keep a copy of your
  schedule.

The feed's options go under `[web.calendar]` in orgwarrior's config.
These are the defaults:

```toml
[web.calendar]
keywords = true            # put the keyword in titles: "NEXT Call dentist"
deadlines = true           # show deadlines as events, not just scheduled dates
alarms = true              # turn a deadline's warning (-3d) into an alarm
alarm_time = "09:00"       # the alarm's time, for a deadline with no time
deadline_prefix = "Due: "  # what a deadline's title starts with ("" for nothing)
```

Times have no time zone. They're in the device's own time, as in org.
iCalendar has no way to say org's `.+` and `++` repeaters, so they become
plain repeats from the current date. The date moves when you mark the
task done.
