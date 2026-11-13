"""The build gate (user's rule, 13 Nov): one number per metric per company per quarter across the feed, Promised vs
Delivered, the snapshot and bull/bear, on all the committed research pages."""
from finn import consistency
from finn.pull import pvd


def test_committed_pages_agree_with_each_other_and_the_feed():
    assert consistency.run_all() == []


def test_the_check_catches_a_second_number_for_one_fact():
    # ASIANPAINT before the fix: feed card PAT (to owners) +7.5%, research total PAT +6.6%; margin 15.6% vs 18.5%
    page = {"symbol": "X", "latest_quarter": "Sep 2026", "promises": [], "margin_definition": None,
            "snapshot": {"basis": "consolidated", "pat_name": "PAT (to owners)",
                         "quarters": {"periods": ["Sep 2025", "Sep 2026"], "revenue": [8531, 9977], "pat": [993.0, 1085.0], "claim": "Revenue +17.0% YoY in Q2 FY27."},
                         "margin": {"periods": ["Sep 2025", "Sep 2026"], "values": [17.6, 18.51]}},
            "bull_bear": {"bull": [{"point": "EBITDA margin 18.2% in Q2 FY27, inside the band."}], "bear": []}}
    card = {"type": "results", "basis": "consolidated", "periods": ["30.09.2026"], "note": "EBITDA = revenue from operations − (total expenses − finance costs − D&A): ...",
            "lines": [{"name": "Revenue", "value": 9977, "yoy_pct": 17.0}, {"name": "EBITDA", "value": 1557, "yoy_pct": 3.6},
                      {"name": "PAT (to owners)", "value": 1067.63, "yoy_pct": 7.5}]}
    feed = {"items": [{"symbol": "X", "filed": "2026-11-06T16:00", "card": card}]}
    bad = consistency.check(page, feed)
    assert any("PAT (to owners) Sep 2026" in b for b in bad) and any("EBITDA margin Sep 2026" in b for b in bad)
    assert any("bull margin Q2 FY27" in b for b in bad)


def test_card_quarter_reads_the_filing_date_and_header():
    assert pvd.card_quarter("2026-11-11T18:00", "30.09.2026") == "Sep 2026"
    assert pvd.card_quarter("2026-05-20T18:00", "Quarter ended March 31, 2026") == "Mar 2026"
    assert pvd.card_quarter("2026-11-11T18:00", "30.06.2026") is None  # header doesn't match: never override
