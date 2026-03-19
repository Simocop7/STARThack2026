"""Pydantic models for the Smart Procurement validation module."""

from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Optional

import re

from pydantic import BaseModel, Field, field_validator


def _sanitize_text(v: str) -> str:
    """Strip control chars, collapse excessive newlines, and trim whitespace."""
    # Remove null bytes and non-printable control chars (keep \n, \t)
    v = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", v)
    # Collapse 3+ consecutive newlines into 2
    v = re.sub(r"\n{3,}", "\n\n", v)
    return v.strip()


def _strip_html_tags(v: str) -> str:
    """Remove HTML tags to prevent XSS in reflected content."""
    return re.sub(r"<[^>]+>", "", v).strip()

# --- Enums ---


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class IssueType(str, Enum):
    MISSING_INFO = "missing_info"
    CONTRADICTORY = "contradictory"
    RESTRICTED_SUPPLIER = "restricted_supplier"
    CATEGORY_MISMATCH = "category_mismatch"
    GEOGRAPHY_MISMATCH = "geography_mismatch"
    CAPACITY_EXCEEDED = "capacity_exceeded"
    LEAD_TIME_WARNING = "lead_time_warning"
    POLICY_NOTE = "policy_note"
    CATEGORY_AMBIGUOUS = "category_ambiguous"


# --- Category suggestion from LLM ---


class CategoryAlternative(BaseModel):
    category_l1: str
    category_l2: str
    reason: str


class CategorySuggestion(BaseModel):
    category_l1: str
    category_l2: str
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str = ""
    alternatives: list[CategoryAlternative] = Field(default_factory=list)
    needs_disambiguation: bool = False


# --- Form Input (what the user submits) ---

_SUPPORTED_LANGUAGES = {"en", "fr", "de", "es", "pt", "it", "ja"}


class FormInput(BaseModel):
    request_text: str = Field(..., min_length=1, max_length=10000)
    quantity: Optional[int] = Field(None, ge=1, le=1_000_000)
    unit_of_measure: Optional[str] = Field(None, max_length=100)
    category_l1: Optional[str] = Field(None, max_length=100)
    category_l2: Optional[str] = Field(None, max_length=100)
    delivery_country: Optional[str] = Field(None, max_length=3)
    required_by_date: Optional[date] = None
    preferred_supplier: Optional[str] = Field(None, max_length=200)
    language: str = "en"  # ISO 639-1 code chosen by user

<<<<<<< Updated upstream
    @field_validator("request_text")
    @classmethod
    def sanitize_request_text(cls, v: str) -> str:
        return _sanitize_text(v)

    @field_validator("preferred_supplier")
    @classmethod
    def sanitize_preferred_supplier(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return _strip_html_tags(v) or None

    @field_validator("delivery_country")
    @classmethod
    def validate_delivery_country(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.upper().strip()
        if v not in _VALID_COUNTRY_CODES:
            return None  # Silently discard invalid codes instead of crashing
        return v
=======
    @field_validator("quantity", mode="before")
    @classmethod
    def coerce_quantity(cls, v: object) -> Optional[int]:
        if v is None or v == "":
            return None
        try:
            return int(float(str(v)))
        except (ValueError, TypeError):
            return None

    @field_validator("required_by_date", mode="before")
    @classmethod
    def coerce_date(cls, v: object) -> Optional[date]:
        if v is None or v == "":
            return None
        return v  # pydantic handles valid date strings
>>>>>>> Stashed changes

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        if v not in _SUPPORTED_LANGUAGES:
            return "en"
        return v


# --- Enriched Request (after LLM interpretation) ---


class TextContradiction(BaseModel):
    field: str
    form_value: str
    text_value: str
    explanation: str


_VALID_COUNTRY_CODES = {
    "DE",
    "FR",
    "NL",
    "BE",
    "AT",
    "IT",
    "ES",
    "PL",
    "UK",
    "CH",
    "US",
    "CA",
    "BR",
    "MX",
    "SG",
    "AU",
    "IN",
    "JP",
    "UAE",
    "ZA",
}


class EnrichedRequest(BaseModel):
    # Original form fields (carried through)
    request_text: str
    quantity: Optional[int] = Field(None, ge=1, le=1_000_000)
    unit_of_measure: Optional[str] = None
    category_l1: Optional[str] = None
    category_l2: Optional[str] = None
    delivery_country: Optional[str] = None
    required_by_date: Optional[date] = None
    preferred_supplier: Optional[str] = None

    @field_validator("delivery_country")
    @classmethod
    def validate_country_code(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.upper().strip()
        if v not in _VALID_COUNTRY_CODES:
            raise ValueError(
                f"Invalid delivery country code: '{v}'. Must be one of: {', '.join(sorted(_VALID_COUNTRY_CODES))}"
            )
        return v

    # LLM-enriched fields
    item_description: str = ""
    preferred_supplier_id: Optional[str] = None
    preferred_supplier_name: Optional[str] = None
    data_residency_required: bool = False
    esg_requirement: bool = False
    urgency: str = "normal"  # normal, high, critical

    @field_validator("urgency")
    @classmethod
    def validate_urgency(cls, v: str) -> str:
        if v not in ("normal", "high", "critical"):
            return "normal"
        return v
    additional_specs: str = ""
    detected_language: str = "en"
    text_quantity_mentioned: Optional[int] = None
    text_contradictions: list[TextContradiction] = Field(default_factory=list)
    unit_of_measure_required: bool = False  # LLM decides if unit_of_measure is needed

    # Auto-categorization
    category_suggestion: Optional[CategorySuggestion] = None


# --- Validation ---


class FixAction(BaseModel):
    field: str
    suggested_value: Optional[str] = None
    alternatives: list[str] = Field(default_factory=list)


class ValidationIssue(BaseModel):
    issue_id: str
    severity: Severity
    type: IssueType
    description: str
    proposed_fix: str
    fix_action: Optional[FixAction] = None


class UserMessageIssue(BaseModel):
    title: str
    explanation: str
    proposed_fix: str
    fix_field: Optional[str] = None
    fix_value: Optional[str] = None


class UserMessage(BaseModel):
    summary: str
    issues: list[UserMessageIssue] = Field(default_factory=list)
    corrected_json: Optional[dict] = None
    all_ok_message: str = ""


class ValidationResult(BaseModel):
    is_valid: bool
    issues: list[ValidationIssue] = Field(default_factory=list)
    enriched_request: EnrichedRequest
    corrected_request: Optional[dict] = None
    user_message: Optional[UserMessage] = None
    category_suggestion: Optional[CategorySuggestion] = None
