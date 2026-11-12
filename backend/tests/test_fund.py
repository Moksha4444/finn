"""Fund-raise size + dilution: the model copies figures, Python converts and divides. No network."""
import json
from finn.push.cards import fund_facts
from finn import ingest

QIP = "allocated 7,683,981 equity shares ... aggregating to INR 42,646 million ... paid-up capital 158,150,000 Equity Shares"


def test_size_in_crore_and_dilution_from_shares_before():
    f = fund_facts({"instrument": "equity", "size_text": "INR 42,646 million", "size_page": 2,
                    "units_issued": "7,683,981", "shares_before": "158,150,000", "shares_after": None}, QIP)
    assert f["size_cr"] == 4264.6 and f["size_page"] == 2
    assert f["dilution_pct"] == round(7683981 / (158150000 + 7683981) * 100, 2)  # 4.63


def test_debt_has_size_but_no_dilution():
    f = fund_facts({"instrument": "debt", "size_text": "INR 7,816 crore", "units_issued": "7,81,600"}, "INR 7,816 crore 7,81,600")
    assert f["size_cr"] == 7816 and f["dilution_pct"] is None


def test_figures_not_in_the_filing_are_dropped():
    f = fund_facts({"instrument": "equity", "size_text": "INR 9,999 crore", "units_issued": "7,683,981", "shares_after": "1,000"}, QIP)
    assert f["size_cr"] is None and f["dilution_pct"] is None  # 9,999 isn't in the text; 1,000 < issued is nonsense


def test_credibility_counts_measured_promises_only(tmp_path, monkeypatch):
    (tmp_path / "research").mkdir()
    monkeypatch.setattr(ingest, "OUT", tmp_path / "feed.json")
    v = ["hit", "ahead", "miss", "behind pace", "moved away", "on track", "partial", "not-yet-measurable"]
    (tmp_path / "research" / "X.json").write_text(json.dumps({"promises": [{"verdict": x} for x in v]}))
    (tmp_path / "research" / "Y.json").write_text(json.dumps({"promises": [{"verdict": "not-yet-measurable"}]}))
    assert ingest.credibility("X") == {"kept": 2, "missed": 3, "open": 1}
    assert ingest.credibility("Y") is None and ingest.credibility("Z") is None
