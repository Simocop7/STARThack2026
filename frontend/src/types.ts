export interface FormData {
  request_text: string;
  quantity: number | null;
  unit_of_measure: string;
  category_l1: string;
  category_l2: string;
  delivery_country: string;
  required_by_date: string;
  preferred_supplier: string;
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
}
