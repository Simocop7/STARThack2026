import { test as base, type Page } from "@playwright/test";
import { RequestFormPage } from "../pages/RequestFormPage";
import { ValidationViewPage } from "../pages/ValidationViewPage";
import { RoleSelectionPage } from "../pages/RoleSelectionPage";
import {
  CATEGORIES_RESPONSE,
  REQUESTS_RESPONSE,
  SINGLE_REQUEST_RESPONSE,
  VALID_VALIDATION_RESULT,
} from "./api-responses";

/**
 * Extended test fixtures that:
 *   - Provide typed POM instances (formPage, validationPage, roleSelectionPage)
 *   - Pre-mock the lightweight read-only API endpoints for every test
 *   - Leave /api/validate un-mocked so individual tests can control it
 *   - formPage.goto() automatically navigates through RoleSelection → Employee
 */

type SmartProcurementFixtures = {
  formPage: RequestFormPage;
  validationPage: ValidationViewPage;
  roleSelectionPage: RoleSelectionPage;
};

export const test = base.extend<SmartProcurementFixtures>({
  formPage: async ({ page }, use) => {
    await mockReadOnlyEndpoints(page);
    await use(new RequestFormPage(page));
  },

  validationPage: async ({ page }, use) => {
    await mockReadOnlyEndpoints(page);
    await use(new ValidationViewPage(page));
  },

  roleSelectionPage: async ({ page }, use) => {
    await mockReadOnlyEndpoints(page);
    await use(new RoleSelectionPage(page));
  },
});

export { expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mock all non-LLM endpoints so tests run without a running FastAPI backend. */
export async function mockReadOnlyEndpoints(page: Page): Promise<void> {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { status: "ok" } })
  );

  await page.route("**/api/categories", (route) =>
    route.fulfill({ json: CATEGORIES_RESPONSE })
  );

  await page.route("**/api/requests", (route) =>
    route.fulfill({ json: REQUESTS_RESPONSE })
  );

  // /api/requests/:id — only REQ-000001 is fully mocked
  await page.route("**/api/requests/**", (route) => {
    const url = route.request().url();
    const id = url.split("/api/requests/")[1];
    if (id === "REQ-000001") {
      return route.fulfill({ json: SINGLE_REQUEST_RESPONSE });
    }
    return route.fulfill({ status: 404, json: { detail: "Request not found" } });
  });

  // Employee submit endpoint
  await page.route("**/api/employee/submit", (route) =>
    route.fulfill({
      json: { request_id: "REQ-TEST-001" },
    })
  );

  // Employee requests inbox (procurement portal)
  await page.route("**/api/employee/requests", (route) =>
    route.fulfill({ json: { requests: [] } })
  );

  // Employee request status PATCH
  await page.route("**/api/employee/requests/**", (route) =>
    route.fulfill({ json: { ok: true } })
  );
}

/**
 * Mock /api/validate and /api/rank, navigate to "/" → Employee portal,
 * and submit the form with default valid data.
 *
 * Returns formPage and validationPage POMs ready for assertions.
 */
export async function submitFormWithMockedResult(
  page: Page,
  validationResult: unknown
): Promise<{ formPage: RequestFormPage; validationPage: ValidationViewPage }> {
  await mockReadOnlyEndpoints(page);

  await page.route("**/api/validate", (route) =>
    route.fulfill({ json: validationResult })
  );

  // Always mock /api/rank so that if validate returns is_valid:true the
  // procurement portal won't hang waiting for ranking.
  await page.route("**/api/rank", (route) =>
    route.fulfill({ json: MOCK_RANKING_RESULT })
  );

  const formPage = new RequestFormPage(page);
  const validationPage = new ValidationViewPage(page);

  await formPage.goto();
  await formPage.fillForm({
    requestText:
      "We need 10 business laptops for our Berlin office by end of March.",
    categoryL1: "IT",
    categoryL2: "Laptops",
    quantity: 10,
    unitOfMeasure: "device",
    deliveryCountry: "DE",
    requiredByDate: "2026-03-31",
    preferredSupplier: "Dell",
  });
  await formPage.submit();
  await validationPage.waitForView();

  return { formPage, validationPage };
}

/**
 * Convenience wrapper: submit with the canned VALID_VALIDATION_RESULT fixture.
 */
export async function submitValidForm(page: Page) {
  return submitFormWithMockedResult(page, VALID_VALIDATION_RESULT);
}

// ---------------------------------------------------------------------------
// Minimal ranking mock for valid-result tests
// ---------------------------------------------------------------------------

const MOCK_RANKING_RESULT = {
  request_id: "REQ-TEST-001",
  ranked_at: "2026-03-19T10:00:00Z",
  method_used: "deterministic",
  k: 3,
  scoring_weights: {
    price: 0.35,
    quality: 0.25,
    risk: 0.2,
    esg: 0.1,
    lead_time: 0.1,
  },
  ranking: [
    {
      rank: 1,
      supplier_id: "SUP-0001",
      supplier_name: "Dell Technologies",
      is_preferred: true,
      is_incumbent: false,
      meets_lead_time: true,
      pricing_tier_applied: "1-99",
      unit_price: 1250,
      total_price: 12500,
      expedited_unit_price: null,
      expedited_total_price: null,
      standard_lead_time_days: 7,
      expedited_lead_time_days: null,
      score_breakdown: {
        price_score: 85,
        quality_score: 90,
        risk_score: 88,
        esg_score: 80,
        lead_time_score: 92,
      },
      raw_scores: { quality: 90, risk: 12, esg: 80 },
      composite_score: 87.5,
      compliance_checks: [],
      recommendation_note: "Preferred supplier, meets all requirements.",
    },
  ],
  excluded: [],
  escalations: [],
  budget_sufficient: true,
  minimum_total_cost: 12500,
  minimum_cost_supplier: "Dell Technologies",
  approval_threshold_id: "EUR_25K",
  approval_threshold_note: "Below 25K EUR — business approval",
  quotes_required: 1,
  currency: "EUR",
  policies_checked: [],
  llm_fallback_reason: null,
};
