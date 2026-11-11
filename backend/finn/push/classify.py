"""Filing -> category + tier. Rules first (BSE category/subcategory + subject keywords); the cheap LLM
sees page 1-2 of the PDF only when no rule matches (generic subjects like "Disclosure under Regulation 30")."""
import re, hashlib
from finn import llm
from finn.config import TIERS, LITIGATION_MIN_CR, DEBT_MIN_CR
from finn.sources import pdf

TIER_OF = {c: t for t, cs in TIERS.items() for c in cs}

# First match wins, so order matters: routine paperwork before management_change ("appointment of
# statutory auditors"), management_change before results, earnings_call before investor_meetings.
RULES = [
    ("unclassified", r"statutory auditor|secretarial audit|reg\. 74 ?\(5\)|esop|esps|stock option|iepf|investor education"
                     r"|registrar and share transfer|\brta\b|trading window|duplicate share|loss of share|compliance certificate"
                     r"|esg rating|monitoring agency|statement of deviation|half yearly report|strike off|reg(ulation)? 30 ?\(5\)"),
    ("management_change", r"change in management|change in directorate|cessation|retirement|resignation|re-?appointment"
                          r"|appointment of (mr|ms|shri|smt|dr)|(managing director|chief executive|\bceo\b|\bcfo\b|key managerial)"),
    ("results", r"financial results|financial statements|results presentation|shareholders'? letter|investor presentation"
                r"|earnings presentation|analyst presentation|presentation for the (quarter|year)|quarterly report w\.r\.t"),
    ("earnings_call", r"earnings?( conference)? call|concall|con\. call|call transcript|audio recording|video recording|investor call"
                      r"|schedule of conference call"),
    ("investor_meetings", r"analyst|investor(s|\(s\))? meet|investor conference|institutional investor|road ?show"),
    ("pledging", r"pledge|encumbrance|reg\. 31"),
    ("insider_trading", r"insider trading|\bsast\b|substantial acquisition|reg\. 29|regulation 7 ?\(2\)"),
    ("litigation", r"litigation|penalt|fines? levied|show cause|insolvency|\bcirp\b|nclt|tribunal|arbitration|court|tax demand|demand order"),
    ("fund_raise", r"\bqip\b|qualified institution|rights issue|preferential|warrant|buy-?back|commercial paper|\bncds?\b"
                   r"|non-convertible|debenture|issue of securities|allotment of (equity )?shares|initial public offer|\bipo\b"
                   r"|red herring|call on partly paid"),
    ("m_and_a", r"acquisition|acquire|merger|amalgamation|demerger|joint venture|scheme of arrangement|share purchase"
                r"|business transfer|disinvestment|divest|stake sale|sale of (entire )?stake|restructuring"),
    ("credit_rating_downgrade", r"rating.*downgrad|downgrad.*rating"),
    ("credit_rating", r"credit rating|\brating"),
    ("dividend", r"dividend|record date"),
    ("bonus_split", r"bonus|split|sub-?division"),
    ("capex", r"capex|capacity addition|capacity expansion|new (plant|facility)|commission(ed|ing)|greenfield|brownfield"),
    ("postal_ballot", r"postal ballot"),
    ("agm_egm", r"\bagm\b|\begm\b|general meeting"),
    ("press_release", r"press release|media release|media statement|bagging|order\(s\)|award of order|receipt of order"
                      r"|clarification|rumour|production volume|sales volume|launch"),
]
# Notices and copies of something filed elsewhere: shown, but never ranked as the news itself.
ROUTINE = r"board meeting intimation|prior intimation|newspaper|clipping|audio recording|video recording|schedule of"
# Results decks / media releases accompany the results filing; the filing itself stays P1.
SUPPORTING = r"presentation|press release|media|shareholders'? letter|quarterly report|analyst|investor meet"
CATEGORIES = sorted({c for c, _ in RULES} | set(TIER_OF))
SCHEMA = {"type": "object", "properties": {
    "category": {"type": "string", "enum": CATEGORIES},
    "headline": {"type": "string"}}, "required": ["category", "headline"]}


EQUITY = r"\bqip\b|qualified institution|rights issue|rights entitlement|preferential|warrant|buy-?back|initial public offer|\bipo\b|red herring|call on partly paid"
DEBT = r"\bncds?\b|non-convertible|debenture|commercial paper|\bcps?\b|\bbonds?\b"
ESOP = r"esop|esos|esps|employee stock|stock option"
AMT = re.compile(r"(?:\brs\b\.?|\binr\b|₹)\s*(\d[\d,]*(?:\.\d+)?)\s*(?:/-)?\s*(crores?|cr\b|lakhs?|lacs?|millions?|mn\b|billions?|bn\b)?", re.I)
UNIT_CR = {"cr": 1, "lak": 0.01, "lac": 0.01, "mil": 0.1, "mn": 0.1, "bil": 100, "bn": 100}


def amounts_cr(text: str) -> list[float]:
    """Every rupee amount in the text, in ₹ crore ("Rs 1,60,000" -> 0.016, "INR 6 billion" -> 600)."""
    out = []
    for m in AMT.finditer(text):
        v, unit = float(m.group(1).replace(",", "")), (m.group(2) or "").lower()
        out.append(v * next((k for u, k in UNIT_CR.items() if unit.startswith(u)), 1e-7))
    return out


def inr(cr: float) -> str:
    return f"₹{cr:,.0f} cr" if cr >= 1 else f"₹{cr * 100:,.1f} lakh"


def _fund(t: str, amounts: list[float], lender: bool) -> tuple[str, str | None] | None:
    """(tier, note) from one text, or None if this text doesn't say what kind of raise it is."""
    if re.search(EQUITY, t):  # before ESOP: a preferential-issue letter mentions ESOPs in its shareholding table
        return "P1", None
    if re.search(ESOP, t):
        return "P3", "Employee stock allotment"
    if re.search(DEBT, t):
        if lender:
            return "P3", "Routine borrowing by a lender"
        a = max(amounts, default=None)  # max = tranche or its authorised limit; errs towards P1
        if a is not None and a >= DEBT_MIN_CR:
            return "P1", None
        return "P3", f"Debt raise {inr(a)}, below {inr(DEBT_MIN_CR)}" if a else "Debt raise, amount not stated"
    return None


def size(cat: str, head: str, body: str, lender: bool) -> tuple[str, str | None] | None:
    """Rules-only sizing for P1 litigation / fund-raise. head = subject + headline, body = PDF pages 1-2 text.
    Returns (tier, note) to override, or None to keep P1."""
    amounts = amounts_cr(head + " " + body)
    if cat == "litigation":
        a = max(amounts, default=None)  # no amount found: stays P1, unsized litigation is not hidden
        return ("P3", f"{inr(a)} at stake, below {inr(LITIGATION_MIN_CR)}") if a is not None and a < LITIGATION_MIN_CR else None
    if cat == "fund_raise":  # the subject decides first; the PDF only if the subject is generic ("Allotment")
        r = _fund(head, amounts, lender) or _fund(body, amounts, lender)
        return None if r == ("P1", None) else (r or ("P3", "Allotment, no equity raise or large debt found"))
    return None


def text_of(row: dict) -> str:
    return " | ".join(str(row.get(k) or "") for k in ("CATEGORYNAME", "SUBCATNAME", "NEWSSUB", "HEADLINE")).lower()


def _match(t: str) -> str | None:
    return next((c for c, rx in RULES if re.search(rx, t)), None)


def by_rules(row: dict) -> str | None:
    """BSE subcategory first (headlines often mention "financial results" on unrelated filings), then subject + headline."""
    t = text_of(row)
    sub = [c for c, rx in RULES if re.search(rx, (row.get("SUBCATNAME") or "").lower())]
    if len(sub) == 1:
        cat = sub[0]
    else:  # no or ambiguous subcategory (NSE's "Investor Meet/Con. Call Updates"): decide on subject + headline
        cat = _match(" | ".join(str(row.get(k) or "") for k in ("NEWSSUB", "HEADLINE")).lower()) or (sub or [None])[0]
    if cat == "fund_raise" and re.search(r"esop|esos|stock option|employee", t):
        cat = "unclassified"  # ESOP allotments are filed as "Allotment of Equity Shares"
    return cat


def classify(row: dict, get_pdf=None, lender: bool = False) -> dict:
    """{'category', 'tier', 'by': rule|llm|default, 'headline'?, 'note'?}. get_pdf() -> attachment bytes (may raise).
    lender: bank/NBFC (their debt raises are routine). LLM errors fall through to 'unclassified'."""
    cat = by_rules(row)
    out = {"by": "rule" if cat else "default"}
    if cat is None and get_pdf:
        try:
            b = get_pdf()
            doc = pdf.open_pdf(b)
            subject = row.get("NEWSSUB") or ""
            r = llm.run("classify", "classify", [subject, pdf.subset(doc, list(range(min(2, len(doc)))))], SCHEMA,
                        key=hashlib.sha256(b).hexdigest() + subject, filing=row.get("NEWSID"))
            cat, out = r["data"]["category"], {"by": "llm", "headline": r["data"]["headline"]}
        except Exception as e:
            out = {"by": "default", "error": f"{type(e).__name__}: {e}"[:200]}
    cat = cat or "unclassified"
    tier = TIER_OF.get(cat, "P3")
    if re.search(ROUTINE, text_of(row)):
        tier = "P3"
    elif cat == "results" and re.search(SUPPORTING, text_of(row)):
        tier = "P2"
    if tier == "P1" and cat in ("litigation", "fund_raise"):
        head = " | ".join(str(row.get(k) or "") for k in ("NEWSSUB", "HEADLINE")).lower()
        try:
            body = " ".join(pdf.pages(pdf.open_pdf(get_pdf()))[:2]).lower() if get_pdf else ""
        except Exception:
            body = ""  # no PDF: size on the subject alone
        if s := size(cat, head, " ".join(body.split()), lender):
            tier, out["note"] = s
    return out | {"category": cat, "tier": tier}
