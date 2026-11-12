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


def test_evidence_only_from_later_calls_and_built_by_python():
    reported = [{"id": "R1", "said_in": "Jun 2026", "page": 4, "quote": "CASA ratio at 37%"},
                {"id": "R2", "said_in": "Sep 2026", "page": 6, "quote": "CASA ratio improved to 38.4%"}]
    p = {"said_in": "Jun 2026", "eligible_reported": ["R2"]}
    # the model cites R1 (same call as the promise) and R2: only R2 survives
    assert pvd.evidence(p, reported, ["R1", "R2"]) == ["Q2 FY27 call, p.6: “CASA ratio improved to 38.4%”"]


def test_fiscal_quarters():
    assert pvd.fy_name("Sep 2026") == "Q2 FY27" and pvd.fy_name("Mar 2026") == "Q4 FY26"
    assert pvd.qlabel(27, 1) == "Jun 2026" and pvd.qlabel(27, 4) == "Mar 2027"
    assert pvd.shift("Dec 2026", 1) == "Mar 2027" and pvd.shift("Sep 2026", -4) == "Sep 2025"


Q = {"periods": ["Jun 2025", "Sep 2025", "Dec 2025", "Mar 2026", "Jun 2026", "Sep 2026"],
     "rows": {"Sales": [100, 100, 100, 100, 108, 112], "Operating Profit": [24, 25, 25, 25, 27, 29.12]}}
P = lambda **k: {"metric": "m", "target": "t", "basis": "reported_inr", "fy": None, "quarter_no": None, "half_no": None, "target_high": None} | k


def test_full_year_growth_in_progress_is_paced_not_judged():
    # "double-digit growth in FY27" said on the Q4 FY26 call; H1 FY27 is in: (108+112)/(100+100) -> +10.0%
    r = pvd.progress(P(metric_key="revenue", target_type="growth_pct", target_low=10, horizon="fiscal_year", fy=27), "Mar 2026", Q)
    assert r["verdict"] == "on track" and "FY27 so far (2 of 4 quarters" in r["actual"] and "+10.0% YoY" in r["actual"]
    r = pvd.progress(P(metric_key="revenue", target_type="growth_pct", target_low=12, horizon="fiscal_year", fy=27), "Mar 2026", Q)
    assert r["verdict"] == "behind pace"


def test_finished_period_is_hit_or_miss_and_margins_are_revenue_weighted():
    # H1 FY27 margin = (27 + 29.12) / (108 + 112) = 25.5%
    r = pvd.progress(P(metric_key="operating_margin", target_type="margin_pct", target_low=25, target_high=27, horizon="half_year", fy=27, half_no=1), "Mar 2026", Q)
    assert r["verdict"] == "hit" and "EBITDA margin 25.5%" in r["actual"] and "25–27%" in r["actual"]
    # "27% next quarter" said on the Q1 FY27 call; Q2 FY27 came in at 29.12 / 112 = 26.0%
    r = pvd.progress(P(metric_key="operating_margin", target_type="margin_pct", target_low=27, horizon="next_quarter"), "Jun 2026", Q)
    assert r["verdict"] == "miss" and "Q2 FY27 (Sep 2026)" in r["actual"]


def test_cannot_compute_returns_none():
    assert pvd.progress(P(metric_key="revenue", target_type="growth_pct", target_low=10, horizon="fiscal_year", fy=27, basis="constant_currency_or_usd"), "Mar 2026", Q) is None
    assert pvd.progress(P(metric_key="other", target_type="count", target_low=200, horizon="fiscal_year", fy=27), "Mar 2026", Q) is None
    assert pvd.progress(P(metric_key="revenue", target_type="growth_pct", target_low=10, horizon="fiscal_year", fy=28), "Mar 2026", Q) is None  # nothing reported yet


def test_ebit_basis_subtracts_depreciation():
    q = {"periods": ["Sep 2025", "Sep 2026"], "rows": {"Sales": [100, 100], "Operating Profit": [28, 28], "Depreciation": [2, 2.5]}}
    r = pvd.progress(P(metric_key="operating_margin", target_type="margin_pct", target_low=25, horizon="long_term", margin_basis="ebit", direction="at_least"), "Jun 2026", q)
    assert "EBIT margin (operating profit less depreciation) 25.5%" in r["actual"] and r["verdict"] == "on track"


def test_ceiling_targets_and_bands():
    p = P(target_low=85, target_high=90, direction="at_most")
    assert pvd.judge(96, p, complete=False) == ("behind pace", "≤90%")
    assert pvd.judge(88, p, complete=True) == ("hit", "≤90%")
    assert pvd.judge(29, P(target_low=26, target_high=28, direction="at_least"), complete=False)[0] == "ahead"


def test_reported_level_is_paced_in_python():
    # "LDR 85-90% for FY27" (Q3 FY26 call); Q2 FY27 call reports "around 96%": FY27 still running -> behind pace
    p = P(metric_key="other", target="85% to 90% for FY '27", target_type="other", target_low=85, target_high=90,
          horizon="fiscal_year", fy=27, direction="at_most", said_in="Dec 2025")
    used = [{"said_in": "Sep 2026", "value": "around 96%"}, {"said_in": "Jun 2026", "value": "about 98%"}]
    r = pvd.pace_reported(p, used, "Sep 2026")
    assert r["verdict"] == "behind pace" and "around 96% (Q2 FY27 call)" in r["why"]
    assert pvd.pace_reported(p, [{"said_in": "Sep 2026", "value": "96% and 98%"}], "Sep 2026") is None  # ambiguous
