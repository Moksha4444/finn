"""Shared HTTP fetch with an on-disk cache and a polite per-host delay."""
import time, hashlib, urllib.parse, httpx
from finn.config import CACHE

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
_client = httpx.Client(follow_redirects=True, timeout=60, headers={"User-Agent": UA})
_last_hit: dict[str, float] = {}


def fetch(url: str, *, headers: dict | None = None, params: dict | None = None,
          max_age: float | None = None, gap: float = 1.0) -> bytes:
    """GET with cache. max_age=None caches forever (filings never change); 0 disables the cache.
    Raises httpx.HTTPStatusError on 4xx/5xx so callers can fall back to the raw link."""
    key = hashlib.sha256((url + repr(sorted((params or {}).items()))).encode()).hexdigest()[:24]
    f = CACHE / "http" / key
    if f.exists() and max_age != 0 and (max_age is None or time.time() - f.stat().st_mtime < max_age):
        return f.read_bytes()
    host = urllib.parse.urlparse(url).netloc
    wait = _last_hit.get(host, 0) + gap - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    r = _client.get(url, headers=headers, params=params)
    _last_hit[host] = time.monotonic()
    r.raise_for_status()
    if max_age != 0:
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(r.content)
    return r.content
