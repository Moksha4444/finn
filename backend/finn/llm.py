"""One router for every LLM call: task -> provider:model, cache, retry, fallback, token + cost log.

Cache key = hash(task, prompt text, schema, inputs). The prompt file's content *is* its version:
edit a prompt and old cache entries stop matching automatically.
"""
import os, json, time, hashlib, datetime as dt
from finn.config import CACHE, ROOT

PROMPTS = ROOT / "backend" / "finn" / "prompts"
LOG = CACHE / "llm_calls.jsonl"

TIER = {  # task -> tier; tier -> env var
    "classify": "CHEAP", "extract_results": "CHEAP", "extract_guidance": "CHEAP", "extract_bio": "CHEAP", "extract_balance_sheet": "CHEAP",
    "business_snapshot": "CHEAP", "headline": "CHEAP", "extract_fund_raise": "CHEAP", "pvd_verdict": "STRONG", "bull_bear": "STRONG",
}
# STRONG = Groq's free gpt-oss-120b (user's decision 12 Nov: gemini-3.8-flash was overloaded for 17+ min);
# STRONG_FALLBACK = gemini-3.8-flash; FALLBACK = the fast model, last resort on the live path only.
DEFAULTS = {"CHEAP": "gemini:gemini-3.5-flash-lite", "STRONG": "groq:openai/gpt-oss-120b",
            "STRONG_FALLBACK": "gemini:gemini-3.8-flash", "FALLBACK": "gemini:gemini-3.5-flash"}
# USD per 1M tokens (in, out), paid standard tier, from ai.google.dev pricing, Nov 2026.
# We run on the free tier, so this is "what it would cost", which is what the writeup reports.
PRICE = {"gemini-3.5-flash-lite": (0.30, 2.50), "gemini-3.8-flash": (0.75, 3.75), "gemini-3.5-flash": (1.50, 9.00),
         "openai/gpt-oss-120b": (0.15, 0.60)}  # Groq on-demand list price; we use Groq's free tier


def model_for(task: str) -> str:
    return os.getenv(f"FINN_TASK_{task.upper()}") or os.getenv(f"FINN_{TIER[task]}") or DEFAULTS[TIER[task]]


def prompt(name: str) -> str:
    return (PROMPTS / f"{name}.md").read_text(encoding="utf-8")


class Retryable(Exception):
    """Overloaded / rate-limited: worth retrying, then falling back."""


def _gemini(model: str, parts: list, schema: dict) -> tuple[dict, int, int]:
    from google import genai
    from google.genai import types, errors
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    contents = [types.Part.from_bytes(data=p, mime_type="application/pdf") if isinstance(p, bytes) else p for p in parts]
    try:
        r = client.models.generate_content(model=model, contents=contents, config=types.GenerateContentConfig(
            response_mime_type="application/json", response_schema=schema, temperature=0))
    except errors.APIError as e:
        if e.code in (429, 500, 503):
            raise Retryable(str(e)) from e
        raise
    except Exception as e:  # dropped connection / timeout mid-request (seen 12 Nov on a long transcript): retry too
        if any(k in type(e).__name__ for k in ("ReadError", "ConnectError", "Timeout", "RemoteProtocolError")):
            raise Retryable(f"{type(e).__name__}: {e}") from e
        raise
    u = r.usage_metadata
    # thinking tokens are billed as output
    return json.loads(r.text), u.prompt_token_count or 0, (u.candidates_token_count or 0) + (u.thoughts_token_count or 0)


def _groq(model: str, parts: list, schema: dict) -> tuple[dict, int, int]:
    """Groq's OpenAI-compatible API. Text only: strong-tier tasks get JSON, never PDFs."""
    import httpx
    if any(isinstance(p, bytes) for p in parts):
        raise ValueError("groq adapter takes text only")
    try:
        r = httpx.post("https://api.groq.com/openai/v1/chat/completions", timeout=120,
                       headers={"Authorization": f"Bearer {os.environ['GROQ_API_KEY']}"},
                       json={"model": model, "temperature": 0, "messages": [{"role": "user", "content": "\n\n".join(parts)}],
                             "response_format": {"type": "json_schema", "json_schema": {"name": "out", "schema": schema}}})
    except httpx.TransportError as e:
        raise Retryable(f"{type(e).__name__}: {e}") from e
    if r.status_code == 429:  # free tier: 8k tokens/min, 1k requests/day; wait as long as Groq asks
        time.sleep(min(float(r.headers.get("retry-after") or 10), 60))
        raise Retryable("groq 429")
    if r.status_code in (500, 502, 503):
        raise Retryable(f"groq {r.status_code}")
    r.raise_for_status()
    j = r.json()
    return json.loads(j["choices"][0]["message"]["content"]), j["usage"]["prompt_tokens"], j["usage"]["completion_tokens"]


ADAPTERS = {"gemini": _gemini, "groq": _groq}


def _call(spec: str, parts: list, schema: dict, tries: int = 3):
    provider, model = spec.split(":", 1)
    for n in range(tries):
        try:
            return model, *ADAPTERS[provider](model, parts, schema)
        except Retryable:
            if n == tries - 1:
                raise
            time.sleep(min(2 ** (n + 1), 120))


def run(task: str, prompt_name: str, inputs: list, schema: dict, key: str | None = None, patient: bool = False, **log) -> dict:
    """inputs: strings and/or PDF bytes. Returns {"data", "model", "model_note", "cached"}.
    Order: the task's model, then (strong tasks) STRONG_FALLBACK, then (live path only) the fast FALLBACK.
    Every answer records the model that produced it; anything but the primary also gets a model_note.
    patient: for precomputed outputs (batch PvD, bull/bear). Retries each strong model longer and never drops to
    the fast model; raises if both strong models stay down.
    key: cache key for the inputs (e.g. source-PDF hash + pages) when the input bytes themselves aren't
    stable; PyMuPDF page subsets differ byte-wise between runs. Extra keyword args go into the cost log."""
    text = prompt(prompt_name)
    h = hashlib.sha256(f"{task}\0{text}\0{json.dumps(schema, sort_keys=True)}".encode())
    for p in [key] if key else inputs:
        h.update(p if isinstance(p, bytes) else p.encode())
    f = CACHE / "llm" / f"{task}-{h.hexdigest()[:24]}.json"
    if f.exists():
        hit = json.loads(f.read_text(encoding="utf-8"))
        fast = (os.getenv("FINN_FALLBACK") or DEFAULTS["FALLBACK"]).split(":", 1)[1]
        if not (patient and hit.get("model") == fast):  # a cached fast-model answer doesn't satisfy a patient call
            return hit | {"cached": True}

    chain = [model_for(task)]
    if TIER[task] == "STRONG":
        chain.append(os.getenv("FINN_STRONG_FALLBACK") or DEFAULTS["STRONG_FALLBACK"])
    if not patient:
        chain.append(os.getenv("FINN_FALLBACK") or DEFAULTS["FALLBACK"])
    if any(isinstance(p, bytes) for p in inputs):  # PDFs: Gemini only
        chain = [c for c in chain if c.startswith("gemini:")]
    chain = list(dict.fromkeys(chain))
    note = None
    for k, spec in enumerate(chain):
        try:
            model, data, tin, tout = _call(spec, [text, *inputs], schema, tries=8 if patient else 3)
            if k:
                note = f"Generated by {spec.split(':', 1)[1]} ({chain[0].split(':', 1)[1]} unavailable)"
            break
        except Retryable:
            if k == len(chain) - 1:
                raise
    pin, pout = PRICE.get(model, (0, 0))
    entry = {"ts": dt.datetime.now().isoformat(timespec="seconds"), "task": task, "model": model,
             "tokens_in": tin, "tokens_out": tout, "usd": round((tin * pin + tout * pout) / 1e6, 6), **log}
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry) + "\n")
    out = {"data": data, "model": model, "model_note": note, "tokens_in": tin, "tokens_out": tout}
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out | {"cached": False}


def total_cost() -> dict:
    rows = [json.loads(l) for l in LOG.read_text(encoding="utf-8").splitlines()] if LOG.exists() else []
    return {"calls": len(rows), "tokens_in": sum(r["tokens_in"] for r in rows),
            "tokens_out": sum(r["tokens_out"] for r in rows), "usd": round(sum(r["usd"] for r in rows), 4)}
