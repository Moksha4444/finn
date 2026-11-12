"""Human one-line headline (<=12 words) for P1/P2 filings, from the cheap model. Results get theirs in the app
from the card's numbers (Python, never the LLM), so they don't come here. Any failure -> None: the app shows the raw subject."""
import hashlib
from finn import llm
from finn.sources import pdf

SCHEMA = {"type": "object", "properties": {"headline": {"type": "string"}}, "required": ["headline"]}


def title(row: dict, get_pdf) -> str | None:
    subject = row.get("NEWSSUB") or ""
    try:
        b = get_pdf()
        doc = pdf.open_pdf(b)
        r = llm.run("headline", "headline", [subject, pdf.subset(doc, list(range(min(2, len(doc)))))], SCHEMA,
                    key=hashlib.sha256(b).hexdigest() + subject, filing=row.get("NEWSID"))
        h = " ".join(r["data"]["headline"].split())
        return h if 0 < len(h.split()) <= 16 else None  # small slack over 12; anything longer is a bad answer
    except Exception:
        return None
