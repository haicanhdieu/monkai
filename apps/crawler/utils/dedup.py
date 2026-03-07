# utils/dedup.py
import hashlib


def sha256_hash(file_bytes: bytes) -> str:
    """Compute SHA-256 hex digest of file bytes.

    Returns lowercase hex string. Consistent across calls with same input.
    Example: sha256_hash(b"hello") → "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    """
    return hashlib.sha256(file_bytes).hexdigest()


def is_duplicate(file_hash: str, seen_hashes: set[str]) -> bool:
    """Return True if file_hash is already in seen_hashes (duplicate detected).

    Does NOT mutate seen_hashes — caller is responsible for adding new hashes.
    """
    return file_hash in seen_hashes
