# Story 1.3: Shared Data Models

Status: done

## Story

As a developer,
I want all Pydantic v2 data models defined in a single `models.py`,
so that all pipeline modules share one validated, type-safe data contract with no schema duplication.

## Acceptance Criteria

1. **Given** `models.py` exists with `ScriptureMetadata` defined
   **When** I instantiate it with all required fields
   **Then** the model validates successfully
   **And** optional fields (`title_pali`, `title_sanskrit`, `author_translator`) default to `None` and appear as `null` in JSON output (never omitted)
   **And** `category` rejects any value outside `["Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ"]` with a `ValidationError`
   **And** `file_format` only accepts `["html", "pdf", "epub", "other"]`
   **And** `copyright_status` only accepts `["public_domain", "unknown"]`
   **And** `model.model_dump_json()` produces valid JSON with snake_case field names and ISO 8601 UTC `created_at`

2. **Given** `IndexRecord` is defined in `models.py`
   **When** I instantiate it
   **Then** it contains exactly: `id`, `title`, `category`, `subcategory`, `source`, `url`, `file_path`, `file_format`, `copyright_status` — no full metadata fields beyond these

3. **Given** a `SourceConfig` instantiated with `rate_limit_seconds` below 1.0
   **When** I instantiate it
   **Then** a `ValidationError` is raised, enforcing the ethical crawl minimum rate

## Tasks / Subtasks

- [x] Add `ScriptureMetadata` to `models.py` (AC: 1)
  - [x] Define all 13 fields per the schema (see Dev Notes)
  - [x] Use `Literal` for `category`, `file_format`, `copyright_status` — enum enforcement
  - [x] Optional fields use `str | None = None` — guarantees `null` in JSON output
  - [x] `created_at: datetime` — use Python `datetime` type (Pydantic serializes to ISO 8601)
  - [x] Add `model_config = ConfigDict(populate_by_name=True)` for flexibility
- [x] Add `IndexRecord` to `models.py` (AC: 2)
  - [x] Exactly 9 fields — do NOT include full metadata fields like `title_pali`, `author_translator`, `created_at`
- [x] Verify `SourceConfig.rate_limit_seconds` validator is in place (AC: 3)
  - [x] This was created in Story 1.2 — confirmed the validator works as expected
- [x] Test model serialization manually (AC: 1)
  - [x] ScriptureMetadata instantiation works with all required fields ✅
  - [x] Optional fields appear as `null`, not absent ✅
  - [x] `created_at` is ISO 8601 UTC string (e.g., "2026-02-27T09:35:21.301846Z") ✅

## Dev Notes

### Dependency on Story 1.2

`models.py` already exists with `SourceConfig` and `CrawlerConfig` from Story 1.2. This story **extends** that file — do NOT recreate it from scratch. Add `ScriptureMetadata` and `IndexRecord` to the existing file.

### Complete models.py After This Story

```python
# models.py
from __future__ import annotations
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, field_validator


class SourceConfig(BaseModel):
    """Configuration for a single crawl source. Loaded from config.yaml."""
    name: str
    seed_url: str
    rate_limit_seconds: float = 1.5
    output_folder: str
    css_selectors: dict[str, str]
    file_type_hints: list[str] = []
    pagination_selector: str | None = None

    @field_validator("rate_limit_seconds")
    @classmethod
    def enforce_minimum_rate_limit(cls, v: float) -> float:
        if v < 1.0:
            raise ValueError(
                f"rate_limit_seconds must be ≥ 1.0 for ethical crawling, got {v}"
            )
        return v


class CrawlerConfig(BaseModel):
    """Top-level crawler configuration. Contains all sources."""
    sources: list[SourceConfig]
    output_dir: str = "data"
    log_file: str = "logs/crawl.log"


class ScriptureMetadata(BaseModel):
    """Full metadata record for a single downloaded scripture file.

    Written as {filename}.meta.json alongside each raw file.
    Optional fields are always serialized as null — never omitted.
    """
    model_config = ConfigDict(populate_by_name=True)

    id: str                          # e.g. "thuvienhoasen__kinh-tam-kinh"
    title: str                       # Original title in Vietnamese
    title_pali: str | None = None    # Pali title if present, else null
    title_sanskrit: str | None = None  # Sanskrit title if present, else null
    category: Literal["Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ"]
    subcategory: str                 # e.g. "Trường Bộ", "Bát Nhã"
    source: str                      # Source name from config, e.g. "thuvienhoasen"
    url: str                         # Canonical source URL
    author_translator: str | None = None  # Translator name if present, else null
    file_path: str                   # Relative path: "data/raw/thuvienhoasen/nikaya/tam-kinh.html"
    file_format: Literal["html", "pdf", "epub", "other"]
    copyright_status: Literal["public_domain", "unknown"]
    created_at: datetime             # UTC datetime; serializes to ISO 8601


class IndexRecord(BaseModel):
    """Lightweight record in data/index.json — the Phase 2 handoff contract.

    Contains exactly 9 fields. Do NOT add metadata-only fields here.
    This schema is frozen after Phase 1 — changes break Phase 2.
    """
    id: str
    title: str
    category: Literal["Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ"]
    subcategory: str
    source: str
    url: str
    file_path: str
    file_format: Literal["html", "pdf", "epub", "other"]
    copyright_status: Literal["public_domain", "unknown"]
```

### Critical: ISO 8601 UTC Datetime Serialization

`created_at` must serialize to `"2026-02-27T10:30:00Z"` format (NOT a Unix timestamp, NOT local time).

Pydantic v2 serializes `datetime` objects to ISO 8601 by default, but the `+00:00` suffix vs `Z` suffix varies. To ensure `Z` suffix:

```python
from datetime import datetime, UTC

# When creating a ScriptureMetadata instance:
created_at = datetime.now(UTC)

# Pydantic v2 serializes datetime to: "2026-02-27T10:30:00Z" (with Z suffix for UTC)
# If you need explicit control:
# created_at_str = datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
```

Pydantic v2 with `datetime` field type and a UTC-aware datetime object will output `Z` suffix correctly. Test this explicitly to confirm the output format matches `"2026-02-27T10:30:00Z"`.

### Critical: Null Optional Fields in JSON Output

Optional fields (`title_pali`, `title_sanskrit`, `author_translator`) MUST appear as `null` in JSON output — never omitted. Pydantic v2 `model_dump_json()` includes all fields by default (unlike `exclude_none=True`). Do NOT use `model_dump_json(exclude_none=True)`.

```python
# CORRECT: Optional field appears as null
m.model_dump_json()
# → {"id": "...", "title_pali": null, "title_sanskrit": null, ...}

# WRONG: Omits optional fields
m.model_dump_json(exclude_none=True)
# → {"id": "...", ...}  ← title_pali missing, breaks Phase 2 contract
```

### IndexRecord: Phase 2 Handoff Contract (FROZEN)

`IndexRecord` has exactly 9 fields. This schema is the Phase 2 handoff contract and MUST NOT be modified after Phase 1 completion. Do not add extra fields "for convenience" — Phase 2 will depend on this exact structure.

The 9 frozen fields:
```json
{
  "id": "thuvienhoasen__kinh-tam-kinh",
  "title": "Tâm Kinh",
  "category": "Đại Thừa",
  "subcategory": "Bát Nhã",
  "source": "thuvienhoasen",
  "url": "https://thuvienhoasen.org/...",
  "file_path": "data/raw/thuvienhoasen/dai-thua/tam-kinh.html",
  "file_format": "html",
  "copyright_status": "public_domain"
}
```

### Category Taxonomy (Exact Values)

The `Literal` type enforces exact match. These are the only valid categories:

| Literal Value | Tradition |
|---|---|
| `"Nikaya"` | Theravada / Pali Canon |
| `"Đại Thừa"` | Mahayana |
| `"Mật Tông"` | Vajrayana |
| `"Thiền"` | Zen / Ch'an |
| `"Tịnh Độ"` | Pure Land |

Vietnamese Unicode is intentional — these must be preserved exactly including diacritics.

### Architecture Compliance

- **All modules import from `models`** — `from models import ScriptureMetadata, IndexRecord, CrawlerConfig`
- **Never redefine** schema as a plain dict, TypedDict, or dataclass in any other file
- **Pydantic v2 API only** — `model_dump_json()` not `.json()` (which is Pydantic v1)
- **`Literal` for enums** — no separate Enum class needed, Literal is cleaner and Pydantic validates it

### Anti-Patterns

- ❌ `from pydantic import validator` — that's Pydantic v1; use `@field_validator` + `@classmethod`
- ❌ `Optional[str]` from typing — use `str | None` (Python 3.10+ syntax, project uses 3.11)
- ❌ `List[SourceConfig]` — use `list[SourceConfig]`
- ❌ `model.json()` — Pydantic v1 API; use `model.model_dump_json()`
- ❌ `model.dict()` — Pydantic v1 API; use `model.model_dump()`
- ❌ Adding `title_pali` or `author_translator` to `IndexRecord` — it's a minimal handoff contract

### Project Structure Notes

- `models.py` is at project root — accessible as `from models import ...` from any script
- No `from __future__ import annotations` conflicts with Pydantic v2 — it works correctly

### References

- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Metadata Schema — Pydantic v2]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Phase 2 Handoff Contract]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Format Patterns]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3: Shared Data Models]
- [Source: _bmad-output/planning-artifacts/epics.md#Additional Requirements — Shared Data Models]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/prd-phase1-crawler.md#FR12, FR13, FR18]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Extended `models.py` with `ScriptureMetadata` (13 fields, Literal enums, optional nulls) and `IndexRecord` (9 frozen fields)
- AC1: ScriptureMetadata validates successfully; optional fields serialize as null; category/file_format/copyright_status enums enforced via Literal
- AC1: created_at serializes to ISO 8601 UTC string (format: "2026-02-27T09:35:21.301846Z")
- AC2: IndexRecord has exactly 9 fields confirmed via model_dump()
- AC3: SourceConfig.rate_limit_seconds validator rejects values below 1.0 with clear error message

### File List

- models.py (extended with ScriptureMetadata and IndexRecord; code review: added UTC enforcement validator on created_at)
