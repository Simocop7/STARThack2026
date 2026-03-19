"""Tests for the region mapper utility."""

from api.region_mapper import country_to_region


def test_switzerland():
    assert country_to_region("CH") == "CH"


def test_eu_countries():
    for code in ("DE", "FR", "NL", "BE", "AT", "IT", "ES", "PL", "UK"):
        assert country_to_region(code) == "EU"


def test_americas():
    for code in ("US", "CA", "BR", "MX"):
        assert country_to_region(code) == "Americas"


def test_apac():
    for code in ("SG", "AU", "IN", "JP"):
        assert country_to_region(code) == "APAC"


def test_mea():
    for code in ("UAE", "ZA"):
        assert country_to_region(code) == "MEA"


def test_unknown_country():
    assert country_to_region("XX") is None


def test_case_insensitive():
    assert country_to_region("ch") == "CH"
    assert country_to_region("de") == "EU"
