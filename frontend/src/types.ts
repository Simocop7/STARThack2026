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
