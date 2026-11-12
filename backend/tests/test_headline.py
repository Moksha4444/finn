"""Headline rules are enforced in Python, not just requested in the prompt."""
from finn.push.headline import problems

SRC = "Allotment of 76,83,981 equity shares at Rs. 5,550 per share aggregating to INR 42,646.09 million under the QIP"


def test_fine_headline_passes():
    assert problems("Allotted 76,83,981 shares via QIP at ₹5,550 each", SRC) == []


def test_number_formats_match_across_indian_and_western_grouping():
    assert problems("Allotted 7,683,981 shares via QIP", SRC) == []


def test_over_12_words_fails():
    p = problems("Allotted 7,683,981 equity shares via QIP at INR 5,550.00 per share aggregating INR 42,646.09 million", SRC)
    assert any("words" in x for x in p)


def test_number_not_in_filing_fails():
    assert problems("Raised ₹7000 crore via QIP", SRC) == ["these numbers are not in the filing: 7000"]
