"""Shared HTTP fetch with an on-disk cache and a polite per-host delay."""
import time, hashlib, urllib.parse, httpx
from finn.config import CACHE

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
_client = httpx.Client(follow_redirects=True, timeout=60, headers={"User-Agent": UA})
_last_hit: dict[str, float] = {}


def fetch(url: str, *, headers: dict | None = None, params: dict | None = None,
          max_age: float | None = None, gap: float = 1.0, expect: bytes | None = None) -> bytes:
    """GET with cache. max_age=None caches forever (filings never change); 0 disables the cache.
    expect: required leading bytes (b"{", b"%PDF"); BSE answers some requests with a 200 HTML error page,
    which must raise and must not be cached. Raises httpx.HTTPStatusError on 4xx/5xx."""
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
    if expect and not r.content.lstrip().startswith(expect):
        raise ValueError(f"unexpected response from {host}: {r.content[:60]!r}")
    if max_age != 0:
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(r.content)
    return r.content
