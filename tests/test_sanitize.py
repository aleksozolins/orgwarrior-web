"""What org's HTML may draw: its own markup, never a script or a stray attribute."""

from orgwarrior_web.sanitize import sanitize


def test_org_markup_kept():
    html = ('<p>\nSome <b>bold</b>, <a href="https://example.org">a link</a>.\n</p>\n'
            '<table border="2"><tbody><tr><td class="org-right" colspan="2">1</td></tr></tbody></table>\n'
            '<pre class="src src-python"><code><span class="org-builtin">print</span></code></pre>\n'
            '<ul class="org-ul"><li class="off"><code>[&nbsp;]</code> one</li></ul>')
    assert sanitize(html) == (
        '<p>\nSome <b>bold</b>, <a href="https://example.org" target="_blank" rel="noopener">a link</a>.\n</p>\n'
        '<table><tbody><tr><td class="org-right" colspan="2">1</td></tr></tbody></table>\n'
        '<pre class="src src-python"><code><span class="org-builtin">print</span></code></pre>\n'
        '<ul class="org-ul"><li class="off"><code>[\xa0]</code> one</li></ul>')


def test_raw_html_made_safe():
    # What #+begin_export html could put there: scripts and their text gone,
    # handlers and styles off, a javascript: or file: link its text only.
    assert sanitize('<p onclick="x()" style="color:red">hi<script>alert(1)</script></p>') == "<p>hi</p>"
    assert sanitize('<a href="javascript:alert(1)">x</a><a href="file:/etc/passwd"><span>y</span></a>') == \
        "<span>x</span><span><span>y</span></span>"
    assert sanitize('<img src=x onerror="alert(1)"><iframe src="//evil">t</iframe>ok') == "ok"
    assert sanitize("<p>&lt;script&gt; stays text</p>") == "<p>&lt;script&gt; stays text</p>"
    assert sanitize("<b>unclosed") == "<b>unclosed</b>"
