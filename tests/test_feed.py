"""The calendar feed's iCalendar, from api.calendar-shaped entries."""

import datetime

import pytest

from orgwarrior.config import ConfigError
from orgwarrior_web.feed import DEFAULTS, fold, ics, options


def entry(title, *stamps, keyword=None, done=False, habit=False, tags=()):
    return {"id": f"h-{title}", "title": title, "keyword": keyword, "done": done,
            "habit": habit, "tags": list(tags), "inherited": ["agenda"], "category": "x", "stamps": list(stamps)}


def stamp(kind, start, start_time=None, end=None, end_time=None, repeat=None, warning=None):
    return {"kind": kind, "start": start, "start_time": start_time, "end": end or start,
            "end_time": end_time or start_time, "repeat": repeat, "warning": warning}


def events(text):
    """Each VEVENT as {name: value}, lines unfolded."""
    assert text.endswith("\r\n") and "\n" not in text.replace("\r\n", "")
    lines = text.replace("\r\n ", "").split("\r\n")
    out, cur = [], None
    for line in lines:
        if line == "BEGIN:VEVENT":
            cur = {}
        elif line == "END:VEVENT":
            out.append(cur)
            cur = None
        elif cur is not None and ":" in line:
            name, _, value = line.partition(":")
            cur.setdefault(name, value)
    return out


NOW = datetime.datetime(2026, 10, 14, 12, tzinfo=datetime.UTC)


def feed(*entries, **opts):
    return events(ics(list(entries), {**DEFAULTS, **opts}, lambda i: f"https://h/#/t/{i}", NOW))


def test_events():
    evs = feed(
        entry("Call dentist", stamp("scheduled", "2026-10-14"), keyword="NEXT", tags=["@phone"]),
        entry("Dentist", stamp("timestamp", "2026-10-15", "14:00")),
        entry("Lunch", stamp("timestamp", "2026-10-16", "12:00", end_time="13:00")),
        entry("Trip", stamp("timestamp", "2026-11-02", end="2026-11-04")),
        entry("Trash", stamp("scheduled", "2026-10-14", repeat={"type": ".+", "value": 2, "unit": "w"}),
              keyword="TODO"),
        entry("Old", stamp("scheduled", "2026-10-01"), keyword="DONE", done=True),
        entry("Floss", stamp("scheduled", "2026-10-14", repeat={"type": ".+", "value": 1, "unit": "d"}),
              keyword="TODO", habit=True))
    by = {e["SUMMARY"]: e for e in evs}
    # Keywords in titles; done tasks and habits left out.
    assert set(by) == {"NEXT Call dentist", "Dentist", "Lunch", "Trip", "TODO Trash"}
    call = by["NEXT Call dentist"]
    assert call["DTSTART;VALUE=DATE"] == "20261014" and call["DTEND;VALUE=DATE"] == "20261015"
    assert call["UID"] == "h-Call dentist-scheduled@orgwarrior"
    assert call["URL"] == "https://h/#/t/h-Call dentist" and call["CATEGORIES"] == "@phone"
    # A time alone has no end; a range or time range does (all-day ends exclusive).
    assert by["Dentist"]["DTSTART"] == "20261015T140000" and "DTEND" not in by["Dentist"]
    assert by["Lunch"]["DTEND"] == "20261016T130000"
    assert by["Trip"]["DTEND;VALUE=DATE"] == "20261105"
    assert by["TODO Trash"]["RRULE"] == "FREQ=WEEKLY;INTERVAL=2"
    assert feed(entry("x", stamp("scheduled", "2026-10-14"), keyword="TODO"), keywords=False)[0]["SUMMARY"] == "x"


def test_deadlines_and_alarms():
    taxes = entry("Taxes", stamp("deadline", "2026-11-20", warning={"value": 3, "unit": "d"}),
                  keyword="TODO")
    text = ics([taxes], DEFAULTS, lambda i: i, NOW)
    # 3 days ahead, at 09:00: 3 days less 9 hours before the day starts.
    assert "BEGIN:VALARM" in text and "TRIGGER:-P2DT15H" in text
    timed = entry("Call", stamp("deadline", "2026-11-20", "15:00", warning={"value": 2, "unit": "h"}))
    assert "TRIGGER:-PT2H" in ics([timed], DEFAULTS, lambda i: i, NOW)
    assert "VALARM" not in ics([taxes], {**DEFAULTS, "alarms": False}, lambda i: i, NOW)
    no_warning = entry("Rent", stamp("deadline", "2026-11-01"), keyword="TODO")
    assert "VALARM" not in ics([no_warning], DEFAULTS, lambda i: i, NOW)
    assert feed(taxes, deadlines=False) == []
    # A deadline says so; a scheduled date doesn't.
    assert feed(taxes)[0]["SUMMARY"] == "Due: TODO Taxes"
    assert "DESCRIPTION:Due: TODO Taxes" in text
    assert feed(taxes, deadline_prefix="")[0]["SUMMARY"] == "TODO Taxes"


def test_sexps():
    birthdays = entry("Birthdays", {"kind": "sexp", "dates": [
        {"date": "2026-10-20", "text": "Birthday: Robin, 46; with a comma"},
        {"date": "2026-11-03", "text": None}]})
    evs = feed(birthdays)
    assert [e["SUMMARY"] for e in evs] == [r"Birthday: Robin\, 46\; with a comma", "Birthdays"]
    assert evs[0]["UID"] == "h-Birthdays-sexp1-20261020@orgwarrior"
    assert evs[1]["DTEND;VALUE=DATE"] == "20261104"


def test_fold():
    line = "SUMMARY:" + "é" * 100
    pieces = fold(line).split("\r\n ")
    assert "".join(pieces) == line and all(len(p.encode()) <= 75 for p in pieces)


def test_options():
    assert options({}) == DEFAULTS
    assert options({"alarm_time": "07:30"})["alarm_time"] == "07:30"
    for bad in ({"alarms": "yes"}, {"alarm_time": "9am"}, {"color": "red"}, {"deadline_prefix": 1}):
        with pytest.raises(ConfigError):
            options(bad)
