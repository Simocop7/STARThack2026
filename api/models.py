"""Pydantic models for the Smart Procurement validation module."""

from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


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

class FormInput(BaseModel):
    request_text: str = Field(..., min_length=1, max_length=10000)
    quantity: Optional[int] = None
    unit_of_measure: Optional[str] = None
    category_l1: Optional[str] = None
    category_l2: Optional[str] = None
    delivery_address: Optional[str] = None
    required_by_date: Optional[date] = None
    preferred_supplier: Optional[str] = None  # free text or name
    language: str = "en"  # ISO 639-1 code chosen by user


# --- Enriched Request (after LLM interpretation) ---

class TextContradiction(BaseModel):
    field: str
    form_value: str
    text_value: str
    explanation: str


class EnrichedRequest(BaseModel):
    # Original form fields (carried through)
    request_text: str
    quantity: Optional[int] = None
    unit_of_measure: Optional[str] = None
    category_l1: Optional[str] = None
    category_l2: Optional[str] = None
    delivery_country: Optional[str] = None
    delivery_address: Optional[str] = None
    required_by_date: Optional[date] = None
    preferred_supplier: Optional[str] = None

    # LLM-enriched fields
    item_description: str = ""
    preferred_supplier_id: Optional[str] = None
    preferred_supplier_name: Optional[str] = None
    data_residency_required: bool = False
    esg_requirement: bool = False
    urgency: str = "normal"  # normal, high, critical
    additional_specs: str = ""
    detected_language: str = "en"
    text_quantity_mentioned: Optional[int] = None
    text_contradictions: list[TextContradiction] = Field(default_factory=list)

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
