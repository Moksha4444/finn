"""Rules on real BSE rows (category | subcategory | subject | headline), copied from the 30-day pull on 12 Nov."""
import pytest
from finn.push.classify import classify

CASES = [  # (CATEGORYNAME, SUBCATNAME, NEWSSUB, HEADLINE) -> (category, tier)
    # HDFCBANK filed Q2 results under Board Meeting, not Result: the keyword rule must still catch it
    (("Board Meeting", "Outcome of Board Meeting", "Board Meeting Outcome for Approval Of Unaudited Standalone And Consolidated Financial Results Of The Bank", ""), ("results", "P1")),
    (("Result", "Financial Results", "Unaudited Financial Results For The Quarter And Half Year Ended 30 September 2026", ""), ("results", "P1")),
    (("Board Meeting", "Board Meeting", "Board Meeting Intimation for Considering The Unaudited Financial Results", ""), ("results", "P3")),
    (("Company Update", "Investor Presentation", "Announcement under Regulation 30 (LODR)-Investor Presentation", ""), ("results", "P2")),
    # headline mentions results, but BSE's subcategory says investor meet: subcategory wins
    (("Company Update", "Analyst / Investor Meet", "Announcement under Regulation 30 (LODR)-Analyst / Investor Meet - Intimation", "post the financial results"), ("investor_meetings", "P3")),
    (("Company Update", "Allotment of Equity Shares", "Announcement under Regulation 30 (LODR)-Allotment", "Outcome of QIP 2026 - Allotment"), ("fund_raise", "P1")),
    (("Company Update", "Allotment of Equity Shares", "Announcement under Regulation 30 (LODR)-Allotment", "Allotment pursuant to Employee Stock Option Scheme"), ("unclassified", "P3")),
    (("Company Update", "General", "Appointment Of Statutory Auditors Pursuant To Mandatory Auditor Rotation", ""), ("unclassified", "P3")),
    (("Company Update", "Retirement", "Announcement under Regulation 30 (LODR)-Retirement", "Retirement of Mr. Noel N Tata as the Chairman"), ("management_change", "P1")),
    (("Company Update", "General", "Newspaper Clippings - Proposed Initial Public Offer Of Jio Platforms Limited", ""), ("fund_raise", "P3")),
    (("Company Update", "General", "Regulation 30 Capacity Addition", ""), ("capex", "P2")),
    ((None, None, "Announcement under Regulation 30 (LODR) - Bagging/receiving of order(s) or contract(s)", ""), ("press_release", "P2")),
    ((None, "Analysts/Institutional Investor Meet/Con. Call Updates", "CDSL has informed the Exchange about Schedule of Analyst Call with J.P. Morgan", None), ("investor_meetings", "P3")),
]


@pytest.mark.parametrize("row,want", CASES)
def test_rules(row, want):
    r = dict(zip(("CATEGORYNAME", "SUBCATNAME", "NEWSSUB", "HEADLINE"), row))
    got = classify(r)
    assert (got["category"], got["tier"], got["by"]) == (*want, "rule")


def test_generic_subject_without_pdf_is_unclassified_not_a_crash():
    r = {"SUBCATNAME": "General", "NEWSSUB": "Disclosure Under Regulation 30 Of SEBI (LODR) Regulations, 2015"}
    assert classify(r) == {"by": "default", "category": "unclassified", "tier": "P3"}
    def boom(): raise FileNotFoundError("attachment gone")
    assert classify(r, boom)["by"] == "default"
