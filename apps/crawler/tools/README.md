# Crawler Tools

## cleanup_placeholder_covers.py

Identifies placeholder cover images (same file shared across multiple books via SHA-256 hash), deletes them, and nulls the cover fields in `book.json` and `index.json`.

### Running on the Windows server

SSH into the server, then run commands via Docker (no Python/uv installed on the host):

```powershell
# 1. SSH in
ssh admin@192.168.1.200

# 2. Dry-run — scans all book.json files, prints report, zero writes
docker run --rm -v D:\ntm\monkai\apps\crawler:/app python:3.11-slim bash -c "pip install typer -q && python /app/tools/cleanup_placeholder_covers.py --data-dir /app/data/book-data"

# 3. Execute — creates backup first, then deletes placeholders and patches JSON files
docker run --rm -v D:\ntm\monkai\apps\crawler:/app python:3.11-slim bash -c "pip install typer -q && python /app/tools/cleanup_placeholder_covers.py --data-dir /app/data/book-data --execute"

# 4. Restore — undo a prior --execute run (use backup path printed by execute)
docker run --rm -v D:\ntm\monkai\apps\crawler:/app python:3.11-slim bash -c "pip install typer -q && python /app/tools/cleanup_placeholder_covers.py --restore /app/data/backups/covers-backup-YYYYMMDDTHHMMSS"
```

**Note:** If `docker run` fails with a credentials error, the Docker Desktop credential store is stale. Fix by using a temporary config:

```powershell
# Create temp config without credential store
New-Item -ItemType Directory -Force -Path C:\tmp\dockercfg | Out-Null
'{"auths": {}}' | Set-Content C:\tmp\dockercfg\config.json

# Then prefix all docker commands with: docker --config C:\tmp\dockercfg
docker --config C:\tmp\dockercfg run --rm -v D:\ntm\monkai\apps\crawler:/app python:3.11-slim bash -c "pip install typer -q && python /app/tools/cleanup_placeholder_covers.py --data-dir /app/data/book-data"
```

### What it does

- **Dry-run (default):** walks all `book.json` under `data/book-data/`, hashes every local cover image, groups by hash. Any hash appearing in ≥2 books is flagged as a placeholder. Prints a report. No files modified.
- **Execute:** same scan, then:
  1. Backs up all affected files to `data/backups/covers-backup-{timestamp}/`
  2. Deletes placeholder image files
  3. Nulls `cover_image_local_path` and `cover_image_url` in each `book.json`
  4. Patches `cover_image_url` to `null` in each source's `index.json`
- **Restore:** reads the backup manifest and copies everything back to original paths.

### Data paths (on Windows server)

| Path | Description |
|---|---|
| `D:\ntm\monkai\apps\crawler\data\book-data\` | Book data root |
| `D:\ntm\monkai\apps\crawler\data\backups\` | Backups land here (outside Caddy-served path) |

### After running --execute

No restart needed. Caddy serves static files; changes are live immediately. The reader's `BookCover` component renders a deterministic gradient cover for any book with `coverImageUrl: null`.

### Flags

| Flag | Default | Description |
|---|---|---|
| `--data-dir` | `data/book-data` | Root of book-data directory |
| `--execute` | off | Apply changes (default is dry-run) |
| `--min-duplicates` | `2` | Min books sharing a hash to treat as placeholder |
| `--restore` | — | Restore from a backup directory |
