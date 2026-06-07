"""Thin subprocess wrapper around the rclone CLI."""

import subprocess

_REMOTE = "onedrive-monkai:PUBLIC-DATA/LIBERET/BOOK-FILES"
_STAGING = "./staging/onedrive/"


def build_pull_args() -> list[str]:
    """Return the exact rclone argument vector for pulling epub + manifest."""
    return [
        "copy",
        _REMOTE,
        _STAGING,
        "--include",
        "*.epub",
        "--include",
        "__books.json",
    ]


def run(args: list[str]) -> str:
    """Run rclone with the given args, returning stdout. Raises RuntimeError on failure."""
    result = subprocess.run(
        ["rclone", *args],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    return result.stdout
