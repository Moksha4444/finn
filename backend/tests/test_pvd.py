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


def test_dedupe_keeps_oldest_mention_across_calls():
    band = {"metric_key": "operating_margin", "target_low": 26, "target_high": 28, "fy": None}
    ps = [band | {"said_in": "Sep 2026", "target": "26% to 28%", "page": 14},
          band | {"said_in": "Sep 2026", "target": "26%-28%", "page": 26},
          band | {"said_in": "Jun 2026", "target": "26%-28%", "page": 9},
          {"said_in": "Sep 2026", "metric_key": "other", "target": "more digital deals", "page": 3},
          # PERSISTENT: the same target worded two ways on one call
          {"said_in": "Sep 2026", "metric_key": "revenue", "target": "$5 billion in annual revenue by FY31", "target_low": 5, "target_high": None, "fy": 31, "page": 4},
          {"said_in": "Sep 2026", "metric_key": "revenue", "target": "$5 billion by March 2031", "target_low": 5, "target_high": None, "fy": 31, "page": 12}]
    assert [p["page"] for p in pvd.dedupe(ps)] == [9, 3, 4]  # the Jun 2026 call's mention has the longest track record


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
P = lambda **k: {"metric": "m", "target": "t", "basis": "reported_inr", "fy": None, "quarter_no": None, "half_no": None, "target_high": None,
                 "said_in": "Mar 2026", "margin_basis": "ebitda", "company_total": True} | k


def prog(p, call_q, q=Q, margin=None, bank=None):
    m = margin or pvd.company_margin(q, {}, [], p.get("margin_basis") == "ebit")
    return pvd.progress(p, call_q, pvd.series(p, q, m, bank))


def test_full_year_growth_in_progress_is_paced_not_judged():
    # "double-digit growth in FY27" said on the Q4 FY26 call; H1 FY27 is in: (108+112)/(100+100) -> +10.0%
    r = prog(P(metric_key="revenue", target_type="growth_pct", target_low=10, horizon="fiscal_year", fy=27), "Mar 2026")
    assert r["verdict"] == "on track" and "FY27 (Apr 2026 – Mar 2027) so far (Q1–Q2, 2 of 4 quarters)" in r["actual"] and "+10.0%" in r["actual"]
    r = prog(P(metric_key="revenue", target_type="growth_pct", target_low=12, horizon="fiscal_year", fy=27), "Mar 2026")
    assert r["verdict"] == "behind pace"


def test_finished_period_is_hit_or_miss_and_margins_are_revenue_weighted():
    # H1 FY27 margin = (27 + 29.12) / (108 + 112) = 25.5%
    r = prog(P(metric_key="operating_margin", target_type="margin_pct", target_low=25, target_high=27, horizon="half_year", fy=27, half_no=1), "Mar 2026")
    assert r["verdict"] == "hit" and "EBITDA margin (computed" in r["actual"] and "25.5% vs target 25–27%" in r["actual"]
    # "27% next quarter" said on the Q1 FY27 call; Q2 FY27 came in at 29.12 / 112 = 26.0%
    r = prog(P(metric_key="operating_margin", target_type="margin_pct", target_low=27, horizon="next_quarter"), "Jun 2026")
    assert r["verdict"] == "miss" and "Q2 FY27 (Jul – Sep 2026)" in r["actual"]


def test_cannot_compute_returns_none():
    assert prog(P(metric_key="revenue", target_type="growth_pct", target_low=10, horizon="fiscal_year", fy=27, basis="constant_currency_or_usd"), "Mar 2026") is None
    assert prog(P(metric_key="other", target_type="count", target_low=200, horizon="fiscal_year", fy=27), "Mar 2026") is None
    assert prog(P(metric_key="revenue", target_type="growth_pct", target_low=10, horizon="fiscal_year", fy=28), "Mar 2026") is None  # nothing reported yet
    # POLYCAB "8-10% EBITDA margin by FY30" is the FMEG segment's: company totals can't measure it
    assert prog(P(metric_key="operating_margin", target_type="margin_pct", target_low=8, target_high=10, horizon="long_term", company_total=False), "Mar 2026") is None
    # TCS "wage hike impact of 150 to 200 basis points": a margin change, never compared with a margin level
    assert prog(P(metric_key="operating_margin", target_type="margin_pct", target="150 to 200 basis points", target_low=1.5, target_high=2, horizon="next_quarter"), "Mar 2026") is None


def test_long_term_is_direction_of_travel_on_computed_ebit():
    # "inch closer to 26-28% over time": long term, no date. EBIT = operating profit - depreciation: 26.0% at the call, 25.5% now
    q = {"periods": ["Jun 2026", "Sep 2026"], "rows": {"Sales": [100, 100], "Operating Profit": [28, 28], "Depreciation": [2, 2.5]}}
    r = prog(P(metric_key="operating_margin", target_type="margin_pct", target_low=26, target_high=28, horizon="long_term",
               margin_basis="ebit", direction="at_least"), "Jun 2026", q)
    assert r["verdict"] == "moved away" and r["path"] == "26.0% → 25.5% (Q1 FY27 → Q2 FY27)"
    assert "EBIT margin (computed: operating profit less depreciation" in r["actual"]


REPORTED_MARGINS = {q: {"name": "operating margin", "basis": "ebit", "value": v, "page": 3, "quote": f"operating margin of {v}%", "transcript": "t.pdf"}
                    for q, v in [("Dec 2025", 25.2), ("Mar 2026", 24.9), ("Jun 2026", 24.6), ("Sep 2026", 24.3)]}


def test_company_reported_margin_wins_and_shows_the_quarterly_path():
    calls = list(REPORTED_MARGINS)
    m = pvd.company_margin(Q, REPORTED_MARGINS, calls, ebit=True)
    assert m["name"] == "Operating margin (as reported)" and m["source"] == pvd.SAID_MARGIN
    r = prog(P(metric_key="operating_margin", target_type="margin_pct", target_low=26, target_high=28, horizon="long_term", direction="at_least"),
             "Mar 2026", margin=m)
    assert r["verdict"] == "moved away" and r["actual"].startswith("Moved away: 24.9% → 24.6% → 24.3% (Q4 FY26 → Q2 FY27) vs target 26–28%")
    assert len(r["cites"]) == 3 and r["cites"][0]["label"] == "Q4 FY26 call, p.3: “operating margin of 24.9%”"
    # one call without a stated margin: the whole company falls back to the computed definition (never mixed)
    gap = {q: v for q, v in REPORTED_MARGINS.items() if q != "Jun 2026"}
    assert pvd.company_margin(Q, gap, calls, ebit=False)["name"].startswith("EBITDA margin (computed")


def test_directional_moving_closer_and_reaching_the_target():
    m = {"q": {"Mar 2026": 24.0, "Jun 2026": 24.8, "Sep 2026": 26.1}, "w": {}, "name": "x", "source": "s", "cites": {}}
    p = P(metric_key="operating_margin", target_type="margin_pct", target_low=26, horizon="long_term", direction="at_least")
    assert prog(p, "Mar 2026", margin=m)["verdict"] == "hit"
    m["q"]["Sep 2026"] = 25.0
    assert prog(p, "Mar 2026", margin=m)["verdict"] == "moved closer"


def test_undated_band_is_judged_on_the_year_it_was_given_in():
    # user's rule, 13 Nov: ASIANPAINT "maintain the 18 to 20% PBDIT band" on the Q2 FY26 call (no period stated)
    # is FY26's band, judged on FY26 as a whole; a Q4 call's undated guidance is about the next year
    m = {"q": {"Jun 2025": 20.7, "Sep 2025": 17.7, "Dec 2025": 20.1, "Mar 2026": 19.4, "Jun 2026": 20.6, "Sep 2026": 15.6},
         "w": {q: 100 for q in ("Jun 2025", "Sep 2025", "Dec 2025", "Mar 2026", "Jun 2026", "Sep 2026")}, "name": "PBDIT margin", "source": "s", "cites": {}}
    p = pvd.dated(P(metric_key="operating_margin", target_type="margin_pct", target_low=18, target_high=20, horizon="unspecified", said_in="Sep 2025"))
    assert (p["horizon"], p["fy"]) == ("fiscal_year", 26) and pvd.period_label(p) == "FY26 (Apr 2025 – Mar 2026)"
    r = prog(p, "Sep 2025", margin=m)
    assert r["verdict"] == "hit" and r["actual"].startswith("FY26 (Apr 2025 – Mar 2026): PBDIT margin 19.5%")
    assert "Q1 FY27" not in (r["path"] or "") and r["chart"]["points"][-1][0] == "Q4 FY26"  # nothing after the deadline
    assert "financial year it was given in" in r["why"]
    assert pvd.dated(P(horizon="next_few_quarters", said_in="Mar 2026"))["fy"] == 27
    assert pvd.dated(P(horizon="long_term", said_in="Mar 2026"))["horizon"] == "long_term"  # stays direction of travel


CD = {q: {"cd_ratio": v, "deposits": 100.0, "advances": v, "unit": "₹ crore", "basis": "standalone", "page": 5, "url": "u"}
      for q, v in [("Dec 2025", 98.7), ("Mar 2026", 94.6), ("Jun 2026", 95.8), ("Sep 2026", 96.0)]}
BANK = lambda since: {q: v for q, v in CD.items() if pvd._q(q) >= pvd._q(since)}
BQ = {"periods": list(CD), "rows": {"Revenue": [1, 1, 1, 1]}}


def test_cd_ratio_from_results_filings_ended_period_is_hit_or_miss():
    # HDFCBANK, Q3 FY26 call: "CD ratio 90% to 96% in FY26" -> FY26 ended Mar 2026 at 94.6%
    p = P(metric_key="cd_ratio", target_type="margin_pct", target_low=90, target_high=96, horizon="fiscal_year", fy=26, direction="at_most", said_in="Dec 2025")
    r = prog(p, "Dec 2025", BQ, bank=BANK)
    assert r["verdict"] == "hit" and r["actual"].startswith("FY26 (Apr 2025 – Mar 2026), at period end: CD ratio (advances / deposits) 94.6% vs target ≤96%")
    assert r["path"] == "98.7% → 94.6% (Q3 FY26 → Q4 FY26)" and r["actual_source"] == pvd.BANK_SOURCE
    # "85% to 90% for FY27": running, latest Sep 2026 at 96.0%
    p = p | {"target_low": 85, "target_high": 90, "fy": 27}
    r = prog(p, "Dec 2025", BQ, bank=BANK)
    assert r["verdict"] == "behind pace" and "FY27 (Apr 2026 – Mar 2027) so far, latest Q2 FY27" in r["actual"]


def test_select_keeps_financial_and_measured_drops_soft_unmeasured():
    ps = [P(metric_key="other", target_type="count", said_in="Dec 2025"),        # soft, unmeasured -> dropped
          P(metric_key="other", target_type="count", said_in="Mar 2026"),        # operational but measured -> kept
          P(metric_key="revenue", target_type="growth_pct", said_in="Jun 2026"),  # financial, unmeasured -> kept, last
          P(metric_key="operating_margin", target_type="margin_pct", said_in="Sep 2026")]
    judged = {1: {"verdict": "hit"}, 3: {"verdict": "moved away"}}
    assert pvd.select(ps, judged) == [3, 1, 2]
    assert len(pvd.select([P(metric_key="revenue", target_type="growth_pct", said_in="Mar 2026")] * 9, {})) == pvd.MAX_PROMISES


def test_reported_margin_must_be_in_its_own_quote():
    m = {"value": 24.6, "page": 3, "quote": "operating margin came in at 24.6%"}
    assert pvd._margin_ok(m, 10) and not pvd._margin_ok(m | {"value": 25.0}, 10) and not pvd._margin_ok(m, 2)


def test_bank_column_date_check():
    import datetime as dt
    from finn.pull import bank
    qe = bank.quarter_end("Dec 2025")
    assert qe == dt.date(2025, 12, 31)
    assert bank.same_date("31.12.2025", qe) and bank.same_date("December 31, 2025", qe)
    assert not bank.same_date("31.03.2025", qe) and not bank.same_date("31.12.2024", qe)


def test_bound_slips_are_normalised():
    # L&T "EBITDA margin target of 8.5%" extracted as 8.5-8.5, at_most: a margin target is a floor, shown as one number
    p = P(metric_key="operating_margin", target_low=8.5, target_high=8.5, direction="at_most")
    assert pvd.judge(10.3, p, complete=True) == ("hit", "≥8.5%")
    # a cost ceiling stays a ceiling
    assert pvd.judge(7.31, P(metric_key="other", target_low=7.55, target_high=7.6, direction="at_most"), complete=True) == ("hit", "≤7.6%")


def test_ceiling_targets_and_bands():
    p = P(target_low=85, target_high=90, direction="at_most")
    assert pvd.judge(96, p, complete=False) == ("behind pace", "≤90%")
    assert pvd.judge(88, p, complete=True) == ("hit", "≤90%")
    assert pvd.judge(29, P(target_low=26, target_high=28, direction="at_least"), complete=False)[0] == "ahead"
    assert pvd.gap(96, p) == 6 and pvd.gap(88, p) == 0 and pvd.gap(25, P(target_low=26, target_high=28, direction="within")) == 1


def test_reported_level_is_paced_in_python():
    # "LDR 85-90% for FY27" (Q3 FY26 call); Q2 FY27 call reports "around 96%": FY27 still running -> behind pace
    p = P(metric_key="other", target="85% to 90% for FY '27", target_type="other", target_low=85, target_high=90,
          horizon="fiscal_year", fy=27, direction="at_most", said_in="Dec 2025")
    used = [{"said_in": "Sep 2026", "value": "around 96%"}, {"said_in": "Jun 2026", "value": "about 98%"}]
    r = pvd.pace_reported(p, used, "Sep 2026")
    assert r["verdict"] == "behind pace" and "around 96% (Q2 FY27 call)" in r["why"]
    assert pvd.pace_reported(p, [{"said_in": "Sep 2026", "value": "96% and 98%"}], "Sep 2026") is None  # ambiguous


def test_bse_transcript_fallback_picks_the_transcript_filing(monkeypatch):
    # MARUTI, Q2 FY27: screener links a company-site viewer page; BSE has the transcript under its own subcategory
    rows = [{"NEWS_DT": "2026-10-27T10:00:00", "SUBCATNAME": "General", "NEWSSUB": "Audio Recording", "ATTACHMENTNAME": "audio.pdf"},
            {"NEWS_DT": "2026-11-02T10:00:00", "SUBCATNAME": "Earnings Call Transcript", "NEWSSUB": "Announcement under Regulation 30", "ATTACHMENTNAME": "t.pdf"}]
    monkeypatch.setattr(pvd.bse, "announcements", lambda *a, **k: rows)
    monkeypatch.setattr(pvd.bse, "attachment", lambda name: b"%PDF " + name.encode())
    url, b = pvd.bse_transcript("532500", "Sep 2026")
    assert url.endswith("Pname=t.pdf") and b == b"%PDF t.pdf"
    monkeypatch.setattr(pvd.bse, "announcements", lambda *a, **k: rows[:1])
    assert pvd.bse_transcript("532500", "Sep 2026") is None


def test_rules_override_the_extractor_on_measure_and_direction():
    # L&T order inflow / BAJFINANCE AUM marked company_total by the model: never measured with revenue
    for metric in ("group order inflows growth", "AUM growth"):
        assert prog(P(metric=metric, metric_key="revenue", target_type="growth_pct", target_low=10, horizon="fiscal_year", fy=27), "Mar 2026") is None
    # BAJFINANCE cost of funds "7.55% to 7.60%", extracted as a band: lower is better
    p = P(metric="cost of funds", metric_key="other", target_low=7.55, target_high=7.6, direction="within")
    assert pvd.judge(7.41, p, complete=True) == ("hit", "≤7.6%")


def test_model_verdicts_are_checked_in_python():
    p = P(target="INR3,500 crores to INR4,000 crores", quote="IT hardware revenue of 3,500 to 4,000 crores", period="next year",
          horizon="fiscal_year", fy=27, said_in="Dec 2025")
    said = ["Q2 FY27 call, p.6: “Revenues for the quarter was Rs. 2,160 crores.”"]
    # DIXON: the reason cites 21,794 crore, which is in no quote
    assert "not in the evidence" in pvd.model_check("hit", "Sep 2026 IT hardware revenue 21,794 crore exceeds 4,000 crore (R7).", p, said, "Sep 2026")
    assert pvd.model_check("partial", "R7 shows 2,160 crores against 3,500 crores in FY27.", p, said, "Sep 2026") is None
    # user's rule, 13 Nov: while FY27 runs the model's hit / miss / partial become pace, never a final verdict
    assert [pvd.before_deadline(v, p, "Sep 2026") for v in ("hit", "miss", "partial")] == ["on track", "behind pace", "behind pace"]
    assert pvd.before_deadline("miss", p, "Mar 2027") == "miss"  # FY27 over: a miss is a miss


def test_running_growth_target_from_a_statement_is_pace():
    # L&T order inflows "10% to 12%" for FY27; Q1 FY27 call reports 14% growth: ahead, not a hit (FY27 is running)
    p = P(metric="order inflows growth", metric_key="other", target_type="growth_pct", target="10% to 12%", target_low=10, target_high=12, horizon="fiscal_year", fy=27, said_in="Mar 2026")
    r = pvd.pace_reported(p, [{"said_in": "Jun 2026", "value": "14%"}], "Sep 2026")
    assert r["verdict"] == "ahead" and "no hit or miss yet" in r["why"]


# ---- segment promises, measured on the segment table of the company's own results filings (13 Nov) ----
from finn.pull import segments


def test_segment_match_by_words_and_acronym_and_unsure_is_none():
    names = ["Wires and Cables", "FMEG", "EPC"]
    assert segments.match("FMEG EBITDA margins", names) == "FMEG"
    assert segments.match("Fast moving electrical goods margin", ["Wires and Cables", "Fast Moving Electrical Goods"]) == "Fast Moving Electrical Goods"
    titan = ["Watches", "Jewellery", "Eyecare", "Others"]
    assert segments.match("watch business margins", titan) == "Watches"
    assert segments.match("Titan Jewellery business margin", titan, {"titan", "company"}) == "Jewellery"
    assert segments.match("CaratLane EBIT margin", titan) is None  # a subsidiary, not a segment
    assert segments.match("watches and jewellery growth", titan) is None  # two segments: unsure


def test_copied_segment_numbers_must_be_on_the_page():
    page = "fmeg 9,931.13 7,611.53 4,521.84 ... (1,229.00)"
    assert segments._on_page(9931.13, page) and segments._on_page(-1229.0, page) and not segments._on_page(9931.31, page)


TITAN_Q = {q: {"page": 14, "basis": "consolidated", "unit": "in crores", "url": "u", "segments": {
    "Watches": {"revenue": r, "revenue_yago": y, "result": res, "result_yago": None}, "Jewellery": {"revenue": 1, "revenue_yago": 1, "result": 0, "result_yago": 0}}}
    for q, (r, y, res) in {"Jun 2026": (1543, 1273, 295), "Sep 2026": (1881, 1477, 412)}.items()}


def test_segment_margin_and_growth_computed_in_python_with_citations():
    m = pvd.segment_series(P(metric="watch business margins", target="15% to 16%", target_type="margin_pct", margin_basis="ebit"), TITAN_Q)
    assert round(m["q"]["Sep 2026"], 1) == 21.9 and round(m["agg"](["Jun 2026", "Sep 2026"]), 1) == round(707 / 3424 * 100, 1)  # revenue-weighted
    assert "p.14" in m["cites"]["Sep 2026"]["label"] and not m["floor_only"]
    g = pvd.segment_series(P(metric="watches revenue growth", target="20%", target_type="growth_pct"), TITAN_Q)
    assert round(g["agg"](["Jun 2026", "Sep 2026"]), 1) == round((3424 / 2750 - 1) * 100, 1)
    assert pvd.segment_series(P(metric="watch volumes", target="10%", target_type="growth_pct"), TITAN_Q) is None  # volumes aren't money


def test_ebitda_segment_target_is_floor_only_and_bands_are_floors():
    m = pvd.segment_series(P(metric="FMEG EBITDA margins", target="8% to 10%", target_type="margin_pct", margin_basis="ebitda"),
                           {"Sep 2026": {"page": 5, "basis": "consolidated", "unit": "₹ million", "url": "u",
                                         "segments": {"FMEG": {"revenue": 9931.13, "revenue_yago": 4521.84, "result": 1006.04, "result_yago": 21.95}}}})
    assert m["floor_only"]
    # above a margin band is ahead, not "moved away" (POLYCAB W&C 14.2% vs 11-13%)
    band = P(metric_key="operating_margin", target_low=11, target_high=13, direction="within")
    assert pvd.judge(14.2, band, complete=False)[0] == "ahead" and pvd.gap(14.2, band) == 0


def test_unmeasurable_reasons_are_labelled():
    seg = lambda since: {"Sep 2026": {"segments": {"Watches": {}, "Jewellery": {}}}}
    usd = P(metric="annual revenue aspiration", target="$2 billion", basis="constant_currency_or_usd", said_in="Dec 2025")
    assert "US-dollar" in pvd.unmeasurable(usd, seg, "Sep 2026")
    assert "volumes" in pvd.unmeasurable(P(metric="sales volume growth", target="over 10%", said_in="Dec 2025"), seg, "Sep 2026")
    assert "latest call" in pvd.unmeasurable(P(metric="watch margins", target="15%", said_in="Sep 2026"), seg, "Sep 2026")
    cl = P(metric="CaratLane EBIT margin", target="double-digit", company_total=False, said_in="Dec 2025")
    assert pvd.unmeasurable(cl, seg, "Sep 2026") == "Not measurable (segment not reported): the results filings report Watches, Jewellery, not this business."
    # ASIANPAINT "mid-single-digit value growth": the decorative business, and the filing has no segments
    vg = P(metric="value growth", target="mid-single-digit value growth", company_total=True, said_in="Sep 2025")
    single = lambda since: {"Sep 2026": {"single": True, "segments": {}}}
    assert pvd.unmeasurable(vg, single, "Sep 2026").startswith("Not measurable (segment not reported)")
    assert pvd.SEGMENT_ONLY.search(vg["target"]) and not pvd.SEGMENT_ONLY.search("revenue growth")
