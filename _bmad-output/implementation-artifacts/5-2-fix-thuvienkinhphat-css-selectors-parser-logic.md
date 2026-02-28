# Story 5.2: Fix ThuvienKinhPhat CSS Selectors & Parser Logic

## Story

As a developer,
I want `parser.py` to use breadcrumb navigation, title-tag splitting, and translator lookup for ThuvienKinhPhat HTML pages,
So that each chapter's meta JSON correctly contains `category`, `bookTitle`, `chapter`, and `authorTranslator` without falling back to filename stubs.

## Status: ready-for-dev

## Context

### Site Structure
Every ThuvienKinhPhat chapter page has a breadcrumb:
```
Trang chính ▪ {Category} ▪ {Book Title}
```

The `<title>` tag uses the format: `"{Book Title}: {Chapter Title}"`
- Example: `"Kinh Trường Bộ: 1. Kinh Phạm võng"` → book=`Kinh Trường Bộ`, chapter=`1. Kinh Phạm võng`

Some pages (Luật Tạng like bkni01) don't follow the colon format. They use an inline `[01]` marker for the chapter number and `"Lời tiếng Việt: {name}"` for the translator.

### Current Problems
- `category: ""` → falls back to "Nikaya" for everything (wrong for Luật, VDP)
- `book_title: "h3"` → returns null on most pages
- `chapter: "h3:nth-of-type(2)"` → returns null almost always
- `author_translator: "em, i"` → captures Pali names like "Digha Nikaya" instead of translator

### Extraction Strategy

| Field | Strategy | CSS/Code |
|-------|----------|---------|
| `category` | Breadcrumb 2nd link text | `soup.find_all('a')` filtered by `thu-vien.html#{section}` href |
| `book_title` | Breadcrumb last non-link text | Last `<a>` text in breadcrumb area |
| `chapter` | `<title>` split on `:` → right side | Python string split |
| `chapter` fallback | `[XX]` pattern in body | regex `r'\[(\d+)\]'` |
| `author_translator` | 1. `"Lời tiếng Việt:"` in body; 2. Translator map | String search + dict lookup |

### Translator Map (built from catalogue page)

```python
THUVIENKINHPHAT_TRANSLATORS = {
    "kinh-truongbo": "Hòa thượng Thích Minh Châu",
    "kinh-trungbo": "Hòa thượng Thích Minh Châu",
    "kinh-tangchibo": "Hòa thượng Thích Minh Châu",
    "kinh-tuongungbo": "Hòa thượng Thích Minh Châu",
    "kinh-tieubo1": "Hòa thượng Thích Minh Châu",
    "kinh-tieubo2": "Gs Trần Phương Lan",
    "kinh-tieubo3": "Hòa thượng Thích Minh Châu",
    "kinh-tieubo4": "Hòa thượng Thích Minh Châu",
    "kinh-tieubo5": "Hòa thượng Thích Minh Châu & Gs Trần Phương Lan",
    "kinh-tieubo6": "Hòa thượng Thích Minh Châu & Gs Trần Phương Lan",
    "kinh-tieubo7": "Gs Trần Phương Lan",
    "kinh-tieubo8": "Gs Trần Phương Lan",
    "kinh-tieubo9": "Gs Trần Phương Lan",
    "kinh-tieubo10": "Gs Trần Phương Lan",
    "luat-ptg": "Tỳ khưu Indacanda",
    "luat-tykheo": "Indacanda Bhikkhu (Trương đình Dũng)",
    "luat-daipham": "Tỳ khưu Indacanda",
    "luat-tieupham": "Tỳ khưu Indacanda",
    "luat-tapyeu": "Tỳ khưu Indacanda",
    "vdp1": "Hòa thượng Tịnh Sự",
    "vdp2": "Hòa thượng Tịnh Sự",
    "vdp3": "Hòa thượng Tịnh Sự",
    "vdp4": "Hòa thượng Tịnh Sự",
    "vdp5": "Tâm An & Minh Tuệ",
    "vdp6": "Hòa thượng Tịnh Sự",
    "vdp7": "Hòa thượng Tịnh Sự",
    "tl-thichthonglac": "Trưởng lão Thích Thông Lạc",
}
```

URL path segment (2nd segment after domain) is used as the key.

## Files to Modify

- `/Users/minhtrucnguyen/working/monkai/config.yaml` — update thuvienkinhphat selectors
- `/Users/minhtrucnguyen/working/monkai/parser.py` — add `extract_thuvienkinhphat_metadata()` function

## Algorithm

### `extract_thuvienkinhphat_metadata(soup, url, file_path)` → dict

```python
import re
from urllib.parse import urlparse

def extract_thuvienkinhphat_metadata(soup, url):
    result = {}

    # --- Step 1: Breadcrumb → category + book_title ---
    # Breadcrumb links: [Home, Category?, BookTitle?]
    all_links = soup.find_all('a')
    breadcrumb_links = [a for a in all_links if 'thu-vien' in (a.get('href', '') or '')]
    # The category link has href like "thu-vien.html#kinh" or "thu-vien.html#luat"
    category_link = None
    book_title_link = None
    for a in all_links:
        href = a.get('href', '') or ''
        text = a.get_text(strip=True)
        if '#kinh' in href or '#luat' in href or '#luan' in href:
            # This is the category breadcrumb link
            if '#kinh' in href:
                result['category'] = 'Kinh Tạng'
            elif '#luat' in href:
                result['category'] = 'Luật Tạng'
            elif '#luan' in href:
                result['category'] = 'Thắng Pháp Tạng'
        elif 'thu-vien.html' not in href and 'index.html' not in href and text and len(text) > 3:
            # Heuristic: last meaningful breadcrumb link = book title link
            book_title_link = text

    if book_title_link:
        result['book_title'] = book_title_link

    # --- Step 2: Title tag → chapter ---
    title_tag = soup.find('title')
    if title_tag:
        title_text = title_tag.get_text(strip=True)
        if ':' in title_text:
            parts = title_text.split(':', 1)
            # left = confirms book_title; right = chapter
            if not result.get('book_title'):
                result['book_title'] = parts[0].strip()
            result['chapter'] = parts[1].strip()
        else:
            # Fallback: look for [XX] marker in page body
            body_text = soup.get_text()
            match = re.search(r'\[(\d+)\]', body_text[:500])
            if match:
                result['chapter'] = f"[{match.group(1).zfill(2)}]"

    # --- Step 3: Author/Translator ---
    body_text = soup.get_text(separator=' ')
    # Strategy 1: "Lời tiếng Việt:" prefix
    viet_match = re.search(r'Lời tiếng Việt\s*:\s*(.+?)(?:\n|\.|\|)', body_text)
    if viet_match:
        result['author_translator'] = viet_match.group(1).strip()
    else:
        # Strategy 2: URL-path translator map
        path_parts = urlparse(url).path.strip('/').split('/')
        if len(path_parts) >= 2:
            path_key = path_parts[1]  # e.g. "kinh-truongbo"
            result['author_translator'] = THUVIENKINHPHAT_TRANSLATORS.get(path_key)

    return result
```

### Integration into `extract_metadata()`

Add a branch in `extract_metadata()` after existing HTML parsing block:

```python
# Source-specific overrides
if source.name == "thuvienkinhphat":
    overrides = extract_thuvienkinhphat_metadata(soup, url)
    if overrides.get('category'):
        category = overrides['category']
    if overrides.get('book_title'):
        book_title = overrides['book_title']
    if overrides.get('chapter'):
        chapter = overrides['chapter']
    if overrides.get('author_translator'):
        author_translator = overrides['author_translator']
    # Set title = chapter (remove separate title concept)
    title = chapter or file_path.stem
    subcategory = ""
```

### config.yaml updates for thuvienkinhphat

```yaml
css_selectors:
  catalog_links: "li strong a"
  file_links: ""
  title: ""                    # disabled — handled in code
  category: ""                 # disabled — breadcrumb in code
  subcategory: ""
  book_collection: ""          # disabled
  book_title: ""               # disabled — breadcrumb in code
  chapter: ""                  # disabled — title-tag split in code
  author_translator: ""        # disabled — translator map in code
  content: "body"              # keep
```

### parser.py --force flag

Add `--force` option to `parse` command so existing meta JSONs can be overwritten:

```python
@app.command()
def parse(
    source: str = typer.Option("all"),
    config: str = typer.Option("config.yaml"),
    force: bool = typer.Option(False, "--force", help="Overwrite existing meta JSONs"),
) -> None:
```

In `parse_source()`, add force check:
```python
if meta_path.exists() and not force:
    skipped_count += 1
    continue
```

## Acceptance Criteria

- `truong01.json`: `book_title="Kinh Trường Bộ"`, `chapter="1. Kinh Phạm võng..."`, `category="Kinh Tạng"`, `author_translator="Hòa thượng Thích Minh Châu"`
- `bkni01.json`: `book_title="Giới Bổn Tỳ-khưu Ni"`, `chapter="[01]"`, `category="Luật Tạng"`, `author_translator="Indacanda Bhikkhu..."`
- ≥ 90% of 547+ files have non-null `book_title`, `chapter`, `category`
- All Vietnamese text preserved without encoding issues

## Testing

```bash
# Delete existing meta to force re-parse
rm -f data/meta/thuvienkinhphat/truong01.json data/meta/thuvienkinhphat/bkni01.json

# Re-parse specific files
uv run python parser.py --source thuvienkinhphat --force

# Spot check
python -c "
import json
for f in ['truong01', 'bkni01', 'vdp1-01']:
    try:
        d = json.load(open(f'data/meta/thuvienkinhphat/{f}.json'))
        print(f'{f}: cat={d[\"category\"]}, book={d[\"book_title\"]}, ch={d[\"chapter\"][:40] if d[\"chapter\"] else None}')
    except FileNotFoundError:
        print(f'{f}: not found')
"
uv run pytest tests/ -v
```
