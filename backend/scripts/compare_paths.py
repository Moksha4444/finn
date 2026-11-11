"""Token + accuracy comparison of the 3 ways to send a results filing to the LLM.
Run from backend/: ../.venv/Scripts/python scripts/compare_paths.py   (cached after the first run)"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from tests.test_results import TRUTH, FIX, FIELDS
from finn.push.cards import extract_results
from finn.llm import PRICE

print(f"{'filing':32} {'path':10} {'tok_in':>7} {'tok_out':>7} {'usd':>8}  correct")
for name, truth in TRUTH.items():
    for path in ("text", "pdf_pages", "full_pdf"):
        ex = extract_results((FIX / name).read_bytes(), path=path)
        cols = ex["data"]["columns"][:3]
        want = [(f, i, v) for f, vs in FIELDS(truth).items() for i, v in enumerate(vs)]
        ok = sum(len(cols) > i and cols[i].get(f) is not None and abs(cols[i][f] - v) < 0.01 for f, i, v in want)
        pin, pout = PRICE[ex["model"]]
        usd = (ex["tokens_in"] * pin + ex["tokens_out"] * pout) / 1e6
        print(f"{name:32} {path:10} {ex['tokens_in']:>7} {ex['tokens_out']:>7} {usd:>8.5f}  {ok}/{len(want)}")
