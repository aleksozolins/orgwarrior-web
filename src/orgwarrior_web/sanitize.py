"""Org's HTML for an entry's text (orgwarrior's show html), made safe to
draw: a task's text can be someone else's (an add token's details), and
org passes raw HTML through (`#+begin_export html`, `@@html:...@@`)."""

from html import escape
from html.parser import HTMLParser

# What org's export of a body writes; anything else is dropped, its text kept.
TAGS = {"p", "br", "hr", "b", "strong", "i", "em", "u", "del", "s", "sub", "sup", "code", "kbd",
        "pre", "span", "div", "a", "ul", "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody",
        "tfoot", "tr", "th", "td", "colgroup", "col", "caption", "blockquote",
        "h1", "h2", "h3", "h4", "h5", "h6"}
VOID = {"br", "hr", "col"}
# Dropped with all they hold.
DROP = {"script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math", "head", "title"}
SAFE_LINKS = ("http://", "https://", "mailto:")


class _Sanitizer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip, self.open = [], 0, []

    def handle_starttag(self, tag, attrs):
        if tag in DROP:
            self.skip += 1
            return
        if self.skip or tag not in TAGS:
            return
        kept = []
        for name, value in attrs:
            value = value or ""
            if name == "class" or (name in ("colspan", "rowspan", "scope") and tag in ("td", "th")):
                kept.append(f' {name}="{escape(value)}"')
            elif name == "href" and tag == "a" and value.strip().lower().startswith(SAFE_LINKS):
                kept.append(f' href="{escape(value.strip())}" target="_blank" rel="noopener"')
        out = tag
        if tag == "a" and not any(k.startswith(" href") for k in kept):
            out = "span"  # org's file: and id: links, a javascript: one: their text only
        self.out.append(f"<{out}{''.join(kept)}>")
        if tag not in VOID:
            self.open.append((tag, out))  # as written, as drawn

    def handle_endtag(self, tag):
        if tag in DROP:
            self.skip = max(0, self.skip - 1)
            return
        if self.skip:
            return
        # The innermost open one of that name, and what's open inside it.
        for i in range(len(self.open) - 1, -1, -1):
            if self.open[i][0] == tag:
                self.out.extend(f"</{out}>" for _, out in reversed(self.open[i:]))
                del self.open[i:]
                return

    def handle_data(self, data):
        if not self.skip:
            self.out.append(escape(data, quote=False))


def sanitize(html: str) -> str:
    s = _Sanitizer()
    s.feed(html or "")
    s.close()
    return "".join(s.out) + "".join(f"</{out}>" for _, out in reversed(s.open))
