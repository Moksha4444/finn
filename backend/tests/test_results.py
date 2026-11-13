"""Results pipeline on 3 real filings: TCS (clean text), HDFCBANK (scanned bank), BAJFINANCE (scanned NBFC).
Ground truth below was read by hand off the PDFs (current Q, previous Q, year-ago Q; ₹ crore, consolidated)."""
import os, pathlib, pytest
from finn.sources import pdf
from finn.push.cards import extract_results, results_card

FIX = pathlib.Path(__file__).parent / "fixtures"
TRUTH = {
    "TCS_results.pdf": dict(page=8, bank=False,
        revenue_from_operations=[73188, 72275, 65799], finance_costs=[252, 273, 229],
        depreciation_amortisation=[1262, 1239, 1413], exceptional_items=[0, 668, 1135],
        profit_before_exceptional_and_tax=[18638, 18612, 17203],
        profit_before_tax=[18638, 17944, 16068], profit_after_tax=[13934, 13420, 12131],
        profit_attributable_to_owners=[13884, 13349, 12075]),
    "HDFCBANK_results.pdf": dict(page=9, bank=True,
        interest_earned=[95131.63, 90575.33, 86993.84], interest_expended=[50667.43, 47625.63, 46740.86],
        total_income=[129358.69, 133110.36, 118560.63],
        profit_before_tax=[28662.54, 27193.16, 26658.89], profit_after_tax=[21537.09, 20382.69, 20363.77],
        profit_attributable_to_owners=[20700.03, 19244.71, 19610.67]),
    "BAJFINANCE_results_p4_p14.pdf": dict(page=2, bank=True,
        interest_earned=[21936.39, 20512.73, 17795.97], interest_expended=[8601.73, 7942.09, 7010.60],
        total_income=[24575.82, 23166.42, 19992.38], profit_before_exceptional_and_tax=[8537.20, 8149.00, 6608.13],
        profit_before_tax=[8537.20, 8149.00, 6608.13], profit_after_tax=[6366.57, 6080.60, 4947.76],
        profit_attributable_to_owners=[6266.20, 5985.75, 4875.36]),
}
FIELDS = lambda t: {k: v for k, v in t.items() if isinstance(v, list)}


@pytest.mark.parametrize("name", TRUTH)
def test_finds_consolidated_pnl_page(name):
    idx, basis = pdf.find_results_pages(pdf.pages(pdf.open_pdf((FIX / name).read_bytes())))
    assert (idx[0] + 1, basis) == (TRUTH[name]["page"], "consolidated")


def _fake(name, unit="₹ crore"):
    t = TRUTH[name]
    cols = [{"period_label": f"col{i}", **{k: v[i] for k, v in FIELDS(t).items()}} for i in range(3)]
    return {"data": {"basis": "consolidated", "unit": unit, "is_bank_or_nbfc": t["bank"], "columns": cols}, "pages": [t["page"]]}


def test_card_math_nonbank_ebitda_and_one_offs():
    c = results_card(_fake("TCS_results.pdf"))
    lines = {l["name"]: l for l in c["lines"]}
    assert lines["EBITDA"]["value"] == 18638 + 252 + 1262
    assert lines["PBT"]["qoq_pct"] == round((18638 - 17944) / 17944 * 100, 1)
    assert lines["Revenue"]["yoy_pct"] == 11.2
    assert c["one_offs"] == ["Previous quarter includes ₹668 cr one-off charge", "Year-ago quarter includes ₹1,135 cr one-off charge"]
    assert lines["EBITDA"]["qoq_pct"] == round((20152 - (18612 + 273 + 1239)) / (18612 + 273 + 1239) * 100, 1)  # Q1 legal charge excluded


def test_ebitda_excludes_exceptional_gain():
    # TATAPOWER Q2 FY27 (spot-checked 12 Nov): ₹119.18 cr net exceptional gain inside PBT
    cols = [dict(period_label=p, revenue_from_operations=r, finance_costs=f, depreciation_amortisation=da, exceptional_items=e,
                 profit_before_exceptional_and_tax=pbe, profit_before_tax=pbt, profit_after_tax=pat, profit_attributable_to_owners=o)
            for p, r, f, da, e, pbe, pbt, pat, o in [
                ("30-Sep-26", 19635.94, 1384.93, 1286.55, 119.18, 2060.67, 2179.85, 1652.04, 1366.11),
                ("30-Jun-26", 19051.26, 1406.78, 1259.86, 0, 1823.34, 1823.34, 1400.86, 1175.93),
                ("30-Sep-25", 15544.91, 1318.65, 1162.05, 0, 1679.90, 1679.90, 1245.39, 919.44)]]
    c = results_card({"data": {"basis": "consolidated", "unit": "₹ crore", "is_bank_or_nbfc": False, "columns": cols}, "pages": [8]})
    lines = {l["name"]: l for l in c["lines"]}
    assert lines["EBITDA"]["value"] == round(2060.67 + 1384.93 + 1286.55, 2)  # 4732.15, not 4851.33
    assert c["one_offs"] == ["This quarter includes ₹119 cr one-off gain"]


def test_no_pre_exceptional_line_falls_back_to_pbt_and_says_so():
    ex = _fake("TCS_results.pdf")
    for col in ex["data"]["columns"]:
        col["profit_before_exceptional_and_tax"] = None
    c = results_card(ex)
    assert "PBT (no pre-exceptional line)" in c["note"]
    assert c["one_offs"] == ["Previous quarter includes ₹668 cr one-off", "Year-ago quarter includes ₹1,135 cr one-off"]


def test_card_math_bank_nii():
    lines = {l["name"]: l for l in results_card(_fake("HDFCBANK_results.pdf"))["lines"]}
    assert list(lines) == ["NII", "Total income", "PBT", "PAT (to owners)"]
    assert lines["PAT (to owners)"]["value"] == 20700.03
    assert lines["NII"]["value"] == round(95131.63 - 50667.43, 2)


def test_card_converts_lakh_to_crore():
    lines = {l["name"]: l for l in results_card(_fake("TCS_results.pdf", unit="₹ in lakhs"))["lines"]}
    assert lines["PAT (to owners)"]["value"] == 138.84


def test_card_falls_back_to_total_pat_when_owners_line_missing():
    ex = _fake("TCS_results.pdf")
    ex["data"]["columns"][2]["profit_attributable_to_owners"] = None  # one column lacks it -> total PAT for all 3
    lines = {l["name"]: l for l in results_card(ex)["lines"]}
    assert "PAT (to owners)" not in lines and lines["PAT"]["value"] == 13934



@pytest.mark.skipif(not os.getenv("GEMINI_API_KEY"), reason="live LLM test needs GEMINI_API_KEY (cached after first run)")
@pytest.mark.parametrize("name", TRUTH)
def test_live_extraction_matches_filing(name):
    ex = extract_results((FIX / name).read_bytes())
    assert extract_results((FIX / name).read_bytes())["cached"]  # cache key must be stable across calls
    assert ex["path"] == "pdf_pages"
    assert ex["data"]["basis"] == "consolidated"
    for field, want in FIELDS(TRUTH[name]).items():
        got = [c.get(field) for c in ex["data"]["columns"][:3]]
        if field == "exceptional_items":  # sign varies (charge printed as +/-); the card uses abs()
            got, want = [abs(x) for x in got], [abs(x) for x in want]
        assert got == pytest.approx(want), field


def test_card_rejects_padded_columns():
    # BHARTIARTL 12 Nov: a 2-column summary page; model padded a 3rd column and YoY showed as QoQ
    ex = _fake("TCS_results.pdf")
    ex["data"]["columns"][2]["profit_before_tax"] = None
    with pytest.raises(ValueError):
        results_card(ex)


def test_prefers_sebi_statement_over_clean_summary_page():
    # BHARTIARTL: p.1 = OCR-garbled SEBI statement (3 quarters), p.2 = clean 2-column investor-report summary
    idx, basis = pdf.find_results_pages(pdf.pages(pdf.open_pdf((FIX / "BHARTIARTL_statement_p2_summary_p33.pdf").read_bytes())))
    assert idx[0] == 0 and basis == "consolidated"


def test_ebitda_excludes_other_income_and_keeps_all_three_columns():
    # ASIANPAINT Q2 FY27: PBDIT as the company reports it excludes other income (15.6% margin, not 18.5%)
    ex = _fake("TCS_results.pdf")
    for col, oi in zip(ex["data"]["columns"], [1000, 900, 800]):
        col["other_income"] = oi
    c = results_card(ex)
    lines = {l["name"]: l for l in c["lines"]}
    assert lines["EBITDA"]["value"] == 18638 + 252 + 1262 - 1000 and "− other income; associates' share not excluded" in c["note"]
    assert lines["Revenue"]["values"] == [73188, 72275, 65799]
    ex["data"]["columns"][1]["other_income"] = None  # one column lacks it: none excluded, and the note says so
    assert "other income not printed" in results_card(ex)["note"]


def test_ebitda_bottom_up_keeps_other_income_associates_and_one_offs_out():
    # ASIANPAINT Q2 FY27 shape: revenue 9,976.51, total expenses 8,786.4 incl. finance 55 and D&A 314 -> EBITDA 1,559.11
    ex = _fake("TCS_results.pdf")
    for col, te in zip(ex["data"]["columns"], [8786.40, 8700.0, 7400.0]):
        col.update(revenue_from_operations=9976.51 if te == 8786.40 else col["revenue_from_operations"], total_expenses=te, finance_costs=55, depreciation_amortisation=314)
    c = results_card(ex)
    assert {l["name"]: l for l in c["lines"]}["EBITDA"]["value"] == round(9976.51 - (8786.40 - 55 - 314), 2)
    assert c["note"].startswith("EBITDA = revenue from operations − (total expenses")


def test_revenue_is_net_of_excise_when_the_filing_prints_it():
    # ITC since Feb 2026: excise on cigarettes inside revenue from operations
    ex = _fake("TCS_results.pdf")
    for col, e in zip(ex["data"]["columns"], [10000, 9000, 1000]):
        col["excise_duty"] = e
    c = results_card(ex)
    assert {l["name"]: l for l in c["lines"]}["Revenue"]["value"] == 73188 - 10000 and c["note"].startswith("Revenue net of excise duty")


def test_total_expenses_printed_before_finance_costs_and_dna():
    # BHARTIARTL Q2 FY27 (₹ million): "Total expenses" 259,316 excludes finance costs and D&A; EBITDA 349,459, not 552,703
    cols = [dict(period_label=p, revenue_from_operations=r, other_income=oi, total_expenses=te, finance_costs=f, depreciation_amortisation=da,
                 profit_before_exceptional_and_tax=pbe, profit_before_tax=pbt, profit_after_tax=pat, profit_attributable_to_owners=o)
            for p, r, oi, te, f, da, pbe, pbt, pat, o in [
                ("Sep 26", 608775, 8769, 259316, 57073, 146171, 156012, 154280, 107104, 88875),
                ("Jun 26", 585391, 9066, 252363, 59564, 142350, 141262, 137728, 100116, 81674),
                ("Sep 25", 521454, 7277, 225840, 48657, 131821, 123223, 123223, 86508, 67917)]]
    c = results_card({"data": {"basis": "consolidated", "unit": "₹ million", "is_bank_or_nbfc": False, "columns": cols}, "pages": [2]})
    assert {l["name"]: l for l in c["lines"]}["EBITDA"]["values"][0] == round((608775 - 259316) * 0.1, 2)


def test_columns_are_put_in_order_by_their_dates():
    from finn.push.cards import _in_order, _month_end
    assert _month_end("3 Months ended 30.09.2026") == (2026, 9) and _month_end("30 Sep 26") == (2026, 9)
    assert _month_end("Quarter ended September 30, 2025") == (2025, 9) and _month_end("Q2") is None
    # ITC prints this quarter, year-ago, previous
    cols = [{"period_label": l} for l in ["30.09.2026", "30.09.2025", "30.06.2026"]]
    assert [c["period_label"] for c in _in_order(cols)] == ["30.09.2026", "30.06.2026", "30.09.2025"]
    # Q4 wraps the year: Mar 2026, Dec 2025, Mar 2025
    cols = [{"period_label": l} for l in ["31.03.2026", "31.12.2025", "31.03.2025"]]
    assert _in_order(cols) == cols
    with pytest.raises(ValueError):  # POLYCAB: two year-ago columns, no previous quarter
        _in_order([{"period_label": l} for l in ["30 Sep 26", "30 Sep 25", "30 Sep 25 (Restated)"]])


def test_pat_is_owners_when_the_filing_has_no_non_controlling_interests():
    ex = _fake("TCS_results.pdf")
    for c in ex["data"]["columns"]:
        c["profit_attributable_to_owners"] = None
    assert "PAT" in {l["name"] for l in results_card(ex)["lines"]}
    assert "PAT (to owners)" in {l["name"] for l in results_card(ex | {"no_nci": True})["lines"]}


def test_the_owners_split_on_the_next_page_is_sent_too():
    t = ["cover", "statement of consolidated results for the quarter revenue from operations total expenses profit before tax tax expense profit for the period consolidated",
         "profit for the period attributable to owners of the company non-controlling interests"]
    assert pdf.find_results_pages(t)[0] == [1, 2]

