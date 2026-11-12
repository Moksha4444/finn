"""Human one-line headline (<=12 words) for P1/P2 filings, from the cheap model. Results get theirs in the app
from the card's numbers (Python, never the LLM), so they don't come here.
Checked in Python, not just asked for in the prompt: at most 12 words, and every number must appear in the
filing pages the model read. One retry that names the problem; then None, and the app shows the cleaned subject."""
import re, hashlib
from finn import llm
from finn.sources import pdf

SCHEMA = {"type": "object", "properties": {"headline": {"type": "string"}}, "required": ["headline"]}
MAX_WORDS = 12


def _nums(s: str) -> set[str]:
    # "5,74,25,740" and "57,425,740" are the same number: compare without separators
    return {re.sub(r"[,\s]", "", m).rstrip(".") for m in re.findall(r"\d[\d,]*(?:\.\d+)?", s)}


# A board-outcome PDF lists every decision (results first) and is filed once per decision. The copy filed as a
# management change must not be headlined with the results (13 Nov: Dixon "Reported quarterly revenue ... and appointed").
RESULTS_WORDS = r"\bresults?\b|revenue|profit|ebitda|\bpat\b|earnings"


def problems(headline: str, source_text: str, category: str | None = None) -> list[str]:
    """Why a headline breaks the rules (empty = fine). source_text: the pages the model was given.
    category: what this copy is filed as; for a non-results event, results talk is a problem."""
    out = []
    if category and category not in ("results", "press_release", "earnings_call") and re.search(RESULTS_WORDS, headline, re.I):
        out.append(f"this copy is filed as a {category.replace('_', ' ')}: write only about that decision, leave out the financial results")
    n = len(headline.split())
    if not 0 < n <= MAX_WORDS:
        out.append(f"it has {n} words; use at most {MAX_WORDS}")
    body = re.sub(r"[,\s]", "", source_text)
    missing = sorted(x for x in _nums(headline) if x not in body)
    if missing:
        out.append(f"these numbers are not in the filing: {', '.join(missing)}")
    return out


def title(row: dict, get_pdf, draft: str | None = None, category: str | None = None) -> str | None:
    """draft: a headline already written (the classifier's); it is checked like any other."""
    subject = row.get("NEWSSUB") or ""
    try:
        b = get_pdf()
        doc = pdf.open_pdf(b)
        idx = list(range(min(2, len(doc))))
        source = subject + " " + " ".join(pdf.pages(doc)[i] for i in idx)
        key = hashlib.sha256(b).hexdigest() + subject
        inputs = [subject, pdf.subset(doc, idx)]
        h = " ".join((draft or llm.run("headline", "headline", inputs, SCHEMA, key=key, filing=row.get("NEWSID"))["data"]["headline"]).split())
        if p := problems(h, source, category):
            fix = f"Your headline was: \"{h}\". Rewrite it: {'; '.join(p)}."
            h = " ".join(llm.run("headline", "headline", [*inputs, fix], SCHEMA, key=key + fix, filing=row.get("NEWSID"), retry=1)["data"]["headline"].split())
            if problems(h, source, category):
                return None
        return h
    except Exception:
        return None
