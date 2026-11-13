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
    # MARUTI: its Japanese parent's results are not Maruti's results
    (("Company Update", "General", "Reference To The Financial Results Issued By Suzuki Motor Corporation", "Reference to the Financial Results issued by Suzuki Motor Corporation"), ("press_release", "P2")),
    # 13 Nov: KPIT filed one board-outcome PDF under 5 subcategories; only the results copy is news
    (("Company Update", "Acquisition", "Announcement under Regulation 30 (LODR)-Acquisition", "KPIT Technologies Limited has informed the Exchange that the Board of Directors of the Company approved the proposal to incorporate a wholly owned subsidiary in Vietnam ."), ("unclassified", "P3")),
    (("Company Update", "Scheme of Arrangement", "Announcement under Regulation 30 (LODR)-Scheme of Arrangement", "KPIT Technologies Limited has informed the Exchange that the Board of Directors of the Company approved the Strike-off of Somit Solutions Limited, wholly owned step-down subsidiary of the Company."), ("unclassified", "P3")),
    (("Company Update", "General", "Issue Of Letter Of Comfort In Favor Of KPIT Technologies (UK) Limited", "KPIT Technologies Limited has informed the Exchange about Issue of Letter of Comfort in favor of KPIT Technologies (UK) Limited , a wholly-owned subsidiary of the Company."), ("unclassified", "P3")),
    (("Company Update", "Change in Management", "Announcement under Regulation 30 (LODR)-Change in Management", "KPIT Technologies Limited has informed the Exchange regarding Appointment of Independent Director, Mr. Anant Talaulicar - Chairman of the Board, on the Board of KPIT Technologies Inc., ...."), ("management_change", "P3")),
    (("Company Update", "Acquisition", "Announcement under Regulation 30 (LODR)-Acquisition", "Incorporation of Wholly Owned Subsidiary"), ("unclassified", "P3")),  # MARUTI's foundation
    # guard (synthetic): a real deal done through a new subsidiary stays M&A
    (("Company Update", "Acquisition", "Announcement under Regulation 30 (LODR)-Acquisition", "Acquisition of 100% stake in Alpha GmbH through a newly incorporated wholly owned subsidiary"), ("m_and_a", "P1")),
    # DIXON's copy of the same kind of PDF is a real appointment (Executive Director): stays P1; its title is fixed in headline.py
    (("Company Update", "Change in Management", "Announcement under Regulation 30 (LODR)-Change in Management", "Announcement under Regulation 30 of SEBI LODR- Change in Management"), ("management_change", "P1")),
    (("Company Update", "General", "Second Reminder Notice For Payment Of First And Final Call On Partly Paid-Up Equity Shares Of Bharti Airtel Limited ('Company')", "Second Reminder Notice for payment of First and Final Call on partly paid-up equity shares of Bharti Airtel Limited, on which First and Final Call remains unpaid."), ("fund_raise", "P3")),
    # POLYCAB: an insolvency order filed as a press release is litigation
    (("Company Update", "Press Release / Media Release", "Announcement under Regulation 30 (LODR)-Press Release / Media Release", "Press Release on receipt of Order dated October 09, 2026 passed by the Hon''ble NCLAT"), ("litigation", "P1")),
    (("Company Update", "Press Release / Media Release", "Announcement under Regulation 30 (LODR)-Press Release / Media Release", "Partnered with Quality Council of India for digital food safety audits"), ("press_release", "P2")),
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


# --- sizing (rules only), snippets from real filings in the 12 Nov 30-day pull ---
from finn.push.classify import amounts_cr, size


def test_amount_parser_units():
    assert amounts_cr("imposing penalty of rs 1,60,000") == [pytest.approx(0.016)]
    assert amounts_cr("fines of ₹10,23,060/- levied") == [pytest.approx(0.1023060)]
    assert amounts_cr("aggregating inr 6 billion") == [600]
    assert amounts_cr("issue size rs. 2,069.501 crore") == [pytest.approx(2069.501)]
    assert amounts_cr("inr 15,000 million") == [1500]
    assert amounts_cr("dear sirs, madam") == []  # 'sirs,' is not 'rs'


SIZE_CASES = [  # (category, head, body, lender) -> (tier, note) override, or None = stays P1
    ("litigation", "received notice from department of telecommunications imposing penalty of rs 1,60,000", "", False,
     ("P3", "₹1.6 lakh at stake, below ₹1 cr")),  # BHARTIARTL
    ("litigation", "board comments on fines levied by the exchanges", "fine of ₹10,23,060/- and ₹29,500/-", False,
     ("P3", "₹10.2 lakh at stake, below ₹1 cr")),  # IRCTC
    ("litigation", "order passed by nclat setting aside the order of nclt", "", False, None),  # unsized: not hidden
    ("litigation", "receipt of tax demand order", "demand of rs. 312.4 crore", False, None),
    ("fund_raise", "outcome of qip 2026 - special committee meeting", "", True, None),  # equity, even for a lender
    ("fund_raise", "allotment of secured redeemable non-convertible debentures", "rs. 2,120 crore", True,
     ("P3", "Routine borrowing by a lender")),  # BAJFINANCE
    ("fund_raise", "intimation of the allotment of commercial paper (cps)", "inr 6 billion", False,
     ("P3", "Debt raise ₹600 cr, below ₹1,000 cr")),  # PERSISTENT
    ("fund_raise", "allotment of non-convertible debentures", "inr 15,000 million", False, None),  # PERSISTENT ₹1,500 cr
    ("fund_raise", "allotment of shares", "pursuant to the employee stock option scheme", False, ("P3", "Employee stock allotment")),  # LT
    ("fund_raise", "outcome of pi 2026 - allotment committee",
     "preferential issue of warrants ... after allotment of warrants and their full conversion into equity shares and esops", True, None),  # BAJFINANCE
    ("fund_raise", "allotment", "", False, ("P3", "Allotment, no equity raise or large debt found")),
]


@pytest.mark.parametrize("cat,head,body,lender,want", SIZE_CASES)
def test_sizing(cat, head, body, lender, want):
    assert size(cat, head, body, lender) == want


def test_sizing_applies_inside_classify():
    r = {"SUBCATNAME": "General", "NEWSSUB": "Disclosure Under Regulation 30 Of SEBI (LODR)",
         "HEADLINE": "Received notice from Department of Telecommunications imposing penalty of Rs 1,60,000"}
    assert classify(r) == {"by": "rule", "category": "litigation", "tier": "P3", "note": "₹1.6 lakh at stake, below ₹1 cr"}


# --- 13 Nov P1 rules (user): management change P1 only for a CEO / MD / CFO / Chairman joining or leaving ---
from finn.push.classify import mgmt_tier


@pytest.mark.parametrize("people,want", [
    ([("appointed", "MD & CEO"), ("retired", "MD & CEO")], "P1"),                              # HDFCBANK
    ([("retired", "Chairman and Independent Director")], "P1"),                                # ASIANPAINT: the Chairman leaves
    ([("appointed", "Additional Director and CEO Designate")], "P1"),                          # TATAPOWER
    ([("re-appointed", "Whole-time Director (designated as Executive Director)")], "P2"),      # HDFCBANK re-appointment
    ([("re-appointed", "Independent Director"), ("ceased", "Deputy Managing Director")], "P2"),  # a deputy MD is not the MD
    ([("ceased", "Independent Director")], "P2"),                                              # KPITTECH
    ([("retired", "Senior Vice President, Operations")], "P2"),                                # CDSL
    ([("appointed", "Chairman Emeritus")], "P2"),
])
def test_management_change_tier(people, want):
    assert mgmt_tier({"people": [{"change": c, "role": r} for c, r in people]})[0] == want
    assert mgmt_tier({"people": []}) is None and mgmt_tier(None) is None  # nothing to decide from: stays P1


@pytest.mark.parametrize("row,want", [
    # internal restructurings are P2, not M&A
    (("Company Update", "Business Transfer", "Business Transfer Agreement With Vyoma.AI Limited (Vyoma), Wholly Owned Subsidiary Of The Company", ""), ("internal_restructuring", "P2")),
    (("Company Update", "Restructuring", "Announcement under Regulation 30 (LODR)-Restructuring", "Eternal Limited has informed the exchange regarding proposed restructuring, acquisition and divestment."), ("internal_restructuring", "P2")),
    (("Company Update", "Acquisition", "Announcement under Regulation 30 (LODR)-Updates on Acquisition", "completion of acquisition of BBY Services India LLP."), ("m_and_a", "P1")),
    # DIXON's US$7m guarantee for its subsidiary: housekeeping
    (("Company Update", "Giving Of Guarantees", "Announcement Under Regulation 30 Of SEBI LODR- Giving Of Guarantees Or Indemnity Or Becoming A Surety For Any Third Party",
      "Dixon Technologies provided a guarantee of USD 7 million for its subsidiary Padget Electronics"), ("unclassified", "P3")),
])
def test_internal_restructuring_and_subsidiary_guarantee(row, want):
    got = classify(dict(zip(("CATEGORYNAME", "SUBCATNAME", "NEWSSUB", "HEADLINE"), row)))
    assert (got["category"], got["tier"]) == want
