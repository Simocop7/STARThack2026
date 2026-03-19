/**
 * Canonical mock responses that mirror the real FastAPI contract.
 * Keep these in sync with api/models.py when the schema changes.
 */

export const CATEGORIES_RESPONSE = {
  categories: {
    IT: ["Laptops", "Mobile Workstations", "Cloud Compute", "Cloud Storage", "Managed Cloud", "Break-Fix"],
    Facilities: ["Reception/Lounge", "Office Furniture"],
    "Professional Services": ["Software Dev", "Cybersecurity Advisory"],
    Marketing: ["SEM", "Influencer campaigns"],
  },
};

export const REQUESTS_RESPONSE = {
  requests: [
    {
      request_id: "REQ-000001",
      title: "Standard laptop procurement for DE office",
      category_l1: "IT",
      category_l2: "Laptops",
      country: "DE",
      scenario_tags: ["standard"],
    },
    {
      request_id: "REQ-000002",
      title: "Cloud storage with data residency requirement",
      category_l1: "IT",
      category_l2: "Cloud Storage",
      country: "CH",
      scenario_tags: ["multilingual", "restricted"],
    },
    {
      request_id: "REQ-000003",
      title: "Missing budget information request",
      category_l1: "IT",
      category_l2: "Laptops",
      country: "FR",
      scenario_tags: ["missing_info"],
    },
  ],
};

export const SINGLE_REQUEST_RESPONSE = {
  request: {
    request_id: "REQ-000001",
    request_text:
      "We need 10 business laptops for our Berlin office by end of March. Budget is EUR 15,000.",
    quantity: 10,
    unit_of_measure: "device",
    category_l1: "IT",
    category_l2: "Laptops",
    delivery_countries: ["DE"],
    required_by_date: "2026-03-31T00:00:00",
    preferred_supplier_mentioned: "Dell",
    scenario_tags: ["standard"],
  },
};

/** A clean, valid validation result (is_valid: true, no blocking issues). */
export const VALID_VALIDATION_RESULT = {
  is_valid: true,
  issues: [
    {
      issue_id: "ISS-001",
      severity: "low",
      type: "preferred_supplier_note",
      description: "Dell is a preferred supplier for IT/Laptops in DE.",
      proposed_fix: "No action required.",
      fix_action: null,
    },
  ],
  enriched_request: {
    request_id: "REQ-000001",
    category_l1: "IT",
    category_l2: "Laptops",
    quantity: 10,
    unit_of_measure: "device",
    budget_amount: 15000,
    currency: "EUR",
    delivery_country: "DE",
    required_by_date: "2026-03-31",
    data_residency_required: false,
    preferred_supplier_stated: "Dell",
  },
  corrected_request: null,
  user_message: {
    summary: "Your request looks good and can proceed to approval.",
    issues: [
      {
        title: "Preferred supplier confirmed",
        explanation: "Dell covers Germany and is eligible for this category.",
        proposed_fix: "No changes needed.",
        fix_field: null,
        fix_value: null,
      },
    ],
    corrected_json: null,
    all_ok_message: "",
  },
};

/** A result with critical and high issues (is_valid: false). */
export const INVALID_VALIDATION_RESULT = {
  is_valid: false,
  issues: [
    {
      issue_id: "ISS-001",
      severity: "critical",
      type: "budget_insufficient",
      description:
        "Stated budget EUR 5,000 is below the minimum required EUR 12,000 for 10 laptops at standard tier pricing.",
      proposed_fix: "Increase budget to at least EUR 12,000.",
      fix_action: {
        field: "budget_amount",
        suggested_value: "12000",
        alternatives: ["12500", "13000"],
      },
    },
    {
      issue_id: "ISS-002",
      severity: "high",
      type: "lead_time_infeasible",
      description:
        "Required delivery in 5 days is below the standard lead time of 14 days.",
      proposed_fix: "Extend delivery deadline or select expedited shipping.",
      fix_action: {
        field: "required_by_date",
        suggested_value: "2026-04-02",
        alternatives: [],
      },
    },
    {
      issue_id: "ISS-003",
      severity: "medium",
      type: "missing_info",
      description: "Unit of measure not specified.",
      proposed_fix: "Set unit_of_measure to 'device'.",
      fix_action: {
        field: "unit_of_measure",
        suggested_value: "device",
        alternatives: [],
      },
    },
  ],
  enriched_request: {
    category_l1: "IT",
    category_l2: "Laptops",
    quantity: 10,
    delivery_country: "DE",
  },
  corrected_request: {
    category_l1: "IT",
    category_l2: "Laptops",
    quantity: 10,
    budget_amount: 12000,
    currency: "EUR",
    delivery_country: "DE",
    required_by_date: "2026-04-02",
    unit_of_measure: "device",
  },
  user_message: {
    summary: "2 issues must be resolved before this request can proceed.",
    issues: [
      {
        title: "Budget too low",
        explanation:
          "The stated budget of EUR 5,000 cannot cover 10 laptops. The minimum is EUR 12,000.",
        proposed_fix: "Increase budget to EUR 12,000.",
        fix_field: "budget_amount",
        fix_value: "12000",
      },
      {
        title: "Lead time not achievable",
        explanation:
          "Standard delivery requires at least 14 days. Your deadline is in 5 days.",
        proposed_fix: "Move the deadline to 2026-04-02 or choose expedited shipping.",
        fix_field: "required_by_date",
        fix_value: "2026-04-02",
      },
    ],
    corrected_json: null,
    all_ok_message: "Accept all suggested fixes to confirm and proceed.",
  },
};

/** Result where user_message is null (fallback raw issues path). */
export const VALIDATION_RESULT_NO_LLM_MESSAGE = {
  is_valid: false,
  issues: [
    {
      issue_id: "ISS-001",
      severity: "high",
      type: "restricted_supplier",
      description: "AWS EMEA is restricted for Cloud Storage in CH.",
      proposed_fix: "Remove AWS EMEA from consideration.",
      fix_action: null,
    },
  ],
  enriched_request: { category_l1: "IT", category_l2: "Cloud Storage" },
  corrected_request: null,
  user_message: null,
};
