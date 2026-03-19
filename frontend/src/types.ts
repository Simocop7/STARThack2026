// ── Supplier Ranking Types ─────────────────────────────────────────

export interface ScoringWeights {
  price: number;
  quality: number;
  risk: number;
  esg: number;
  lead_time: number;
}

export interface ScoreBreakdown {
  price_score: number;
  quality_score: number;
  risk_score: number;
  esg_score: number;
  lead_time_score: number;
}

export interface ComplianceCheck {
  rule_id: string;
  rule_description: string;
  result: "pass" | "fail" | "warning" | "not_applicable";
  detail: string;
}

export interface ScoredSupplier {
  rank: number;
  supplier_id: string;
  supplier_name: string;
  is_preferred: boolean;
  is_incumbent: boolean;
  meets_lead_time: boolean;
  pricing_tier_applied: string;
  unit_price: number;
  total_price: number;
  expedited_unit_price: number | null;
  expedited_total_price: number | null;
  standard_lead_time_days: number;
  expedited_lead_time_days: number | null;
  score_breakdown: ScoreBreakdown;
  composite_score: number;
  compliance_checks: ComplianceCheck[];
  recommendation_note: string;
}

export interface ExcludedSupplier {
  supplier_id: string;
  supplier_name: string;
  reason: string;
}

export interface Escalation {
  rule_id: string;
  trigger: string;
  escalate_to: string;
  blocking: boolean;
  detail: string;
}

export interface RankedSupplierOutput {
  request_id: string;
  ranked_at: string;
  method_used: "deterministic" | "llm_fallback" | "hybrid";
  k: number;
  scoring_weights: ScoringWeights;
  ranking: ScoredSupplier[];
  excluded: ExcludedSupplier[];
  escalations: Escalation[];
  budget_sufficient: boolean | null;
  minimum_total_cost: number | null;
  minimum_cost_supplier: string | null;
  approval_threshold_id: string | null;
  approval_threshold_note: string | null;
  quotes_required: number | null;
  policies_checked: string[];
  llm_fallback_reason: string | null;
}

// ── Order Types ─────────────────────────────────────────────────────

export interface OrderRequest {
  request_id: string;
  category_l1: string;
  category_l2: string;
  quantity: number;
  unit_of_measure: string;
  currency: string;
  delivery_country: string;
  required_by_date: string | null;
  selected_supplier_id: string;
  selected_supplier_name: string;
  unit_price: number;
  total_price: number;
  pricing_tier_applied: string;
  approval_threshold_id: string | null;
  approval_threshold_note: string | null;
  quotes_required: number | null;
  notes: string | null;
}

export interface OrderConfirmation {
  order_id: string;
  request_id: string;
  placed_at: string;
  status: "submitted" | "pending_approval";
  selected_supplier_id: string;
  selected_supplier_name: string;
  category_l1: string;
  category_l2: string;
  quantity: number;
  unit_of_measure: string;
  unit_price: number;
  total_price: number;
  currency: string;
  delivery_country: string;
  required_by_date: string | null;
  pricing_tier_applied: string;
  approval_required: boolean;
  approval_threshold_id: string | null;
  approval_threshold_note: string | null;
  quotes_required: number | null;
  notes: string | null;
  next_steps: string[];
}

// ── Form Types ─────────────────────────────────────────────────────

export interface FormData {
  request_text: string;
  quantity: number | null;
  unit_of_measure: string;
  category_l1: string;
  category_l2: string;
  delivery_address: string;
  required_by_date: string;
  preferred_supplier: string;
  language: string;
}

export interface CategoryAlternative {
  category_l1: string;
  category_l2: string;
  reason: string;
}

export interface CategorySuggestion {
  category_l1: string;
  category_l2: string;
  confidence: number;
  reasoning: string;
  alternatives: CategoryAlternative[];
  needs_disambiguation: boolean;
}

export interface FixAction {
  field: string;
  suggested_value: string | null;
  alternatives: string[];
}

export interface ValidationIssue {
  issue_id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  type: string;
  description: string;
  proposed_fix: string;
  fix_action: FixAction | null;
}

export interface UserMessageIssue {
  title: string;
  explanation: string;
  proposed_fix: string;
  fix_field: string | null;
  fix_value: string | null;
}

export interface UserMessage {
  summary: string;
  issues: UserMessageIssue[];
  corrected_json: Record<string, unknown> | null;
  all_ok_message: string;
}

export interface ValidationResult {
  is_valid: boolean;
  issues: ValidationIssue[];
  enriched_request: Record<string, unknown>;
  corrected_request: Record<string, unknown> | null;
  user_message: UserMessage | null;
  category_suggestion: CategorySuggestion | null;
}
