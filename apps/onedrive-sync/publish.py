"""Publish the onedrive payload to the Pi idempotently and non-destructively.

Design principles:
- rsync -a WITHOUT --delete: additive only; never touch vbeta/ or vnthuquan/.
- Atomic index swap: rsync to temp file, then ssh mv → readers never see partial writes.
- Reconciliation: full regeneration per run → removed upstream books drop from index
  naturally (the index is always the complete current set). Orphaned epub files on the
  Pi are harmless (unreferenced). A --prune flag can clean them up in a future story.
- No Python on the Pi (NFR1/AD-4): all logic runs on the Mac; Pi just receives files.
"""

import subprocess
from dataclasses import dataclass
from pathlib import Path

import yaml

PI_BOOK_DATA = "/mnt/data/book-data"


@dataclass
class PiConfig:
    host: str
    user: str
    password: str  # stored for reference; rsync/ssh use SSH key auth (configure key auth before running)
    port: int

    @classmethod
    def from_yaml(cls, path: Path) -> "PiConfig":
        if not path.exists():
            raise FileNotFoundError(f"Pi server config not found: {path}")
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        try:
            return cls(
                host=data["host"],
                user=data["user"],
                password=data.get("password", ""),
                port=int(data.get("port", 22)),
            )
        except KeyError as e:
            raise ValueError(f"Missing required key {e} in {path}") from e


def build_rsync_args(
    local_src: str,
    pi_user: str,
    pi_host: str,
    pi_port: int,
    subpath: str = "",
) -> list[str]:
    """Build rsync command args. -a only, NO --delete. Scoped to onedrive/ subtree."""
    dest = f"{pi_user}@{pi_host}:{PI_BOOK_DATA}/onedrive/{subpath}"
    return [
        "rsync",
        "-a",
        "-e", f"ssh -p {pi_port} -o StrictHostKeyChecking=no",
        local_src,
        dest,
    ]


def build_index_swap_args(
    pi_user: str,
    pi_host: str,
    pi_port: int,
    temp_name: str = "index.json.tmp",
) -> list[str]:
    """Build ssh mv command for atomic index swap on the Pi."""
    tmp_path = f"{PI_BOOK_DATA}/onedrive/{temp_name}"
    final_path = f"{PI_BOOK_DATA}/onedrive/index.json"
    return [
        "ssh",
        "-p", str(pi_port),
        "-o", "StrictHostKeyChecking=no",
        f"{pi_user}@{pi_host}",
        f"mv '{tmp_path}' '{final_path}'",  # quoted to handle spaces in paths
    ]


def publish_to_pi(
    publish_dir: Path,
    pi_config: PiConfig,
    run_cmd=subprocess.run,
) -> None:
    """Rsync epub files + covers, then atomically swap index.json on the Pi."""
    # Copy epub files
    epub_src = str(publish_dir / "onedrive" / "nhasachmienphi") + "/"
    epub_args = build_rsync_args(
        epub_src, pi_config.user, pi_config.host, pi_config.port, subpath="nhasachmienphi/"
    )
    run_cmd(epub_args, check=True)

    # Copy cover files
    cover_src = str(publish_dir / "onedrive" / "cover") + "/"
    cover_args = build_rsync_args(
        cover_src, pi_config.user, pi_config.host, pi_config.port, subpath="cover/"
    )
    run_cmd(cover_args, check=True)

    # Rsync index.json to temp, then atomic swap
    index_src = str(publish_dir / "onedrive" / "index.json")
    tmp_name = "index.json.tmp"
    index_args = build_rsync_args(
        index_src, pi_config.user, pi_config.host, pi_config.port, subpath=tmp_name
    )
    run_cmd(index_args, check=True)

    swap_args = build_index_swap_args(pi_config.user, pi_config.host, pi_config.port, tmp_name)
    run_cmd(swap_args, check=True)
