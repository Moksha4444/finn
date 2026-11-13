"""Portfolio, priority tiers and default alert thresholds. Paths are relative to the repo root."""
import pathlib
from dotenv import load_dotenv

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / "cache"
load_dotenv(ROOT / ".env")

PORTFOLIO = [
    "RELIANCE", "HDFCBANK", "TCS", "BHARTIARTL", "ITC", "LT", "SUNPHARMA", "MARUTI", "BAJFINANCE", "ASIANPAINT",
    "TRENT", "ETERNAL", "DIXON", "PERSISTENT", "POLYCAB", "TATAPOWER", "IRCTC", "CDSL", "KPITTECH", "DEEPAKNTR",
]

TIERS = {
    "P1": ["results", "m_and_a", "management_change", "fund_raise", "litigation", "credit_rating_downgrade", "pledging"],
    "P2": ["internal_restructuring", "earnings_call", "dividend", "bonus_split", "capex", "press_release", "credit_rating"],
    "P3": ["investor_meetings", "postal_ballot", "agm_egm", "insider_trading", "unclassified"],
}

# Defaults only; the user changes them in the app (localStorage).
VOLUME_MULTIPLE = 2.0   # alert when EOD volume >= N x 20-day average
EXCESS_MOVE_PCT = 3.0   # alert when |stock % - Nifty %| >= X

# Sizing (rules, no LLM). Every portfolio name is a large cap, so a flat floor is enough here.
LITIGATION_MIN_CR = 1      # penalties / fines / demands below this -> P3 with a note
DEBT_MIN_CR = 1000         # a non-lender's debt raise below this -> P3; lenders' debt is always routine
