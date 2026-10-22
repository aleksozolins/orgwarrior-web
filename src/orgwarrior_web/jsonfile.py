"""A small JSON state file, beside tokens.json: reread when it changes on
disk (another process saved it), written atomically."""

import json
import os
from pathlib import Path


class JsonFile:
    """PATH's JSON, EMPTY() while there's no file.  MODE, if given, is the
    new file's permissions (0o600 for secrets)."""

    def __init__(self, path: Path, empty, mode: int | None = None):
        self.path, self._empty, self._mode = path, empty, mode
        self._stamp, self._data = None, empty()

    def load(self):
        try:
            st = self.path.stat()
        except FileNotFoundError:
            self._stamp, self._data = None, self._empty()
            return self._data
        if (stamp := (st.st_mtime_ns, st.st_size, st.st_ino)) != self._stamp:
            self._data = json.loads(self.path.read_text())
            self._stamp = stamp
        return self._data

    def save(self, data):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        if self._mode is None:
            tmp.write_text(json.dumps(data, indent=1))
        else:
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, self._mode)
            with os.fdopen(fd, "w") as f:
                json.dump(data, f, indent=1)
        os.replace(tmp, self.path)  # atomic: a reader never sees half a file
