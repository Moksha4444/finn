"""Promised vs Delivered: call selection and actuals math (offline), plus the 2 saved transcript fixtures."""
import pathlib
import pytest
from finn.pull import pvd
from finn.sources import pdf

FIX = pathlib.Path(__file__).parent / "fixtures"
BSE = "https://www.bseindia.com/stockinfo/AnnPdfOpen.aspx?Pname="


def test_results_calls_pick_one_per_quarter_and_skip_non_results_calls():
    # TCS as screener listed it on 12 Nov 2026: a company-site "Jul 2026" link that is really the 2025 file,
    # a deck-only "Mar 2026" row and an analyst-day "Dec 2025" call.
    concalls = [
        {"period": "Oct 2026", "transcript": BSE + "a.pdf"},
        {"period": "Jul 2026", "transcript": BSE + "b.pdf"},
        {"period": "Jul 2026", "transcript": "https://www.tcs.com/.../Q1%202025-26.pdf"},
        {"period": "Apr 2026", "transcript": BSE + "c.pdf"},
        {"period": "Mar 2026", "transcript": None},
        {"period": "Jan 2026", "transcript": BSE + "d.pdf"},
        {"period": "Dec 2025", "transcript": BSE + "e.pdf"},
        {"period": "Oct 2025", "transcript": BSE + "f.pdf"},
    ]
    got = pvd.results_calls(concalls)
    assert [c["quarter"] for c in got] == ["Sep 2026", "Jun 2026", "Mar 2026", "Dec 2025"]
    assert got[1]["transcript"].endswith("b.pdf")  # BSE copy wins over the mislabelled company-site link


def test_hdfcbank_march_call_is_not_a_results_call():
    assert pvd.reported_quarter("Mar 2026") is None  # 3 months after Dec: an investor call, not results
    assert pvd.reported_quarter("Jan 2026") == "Dec 2025"
    assert pvd.reported_quarter("Nov 2026") == "Sep 2026"


def test_actuals_compute_growth_in_python_and_margins_in_points():
    q = {"periods": ["Sep 2025", "Dec 2025", "Mar 2026", "Jun 2026", "Sep 2026"],
         "rows": {"Sales": [100, 104, 108, 110, 115], "OPM %": [24.0, 25.0, 25.5, 24.5, 26.0]}}
    s = pvd.actuals(q, "revenue", "Jun 2026")
    assert s == [{"quarter": "Sep 2026", "value": 115, "unit": "₹ crore", "yoy_pct": 15.0, "qoq_pct": 4.5}]
    m = pvd.actuals(q, "operating_margin", "Jun 2026")[0]
    assert (m["yoy_pp"], m["qoq_pp"]) == (2.0, 1.5)
    assert pvd.actuals(q, "capex", "Jun 2026") == []  # not in the quarterly table: the verdict must say not measurable
    assert pvd.describe(s, ["Sep 2026"]) == "Sep 2026: ₹115 cr (+15.0% YoY)"


@pytest.mark.parametrize("name", ["TCS_transcript.pdf", "HDFCBANK_transcript.pdf"])
def test_transcript_fixtures_have_page_markers(name):
    f = FIX / name
    if not f.exists():
        pytest.skip("fixture not saved yet")
    texts = pdf.pages(pdf.open_pdf(f.read_bytes()))
    marked = pdf.marked_text(texts, list(range(len(texts))))
    assert len(texts) > 5 and "[p.1]" in marked and f"[p.{len(texts)}]" in marked
    assert "quarter" in marked.lower()


def test_dedupe_keeps_first_mention_of_a_repeated_target():
    ps = [{"said_in": "Sep 2026", "metric_key": "operating_margin", "target": "26% to 28%", "page": 14},
          {"said_in": "Sep 2026", "metric_key": "operating_margin", "target": "26%-28%", "page": 26},
          {"said_in": "Jun 2026", "metric_key": "operating_margin", "target": "26%-28%", "page": 9}]
    assert [p["page"] for p in pvd.dedupe(ps)] == [14, 9]  # same call repeats dropped; another call's mention kept
