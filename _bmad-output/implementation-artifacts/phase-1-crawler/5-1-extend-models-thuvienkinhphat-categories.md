# Story 5.1: Extend Models for ThuvienKinhPhat Categories

## Story

As a developer,
I want the `ScriptureMetadata` model to accept Tạng-level categories from ThuvienKinhPhat,
So that the parser can correctly classify Kinh Tạng, Luật Tạng, and Thắng Pháp Tạng scriptures.

## Status: ready-for-dev

## Context

The current `ScriptureMetadata.category` Literal in `models.py` only allows:
`"Nikaya" | "Đại Thừa" | "Mật Tông" | "Thiền" | "Tịnh Độ"`

ThuvienKinhPhat organizes content by the three Pitaka baskets:
- **Kinh Tạng** (Sutta Pitaka): main sutra collections
- **Luật Tạng** (Vinaya Pitaka): monastic rules
- **Thắng Pháp Tạng** (Abhidhamma Pitaka): philosophical analysis

These need to be valid category literals so Pydantic validation doesn't reject them.

The `CATEGORY_MAP` dict in `parser.py` must also map the Vietnamese breadcrumb text to these literals.

## Files to Modify

- `/Users/minhtrucnguyen/working/monkai/models.py` — extend `category` Literal on `ScriptureMetadata` and `IndexRecord`
- `/Users/minhtrucnguyen/working/monkai/parser.py` — add entries to `CATEGORY_MAP`

## Implementation Notes

### models.py changes

Change the `category` field type on both `ScriptureMetadata` (line 48) and `IndexRecord` (line 80):

```python
# Before
category: Literal["Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ"]

# After
category: Literal["Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ",
                  "Kinh Tạng", "Luật Tạng", "Thắng Pháp Tạng"]
```

### parser.py changes

Add to `CATEGORY_MAP` dict (after line 40):

```python
"kinh tạng": "Kinh Tạng",
"luật tạng": "Luật Tạng",
"thắng pháp tạng": "Thắng Pháp Tạng",
```

## Acceptance Criteria

- `ScriptureMetadata(category="Kinh Tạng", ...)` validates without error
- `ScriptureMetadata(category="Luật Tạng", ...)` validates without error
- `ScriptureMetadata(category="Thắng Pháp Tạng", ...)` validates without error
- All existing valid values still validate
- `IndexRecord.category` accepts the same new values
- `CATEGORY_MAP` contains all 3 new lowercase → Literal mappings
- All existing tests pass (`uv run pytest`)

## Testing

```bash
uv run python -c "
from models import ScriptureMetadata
from datetime import datetime, timezone
m = ScriptureMetadata(
  id='test', title='test', category='Kinh Tạng',
  subcategory='', source='thuvienkinhphat',
  url='https://example.com', file_path='data/raw/test.html',
  file_format='html', copyright_status='unknown',
  created_at=datetime.now(timezone.utc)
)
print('OK:', m.category)
"
uv run pytest tests/ -v
```
