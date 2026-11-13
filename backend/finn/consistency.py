"""One number per metric per company per quarter, everywhere the app shows it (user's rule, 13 Nov).
Checks the committed data: feed results cards vs the research page's snapshot, PvD rows vs the snapshot, bull/bear
figures vs the snapshot, and the PvD period rules (no hit/miss before a deadline, no chart points past it).
Run from backend/:  ../.venv/Scripts/python -m finn.consistency     (exit 1 on any problem; tests run it too)
"""
import re, sys, json
from finn.pull import pvd
from finn.pull.research import fact, signed

TOL_PCT = 0.05   # percentages: both sides print one decimal, computed from the same figures
TOL_CR = 0.5     # ₹ crore: screener prints whole crore where the filing card doesn't cover a quarter


def _yoy(series: dict[str, float], q: str) -> float | None:
    ago = series.get(pvd.shift(q, -4))
    return None if ago in (None, 0) or q not in series else (series[q] / ago - 1) * 100


def check(r: dict, feed: dict | None) -> list[str]:
    """Problems for one research file (r) against the feed (None = no feed)."""
    out, sym, snap = [], r["symbol"], r.get("snapshot") or {}
    q8 = snap.get("quarters") or {}
    rev = dict(zip(q8.get("periods", []), q8.get("revenue", [])))
    pat = dict(zip(q8.get("periods", []), q8.get("pat", [])))
    m = snap.get("margin") or {}
    margin = dict(zip(m.get("periods", []), m.get("values", [])))
    by_label = {pvd.fy_name(q): q for q in set(rev) | set(margin)}
    say = lambda what, a, b: out.append(f"{sym}: {what}: {a} vs {b}")

    # 1. feed results card vs snapshot, for the quarters the card covers
    cards = [i for i in (feed or {}).get("items", []) if i["symbol"] == sym and (i.get("card") or {}).get("type") == "results"
             and i["card"]["basis"] == snap.get("basis")]  # standalone vs consolidated: two labelled metrics, not one
    if cards:
        c = max(cards, key=lambda i: i["filed"])
        cur = pvd.card_quarter(c["filed"], c["card"]["periods"][0])
        lines = {l["name"]: l for l in c["card"]["lines"]}
        if cur in rev:
            rname = "Total income" if snap.get("lender") else "Revenue"
            if rname in lines and lines[rname]["value"] is not None and abs(lines[rname]["value"] - rev[cur]) > TOL_CR:
                say(f"{rname} {cur} feed vs research", lines[rname]["value"], rev[cur])
            if rname in lines and lines[rname]["yoy_pct"] is not None and (y := _yoy(rev, cur)) is not None and abs(lines[rname]["yoy_pct"] - round(y, 1)) > TOL_PCT:
                say(f"{rname} YoY {cur} feed vs research", lines[rname]["yoy_pct"], round(y, 1))
            pname = snap.get("pat_name", "PAT")
            if pname in lines:
                if lines[pname]["value"] is not None and abs(lines[pname]["value"] - pat[cur]) > TOL_CR:
                    say(f"{pname} {cur} feed vs research", lines[pname]["value"], pat[cur])
                if lines[pname]["yoy_pct"] is not None and (y := _yoy(pat, cur)) is not None and abs(lines[pname]["yoy_pct"] - round(y, 1)) > TOL_PCT:
                    say(f"{pname} YoY {cur} feed vs research", lines[pname]["yoy_pct"], round(y, 1))
            elif not snap.get("lender"):
                say(f"PAT definition {cur}", f"feed shows {[n for n in lines if n.startswith('PAT')]}", f"research shows {pname}")
            e, rv = lines.get("EBITDA", {}).get("value"), lines.get("Revenue", {}).get("value")
            if e is not None and rv and cur in margin and "− other income" in c["card"]["note"] and abs(e / rv * 100 - margin[cur]) > TOL_PCT:
                say(f"EBITDA margin {cur} feed vs research", round(e / rv * 100, 2), margin[cur])

    # 2. snapshot claims vs their own series
    if q8.get("periods"):
        last = q8["periods"][-1]
        if (y := _yoy(rev, last)) is not None and signed(y) not in q8["claim"]:
            say(f"revenue YoY claim {last}", q8["claim"], signed(y))

    # 3. PvD rows: margin and revenue-growth paths vs the snapshot; deadlines
    latest = r.get("latest_quarter")
    same_margin = "operating profit over" in ((r.get("margin_definition") or {}).get("name") or "")
    for p in r.get("promises", []):
        ch = p.get("chart") or {}
        end = ch.get("end")
        for label, v in ch.get("points", []):
            q = by_label.get(label)
            if end and _fq(label) > _fq(end):
                say(f"chart point after the deadline ({p['metric']})", label, end)
            if ch.get("kind") == "margin" and same_margin and q in margin and "segment" not in p["actual"] and abs(v - margin[q]) > TOL_PCT:
                say(f"margin {label} PvD ({p['metric']}) vs snapshot", v, margin[q])
            if ch.get("kind") == "growth" and "Revenue growth YoY" in p["actual"] and q and (y := _yoy(rev, q)) is not None \
                    and not snap.get("lender") and abs(v - y) > TOL_PCT:
                say(f"revenue growth {label} PvD vs snapshot", v, round(y, 2))
        fy = re.match(r"(?:Q[1-4] |H[12] )?FY(\d{2})", p.get("period") or "")
        if fy and latest and p["verdict"] in ("hit", "miss"):
            ends = pvd.period_end({"horizon": "fiscal_year" if p["period"].startswith("FY") else
                                   "half_year" if p["period"].startswith("H") else "quarter", "fy": int(fy.group(1)), "said_in": p["said_in"],
                                   "half_no": int(p["period"][1]) if p["period"].startswith("H") else None,
                                   "quarter_no": int(p["period"][1]) if p["period"].startswith("Q") else None})
            if ends and pvd._q(ends) > pvd._q(latest):
                say(f"'{p['verdict']}' before the deadline ({p['metric']})", p["period"], f"latest results {latest}")

    # 4. bull/bear figures vs the snapshot
    bb = r.get("bull_bear") or {}
    for side in ("bull", "bear"):
        for pt in bb.get(side, []):
            f = fact(pt["point"])
            if not f or not (q := by_label.get(f[1])):
                continue
            fam, _, v = f
            if fam == "margin" and q in margin and abs(v - round(margin[q], 1)) > TOL_PCT \
                    and not re.search(r"segment|standalone|gross", pt["point"], re.I):
                say(f"{side} margin {f[1]}", pt["point"], f"{margin[q]:.1f}%")
            if fam in ("revenue", "pat") and "YoY" in pt["point"]:
                y = _yoy(rev if fam == "revenue" else pat, q)
                if y is not None and abs(abs(v) - abs(round(y, 1))) > TOL_PCT:
                    say(f"{side} {fam} YoY {f[1]}", pt["point"], f"{y:+.1f}%")
    return out


def _fq(label: str) -> tuple[int, int]:
    """'Q2 FY27' -> (27, 2)."""
    m = re.match(r"Q([1-4]) FY(\d{2})", label)
    return int(m.group(2)), int(m.group(1))


def run_all() -> list[str]:
    feed = json.loads(pvd.FEED.read_text(encoding="utf-8")) if pvd.FEED.exists() else None
    out = []
    for f in sorted(pvd.OUT.glob("*.json")):
        if f.stem != "index":
            out += check(json.loads(f.read_text(encoding="utf-8")), feed)
    return out


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    bad = run_all()
    for b in bad:
        print("INCONSISTENT", b)
    print(f"{len(bad)} problems across the research pages and the feed")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
