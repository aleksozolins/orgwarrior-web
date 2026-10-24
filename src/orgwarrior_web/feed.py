"""The calendar feed: orgwarrior's dated entries (api.calendar) as
iCalendar (RFC 5545), read-only, each event linking to its task page."""

import datetime
import re

from orgwarrior.config import ConfigError

DEFAULTS = {"keywords": True, "deadlines": True, "alarms": True, "alarm_time": "09:00",
            "deadline_prefix": "Due: "}

FREQ = {"h": "HOURLY", "d": "DAILY", "w": "WEEKLY", "m": "MONTHLY", "y": "YEARLY"}
# iCalendar durations have no months or years: a warning of 2m is 60 days.
MINUTES = {"h": 60, "d": 1440, "w": 7 * 1440, "m": 30 * 1440, "y": 365 * 1440}


def options(table: dict) -> dict:
    """[web.calendar] over the defaults, checked at startup like the tabs."""
    if unknown := set(table) - set(DEFAULTS):
        raise ConfigError(f"[web.calendar] has no key {sorted(unknown)[0]!r}")
    for key in ("keywords", "deadlines", "alarms"):
        if not isinstance(table.get(key, True), bool):
            raise ConfigError(f"[web.calendar] {key} has to be true or false")
    if not isinstance(table.get("deadline_prefix", ""), str):
        raise ConfigError('[web.calendar] deadline_prefix has to be text, like "Due: ", or "" for nothing')
    if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", str(table.get("alarm_time", "09:00"))):
        raise ConfigError('[web.calendar] alarm_time has to be a time of day, like "09:00"')
    return {**DEFAULTS, **table}


def escape(text: str) -> str:
    return (text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
            .replace("\r\n", "\\n").replace("\r", "\\n").replace("\n", "\\n"))


def fold(line: str) -> str:
    """LINE in pieces of at most 75 octets, as the RFC wants, never
    splitting a UTF-8 character."""
    out, piece, size = [], "", 0
    for ch in line:
        n = len(ch.encode())
        if size + n > (75 if not out else 74):
            out.append(piece)
            piece, size = "", 0
        piece += ch
        size += n
    out.append(piece)
    return "\r\n ".join(out)


def ical_date(iso: str) -> str:
    return iso.replace("-", "")


def ical_time(iso: str, hhmm: str) -> str:
    return f"{ical_date(iso)}T{hhmm.replace(':', '')}00"


def next_day(iso: str) -> str:
    return (datetime.date.fromisoformat(iso) + datetime.timedelta(days=1)).isoformat()


def duration(minutes: int) -> str:
    sign = "-" if minutes < 0 else ""
    days, rest = divmod(abs(minutes), 1440)
    hours, mins = divmod(rest, 60)
    time = (f"{hours}H" if hours else "") + (f"{mins}M" if mins else "")
    return f"{sign}P" + (f"{days}D" if days or not time else "") + (f"T{time}" if time else "")


def times(stamp: dict) -> list[str]:
    """DTSTART and DTEND.  Floating times (no time zone): the device's own,
    as org's are.  All-day ends are exclusive, so a range's last day + 1."""
    start, end, t0, t1 = stamp["start"], stamp["end"], stamp["start_time"], stamp["end_time"]
    if not t0:
        return [f"DTSTART;VALUE=DATE:{ical_date(start)}", f"DTEND;VALUE=DATE:{ical_date(next_day(end))}"]
    lines = [f"DTSTART:{ical_time(start, t0)}"]
    if t1 and (end, t1) != (start, t0):
        lines.append(f"DTEND:{ical_time(end, t1)}")
    elif end != start:
        lines.append(f"DTEND:{ical_date(next_day(end))}T000000")
    return lines


def alarm(stamp: dict, opts: dict, summary: str) -> list[str]:
    """A deadline's warning (-3d) as an alarm that many days ahead: for an
    all-day deadline, at alarm_time on that day."""
    warning = stamp.get("warning")
    if not (opts["alarms"] and stamp["kind"] == "deadline" and warning):
        return []
    ahead = warning["value"] * MINUTES[warning["unit"]]
    if not stamp["start_time"]:
        h, m = opts["alarm_time"].split(":")
        ahead -= int(h) * 60 + int(m)
    return ["BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{escape(summary)}",
            f"TRIGGER:{duration(-ahead)}", "END:VALARM"]


def ics(entries: list[dict], opts: dict, task_url, now: datetime.datetime | None = None) -> str:
    """The calendar of ENTRIES (api.calendar): open tasks and events, no
    habits, nothing from a read-only file (another calendar's copy: a
    calendar app showing both would show it twice); TASK_URL(id) is the
    link each event carries."""
    stamp_now = (now or datetime.datetime.now(datetime.UTC)).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//orgwarrior-web//EN",
             "CALSCALE:GREGORIAN", "X-WR-CALNAME:orgwarrior",
             "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"]
    for e in entries:
        if e["habit"] or e["done"] or e["read_only"]:
            continue
        summary = f"{e['keyword']} {e['title']}" if opts["keywords"] and e["keyword"] else e["title"]
        url = task_url(e["id"])
        common = [f"URL:{url}", f"DESCRIPTION:{escape(url)}"]
        if e["tags"]:
            common.append("CATEGORIES:" + ",".join(escape(t) for t in e["tags"]))
        n = 0
        for stamp in e["stamps"]:
            kind = stamp["kind"]
            if kind == "deadline" and not opts["deadlines"]:
                continue
            if kind not in ("scheduled", "deadline"):
                n += 1
            # Stable across fetches, so a calendar updates an event in place.
            uid = f"{e['id']}-{kind if kind in ('scheduled', 'deadline') else f'{kind}{n}'}"
            if "dates" in stamp:  # a diary sexp, one event per day it holds
                for d in stamp["dates"]:
                    lines += ["BEGIN:VEVENT", f"UID:{uid}-{ical_date(d['date'])}@orgwarrior",
                              f"DTSTAMP:{stamp_now}", f"DTSTART;VALUE=DATE:{ical_date(d['date'])}",
                              f"DTEND;VALUE=DATE:{ical_date(next_day(d['date']))}",
                              f"SUMMARY:{escape(d['text'] or summary)}", *common, "END:VEVENT"]
                continue
            # A deadline and a scheduled date would otherwise read the same.
            title = opts["deadline_prefix"] + summary if kind == "deadline" else summary
            lines += ["BEGIN:VEVENT", f"UID:{uid}@orgwarrior", f"DTSTAMP:{stamp_now}",
                      *times(stamp), f"SUMMARY:{escape(title)}", *common]
            if r := stamp["repeat"]:
                # .+ and ++ have no iCalendar equivalent: a plain repeat
                # from the current date, which moves when it's done.
                lines.append(f"RRULE:FREQ={FREQ[r['unit']]};INTERVAL={r['value']}")
            lines += [*alarm(stamp, opts, title), "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return "".join(fold(line) + "\r\n" for line in lines)
