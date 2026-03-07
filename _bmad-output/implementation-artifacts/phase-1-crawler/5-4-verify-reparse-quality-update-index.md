# Story 5.4: Verify Re-Parse Quality + Update Index

## Story

As a developer,
I want to re-parse all ThuvienKinhPhat files with the fixed parser and verify metadata quality via validate.py,
So that the corpus accurately reflects the correct book-level metadata before EPUB generation begins.

## Status: ready-for-dev

## Prerequisites

- Story 5.1 done: models.py extended with new category literals
- Story 5.2 done: parser.py has breadcrumb/title-split extraction for thuvienkinhphat
- Story 5.3 done: book_builder.py creates book manifests

## Implementation Steps

This story is primarily a verification/execution story, with minor additions to `validate.py` to check thuvienkinhphat-specific quality metrics.

### Step 1: Delete existing meta JSONs and re-parse

```bash
# Remove stale meta JSONs for thuvienkinhphat (they have wrong data)
rm -rf data/meta/thuvienkinhphat/

# Re-parse all raw files using fixed parser with --force
uv run python parser.py --source thuvienkinhphat --force
```

### Step 2: Spot-check key files

```bash
python -c "
import json

test_cases = [
    ('truong01', 'Kinh Tạng', 'Kinh Trường Bộ', '1. Kinh Phạm võng'),
    ('bkni01',   'Luật Tạng', 'Giới Bổn Tỳ-khưu Ni', '[01]'),
]

for stem, exp_cat, exp_book, exp_ch_prefix in test_cases:
    try:
        d = json.load(open(f'data/meta/thuvienkinhphat/{stem}.json'))
        cat_ok = d.get('category') == exp_cat
        book_ok = d.get('book_title') == exp_book
        ch_ok = (d.get('chapter') or '').startswith(exp_ch_prefix)
        status = 'PASS' if (cat_ok and book_ok and ch_ok) else 'FAIL'
        print(f'{status} {stem}: cat={d[\"category\"]}, book={d[\"book_title\"]}, ch={d[\"chapter\"]}')
    except FileNotFoundError:
        print(f'MISSING {stem}')
"
```

### Step 3: Run validate.py for ThuvienKinhPhat coverage

```bash
uv run python validate.py
```

Expected output includes:
- ≥ 90% of ThuvienKinhPhat records with `book_title` non-null
- ≥ 90% of ThuvienKinhPhat records with `chapter` non-null
- ≥ 80% of ThuvienKinhPhat records with `author_translator` non-null
- `category` values: only `"Kinh Tạng"`, `"Luật Tạng"`, `"Thắng Pháp Tạng"` — no `"Nikaya"` misclassification

### Step 4: Update index

```bash
uv run python indexer.py
```

Verify:
- No duplicate IDs for thuvienkinhphat entries
- All corrected records reflected in `data/index.json`

### Step 5: Build book manifests

```bash
uv run python book_builder.py --source thuvienkinhphat
```

Verify:
- `data/books/thuvienkinhphat/` contains expected book manifest files
- All manifests have chapters in correct order

## Files to Modify (minor)

- `/Users/minhtrucnguyen/working/monkai/validate.py` (if exists) — no major changes needed; existing schema validation will catch wrong `category` values after model is updated
- If `validate.py` doesn't exist yet (Epic 4), use inline Python script for validation

## Acceptance Criteria

- All 547+ ThuvienKinhPhat meta JSONs regenerated
- `truong01.json` has `category="Kinh Tạng"`, `book_title="Kinh Trường Bộ"`, non-null `chapter`
- `bkni01.json` has `category="Luật Tạng"`, `book_title="Giới Bổn Tỳ-khưu Ni"`, `chapter="[01]"`
- ≥ 90% coverage for `book_title` and `chapter`
- ≥ 80% coverage for `author_translator`
- No duplicate IDs in updated `data/index.json`

## Quick Validation Script

```bash
python -c "
import json, glob
files = glob.glob('data/meta/thuvienkinhphat/*.json')
total = len(files)
has_book = sum(1 for f in files if json.load(open(f)).get('book_title'))
has_ch   = sum(1 for f in files if json.load(open(f)).get('chapter'))
has_auth = sum(1 for f in files if json.load(open(f)).get('author_translator'))
cats     = {json.load(open(f)).get('category') for f in files}
print(f'Total: {total}')
print(f'book_title: {has_book}/{total} ({has_book/total*100:.1f}%)')
print(f'chapter:    {has_ch}/{total} ({has_ch/total*100:.1f}%)')
print(f'translator: {has_auth}/{total} ({has_auth/total*100:.1f}%)')
print(f'categories: {cats}')
"
```
