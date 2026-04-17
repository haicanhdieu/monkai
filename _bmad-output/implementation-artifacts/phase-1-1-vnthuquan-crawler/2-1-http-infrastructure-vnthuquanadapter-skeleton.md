# Story 2.1: HTTP Infrastructure & VnthuquanAdapter Skeleton

Status: review

## Story

As a developer,
I want a `VnthuquanAdapter` class with session management, cookie handling, rate limiting, and retry logic,
So that all HTTP communication with VNThuQuan is reliable, polite, and handles failures gracefully.

## Acceptance Criteria

1. **Given** the adapter is initialized with a `SourceConfig` and `aiohttp.ClientSession`
   **When** the session is created
   **Then** the cookie jar is pre-seeded with `AspxAutoDetectCookieSupport=1`
   **And** User-Agent is set to `MonkaiCrawler/1.1`
   **And** timeouts are 30s connect (`sock_connect`), 60s read (`sock_read`)

2. **Given** `_rate_limited_request(method, url)` is called
   **When** the request executes
   **Then** `asyncio.sleep(rate_limit_seconds)` is called BEFORE the request (not after)
   **And** the request delegates to `_request_with_retry`

3. **Given** a request fails with a 5xx error or timeout
   **When** `_request_with_retry` handles it
   **Then** it retries up to 3 times with exponential backoff (1s, 2s, 4s) + jitter
   **And** returns a `RequestResult` with `error_type` and `error_detail` on exhaustion

4. **Given** a request returns a 4xx error
   **When** `_request_with_retry` handles it
   **Then** it does NOT retry and returns `RequestResult` with `error_type="http_4xx"`

5. **Given** the session detects a 302 redirect to a session-expired page
   **When** `_refresh_session()` is triggered
   **Then** the current session is closed and a new one is created with fresh cookie jar
   **And** maximum 2 session refreshes per crawl run

## Tasks / Subtasks

- [x] Create `RequestResult` dataclass in `apps/crawler/vnthuquan_crawler.py` (AC: #3, #4)
  - [x] Fields: `response` (aiohttp.ClientResponse | None), `status` (int | None), `error_type` (str | None), `error_detail` (str | None)
  - [x] `error_type` must be one of: `"timeout"`, `"connection"`, `"dns"`, `"http_4xx"`, `"http_5xx"`, or `None`
  - [x] Use `@dataclass` from the standard library — NOT a Pydantic model

- [x] Create `VnthuquanAdapter` class skeleton in `apps/crawler/vnthuquan_crawler.py` (AC: #1)
  - [x] `__init__(self, source_config, session, state, output_dir)` — accept and store all four parameters
  - [x] Store `_session_refresh_count: int = 0` for session refresh tracking (max 2 per run)
  - [x] Store `rate_limit_seconds` extracted from `source_config` (e.g. `source_config.rate_limit_seconds`)
  - [x] Do NOT create the session inside `__init__` — accept it as a parameter
  - [x] Type-annotate all parameters properly using `aiohttp.ClientSession`, `pathlib.Path`, etc.

- [x] Implement session factory helper (module-level or static method) for creating a correctly configured `aiohttp.ClientSession` (AC: #1)
  - [x] Create `aiohttp.CookieJar()` and call `jar.update_cookies({"AspxAutoDetectCookieSupport": "1"})`
  - [x] Create `aiohttp.ClientTimeout(sock_connect=30, sock_read=60)`
  - [x] Create session with `cookie_jar=jar`, `timeout=timeout`, `headers={"User-Agent": "MonkaiCrawler/1.1"}`
  - [x] Name the factory `create_session() -> aiohttp.ClientSession` (module-level async function)

- [x] Implement `async def _request_with_retry(self, method: str, url: str, **kwargs) -> RequestResult` (AC: #3, #4)
  - [x] Total of 4 attempts: attempt 0 (initial) + attempts 1, 2, 3 (retries)
  - [x] Attempt 0: no pre-delay
  - [x] Attempts 1+: delay = `2 ** (attempt - 1)` + `random.uniform(0.1, 0.5)` seconds (yields: ~1.1–1.5s, ~2.1–2.5s, ~4.1–4.5s)
  - [x] Call `self._session.request(method, url, **kwargs)` and read the response
  - [x] On `aiohttp.ServerTimeoutError` or `asyncio.TimeoutError`: set `error_type="timeout"`, retry
  - [x] On `aiohttp.ClientConnectorError` with DNS-related message: set `error_type="dns"`, retry
  - [x] On `aiohttp.ClientConnectorError` (non-DNS): set `error_type="connection"`, retry
  - [x] On HTTP 4xx response: return `RequestResult` immediately with `error_type="http_4xx"`, `status=response.status` — do NOT retry
  - [x] On HTTP 5xx response: set `error_type="http_5xx"`, retry
  - [x] On HTTP 200–3xx (excluding session-expired 302): return `RequestResult(response=response, status=response.status, error_type=None, error_detail=None)`
  - [x] On exhaustion of all 4 attempts: return `RequestResult(response=None, status=None, error_type=<last_error_type>, error_detail=<last_error_str>)`
  - [x] Do NOT call `asyncio.sleep(rate_limit_seconds)` inside this method — rate limiting is the caller's responsibility

- [x] Implement `async def _rate_limited_request(self, method: str, url: str, **kwargs) -> RequestResult` (AC: #2)
  - [x] Call `await asyncio.sleep(self.rate_limit_seconds)` FIRST, before any HTTP call
  - [x] Then delegate: `return await self._request_with_retry(method, url, **kwargs)`
  - [x] This is the sole public-facing request entrypoint for all HTTP calls in the adapter

- [x] Implement `async def _refresh_session(self) -> None` (AC: #5)
  - [x] Guard: if `self._session_refresh_count >= 2`, log a warning and raise an exception (or return without refreshing)
  - [x] Close the existing session: `await self._session.close()`
  - [x] Call `create_session()` to build a new session with fresh cookie jar
  - [x] Assign the new session to `self._session`
  - [x] Increment `self._session_refresh_count`

- [x] Add `aioresponses` as a dev dependency in `apps/crawler/pyproject.toml`
  - [x] Add `aioresponses>=0.7.6` under `[project.optional-dependencies]` `dev` group (or `[dependency-groups]` `dev` if using uv workspaces style)
  - [x] Verify `uv run pytest` still passes after adding the dependency

- [x] Write tests in `apps/crawler/tests/test_vnthuquan_crawler.py` (AC: #1–#5)
  - [x] Test session creation (AC: #1)
    - [x] Call `create_session()` and verify User-Agent header, cookie jar contains `AspxAutoDetectCookieSupport=1`, timeouts are 30s connect / 60s read
    - [x] Close the session after the test (`await session.close()`)
  - [x] Test rate-limit sleep fires BEFORE the request (AC: #2)
    - [x] Patch `asyncio.sleep` and assert it is called with `rate_limit_seconds` before the mock response is consumed
  - [x] Test retry on 503 — succeeds on third attempt (AC: #3)
    - [x] Use `aioresponses`: register `status=503` twice, then `status=200`
    - [x] Assert final `result.status == 200` and `result.error_type is None`
  - [x] Test retry exhaustion — all 4 attempts return 503 (AC: #3)
    - [x] Use `aioresponses`: register `status=503` four times
    - [x] Assert `result.status is None` and `result.error_type == "http_5xx"`
  - [x] Test timeout retry and exhaustion (AC: #3)
    - [x] Use `aioresponses`: raise `aiohttp.ServerTimeoutError` for all 4 attempts
    - [x] Assert `result.error_type == "timeout"`
  - [x] Test 4xx does NOT retry (AC: #4)
    - [x] Use `aioresponses`: register `status=404` once
    - [x] Assert `result.status == 404`, `result.error_type == "http_4xx"`
    - [x] Assert `aioresponses` has no unconsumed mocks (only 1 request was made)
  - [x] Test `_refresh_session` replaces the session (AC: #5)
    - [x] Call `_refresh_session()` and verify `adapter._session` is a new object
    - [x] Assert `adapter._session_refresh_count == 1` after first call
  - [x] Test `_refresh_session` refuses after 2 calls (AC: #5)
    - [x] Call `_refresh_session()` twice, assert count is 2
    - [x] Call a third time and assert it raises or logs warning without refreshing

## Dev Notes

### Architecture Compliance

- **File location:** All adapter code goes in `apps/crawler/vnthuquan_crawler.py` — this is a NEW file created by this story
- **Parser untouched:** `apps/crawler/vnthuquan_parser.py` already exists from Epic 1 — do NOT modify it in this story
- **No modifications** to `models.py`, `crawler.py`, `utils/state.py`, `config.yaml`, or any existing crawler file
- **CWD = `apps/crawler/`** — all `uv run` commands must be run from there
- **Dataclasses, not Pydantic** for `RequestResult` — it is an internal intermediate type

### RequestResult Dataclass

```python
from dataclasses import dataclass
import aiohttp

@dataclass
class RequestResult:
    response: aiohttp.ClientResponse | None
    status: int | None
    error_type: str | None  # "timeout" | "connection" | "dns" | "http_4xx" | "http_5xx" | None
    error_detail: str | None
```

### Session Initialization (exact pattern)

```python
async def create_session() -> aiohttp.ClientSession:
    jar = aiohttp.CookieJar()
    jar.update_cookies({"AspxAutoDetectCookieSupport": "1"})
    timeout = aiohttp.ClientTimeout(sock_connect=30, sock_read=60)
    session = aiohttp.ClientSession(
        cookie_jar=jar,
        timeout=timeout,
        headers={"User-Agent": "MonkaiCrawler/1.1"},
    )
    return session
```

### VnthuquanAdapter Class Skeleton

```python
class VnthuquanAdapter:
    def __init__(
        self,
        source_config,          # SourceConfig from models.py
        session: aiohttp.ClientSession,
        state,                  # CrawlState from utils/state.py
        output_dir: Path,
    ) -> None:
        self._source_config = source_config
        self._session = session
        self._state = state
        self._output_dir = output_dir
        self.rate_limit_seconds: float = source_config.rate_limit_seconds
        self._session_refresh_count: int = 0

    async def _rate_limited_request(self, method: str, url: str, **kwargs) -> RequestResult:
        await asyncio.sleep(self.rate_limit_seconds)   # BEFORE — always
        return await self._request_with_retry(method, url, **kwargs)

    async def _request_with_retry(self, method: str, url: str, **kwargs) -> RequestResult:
        ...

    async def _refresh_session(self) -> None:
        ...
```

### Retry Logic (exact algorithm)

```python
MAX_ATTEMPTS = 4  # 1 initial + 3 retries

async def _request_with_retry(self, method: str, url: str, **kwargs) -> RequestResult:
    last_error_type = None
    last_error_detail = None

    for attempt in range(MAX_ATTEMPTS):
        if attempt > 0:
            delay = 2 ** (attempt - 1) + random.uniform(0.1, 0.5)
            await asyncio.sleep(delay)

        try:
            async with self._session.request(method, url, **kwargs) as resp:
                status = resp.status
                if 400 <= status < 500:
                    return RequestResult(response=resp, status=status,
                                         error_type="http_4xx", error_detail=None)
                if status >= 500:
                    last_error_type = "http_5xx"
                    last_error_detail = f"HTTP {status}"
                    continue  # retry
                return RequestResult(response=resp, status=status,
                                     error_type=None, error_detail=None)

        except (aiohttp.ServerTimeoutError, asyncio.TimeoutError) as exc:
            last_error_type = "timeout"
            last_error_detail = str(exc)
        except aiohttp.ClientConnectorError as exc:
            if "Name or service not known" in str(exc) or "nodename nor servname" in str(exc):
                last_error_type = "dns"
            else:
                last_error_type = "connection"
            last_error_detail = str(exc)

    return RequestResult(response=None, status=None,
                         error_type=last_error_type, error_detail=last_error_detail)
```

Backoff schedule for retries (attempt 1, 2, 3):
- Attempt 1: `2^0 + jitter` = ~1.1–1.5s
- Attempt 2: `2^1 + jitter` = ~2.1–2.5s
- Attempt 3: `2^2 + jitter` = ~4.1–4.5s

### Session Refresh Logic

```python
async def _refresh_session(self) -> None:
    if self._session_refresh_count >= 2:
        # Log warning — do not raise; caller decides how to handle
        return
    await self._session.close()
    self._session = await create_session()
    self._session_refresh_count += 1
```

Session refresh is triggered by the caller when a 302 redirect to a session-expired URL is detected. The detection logic is NOT part of this story — story 2.1 only implements the infrastructure; later stories will wire in the detection.

### Testing with aioresponses

Install dev dependency first:

```toml
# apps/crawler/pyproject.toml
[dependency-groups]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
    "aioresponses>=0.7.6",
    ...
]
```

Basic pattern for HTTP mock:

```python
from aioresponses import aioresponses as aioresponses_ctx

@pytest.mark.asyncio
async def test_retry_on_503():
    session = await create_session()
    adapter = VnthuquanAdapter(source_config=mock_config, session=session,
                                state=None, output_dir=Path("/tmp"))
    url = "https://vnthuquan.net/truyen/truyen.aspx?tid=abc"

    with aioresponses_ctx() as m:
        m.get(url, status=503)
        m.get(url, status=503)
        m.get(url, status=200, body=b"OK")
        result = await adapter._request_with_retry("GET", url)

    await session.close()
    assert result.status == 200
    assert result.error_type is None
```

Verifying only ONE request is made (4xx no-retry test):

```python
with aioresponses_ctx() as m:
    m.get(url, status=404)
    result = await adapter._request_with_retry("GET", url)
    # If a second GET were attempted, aioresponses would raise ConnectionError
assert result.status == 404
assert result.error_type == "http_4xx"
```

Mocking rate-limit sleep:

```python
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_rate_limit_fires_before_request():
    session = await create_session()
    adapter = VnthuquanAdapter(source_config=mock_config, session=session,
                                state=None, output_dir=Path("/tmp"))
    call_order = []

    async def mock_sleep(seconds):
        call_order.append("sleep")

    url = "https://vnthuquan.net/truyen/truyen.aspx?tid=abc"
    with patch("asyncio.sleep", side_effect=mock_sleep):
        with aioresponses_ctx() as m:
            m.get(url, status=200, body=b"OK", callback=lambda *a, **kw: call_order.append("request"))
            await adapter._rate_limited_request("GET", url)

    await session.close()
    assert call_order[0] == "sleep", "sleep must fire before the HTTP request"
```

### Important Constraints

- `asyncio.sleep(rate_limit_seconds)` belongs ONLY in `_rate_limited_request` — never inside `_request_with_retry` or `_refresh_session`
- The retry backoff `asyncio.sleep` inside `_request_with_retry` is SEPARATE from the rate-limit sleep and is correct as-is
- `_rate_limited_request` is the sole entry point for all outbound HTTP — all future methods on `VnthuquanAdapter` (catalog fetch, book detail fetch, chapter fetch) must go through it, never calling `_request_with_retry` directly

### Running Tests

```bash
cd apps/crawler && uv run pytest tests/test_vnthuquan_crawler.py -v
```

Lint check:

```bash
cd apps/crawler && uv run ruff check .
```

Full test suite (must still pass after this story):

```bash
cd apps/crawler && uv run pytest tests/ -v
```

### Project Structure Notes

New files created by this story:
- `apps/crawler/vnthuquan_crawler.py` — `RequestResult` dataclass + `create_session()` factory + `VnthuquanAdapter` class skeleton (HTTP infrastructure only; catalog/book/chapter methods added in later stories)
- `apps/crawler/tests/test_vnthuquan_crawler.py` — adapter HTTP infrastructure tests

Files modified by this story:
- `apps/crawler/pyproject.toml` — add `aioresponses>=0.7.6` to dev dependencies

Files NOT modified (do not touch):
- `apps/crawler/vnthuquan_parser.py` — parser module from Epic 1, complete
- `apps/crawler/tests/test_vnthuquan_parser.py` — parser tests from Epic 1, complete
- `apps/crawler/models.py` — shared Pydantic models
- `apps/crawler/crawler.py` — existing CLI entry point
- `apps/crawler/utils/state.py` — CrawlState
- Any other file in `apps/crawler/utils/`

### References

- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/epics-vnthuquan-crawler.md#Story 2.1]
- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/architecture-vnthuquan-crawler.md#VnthuquanAdapter]
- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/architecture-vnthuquan-crawler.md#Enforcement Guidelines]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- Created `apps/crawler/vnthuquan_crawler.py` with `RequestResult` dataclass, `create_session()` async factory, and `VnthuquanAdapter` class with `_rate_limited_request`, `_request_with_retry`, and `_refresh_session`.
- Note: `pyproject.toml` is at the project root (not inside `apps/crawler/`) — `aioresponses>=0.7.6` was added to the root `pyproject.toml` `[dependency-groups] dev` group.
- All 11 new tests pass; 203 pre-existing tests still pass (6 pre-existing failures in `test_deduplication.py` are unrelated to this story — they fail due to CWD assumptions).
- Lint (ruff) passes clean on both new files.

### File List

- `apps/crawler/vnthuquan_crawler.py` — NEW: RequestResult dataclass, create_session() factory, VnthuquanAdapter class skeleton
- `apps/crawler/tests/test_vnthuquan_crawler.py` — NEW: 11 tests covering all 5 ACs
- `pyproject.toml` — MODIFIED: added `aioresponses>=0.7.6` to dev dependencies

## Change Log

- 2026-04-16: Story 2.1 implemented — HTTP infrastructure, VnthuquanAdapter skeleton, 11 tests added (Date: 2026-04-16)
