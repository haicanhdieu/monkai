# Spike: Audio Book Crawling — thuviensachnoihuongduong.com

**Date:** 2026-05-17  
**Status:** Complete  
**Author:** Research spike — party mode + live API investigation  

---

## 1. API Investigation Results

### Endpoint

```
GET https://web-api.thuviensachnoihuongduong.com/api/v2/front/post/sach/posts?limit={N}&page={N}
```

- No auth required — public API
- Standard offset pagination via query params

### Pagination shape

```json
{
  "data": [...],
  "meta": {
    "current_page": 1,
    "per_page": 12,
    "last_page": 232,
    "total": 2781,
    "from": 1,
    "to": 12
  }
}
```

**Total catalog: 2,781 books** (as of 2026-05-17).

### Book record shape (key fields)

```json
{
  "_id": "69e829b3...",
  "id": "332224db-08cd-4613-af22-6ec5928406be",
  "slug": "tro-chuyen-cung-gen-z",
  "title": "Trò chuyện cùng Gen Z",
  "type": "sach",
  "is_active": 1,
  "categories": [],
  "featured_image": {
    "path": "https://audio-books-spaces-bucket.sgp1.digitaloceanspaces.com/audio-books/def0d83d...jpg"
  },
  "session_tag_posts": {
    "tag_author":     [{ "slug": "tran-si-chuong",  "title": "Trần Sĩ Chương",  "type": "tac-gia" }],
    "tag_speaker":    [{ "slug": "le-nhu-quynh...",  "title": "Lê Như Quỳnh",    "type": "nguoi-doc" }],
    "tag_publisher":  [{ "slug": "nxb-...",          "title": "NXB Thế giới...",  "type": "nha-xuat-ban" }],
    "tag_translator": [{ "slug": "bien-soan-...",    "title": "Biên soạn: ...",   "type": "nguoi-dich" }]
  },
  "tracks": [...],
  "published_start": "2026-04-22T01:41:03.857Z",
  "view": 85
}
```

### Track record shape (per audio file)

```json
{
  "id": "87191898-5fe7-4871-b186-97ca3e0651ef",
  "slug": "track-1-tro-chuyen-cung-gen-z-...",
  "title": "Track 1: Trò chuyện cùng Gen Z - ...",
  "file": "https://audio-books-spaces-bucket.sgp1.digitaloceanspaces.com/audio-books/0cae13ebb0d473993535477a702b2e81.mp3",
  "is_download": false,
  "published_start": "2026-04-22T01:52:04.507Z"
}
```

### Key findings

| Finding | Detail |
|---|---|
| Auth | None required — fully public |
| Audio URLs | Direct `.mp3` on DigitalOcean Spaces CDN — **stable, not signed** |
| Cover image URLs | Same CDN — stable |
| Category field | `categories: []` — **always empty** in samples; no server-side category |
| Narrator | First-class entity in `session_tag_posts.tag_speaker` |
| Author | `session_tag_posts.tag_author` |
| Publisher | `session_tag_posts.tag_publisher` |
| Translator | `session_tag_posts.tag_translator` |
| Track ordering | `slug` contains `track-N-...`; no explicit `position` field reliably set |
| `is_download` | `false` on all tracks — streaming only from source |

---

## 2. Data Model Changes

### 2a. New models in `models.py`

```python
class AudioTrack(BaseModel):
    """Single audio track within an audio book."""
    id: str
    slug: str
    title: str
    file_url: str                      # source CDN URL
    file_local_path: str | None = None # relative path under data/book-data/ when downloaded
    published_at: datetime | None = None


class AudioBookData(BaseModel):
    """
    Canonical output for one audio book.
    Path: data/book-data/huongduong/{book_slug}/book.json
    """
    meta: BookMeta = Field(..., alias="_meta")  # reuse BookMeta, source="huongduong"
    id: str                            # e.g. "huongduong__tro-chuyen-cung-gen-z"
    source_id: str                     # original UUID from API
    slug: str
    title: str
    cover_image_url: str | None = None
    cover_image_local_path: str | None = None
    author: str | None = None
    narrator: str | None = None        # tag_speaker → most important for UX
    publisher: str | None = None
    translator: str | None = None
    published_at: datetime | None = None
    view_count: int = 0
    total_tracks: int
    tracks: list[AudioTrack]
    model_config = ConfigDict(populate_by_name=True)
```

### 2b. `BookIndexEntry` — required changes

Current model has `author: str | None` and `publisher: str | None` already — **no change needed** for those.

Problems to fix and fields to add:

```python
class BookIndexEntry(BaseModel):
    id: str
    source_book_id: str
    book_name: str
    book_seo_name: str
    cover_image_url: str | None = None
    author: str | None = None           # EXISTING — populated from tag_author
    publisher: str | None = None        # EXISTING — populated from tag_publisher
    publication_year: int | None = None # EXISTING
    category_id: int | None = None      # CHANGED: int → int | None (audio books have no category_id)
    category_name: str                  # EXISTING — audio uses default "Sách Nói"
    category_seo_name: str              # EXISTING — audio uses default "sach-noi"
    total_chapters: int                 # EXISTING — audio: use total_tracks count here
    artifacts: list[BookArtifact]       # EXISTING
    source: str                         # EXISTING
    media_type: Literal["text", "audio"] = "text"   # NEW
    narrator: str | None = None         # NEW — from tag_speaker
    translator: str | None = None       # NEW — from tag_translator
    audio_tracks_count: int | None = None           # NEW — audio only; total_chapters = same value
```

**`category_id` breaking change:** changing `int` → `int | None` is backward-compatible for existing text books (they all have a category_id). Audio books set `category_id: None`.

Reader Zod schema additions in `shared/schemas/`:
```ts
category_id: z.number().int().nullable(),   // was z.number().int() — make nullable
media_type: z.enum(["text", "audio"]).default("text"),
narrator: z.string().nullable().optional(),
translator: z.string().nullable().optional(),
audio_tracks_count: z.number().int().nullable().optional(),
```

### 2c. `BookArtifact` — no change needed

`format: str` is already unrestricted. Audio artifact uses `format: "audio_json"` or `format: "mp3_manifest"`. No Literal constraint to break.

### 2d. Category handling

`categories: []` is always empty in this API. Two options:

- **Option A (recommended):** Set `category_name: "Sách Nói"` and `category_seo_name: "sach-noi"` as a fixed default for all audio books from this source. Controlled in `config.yaml` via a `default_category` field on `SourceConfig`.
- **Option B:** Leave `category_name: null` and let the reader display "Không phân loại".

Option A is cleaner for the existing index UI which groups by category.

---

## 3. Crawler Architecture

### 3a. New `SourceConfig` fields needed

```python
class SourceConfig(BaseModel):
    ...
    # Existing fields unchanged
    source_type: Literal["html", "api"] = "html"
    api_base_url: str | None = None
    api_endpoints: dict[str, str] | None = None

    # New fields for audio sources
    media_type: Literal["text", "audio"] = "text"     # NEW
    default_category: str | None = None               # NEW — for sources with no category API
    download_audio: bool = False                       # NEW — opt-in audio file download
```

### 3b. New adapter: `utils/audio_adapter.py`

Parallel to `VbetaApiAdapter`. Do NOT modify the existing adapter — separate class for separation of concerns.

```
utils/
  api_adapter.py      ← existing (vbeta text books)
  audio_adapter.py    ← NEW (huongduong audio books)
```

**`HuongDuongAudioAdapter` skeleton:**

```python
class HuongDuongAudioAdapter:
    BASE_URL = "https://web-api.thuviensachnoihuongduong.com"
    POSTS_ENDPOINT = "/api/v2/front/post/sach/posts"
    DEFAULT_PAGE_LIMIT = 12

    def __init__(self, source_config, session, state, output_dir):
        ...

    async def process_all(self):
        """Phase 1: fetch catalog → Phase 2: download audio (if enabled) → Phase 3: build index"""
        books = await self._fetch_all_books()
        if self.config.download_audio:
            await self._download_audio_files(books)
        self._build_book_data(books)
```

**Pagination loop:**

```python
async def _fetch_all_books(self) -> list[dict]:
    page = 1
    all_books = []
    while True:
        url = f"{self.BASE_URL}{self.POSTS_ENDPOINT}?limit={self.DEFAULT_PAGE_LIMIT}&page={page}"
        # skip if raw page file exists on disk (idempotent)
        raw_key = ["pages", f"page_{page}.json"]
        if self._raw_file_exists(raw_key):
            data = self._load_raw(raw_key)
        else:
            data = await self._fetch_get(url)
            if not data:
                break
            self._save_raw(raw_key, data)

        books = data.get("data", [])
        all_books.extend(books)

        meta = data.get("meta", {})
        if meta.get("current_page", 1) >= meta.get("last_page", 1):
            break
        page += 1
        await asyncio.sleep(self.config.rate_limit_seconds)

    return all_books
```

**State tracking:** Use `CrawlState` keyed on `book["id"]` (UUID). Marks status `"audio_crawled"` after book metadata is saved, `"audio_downloaded"` after binary files are saved.

### 3c. Audio file download (opt-in)

When `download_audio: true` in config:

```python
async def _download_track(self, track: AudioTrack, dest_path: Path) -> bool:
    if dest_path.exists():
        logger.info(f"[audio_adapter] Skip (disk): {dest_path}")
        return True
    if self.state.is_downloaded(track.file_url):
        logger.info(f"[audio_adapter] Skip (state): {track.file_url}")
        return True

    await asyncio.sleep(self.config.rate_limit_seconds)
    try:
        async with self.session.get(track.file_url) as resp:
            if resp.status >= 400:
                self.state.mark_error(track.file_url)
                self.state.save()
                return False
            data = await resp.read()
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        dest_path.write_bytes(data)
        self.state.mark_downloaded(track.file_url)
        self.state.save()
        return True
    except Exception as e:
        logger.error(f"[audio_adapter] Download error {track.file_url}: {e}")
        self.state.mark_error(track.file_url)
        self.state.save()
        return False
```

**Local path convention:**
```
data/book-data/huongduong/{book_slug}/audio/{track_slug}.mp3
```

### 3d. `config.yaml` entry

```yaml
sources:
  - name: huongduong
    source_type: api
    media_type: audio
    enabled: true
    api_base_url: "https://web-api.thuviensachnoihuongduong.com"
    api_endpoints:
      posts: "/api/v2/front/post/sach/posts"
    rate_limit_seconds: 1.5
    output_folder: huongduong
    default_category: "Sách Nói"
    download_audio: false    # set true to backup audio files locally
```

### 3e. Integration point in `pipeline.py`

In `crawl_all()` (or wherever adapters are dispatched), add dispatch on `source.media_type`:

```python
if source.source_type == "api" and source.media_type == "audio":
    adapter = HuongDuongAudioAdapter(source, session, state, cfg.output_dir)
    await adapter.process_all()
elif source.source_type == "api":
    adapter = VbetaApiAdapter(source, session, state, cfg.output_dir)
    await adapter.process_all()
else:
    # existing HTML crawl path
    ...
```

---

## 4. Audio URL Strategy

### Default (Phase 4 MVP): stream from CDN

`AudioTrack.file_url` = source CDN URL. Reader streams directly. No bytes on disk. Fast to ship.

```
data/book-data/huongduong/{book_slug}/book.json
  tracks[n].file_url = "https://audio-books-spaces-bucket.sgp1.digitaloceanspaces.com/..."
  tracks[n].file_local_path = null
```

### Switch to self-hosted (when `download_audio: true`)

After download, `file_local_path` is populated. Reader uses env var to choose:

```
VITE_AUDIO_SOURCE=self_hosted  →  reader uses file_local_path resolved via VITE_BOOK_DATA_URL
VITE_AUDIO_SOURCE=source_site  →  reader uses file_url directly (default)
```

`resolveAudioUrl(track, env)` in reader:
```ts
export function resolveTrackUrl(track: AudioTrack): string | null {
  if (import.meta.env.VITE_AUDIO_SOURCE === 'self_hosted' && track.fileLocalPath) {
    return `${import.meta.env.VITE_BOOK_DATA_URL}/${track.fileLocalPath}`;
  }
  return track.fileUrl ?? null;
}
```

No schema change needed to switch source — env var only.

### TTS injection point (future)

When TTS generates audio for a text book, it populates `AudioTrack.file_url` for that book. The reader plays it identically. No schema change required. Add `audio_source_type: Literal["human", "tts"] = "human"` to `AudioTrack` only when TTS ships and a UI badge is needed.

---

## 5. Estimated Scope

| Item | Count / Size estimate |
|---|---|
| Total books | 2,781 |
| Avg tracks per book | ~8–12 (sample: 10 tracks on book 1) |
| Total track files | ~25,000–33,000 MP3s |
| Avg MP3 size | ~15–40 MB per track |
| **Total audio storage (worst case)** | **~1.3 TB** |
| Metadata only (no audio download) | < 50 MB (JSON + cover images) |

**Implication:** `download_audio: false` (stream from CDN) is the correct default. Audio download should be opt-in per-book or per-category, not bulk-all.

**Incremental backup strategy:** Add a CLI flag `--download-audio-limit N` to download N books at a time. Run periodically to build local backup without saturating disk.

---

## 6. Reader Changes (summary — full spec in PRD)

New feature dir: `apps/reader/src/features/audio-player/`

| Component | Purpose |
|---|---|
| `useAudioPlayer.ts` | Hook: play/pause/seek/duration state wrapping `<audio>` element |
| `AudioPlayer.tsx` | Persistent mini-player: title, play/pause, scrubber, 15s-back |
| `AudioBookPage.tsx` | Full page: cover, narrator, track list, expanded player |
| `resolveTrackUrl.ts` | `shared/utils/` — CDN vs self-hosted URL switch |
| New route | `ROUTES.AUDIO_BOOK = '/listen/:bookId'` |
| Zod schema | `AudioTrackSchema`, `AudioBookDataSchema` in `shared/schemas/` |

**Key test concern:** JSDOM does not implement `HTMLMediaElement`. Add stubs in `vitest.setup.ts`:
```ts
Object.defineProperty(HTMLMediaElement.prototype, 'play', { value: vi.fn().mockResolvedValue(undefined) });
Object.defineProperty(HTMLMediaElement.prototype, 'pause', { value: vi.fn() });
```

---

## 7. Open Questions / Risks

| # | Question | Risk | Recommendation |
|---|---|---|---|
| 1 | DigitalOcean Spaces CDN longevity | Medium — if source site shuts down, CDN goes too. That's the backup motivation. | Accept for MVP. Enable `download_audio` incrementally. |
| 2 | Rate limits on CDN | Low — CDN is designed for high-throughput. Still use `rate_limit_seconds` for API calls. | Rate limit API calls only; CDN downloads can be faster. |
| 3 | `categories: []` always empty | Low — confirmed empty in samples. | Use `default_category: "Sách Nói"` from config. |
| 4 | Track ordering | Low — `slug` has `track-N-...` prefix; sort by slug string is reliable. | Sort by `slug` in `_build_book_data`. |
| 5 | New books added to API over time | Low | Re-run adapter periodically. `CrawlState` prevents re-download. |
| 6 | 2,781 books × API calls at rate_limit=1.5s | Timing — ~70 min for full catalog crawl (metadata only) | Acceptable. Use `download_audio: false` for MVP run. |

---

## 8. Implementation Plan

### Phase 4a — Crawler (metadata only, no audio download)

1. Add `media_type`, `download_audio`, `default_category` to `SourceConfig` in `models.py`
2. Add `AudioTrack`, `AudioBookData` models to `models.py`
3. Add `media_type`, `narrator`, `audio_tracks_count` to `BookIndexEntry`
4. Write `utils/audio_adapter.py` with `HuongDuongAudioAdapter`
5. Add `huongduong` entry to `config.yaml` (`download_audio: false`)
6. Wire adapter in pipeline dispatch
7. Write tests: pagination, track extraction, state resume, skip-existing

### Phase 4b — Reader audio player

1. Update `shared/schemas/` Zod schemas for audio
2. Add `resolveTrackUrl` util + tests (4 combinations)
3. Implement `useAudioPlayer` hook with `HTMLMediaElement` stubs in test setup
4. Build `AudioPlayer` mini-player component
5. Build `AudioBookPage` route
6. Register route in `shared/constants/routes.ts`
7. Update library card to show headphone badge for `media_type: "audio"`

### Phase 4c — Audio backup (when needed)

1. Set `download_audio: true` in config
2. Add `--download-audio-limit N` CLI flag
3. Update `deploy:book-data` to include audio files incrementally
4. Update Docker Compose volume mounts for audio dir
5. Set `VITE_AUDIO_SOURCE=self_hosted` + redeploy reader
