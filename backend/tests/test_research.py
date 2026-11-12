from finn.pull import pvd, research


def test_checked_drops_points_whose_numbers_are_not_in_their_evidence():
    by_id = {"S1": {"text": "Revenue: 15.8% (Q2 FY27). “revenue grew 15.8% YoY”", "cite": {"label": "Q2 FY27 call, p.4", "url": "u"}},
             "F1": {"text": "Debt/equity 1.15 at FY26 end, from 1.52 at FY22 end.", "cite": {"label": "Financial snapshot", "url": "#leverage"}}}
    points = [{"point": "Revenue grew 15.8% YoY in Q2 FY27.", "cites": ["S1"]},          # number in evidence; FY27 is a period, not a claim
              {"point": "Revenue grew 16% YoY.", "cites": ["S1"]},                        # rounded: not in the evidence
              {"point": "Debt/equity fell to 1.15 from 1.52.", "cites": ["F1", "X9"]},   # unknown id ignored, rest checks
              {"point": "Margins are healthy.", "cites": ["X9"]}]                          # no valid citation
    keep, dropped = research.checked(points, by_id)
    assert [k["point"] for k in keep] == ["Revenue grew 15.8% YoY in Q2 FY27.", "Debt/equity fell to 1.15 from 1.52."]
    assert keep[1]["cites"] == [by_id["F1"]["cite"]] and dropped == 2


def row(verdict, metric="revenue growth", said="Sep 2025"):
    return {"verdict": verdict, "metric": metric, "said_in": said, "call": pvd.fy_name(said)}


def test_summary_counts_and_sentence():
    rows = [row("hit"), row("ahead"), row("on track"), row("partial"), row("miss", "Revenue growth"), row("behind pace", "EBITDA margin", "Dec 2025"),
            row("not-yet-measurable")]
    s = research.summary(rows, 4)
    assert {k: s[k] for k in ("kept", "missed", "open", "partial", "measured", "total")} == \
        {"kept": 2, "missed": 2, "open": 1, "partial": 1, "measured": 6, "total": 7}
    assert s["sentence"] == "Kept 2 of 6 measured promises from the last 4 calls; missed 2, the latest on EBITDA margin (Q3 FY26 call)."
    assert research.summary([row("hit")], 4)["sentence"] == "Kept 1 of 1 measured promise from the last 4 calls, none missed."
    assert research.summary([row("not-yet-measurable")], 3)["sentence"].startswith("None of the 1 promises from the last 3 calls")
    assert research.summary([], 4)["sentence"] == "No checkable promises found on the last 4 calls."


def table(periods, rows):
    return {"periods": periods, "rows": rows}


def test_snapshot_math_industrial_and_lender():
    qs = ["Sep 2025", "Dec 2025", "Mar 2026", "Jun 2026", "Sep 2026"]
    yrs = ["Mar 2024", "Mar 2025", "Mar 2026", "TTM"]
    co = {"basis": "consolidated", "quarters": table(qs, {
        "Sales": [100, 110, 120, 130, 120], "Net Profit": [10, 11, 12, 13, 15],
        "Profit before tax": [14, 15, 16, 17, 18], "Interest": [1, 1, 1, 1, 1], "Depreciation": [5, 5, 5, 5, 5]}),
        "annual": {"profit-loss": table(yrs, {"Net Profit": [40, 45, 50, 52]}),
                   "cash-flow": table(yrs[:3], {"Cash from Operating Activity": [44, 45, 61]}),
                   "balance-sheet": table(yrs[:3] + ["Sep 2026"], {"Borrowings": [50, 40, 30, 29], "Equity Capital": [10, 10, 10, 10], "Reserves": [90, 90, 90, 95]})}}
    s = research.snapshot(co)
    assert s["quarters"]["claim"] == "Revenue +20.0% YoY in the Sep 2026 quarter; PAT +50.0%."
    assert s["margin"]["claim"] == "EBITDA margin 20.0% in the Sep 2026 quarter, +0.0 pp YoY."  # (18+1+5)/120 and (14+1+5)/100
    assert s["cash"]["years"] == ["FY24", "FY25", "FY26"] and s["cash"]["claim"].startswith("Operating cash flow was 1.11× PAT over FY24–FY26")
    assert s["leverage"]["values"] == [0.5, 0.4, 0.3]  # year ends only, not the Sep half-year

    co["quarters"]["rows"] = {"Revenue": [80, 85, 90, 95, 100], "Other Income": [20, 20, 20, 25, 20], "Financing Profit": [0] * 5, "Net Profit": [10, 11, 12, 13, 18]}
    s = research.snapshot(co)
    assert s["lender"] and s["quarters"]["revenue_name"] == "Total income" and s["quarters"]["revenue"][-1] == 120
    assert s["margin"]["values"][-1] == 15.0 and "note" in s["cash"] and "note" in s["leverage"]


def test_chart_carries_the_verdict_bounds():
    # growth floor with a band: shaded 10-12, judged as at_least; a cost ceiling keeps only hi
    assert pvd.chart({"metric": "revenue growth", "target": "10% to 12%", "metric_key": "revenue", "target_low": 10, "target_high": 12, "direction": "within"},
                     "growth", [["Q1 FY27", 11.0]]) == {"kind": "growth", "points": [["Q1 FY27", 11.0]], "lo": 10, "hi": 12, "direction": "at_least"}
    c = pvd.chart({"metric": "working capital", "target": "around 12%", "metric_key": "other", "target_low": 12, "target_high": None, "direction": "at_most"},
                  "level", [["Q4 FY26", 4.1]])
    assert (c["lo"], c["hi"], c["direction"]) == (None, 12, "at_most")
