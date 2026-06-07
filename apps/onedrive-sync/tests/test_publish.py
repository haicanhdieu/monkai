from publish import (
    PI_BOOK_DATA,
    build_index_swap_args,
    build_rsync_args,
)

# --- build_rsync_args ---

def test_rsync_includes_a_flag():
    args = build_rsync_args(
        local_src="/local/onedrive/",
        pi_user="pi",
        pi_host="192.168.1.225",
        pi_port=22,
    )
    assert "-a" in args
    assert "--delete" not in args


def test_rsync_targets_onedrive_subtree_only():
    args = build_rsync_args(
        local_src="/local/onedrive/",
        pi_user="pi",
        pi_host="192.168.1.225",
        pi_port=22,
    )
    dest = args[-1]
    assert dest.startswith("pi@192.168.1.225:/mnt/data/book-data/onedrive/")
    assert "vbeta" not in dest
    assert "vnthuquan" not in dest


def test_rsync_uses_custom_port():
    args = build_rsync_args(
        local_src="/local/onedrive/",
        pi_user="pi",
        pi_host="192.168.1.225",
        pi_port=2222,
    )
    port_args = " ".join(args)
    assert "2222" in port_args


# --- build_index_swap_args ---

def test_index_swap_uses_mv_not_cp():
    args = build_index_swap_args(
        pi_user="pi",
        pi_host="192.168.1.225",
        pi_port=22,
        temp_name="index.json.tmp",
    )
    cmd = " ".join(args)
    assert "mv" in cmd
    assert "index.json.tmp" in cmd
    assert f"{PI_BOOK_DATA}/onedrive/index.json" in cmd


# --- reconciliation: dropped books ---

def test_dropped_book_not_in_full_regen_index():
    """A book absent from the new candidate set is absent from the new index.

    The full-regeneration strategy means the emitted index.json is always the
    complete current set. A removed upstream book simply doesn't appear.
    """
    from compose import compose

    prior_index = {
        "_meta": {},
        "books": [
            {"id": "onedrive:nhasachmienphi:book-a", "book_name": "Book A"},
            {"id": "onedrive:nhasachmienphi:book-b", "book_name": "Book B"},
        ],
    }
    # New run: only book-a kept (book-b dropped from upstream)
    new_fragment = {
        "_meta": {},
        "books": [{"id": "onedrive:nhasachmienphi:book-a", "book_name": "Book A"}],
    }
    result = compose(prior_index, new_fragment)
    ids = [b["id"] for b in result["books"]]
    assert "onedrive:nhasachmienphi:book-a" in ids
    assert "onedrive:nhasachmienphi:book-b" not in ids
