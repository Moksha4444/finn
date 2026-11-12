"""Mgmt-change card on 3 real filings. Ground truth read by hand off the PDFs."""
import os, pathlib, pytest
from finn.push.cards import mgmt_card

FIX = pathlib.Path(__file__).parent / "fixtures"
live = pytest.mark.skipif(not os.getenv("GEMINI_API_KEY"), reason="live LLM test (cached after first run)")


@live
def test_profile_missing_from_filing_is_said_not_invented():
    # HDFCBANK: new MD & CEO; the filing points to the 1 Oct intimation for his profile
    p = mgmt_card((FIX / "HDFCBANK_mgmt.pdf").read_bytes())["people"]
    assert [(x["name"], x["change"]) for x in p][0] == ("Anup Bagchi", "appointed")
    assert p[0]["bio"].startswith("Profile not in this filing") and "October 1, 2026" in p[0]["bio"]
    assert {x["name"] for x in p} == {"Anup Bagchi", "Sashidhar Jagdishan"}


@live
def test_profiles_cited_to_their_page():
    # TRENT: Noel Tata retires; Vakil (no profile), Dube and Merchant (profiles on p.4) come in
    p = {x["name"].replace("Mr. ", "").replace("Ms. ", ""): x for x in mgmt_card((FIX / "TRENT_mgmt.pdf").read_bytes())["people"]}
    assert p["Noel N. Tata"]["change"] == "retired"
    assert p["Rajiv Dube"]["bio_page"] == 4 and "Aditya Birla" in p["Rajiv Dube"]["bio"]
    assert p["Kalpana Merchant"]["bio_page"] == 4 and "45 years" in p["Kalpana Merchant"]["bio"]
    assert p["Bahram Vakil"]["bio"] == "Profile not in this filing"


@live
def test_one_entry_per_person():
    p = mgmt_card((FIX / "TATAPOWER_mgmt.pdf").read_bytes())["people"]
    assert len(p) == 1 and p[0]["name"].endswith("Sanjay Banga") and p[0]["bio_page"] == 2
    assert "Renewable" in p[0]["bio"]
    # CEO Designate from 11 Nov 2026, CEO & MD only from 1 May 2027: each role keeps its own date
    assert "Designate" in p[0]["role"] and "2027" in p[0]["role"] and p[0]["effective"] == "2026-11-11"
