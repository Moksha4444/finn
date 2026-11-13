"""Router order without network: strong tasks go Groq gpt-oss-120b -> gemini-3.8-flash -> (live only) gemini-3.5-flash;
PDF tasks never go to Groq; every non-primary answer is labelled with the model that produced it."""
import pytest
from finn import llm

SCHEMA = {"type": "object", "properties": {"x": {"type": "string"}}}


@pytest.fixture
def fake(monkeypatch, tmp_path):
    monkeypatch.setattr(llm, "CACHE", tmp_path)
    monkeypatch.setattr(llm, "LOG", tmp_path / "log.jsonl")
    monkeypatch.setattr(llm.time, "sleep", lambda s: None)
    down = set()
    calls = []

    def adapter(model, parts, schema):
        calls.append(model)
        if model in down:
            raise llm.Retryable("down")
        return {"x": model}, 1, 1

    monkeypatch.setitem(llm.ADAPTERS, "gemini", adapter)
    monkeypatch.setitem(llm.ADAPTERS, "groq", adapter)
    return down, calls


def test_strong_task_uses_groq_first_unlabelled(fake):
    r = llm.run("pvd_verdict", "pvd_verdict", ["{}"], SCHEMA)
    assert r["model"] == "openai/gpt-oss-120b" and r["model_note"] is None


def test_groq_down_falls_back_to_gemini_strong_with_a_label(fake):
    fake[0].add("openai/gpt-oss-120b")
    r = llm.run("pvd_verdict", "pvd_verdict", ["{}"], SCHEMA, patient=True)
    assert r["model"] == "gemini-3.8-flash" and "gemini-3.8-flash" in r["model_note"]


def test_patient_mode_never_uses_the_fast_model(fake):
    fake[0].update({"openai/gpt-oss-120b", "gemini-3.8-flash"})
    with pytest.raises(llm.Retryable):
        llm.run("pvd_verdict", "pvd_verdict", ["{}"], SCHEMA, patient=True)
    assert "gemini-3.5-flash" not in fake[1]


def test_live_path_ends_at_the_fast_model(fake):
    fake[0].update({"openai/gpt-oss-120b", "gemini-3.8-flash"})
    r = llm.run("bull_bear", "pvd_verdict", ["{}"], SCHEMA)
    assert r["model"] == "gemini-3.5-flash" and r["model_note"]


def test_pdf_tasks_never_go_to_groq(fake, monkeypatch):
    monkeypatch.setenv("FINN_TASK_PVD_VERDICT", "groq:openai/gpt-oss-120b")
    r = llm.run("pvd_verdict", "pvd_verdict", ["s", b"%PDF-1.4"], SCHEMA)
    assert r["model"] == "gemini-3.8-flash" and "openai/gpt-oss-120b" not in fake[1]


def test_daily_cap_skips_straight_to_the_next_model(fake, monkeypatch):
    calls = fake[1]

    def capped(model, parts, schema):
        calls.append(model)
        raise llm.Exhausted("429, retry after 770s")
    monkeypatch.setitem(llm.ADAPTERS, "groq", capped)
    r = llm.run("bull_bear", "bull_bear", ["{}"], SCHEMA, patient=True)
    assert calls == ["openai/gpt-oss-120b", "gemini-3.8-flash"] and r["model"] == "gemini-3.8-flash"


def test_cheap_tasks_fall_back_to_groq_on_text(fake, monkeypatch):
    # 13 Nov: a Gemini quota day must not stop headlines, classification or extraction
    fake[0].add("gemini-3.5-flash-lite")
    monkeypatch.setattr(llm, "as_text", lambda inputs: [p if isinstance(p, str) else "[p.1] text" for p in inputs])
    r = llm.run("headline", "headline", ["subject", b"%PDF-1.4"], SCHEMA)
    assert r["model"] == "openai/gpt-oss-20b" and "gemini-3.5-flash-lite unavailable" in r["model_note"]


def test_long_text_is_chunked_for_groq_and_lists_are_joined():
    schema = {"type": "object", "properties": {"promises": {"type": "array"}, "m": {"type": "object", "nullable": True}}}
    text = "".join(f"[p.{i}] " + "x" * 6000 for i in range(1, 7))  # 36k chars
    parts = llm.chunks(["ctx", text], schema)
    assert len(parts) == 3 and all(p[0] == "ctx" and len(p[1]) <= llm.GROQ_CHARS for p in parts) and parts[1][1].startswith("[p.3]")
    assert llm.merge([{"promises": [1], "m": None}, {"promises": [2], "m": {"v": 1}}], schema) == {"promises": [1, 2], "m": {"v": 1}}
    assert len(llm.chunks(["ctx", text], {"type": "object", "properties": {"basis": {"type": "string"}}})) == 1  # scalars can't be joined


def test_gemini_daily_quota_is_exhausted_not_retryable(monkeypatch):
    from google import genai
    from google.genai import errors
    monkeypatch.setenv("GEMINI_API_KEY", "x")

    def client(msg):
        class C:
            class models:
                @staticmethod
                def generate_content(**k):
                    raise errors.APIError(429, {"error": {"code": 429, "message": msg, "status": "RESOURCE_EXHAUSTED"}})
        return lambda **k: C()
    monkeypatch.setattr(genai, "Client", client("quota exceeded, quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier"))
    with pytest.raises(llm.Exhausted):
        llm._gemini("gemini-3.8-flash", ["x"], SCHEMA)
    monkeypatch.setattr(genai, "Client", client("quota exceeded, quotaId: GenerateRequestsPerMinutePerProjectPerModel-FreeTier"))
    with pytest.raises(llm.Retryable):
        llm._gemini("gemini-3.8-flash", ["x"], SCHEMA)
