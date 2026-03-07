# utils/state.py
import json
import os
import tempfile
from typing import Literal

StatusValue = Literal["downloaded", "error", "skipped"]
STATE_FILE = "data/crawl-state.json"


class CrawlState:
    """Persistent URL status tracker backed by data/crawl-state.json.

    Tracks per-URL crawl outcomes: downloaded, error, or skipped.
    Supports incremental/resumable crawls (FR7, FR8, NFR5).
    """

    def __init__(self, state_file: str = STATE_FILE) -> None:
        self._state_file = state_file
        self._state: dict[str, StatusValue] = {}
        self._load()

    def _load(self) -> None:
        """Load state from disk. Silent no-op if file doesn't exist or is empty."""
        if os.path.exists(self._state_file) and os.path.getsize(self._state_file) > 0:
            with open(self._state_file, encoding="utf-8") as f:
                self._state = json.load(f)

    def save(self) -> None:
        """Persist current state to disk atomically via temp-file + os.replace."""
        state_dir = os.path.dirname(self._state_file) or "."
        os.makedirs(state_dir, exist_ok=True)
        tmp_fd, tmp_path = tempfile.mkstemp(dir=state_dir, suffix=".tmp")
        try:
            with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
                json.dump(self._state, f, indent=2, ensure_ascii=False)
            os.replace(tmp_path, self._state_file)
        except Exception:
            os.unlink(tmp_path)
            raise

    def is_downloaded(self, url: str) -> bool:
        """Return True if URL is recorded as successfully downloaded."""
        return self._state.get(url) == "downloaded"

    def get_status(self, url: str) -> StatusValue | None:
        """Return current status for URL, or None if not tracked."""
        return self._state.get(url)

    def mark_downloaded(self, url: str) -> None:
        self._state[url] = "downloaded"

    def mark_error(self, url: str) -> None:
        self._state[url] = "error"

    def mark_skipped(self, url: str) -> None:
        self._state[url] = "skipped"
