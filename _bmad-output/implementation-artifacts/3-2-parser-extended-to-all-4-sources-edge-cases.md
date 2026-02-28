# Story 3.2: Parser Extended to All 4 Sources + Edge Cases

Status: done

## Story

As a developer,
I want `parser.py` extended to handle all 4 sources with correct CSS selectors and copyright classification,
so that the complete corpus of all 4 sources has validated, UTF-8 clean metadata records.

## Acceptance Criteria

1. **Given** raw files exist for `budsas`, `chuabaphung`, and `dhammadownload`
   **When** I run `parser.py --source all`
   **Then** `.meta.json` files are generated for every raw file across all 4 sources
   **And** each source uses its own CSS selectors defined in `config.yaml` — no hardcoded selectors in parser.py (NFR9)

2. **Given** a modern Vietnamese translation file is parsed (chuabaphung or dhammadownload)
   **When** `copyright_status` is determined
   **Then** it is set to `"unknown"` for modern translations
   **And** classical Pali canon texts (Nikaya category) from budsas are set to `"public_domain"`

3. **Given** a metadata field contains Vietnamese Unicode text (e.g., title with diacritics)
   **When** the `.meta.json` is written
   **Then** the file is UTF-8 encoded with no mojibake or encoding corruption (NFR7)
   **And** `json.loads(meta_path.read_text(encoding="utf-8"))` succeeds with all Vietnamese characters preserved

4. **Given** a raw file's HTML is malformed or CSS selectors return no match
   **When** the parser processes it
   **Then** it logs `[ERROR] [parser] Extraction failed: {file_path} — {reason}` and continues
   **And** the run never crashes due to a single file failure (per-file try/except already in place from 3.1)
   **And** ≥ 90% of all records across the corpus have all required metadata fields populated (NFR6)

## Tasks / Subtasks

- [x] Implement `classify_copyright(source_name, category) -> Literal["public_domain", "unknown"]` (AC: 2)
  - [x] `budsas` + category `"Nikaya"` → `"public_domain"` (classical Pali canon)
  - [x] All other source/category combos → `"unknown"`
  - [x] Replace hardcoded `"unknown"` in `extract_metadata()` with call to `classify_copyright(source.name, category)`
- [x] Handle budsas source specifics in `extract_metadata()` (AC: 1, 2)
  - [x] `category` selector is `""` in config → use `"Nikaya"` unconditionally (no map_category call needed)
  - [x] `subcategory` selector: `"h1"` → `select_text(soup, "h1")`; use `""` if None
  - [x] `title` selector: `"h2, h3"` — use `soup.select_one("h2, h3")` via select_text() for first match
  - [x] All budsas files are HTML — file_format always `"html"`
- [x] Handle chuabaphung source specifics in `extract_metadata()` (AC: 1, 3)
  - [x] `category`: `".breadcrumb li:nth-child(2)"` → `map_category(text)`
  - [x] `subcategory`: `".breadcrumb li:last-child"` → strip whitespace
  - [x] `title`: `"h1.entry-title"` → strip whitespace
  - [x] Open files with `encoding="utf-8", errors="replace"` (already the standard pattern)
- [x] Handle dhammadownload source specifics in `extract_metadata()` (AC: 1, 4)
  - [x] Mixed HTML + PDF — detect via `file_path.suffix`
  - [x] For PDF: title from `file_path.stem.replace("-", " ").title()`, category `"Nikaya"`, subcategory `""`, file_format `"pdf"`
  - [x] For HTML: apply standard CSS selector extraction with `source.css_selectors`
  - [x] `category`/`subcategory` selectors may be `""` — `select_text()` already returns None on empty, handled by defaults
- [x] Handle empty/None CSS selector results gracefully across all sources (AC: 4)
  - [x] `title` None → `file_path.stem` fallback + log `[WARN] [parser] No title extracted: {file_path}`
  - [x] `category` None → `"Nikaya"` default + log `[WARN] [parser] No category for {file_path}, defaulting to Nikaya`
  - [x] `subcategory` None → `""` (empty string; still valid for Pydantic)
  - [x] Verify none of these defaults can produce a Pydantic ValidationError
- [x] Add NFR6 coverage logging per source run (AC: 4)
  - [x] Track: `success_count` (ScriptureMetadata created), `error_count` (extract_metadata returned None)
  - [x] After each source: `coverage_pct = success_count / (success_count + error_count) * 100`
  - [x] If `coverage_pct < 90`: log `[WARN] [parser] Coverage {coverage_pct:.1f}% below 90% threshold for {source.name}`
- [x] Verify config-only extensibility — no source-name branches in `extract_metadata()` (AC: 1)
  - [x] Confirm: no `if source.name == "budsas":` conditional blocks in core extraction logic
  - [x] All source-specific behavior comes from `source.css_selectors` (from config) + `classify_copyright()` (source name as param)
  - [x] Exception: PDF handling is driven by `file_path.suffix`, not source name — this is correct
- [x] Extend `tests/test_parser.py` with multi-source and edge case coverage (AC: 1–4)
  - [x] Test `classify_copyright("budsas", "Nikaya")` → `"public_domain"`
  - [x] Test `classify_copyright("budsas", "Đại Thừa")` → `"unknown"`
  - [x] Test `classify_copyright("chuabaphung", "Nikaya")` → `"unknown"`
  - [x] Test `classify_copyright("thuvienhoasen", "Nikaya")` → `"unknown"`
  - [x] Test budsas: empty category selector → "Nikaya" default; title from "h2, h3" selector
  - [x] Test dhammadownload PDF: title from filename stem, format "pdf", no BeautifulSoup error
  - [x] Test malformed HTML (unclosed tags, garbage bytes): extract_metadata returns None, no exception propagates
  - [x] Test Vietnamese UTF-8 roundtrip: `json.loads(meta_path.read_text("utf-8"))["title"]` preserves "Tâm Kinh"
  - [x] Test NFR6 warning logged when coverage < 90% (mock enough files to trigger)

## Dev Notes

### classify_copyright Implementation

```python
def classify_copyright(
    source_name: str, category: str
) -> Literal["public_domain", "unknown"]:
    """Classify copyright based on source origin and text category."""
    if source_name == "budsas" and category == "Nikaya":
        return "public_domain"  # Ancient Pali canon — unambiguously public domain
    return "unknown"
```

Place this function in `parser.py` alongside other helpers. Call it after `category` is resolved:
```python
copyright_status = classify_copyright(source.name, category)
```

### budsas Title Selector: "h2, h3"

`select_text(soup, "h2, h3")` calls `soup.select_one("h2, h3")` — valid CSS selector in BS4. This handles compound selectors natively without source-name branches.

### dhammadownload PDF Handling

PDF files cannot be parsed with BeautifulSoup — no HTML to extract. Strategy:

```python
if file_path.suffix.lower() == ".pdf":
    # Title from filename: "truong-bo-kinh-01.pdf" → "Truong Bo Kinh 01"
    title = file_path.stem.replace("-", " ").title()
    category = map_category(source.css_selectors.get("category", ""))  # likely "" → "Nikaya"
    subcategory = ""
    file_format = "pdf"
    # Skip BeautifulSoup entirely
```

Do NOT install a PDF parsing library (PyMuPDF, pdfminer, etc.) — the PRD/architecture does not require it and adding a new dependency is out of scope for Phase 1.

### Empty Selector Default Flow

The `select_text()` helper already handles empty selectors. The caller must handle `None` returns:

```python
raw_category = select_text(soup, source.css_selectors.get("category", ""))
category = map_category(raw_category) if raw_category else "Nikaya"

raw_subcategory = select_text(soup, source.css_selectors.get("subcategory", ""))
subcategory = raw_subcategory or ""  # empty string is valid

raw_title = select_text(soup, source.css_selectors.get("title", ""))
title = raw_title or file_path.stem  # stem as last resort
```

`map_category("")` would hit the default "Nikaya" branch too, but the explicit `None` check is clearer.

### NFR6: What "Required Fields" Means

Pydantic's `ScriptureMetadata` enforces ALL non-Optional fields at construction time. If `ScriptureMetadata(...)` succeeds → all required fields are populated by definition. NFR6's ≥90% means: ≥90% of raw files must produce a successful `ScriptureMetadata` instantiation. The other ≤10% can fail (error_count).

Track per `parse_source()` call (per source), not globally across all sources.

### Config CSS Selectors for All 4 Sources (do NOT hardcode these in parser.py)

| Source | title | category | subcategory |
|---|---|---|---|
| thuvienhoasen | `"h1.entry-title"` | `".breadcrumb li:nth-child(2)"` | `".breadcrumb li:last-child"` |
| budsas | `"h2, h3"` | `""` | `"h1"` |
| chuabaphung | `"h1.entry-title"` | `".breadcrumb li:nth-child(2)"` | `".breadcrumb li:last-child"` |
| dhammadownload | `"h1, h2, title"` | `""` | `""` |

All selectors are read dynamically: `source.css_selectors.get("title", "")`. No hardcoding.

### dhammadownload "h1, h2, title" Selector

`soup.select_one("h1, h2, title")` selects `<title>` tag if no h1/h2 — that's the page `<title>` element. Strip boilerplate if title contains site name:
```python
raw_title = select_text(soup, source.css_selectors.get("title", ""))
# Remove trailing site name pattern: "Tâm Kinh | Dhamma Download"
if raw_title and "|" in raw_title:
    raw_title = raw_title.split("|")[0].strip()
```

### Vietnamese UTF-8 Preservation

All file reads use `encoding="utf-8", errors="replace"`. All `.meta.json` writes use `encoding="utf-8"`. `model_dump_json()` returns a Python `str` with Unicode intact — Pydantic does NOT encode bytes. `write_text(..., encoding="utf-8")` ensures proper encoding on all platforms.

### Project Structure Notes

- Only file changed: `parser.py` (project root) — extending Story 3.1's implementation
- `tests/test_parser.py` extended with new test cases
- No changes to: `models.py`, `utils/`, `config.yaml`, `crawler.py`, `indexer.py`
- CSS selectors for all 4 sources already in `config.yaml` — NO config changes needed

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2: Parser Extended to All 4 Sources + Edge Cases]
- [Source: _bmad-output/planning-artifacts/epics.md#Requirements — NFR6, NFR7, NFR9]
- [Source: config.yaml#sources — all 4 sources with css_selectors]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Implementation Patterns — Anti-Pattern Reference]
- [Source: _bmad-output/implementation-artifacts/2-5-content-deduplication-all-4-sources-configured.md#Dev Notes — Source Rate Limits (source names reference)]
- [Source: models.py#ScriptureMetadata — copyright_status Literal["public_domain", "unknown"]]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

Story 3.2 was implemented alongside 3.1 in a single parser.py. Key design decision: select_text() uses soup.select_one() which natively handles compound CSS selectors, enabling config-only extensibility with no source-name branches.

### Completion Notes List

- `classify_copyright()` implemented in parser.py — budsas + Nikaya = public_domain; all else = unknown
- All 4 sources handled via config-driven CSS selectors; no source-name conditional branches
- PDF handling is suffix-driven (not source-name-driven) — architecture-compliant
- Pipe-stripping (`"Title | Site"` → `"Title"`) applied universally, not source-specifically
- NFR6 coverage warning logged when success_count / total < 90%
- Tests in test_parser.py cover all 4 sources + edge cases — 29 tests total

### File List

- `parser.py` (modified — same file as Story 3.1)
- `tests/test_parser.py` (modified — extended with 3.2 tests)

### Change Log

- 2026-02-28: Implemented Story 3.2 alongside 3.1 — classify_copyright, multi-source handling, NFR6 coverage logging, extended test suite
