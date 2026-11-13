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
