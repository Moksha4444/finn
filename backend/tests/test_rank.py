import json, pathlib, pytest
from finn.push.rank import rank, reaction_day, price_alerts

CASES = json.loads((pathlib.Path(__file__).parent / "rank_cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_rank_cases(case):  # same table the TS port runs
    assert rank(case["item"], vol_n=2.0, move_x=3.0) == case["want"]


def test_reaction_day_uses_1530_ist_close():
    assert str(reaction_day("2026-11-11T15:29:59")) == "2026-11-11"
    assert str(reaction_day("2026-11-11T18:54:00.123")) == "2026-11-12"  # TATAPOWER CEO filing: pending on 12 Nov morning


def test_price_alerts_only_for_crossing_days():
    days = [{"date": "2026-11-09", "move_pct": 0.5, "excess_pct": 0.1, "vol_ratio": 1.0},
            {"date": "2026-11-11", "move_pct": 2.0, "excess_pct": 1.5, "vol_ratio": 3.2}]
    assert price_alerts("X", days, 2.0, 3.0) == [{"symbol": "X", "date": "2026-11-11", "kind": "price", "text": "3.2× volume"}]
