"""Filing -> category + tier. Rules first (BSE category/subcategory + subject keywords); the cheap LLM
sees page 1-2 of the PDF only when no rule matches (generic subjects like "Disclosure under Regulation 30")."""
import re, hashlib
from finn import llm
from finn.config import TIERS
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


def classify(row: dict, get_pdf=None) -> dict:
    """{'category', 'tier', 'by': rule|llm|default, 'headline'?}. get_pdf() -> attachment bytes (may raise).
    LLM errors fall through to 'unclassified' so one bad filing never stops ingest."""
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
    return out | {"category": cat, "tier": tier}
