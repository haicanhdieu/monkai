# tests/test_dedup.py
from utils.dedup import sha256_hash, is_duplicate

KNOWN_HASH = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"  # sha256(b"hello")


def test_sha256_hash_known_value():
    assert sha256_hash(b"hello") == KNOWN_HASH


def test_sha256_hash_stability():
    assert sha256_hash(b"test bytes") == sha256_hash(b"test bytes")


def test_sha256_hash_different_inputs():
    assert sha256_hash(b"hello") != sha256_hash(b"world")


def test_is_duplicate_true_for_known_hash():
    seen = {KNOWN_HASH}
    assert is_duplicate(KNOWN_HASH, seen) is True


def test_is_duplicate_false_for_new_hash():
    seen = {KNOWN_HASH}
    new_hash = sha256_hash(b"different content")
    assert is_duplicate(new_hash, seen) is False


def test_is_duplicate_does_not_mutate_set():
    seen: set[str] = set()
    new_hash = sha256_hash(b"some content")
    is_duplicate(new_hash, seen)
    assert len(seen) == 0  # is_duplicate must not add to the set
