"""Map ISO country codes to pricing/policy regions."""

COUNTRY_TO_REGION: dict[str, str] = {
    "DE": "EU", "FR": "EU", "NL": "EU", "BE": "EU",
    "AT": "EU", "IT": "EU", "ES": "EU", "PL": "EU", "UK": "EU",
    "CH": "CH",
    "US": "Americas", "CA": "Americas", "BR": "Americas", "MX": "Americas",
    "SG": "APAC", "AU": "APAC", "IN": "APAC", "JP": "APAC",
    "UAE": "MEA", "ZA": "MEA",
}


def country_to_region(country_code: str) -> str | None:
    return COUNTRY_TO_REGION.get(country_code.upper())
