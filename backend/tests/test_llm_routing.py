"""Router order without network: strong -> Groq -> fast fallback on the live path; patient mode never falls back."""
import pytest
from finn import llm

SCHEMA = {"type": "object", "properties": {"x": {"type": "string"}}}


@pytest.fixture
def fake(monkeypatch, tmp_path):
    monkeypatch.setattr(llm, "CACHE", tmp_path)
    monkeypatch.setattr(llm, "LOG", tmp_path / "log.jsonl")
    monkeypatch.setattr(llm.time, "sleep", lambda s: None)
    monkeypatch.setenv("GROQ_API_KEY", "test")
    calls = []

    def gemini(model, parts, schema):
        calls.append(model)
        if model == "gemini-3.8-flash":
            raise llm.Retryable("503")
        return {"x": model}, 1, 1

    def groq(model, parts, schema):
        calls.append(model)
        return {"x": model}, 1, 1

    monkeypatch.setitem(llm.ADAPTERS, "gemini", gemini)
    monkeypatch.setitem(llm.ADAPTERS, "groq", groq)
    return calls


def test_live_strong_task_goes_to_groq_with_a_label(fake):
    r = llm.run("pvd_verdict", "pvd_verdict", ["{}"], SCHEMA)
    assert r["data"] == {"x": "openai/gpt-oss-120b"} and "Groq" in r["model_note"]


def test_patient_mode_never_falls_back(fake):
    with pytest.raises(llm.Retryable):
        llm.run("pvd_verdict", "pvd_verdict", ["{}"], SCHEMA, patient=True)
    assert set(fake) == {"gemini-3.8-flash"}  # retried the strong model only


def test_pdf_tasks_skip_groq(fake, monkeypatch):
    monkeypatch.setenv("FINN_TASK_HEADLINE", "gemini:gemini-3.8-flash")  # force the primary to fail
    r = llm.run("headline", "headline", ["s", b"%PDF-1.4"], SCHEMA)
    assert r["data"] == {"x": "gemini-3.5-flash"} and "fallback" in r["model_note"]
