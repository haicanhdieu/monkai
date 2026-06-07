from unittest.mock import patch

import pytest

from rclone import build_pull_args, run


EXPECTED_ARGS = [
    "copy",
    "onedrive-monkai:PUBLIC-DATA/LIBERET/BOOK-FILES",
    "./staging/onedrive/",
    "--include",
    "*.epub",
    "--include",
    "__books.json",
]


def test_build_pull_args_exact_vector():
    assert build_pull_args() == EXPECTED_ARGS


def test_run_raises_on_nonzero_exit():
    with patch("rclone.subprocess.run") as mock_run:
        mock_run.return_value.returncode = 1
        mock_run.return_value.stderr = "Error: Failed to connect"
        mock_run.return_value.stdout = ""
        with pytest.raises(RuntimeError, match="Failed to connect"):
            run(["copy", "bad-remote:path", "./staging/"])
