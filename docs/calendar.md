# The calendar feed

`/calendar.ics` is your agenda as a calendar to subscribe to, read-only:
scheduled dates, deadlines (a `-3d` warning becomes an alarm) and plain
timestamps of open tasks and events, repeats included, and diary sexps
(birthdays, `%%(diary-float ...)`) for the coming year. Done tasks,
habits and read-only files are left out: a file that isn't writable is
taken as a copy of another calendar (say Google's, exported to org from
vdirsyncer by a script), which a calendar app showing both would show
twice. Each event links to its task page, where you act on
it; changes show on the calendar's next refresh.

Calendar apps can't sign in, so the feed takes a token of its own in its
URL, one that opens the feed and nothing else:

```sh
orgwarrior-web token add calendar --calendar --url https://10.0.0.5:22546
```

Subscribe to the URL it prints:

- **Android:** [ICSx⁵](https://icsx5.bitfire.at/) (F-Droid or Play) takes
  the URL and a refresh interval and adds a read-only calendar to the
  phone's, so any calendar app shows it. Google Calendar's app hides
  such calendars until its settings allow non-Google ones. With your own
  certificate, the phone needs its CA installed ([phone.md](phone.md)). Every 15
  minutes to an hour is plenty: a fetch takes milliseconds.
- **iPhone:** Settings → Calendar → Accounts → Add Account → Other →
  Add Subscribed Calendar, with the CA trusted ([phone.md](phone.md)).
- **Desktop:** a calendar app that fetches it itself: Thunderbird ("On the
  Network"), GNOME Calendar or Evolution, Apple Calendar with the location
  "On My Mac".
- **Google Calendar** ("From URL") or iCloud fetch from their servers, so
  they need a public HTTPS address (a tunnel), refresh every few hours to
  a day, and keep a copy of your schedule.

`[web.calendar]` in orgwarrior's config (defaults shown):

```toml
[web.calendar]
keywords = true            # "NEXT Call dentist" in titles
deadlines = true           # deadlines as events, not only scheduled dates
alarms = true              # a deadline's warning (-3d) as an alarm
alarm_time = "09:00"       # when, for an all-day deadline
deadline_prefix = "Due: "  # a deadline's title starts with it ("" for none)
```

Times have no time zone: the device's own, as in org. `.+` and `++`
repeaters become plain repeats from the current date, which iCalendar
can't say otherwise; the date moves once you mark it done.
