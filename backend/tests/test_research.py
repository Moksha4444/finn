from finn.pull import pvd, research


def test_checked_drops_points_whose_numbers_are_not_in_their_evidence():
    by_id = {"S1": {"text": "Revenue: 15.8% (Q2 FY27). “revenue grew 15.8% YoY on rural paint demand”", "cite": {"label": "Q2 FY27 call, p.4", "url": "u"}},
             "F1": {"text": "Debt/equity 1.15 at FY26 end (Mar 2026), from 1.52 at FY22 end.", "cite": {"label": "Financial snapshot", "url": "#leverage"}}}
    why = "Rural paint demand is carrying volumes."
    points = [{"claim": "Revenue grew 15.8% YoY in Q2 FY27.", "why": why, "cites": ["S1"]},          # number in evidence; FY27 is a period
              {"claim": "Revenue grew 16% YoY in Q2 FY27.", "why": why, "cites": ["S1"]},            # rounded: not in the evidence
              {"claim": "Debt/equity fell to 1.15 at FY26 end from 1.52.", "why": "Less debt, less refinancing risk.", "cites": ["F1", "X9"]},  # unknown id ignored
              {"claim": "Margins are healthy.", "why": why, "cites": ["X9"]}]                          # no valid citation
    keep, dropped = research.checked(points, by_id)
    assert [k["point"] for k in keep] == ["Revenue grew 15.8% YoY in Q2 FY27.", "Debt/equity fell to 1.15 at FY26 end from 1.52."]
    assert keep[0]["why"] == why and keep[1]["cites"] == [by_id["F1"]["cite"]] and dropped == 2


def test_bull_bear_points_are_arguments_that_respect_the_verdicts():
    by_id = {"P1": {"verdict": "ahead", "text": "Promised on the Q4 FY26 call: order inflows growth: 10% to 12% (FY27). Verdict: ahead. Actual: Q1 FY27 call: 14%",
                    "cite": {"label": "Q4 FY26 call, p.13 (promise)", "url": "u"}},
             "P2": {"verdict": "miss", "text": "Promised on the Q2 FY26 call: revenue growth: 15% (FY26). Verdict: miss. Actual: FY26: +11.8%", "cite": {}},
             "F1": {"text": "EBITDA margin 15.6% in Q2 FY27, −2.0 pp YoY.", "cite": {}},
             "Q1": {"text": "Analyst on the Q2 FY27 call: “Is crude-linked raw material inflation squeezing margins?”", "cite": {}},
             "F2": {"text": "Promised 18–20%; H1 FY27 18.2% and Q2 FY27 15.6%.", "cite": {}}}
    pt = lambda claim, ids, why="Order inflows fund next year's execution.": {"claim": claim, "why": why, "cites": ids}
    keep, dropped = research.checked([
        pt("Order inflows grew 14% in Q1 FY27, beating 10% to 12% guidance.", ["P1"]),     # beaten before FY27 ends: dropped
        pt("Order inflows 14% in Q1 FY27, ahead of the 10% to 12% FY27 target.", ["P1"]),  # pace words: kept
        pt("FY26 revenue growth of 11.8% missed the 15% target.", ["P2"], "Management's growth guidance proved unreliable."),  # a real miss: kept
        pt("EBITDA margin 15.6% in Q2 FY27.", ["F1"], "Margin fell 2.0 pp, so earnings lag revenue."),  # the why restates numbers
        pt("EBITDA margin 15.6% fell 2.0 pp.", ["F1", "Q1"], "Crude-linked raw material inflation."),  # numbers without a period
        pt("EBITDA margin 15.6% in Q2 FY27, down 2.0 pp YoY.", ["F1", "Q1"], "Crude-linked raw material inflation is not passed on."),  # kept
        pt("EBITDA margin 18.2% in Q2 FY27.", ["F2", "Q1"], "Crude-linked raw material inflation."),  # second figure for the same fact: dropped
    ], by_id)
    assert [k["point"][:24] for k in keep] == ["Order inflows 14% in Q1 ", "FY26 revenue growth of 1", "EBITDA margin 15.6% in Q"] and dropped == 4


def row(verdict, metric="revenue growth", said="Sep 2025"):
    return {"verdict": verdict, "metric": metric, "said_in": said, "call": pvd.fy_name(said)}


def test_summary_counts_and_sentence():
    rows = [row("hit"), row("ahead"), row("on track"), row("partial"), row("miss", "Revenue growth"), row("behind pace", "EBITDA margin", "Dec 2025"),
            row("not-yet-measurable")]
    s = research.summary(rows, 4)
    assert {k: s[k] for k in ("kept", "missed", "open", "partial", "measured", "total")} == \
        {"kept": 2, "missed": 2, "open": 1, "partial": 1, "measured": 6, "total": 7}
    assert s["sentence"] == "Kept 2 of 6 measured promises from the last 4 calls; 2 not kept, the latest behind on EBITDA margin (Q3 FY26 call); 1 on track; 1 partly met."
    assert research.summary([row("on track", "Operating Margin"), row("miss", "Operating Margin")], 4)["sentence"] == \
        "Kept 0 of 2 measured promises from the last 4 calls; missed on operating margin (Q2 FY26 call); 1 on track."
    assert research.summary([row("behind pace", "Volume growth")], 4)["sentence"] ==         "Kept 0 of 1 measured promise from the last 4 calls; behind on volume growth (Q2 FY26 call)."
    assert research.summary([], 0)["sentence"] == "No earnings-call transcripts were found to check promises against."
    assert research.summary([row("partial")], 4)["sentence"] == "Kept 0 of 1 measured promise from the last 4 calls; 1 partly met; none missed."
    assert research.summary([row("hit")], 4)["sentence"] == "Kept 1 of 1 measured promise from the last 4 calls; none missed."
    assert research.summary([row("not-yet-measurable")], 3)["sentence"] == "The one promise from the last 3 calls can't be checked yet; the reason is below."
    assert research.summary([], 4)["sentence"] == "No checkable promises found on the last 4 calls."


def table(periods, rows):
    return {"periods": periods, "rows": rows}


def test_snapshot_math_industrial_and_lender():
    qs = ["Sep 2025", "Dec 2025", "Mar 2026", "Jun 2026", "Sep 2026"]
    yrs = ["Mar 2024", "Mar 2025", "Mar 2026", "TTM"]
    co = {"basis": "consolidated", "quarters": table(qs, {
        "Sales": [100, 110, 120, 130, 120], "Net Profit": [10, 11, 12, 13, 15], "Operating Profit": [20, 22, 24, 26, 24],
        "Profit before tax": [14, 15, 16, 17, 18], "Interest": [1, 1, 1, 1, 1], "Depreciation": [5, 5, 5, 5, 5]}),
        "pat_basis": "to owners",
        "annual": {"profit-loss": table(yrs, {"Net Profit": [40, 45, 50, 52]}),
                   "cash-flow": table(yrs[:3], {"Cash from Operating Activity": [44, 45, 61]}),
                   "balance-sheet": table(yrs[:3] + ["Sep 2026"], {"Borrowings": [50, 40, 30, 29], "Equity Capital": [10, 10, 10, 10], "Reserves": [90, 90, 90, 95]})}}
    s = research.snapshot(co)
    assert s["quarters"]["claim"] == "Revenue +20.0% YoY in Q2 FY27; PAT (to owners) +50.0%."
    # operating profit over sales, other income excluded: 24/120 and 20/100 (not PBT + interest + D&A)
    assert s["margin"]["claim"] == "EBITDA margin 20.0% in Q2 FY27, +0.0 pp YoY."
    assert s["cash"]["years"] == ["FY24", "FY25", "FY26"] and s["cash"]["claim"].startswith("Operating cash flow was 1.11× PAT over FY24–FY26 (Apr 2023 – Mar 2026)")
    assert s["leverage"]["values"] == [0.5, 0.4, 0.3]  # year ends only, not the Sep half-year

    co["quarters"]["rows"] = {"Revenue": [80, 85, 90, 95, 100], "Other Income": [20, 20, 20, 25, 20], "Financing Profit": [0] * 5, "Net Profit": [10, 11, 12, 13, 18]}
    s = research.snapshot(co)
    assert s["lender"] and s["quarters"]["revenue_name"] == "Total income" and s["quarters"]["revenue"][-1] == 120
    assert s["margin"]["values"][-1] == 15.0 and "note" in s["cash"] and "note" in s["leverage"]


def test_chart_carries_the_verdict_bounds():
    # growth floor with a band: shaded 10-12, judged as at_least; a cost ceiling keeps only hi
    assert pvd.chart({"metric": "revenue growth", "target": "10% to 12%", "metric_key": "revenue", "target_low": 10, "target_high": 12, "direction": "within", "horizon": "long_term"},
                     "growth", [["Q1 FY27", 11.0]]) == {"kind": "growth", "points": [["Q1 FY27", 11.0]], "lo": 10, "hi": 12, "direction": "at_least", "end": None}
    c = pvd.chart({"metric": "working capital", "target": "around 12%", "metric_key": "other", "target_low": 12, "target_high": None, "direction": "at_most", "horizon": "long_term"},
                  "level", [["Q4 FY26", 4.1]])
    assert (c["lo"], c["hi"], c["direction"]) == (None, 12, "at_most")


def test_dedupe_treats_15_15_as_15():
    base = {"metric_key": "revenue", "fy": 26, "target": "15%"}
    ps = [base | {"said_in": "Dec 2025", "target_low": 15, "target_high": 15}, base | {"said_in": "Sep 2025", "target_low": 15.0, "target_high": None}]
    assert [p["said_in"] for p in pvd.dedupe(ps)] == ["Sep 2025"]  # the oldest mention, longest track record


def test_chart_end_is_the_deadline_quarter():
    p = {"metric": "revenue growth", "target": "15%", "metric_key": "revenue", "target_low": 15, "target_high": None,
         "direction": "at_least", "horizon": "fiscal_year", "fy": 26, "said_in": "Sep 2025"}
    assert pvd.chart(p, "growth", [["Q2 FY26", 10.4]])["end"] == "Q4 FY26"


def test_checked_survives_malformed_model_output():
    keep, dropped = research.checked([{"claim": "x"}, "text", {"cites": ["S1"]}], {"S1": {"text": "", "cite": {}}})
    assert keep == [] and dropped == 3


def test_an_economy_statistic_is_not_a_bull_or_bear_point():
    by_id = {"S1": {"text": "Headline CPI at 4.4% in June 2026"}}
    pt = {"claim": "Headline CPI 4.4% in Q1 FY27", "why": "Input costs rise and squeeze margins", "cites": ["S1"]}
    assert research.problem(pt, ["S1"], by_id) == "an economy statistic, not a fact about the company"


def test_an_unavailable_model_keeps_the_previous_bull_bear(monkeypatch):
    def down(*a, **k):
        raise research.llm.Exhausted("429 daily cap")
    monkeypatch.setattr(research.llm, "run", down)
    prev = {"bull": [{"point": "x", "why": "y", "cites": []}], "bear": [], "model": "openai/gpt-oss-120b"}
    assert research.bull_bear("Co", "Sep 2026", [], "X", prev) is prev
    assert research.bull_bear("Co", "Sep 2026", [], "X") is None


def test_a_second_margin_for_a_quarter_on_the_page_is_dropped(monkeypatch):
    ev = [{"id": "P1", "text": "FMEG EBITDA margins 10.1% (Q2 FY27)", "cite": {}}, {"id": "F2", "text": "EBITDA margin 14.4% in Q2 FY27", "cite": {}}]
    ev[1]["text"] += " [EBITDA margin, wires price hikes]"
    pts = {"bull": [{"claim": "EBITDA margins 10.1% in Q2 FY27", "why": "FMEG pricing holds", "cites": ["P1"]},
                    {"claim": "EBITDA margin 14.4% in Q2 FY27", "why": "Wires price hikes stuck", "cites": ["F2"]}],
           "bear": [{"claim": "EBITDA margin 14.4% in Q2 FY27", "why": "Wires price hikes may reverse", "cites": ["F2"]}]}
    monkeypatch.setattr(research.llm, "run", lambda *a, **k: {"data": {} if k.get("step") == "repair" else pts, "model": "m"})
    out = research.bull_bear("Co", "Sep 2026", ev, "X", snap={"margin": {"periods": ["Sep 2026"], "values": [14.42]}})
    assert [p["point"] for p in out["bull"]] == ["EBITDA margin 14.4% in Q2 FY27"] and out["dropped"] == 1



def test_fact_reads_company_metrics_only_when_the_claim_starts_with_them():
    assert research.fact("EBITDA margin 15.6% in Q2 FY27, down 2.0 pp YoY") == ("margin", "Q2 FY27", 15.6)
    assert research.fact("EBITDA margins 10.1% in Q2 FY27") == ("margin", "Q2 FY27", 10.1)  # a segment's, name dropped: still checked
    assert research.fact("EBITDA INR47,439 million in Q2 FY27, up 4.8% YoY") is None  # growth, not a margin
    assert research.fact("EPC revenues INR 3,077 million declined 11% YoY in Q1 FY27") is None  # a segment
    assert research.fact("PAT margin 10.0% in Q2 FY27") is None
    assert research.fact("Revenue +16.9% YoY in Q2 FY27; PAT (to owners) +7.5%") == ("revenue", "Q2 FY27", 16.9)


def test_checked_drops_one_fact_said_twice():
    ev = {"S1": {"text": "Revenue growth 38.52% YoY in Q2 FY27 on cable exports", "cite": {"label": "Q2 FY27 call, p.3", "url": None}}}
    pts = [{"claim": "Revenue growth YoY +38.5% in Q2 FY27", "why": "Cable exports are scaling.", "cites": ["S1"]},
           {"claim": "Net sales growth 38.52% in Q2 FY27", "why": "Cable exports again.", "cites": ["S1"]}]
    keep, dropped = research.checked(pts, ev)
    assert len(keep) == 1 and dropped == 1


def test_bull_bear_why_names_a_driver_and_sides_respect_verdicts_and_leverage():
    by_id = {"F4": {"text": "Debt/equity 0.06 at FY26 end (Mar 2026), from 0.04 at FY22 end.", "cite": {}},
             "F5": {"text": "Debt/equity 1.95 at FY26 end (Mar 2026), from 1.10 at FY22 end. Gold metal loan borrowings.", "cite": {}},
             "P1": {"verdict": "behind pace", "text": "Promised: volume growth 8-10% (FY27). Verdict: behind pace. Actual: 6.4%, Birla Opus competition", "cite": {}},
             "P2": {"verdict": "on track", "text": "Promised: EBITDA margin 18-20% (FY27). Verdict: on track. Actual: H1 FY27 (Q1–Q2) 18.2%", "cite": {}},
             "Q1": {"text": "Analyst: “Is Birla Opus discounting hurting your dealer network share?”", "cite": {}}}
    p = lambda claim, ids, why: {"claim": claim, "why": why, "cites": ids}
    bear, d = research.checked([
        p("Debt/equity 0.06 at FY26 end.", ["F4"], "Gold metal loan borrowings."),               # low leverage is not a bear point
        p("Debt/equity 1.95 at FY26 end.", ["F5"], "Gold metal loan borrowings fund inventory."),  # kept
        p("Volume growth 6.4% in Q2 FY27, behind the 8-10% FY27 target.", ["P1"], "Supports profitability."),  # generic why
        p("Volume growth 6.4% in Q2 FY27, behind the 8-10% FY27 target.", ["P1", "Q1"], "Birla Opus discounting takes dealer share."),  # kept
        p("EBITDA margin 18.2% in H1 FY27, on track for 18-20%.", ["P2"], "Birla Opus discounting."),  # driver not in the cited evidence
    ], by_id, side="bear")
    assert [x["point"][:14] for x in bear] == ["Debt/equity 1.", "Volume growth "] and d == 3
    bull, d = research.checked([
        p("Volume growth 6.4% in Q2 FY27.", ["P1", "Q1"], "Birla Opus discounting takes dealer share."),  # a behind-pace promise is no bull point
        p("EBITDA margin 18.2% so far in FY27.", ["P2"], "Price hikes held."),                        # part-year without its quarters
        p("EBITDA margin 18.2% in H1 FY27, on track for 18-20%.", ["P2"], "Pricing holds despite a margin squeeze."),  # why names nothing from evidence
        p("Volume growth on track at 6.4% in Q2 FY27.", ["Q1"], "Birla Opus discounting."),             # 'on track' with no such verdict cited
    ], by_id, side="bull")
    assert bull == [] and d == 4


def test_part_year_periods_are_named_by_their_quarters():
    a = "FY27 (Apr 2026 – Mar 2027) so far (Q1–Q2, 2 of 4 quarters): PBDIT margin 18.2% vs target 18–20%"
    assert research.part_year(a) == "H1 FY27 (Q1–Q2): PBDIT margin 18.2% vs target 18–20%"
    assert research.fact("15.6% EBITDA margin in Q2 FY27, −2.0 pp YoY") == ("margin", "Q2 FY27", 15.6)  # numbers-first


def test_rejected_points_get_one_repair_call_and_a_thin_side_says_so(monkeypatch):
    ev = [{"id": "F5", "text": "Debt/equity 1.95 at FY26 end (Mar 2026). Gold metal loan borrowings.", "cite": {}},
          {"id": "S1", "text": "Studded jewellery share 31% in Q2 FY27 on wedding demand", "cite": {}}]
    first = {"bull": [{"claim": "Studded share 35% in Q2 FY27", "why": "Wedding demand.", "cites": ["S1"]}],  # 35 isn't in S1
             "bear": [{"claim": "Debt/equity 1.95 at FY26 end.", "why": "Gold metal loan borrowings fund inventory.", "cites": ["F5"]}]}
    fixed = {"bull": [{"claim": "Studded jewellery share 31% in Q2 FY27", "why": "Wedding demand lifts the studded mix.", "cites": ["S1"]}], "bear": []}
    calls = []
    def run(task, prompt, inputs, schema, **k):
        calls.append(inputs)
        return {"data": fixed if k.get("step") == "repair" else first, "model": "m"}
    monkeypatch.setattr(research.llm, "run", run)
    out = research.bull_bear("Co", "Sep 2026", ev, "X")
    sent = research.json.loads(calls[1][-1])
    assert len(calls) == 2 and sent["need"] == {"bull": 3, "bear": 2} and sent["rejected"][0]["reason"] == "a number not in its cited evidence"
    assert [p["point"] for p in out["bull"]] == ["Studded jewellery share 31% in Q2 FY27"] and len(out["bear"]) == 1
    assert out["note"] == "Only 1 bull point passed the evidence checks. Only 1 bear point passed the evidence checks."
    calls.clear()
    first["bull"] = fixed["bull"]  # nothing rejected: the model just ran out of evidence, so no repair call
    research.bull_bear("Co", "Sep 2026", ev, "X")
    assert len(calls) == 1
