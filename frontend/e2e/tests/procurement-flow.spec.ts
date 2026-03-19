/**
 * Procurement Portal — End-to-End Flow Tests
 *
 * Critical journeys:
 *   1. Inbox: Role Selection → Procurement Office → see Incoming Requests
 *   2. Process (manual): New Manual Request → fill form → validate →
 *      supplier ranking → select supplier → confirm order
 *   3. Process from inbox: pending request → Process button → validation →
 *      supplier ranking → order
 */
import { test, expect } from "@playwright/test";
import {
  VALID_VALIDATION_RESULT,
  INVALID_VALIDATION_RESULT,
} from "../fixtures/api-responses";
import { mockReadOnlyEndpoints } from "../fixtures/test-fixtures";
import { RequestFormPage } from "../pages/RequestFormPage";
import { ValidationViewPage } from "../pages/ValidationViewPage";

// ── Shared fixture data ───────────────────────────────────────────────────

const PENDING_REQUEST = {
  id: "EMP-001",
  submitted_at: "2026-03-19T08:00:00Z",
  status: "pending",
  request_text: "10 business laptops for Berlin office by end of March",
  quantity: 10,
  unit_of_measure: "device",
  category_l1: "IT",
  category_l2: "Laptops",
  delivery_address: "Berlin, Germany",
  required_by_date: "2026-03-31",
  preferred_supplier: "Dell",
  language: "en",
};

const RANKED_SUPPLIERS_MOCK = {
  request_id: "REQ-PROC-001",
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
    {
      rank: 2,
      supplier_id: "SUP-0002",
      supplier_name: "Lenovo Direct",
      is_preferred: false,
      is_incumbent: false,
      meets_lead_time: true,
      pricing_tier_applied: "1-99",
      unit_price: 1180,
      total_price: 11800,
      expedited_unit_price: null,
      expedited_total_price: null,
      standard_lead_time_days: 10,
      expedited_lead_time_days: null,
      score_breakdown: {
        price_score: 90,
        quality_score: 82,
        risk_score: 80,
        esg_score: 75,
        lead_time_score: 78,
      },
      raw_scores: { quality: 82, risk: 20, esg: 75 },
      composite_score: 83.0,
      compliance_checks: [],
      recommendation_note: "Good value alternative.",
    },
  ],
  excluded: [],
  escalations: [],
  budget_sufficient: true,
  minimum_total_cost: 11800,
  minimum_cost_supplier: "Lenovo Direct",
  approval_threshold_id: "EUR_25K",
  approval_threshold_note: "Below 25K EUR — business approval only",
  quotes_required: 1,
  currency: "EUR",
  policies_checked: ["CR-001", "GR-002"],
  llm_fallback_reason: null,
};

const ORDER_CONFIRMATION_MOCK = {
  order_id: "ORD-2026-001",
  request_id: "REQ-PROC-001",
  placed_at: "2026-03-19T10:05:00Z",
  status: "submitted",
  selected_supplier_id: "SUP-0001",
  selected_supplier_name: "Dell Technologies",
  category_l1: "IT",
  category_l2: "Laptops",
  quantity: 10,
  unit_of_measure: "device",
  unit_price: 1250,
  total_price: 12500,
  currency: "EUR",
  delivery_country: "DE",
  required_by_date: "2026-03-31",
  pricing_tier_applied: "1-99",
  approval_required: false,
  approval_threshold_id: "EUR_25K",
  approval_threshold_note: "Below 25K EUR — business approval only",
  quotes_required: 1,
  notes: null,
  next_steps: ["Send PO to Dell Technologies", "Confirm delivery date"],
};

// Helper to navigate to procurement portal
async function goToProcurementPortal(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Procurement Office/i })
    .click();
}

// ── Inbox ─────────────────────────────────────────────────────────────────

test.describe("Procurement Portal — Inbox", () => {
  test("Procurement Office selection shows the Incoming Requests inbox", async ({
    page,
  }) => {
    await mockReadOnlyEndpoints(page);
    await goToProcurementPortal(page);

    await expect(
      page.getByRole("heading", { name: "Incoming Requests" })
    ).toBeVisible({ timeout: 5_000 });
  });

  test("empty inbox shows a no-requests placeholder", async ({ page }) => {
    await mockReadOnlyEndpoints(page);
    // Default mock returns empty requests list
    await goToProcurementPortal(page);

    await expect(page.getByText("No requests yet")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("pending request appears in the inbox list", async ({ page }) => {
    await mockReadOnlyEndpoints(page);
    // Override the employee/requests endpoint to return one pending request
    await page.route("**/api/employee/requests", (route) =>
      route.fulfill({ json: { requests: [PENDING_REQUEST] } })
    );

    await goToProcurementPortal(page);

    await expect(
      page.getByText(PENDING_REQUEST.request_text, { exact: false })
    ).toBeVisible({ timeout: 5_000 });
  });

  test("pending request shows Process and Refuse buttons", async ({ page }) => {
    await mockReadOnlyEndpoints(page);
    await page.route("**/api/employee/requests", (route) =>
      route.fulfill({ json: { requests: [PENDING_REQUEST] } })
    );

    await goToProcurementPortal(page);

    await expect(page.getByRole("button", { name: "Process" })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole("button", { name: "Refuse" })).toBeVisible({
      timeout: 5_000,
    });
  });

  test("New Manual Request button is present in the inbox", async ({
    page,
  }) => {
    await mockReadOnlyEndpoints(page);
    await goToProcurementPortal(page);

    await expect(
      page.getByRole("button", { name: /New Manual Request/i })
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ── Manual processing flow ────────────────────────────────────────────────

test.describe("Procurement Portal — Manual Request Flow", () => {
  test("New Manual Request opens the processing form", async ({ page }) => {
    await mockReadOnlyEndpoints(page);
    await goToProcurementPortal(page);

    await page.getByRole("button", { name: /New Manual Request/i }).click();

    // Processing view shows a request form
    await expect(
      page.getByRole("button", { name: "Validate Request" })
    ).toBeVisible({ timeout: 5_000 });
  });

  test("valid validation in procurement portal triggers supplier ranking", async ({
    page,
  }) => {
    await mockReadOnlyEndpoints(page);
    await page.route("**/api/validate", (route) =>
      route.fulfill({ json: VALID_VALIDATION_RESULT })
    );
    await page.route("**/api/rank", (route) =>
      route.fulfill({ json: RANKED_SUPPLIERS_MOCK })
    );

    await goToProcurementPortal(page);
    await page.getByRole("button", { name: /New Manual Request/i }).click();

    const formPage = new RequestFormPage(page);
    await formPage.fillForm({
      requestText: "10 laptops for Berlin office by end of March",
      categoryL1: "IT",
      categoryL2: "Laptops",
      quantity: 10,
      unitOfMeasure: "device",
      deliveryCountry: "DE",
      requiredByDate: "2026-03-31",
      preferredSupplier: "Dell",
    });
    await formPage.submit();

    // Supplier ranking view appears
    await expect(
      page.getByText(/Dell Technologies|Supplier Ranking|Ranked Suppliers/i)
    ).toBeVisible({ timeout: 15_000 });
  });

  test("invalid result in procurement portal shows validation banner", async ({
    page,
  }) => {
    await mockReadOnlyEndpoints(page);
    await page.route("**/api/validate", (route) =>
      route.fulfill({ json: INVALID_VALIDATION_RESULT })
    );

    await goToProcurementPortal(page);
    await page.getByRole("button", { name: /New Manual Request/i }).click();

    const formPage = new RequestFormPage(page);
    await formPage.fillForm({
      requestText: "10 laptops for Berlin",
      quantity: 10,
      deliveryCountry: "DE",
      requiredByDate: "2026-03-31",
    });
    await formPage.submit();

    // Validation banner with issue count
    const validationPage = new ValidationViewPage(page);
    await validationPage.expectInvalid(2);
  });

  test("Back to Inbox link is visible during processing", async ({ page }) => {
    await mockReadOnlyEndpoints(page);
    await goToProcurementPortal(page);

    await page.getByRole("button", { name: /New Manual Request/i }).click();

    await expect(
      page.getByRole("button", { name: /Back to Inbox/i }).or(
        page.getByText(/Back to Inbox/i)
      )
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ── From inbox → process → rank → order ─────────────────────────────────

test.describe("Procurement Portal — Process From Inbox Flow", () => {
  test("clicking Process on a pending request navigates to validation form", async ({
    page,
  }) => {
    await mockReadOnlyEndpoints(page);
    await page.route("**/api/employee/requests", (route) =>
      route.fulfill({ json: { requests: [PENDING_REQUEST] } })
    );

    await goToProcurementPortal(page);

    await page.getByRole("button", { name: "Process" }).click();

    // Processing form is shown
    await expect(
      page.getByRole("button", { name: "Validate Request" })
    ).toBeVisible({ timeout: 5_000 });
  });

  test("full procurement flow: process → validate → rank → select → confirm order", async ({
    page,
  }) => {
    await mockReadOnlyEndpoints(page);
    await page.route("**/api/employee/requests", (route) =>
      route.fulfill({ json: { requests: [PENDING_REQUEST] } })
    );
    await page.route("**/api/validate", (route) =>
      route.fulfill({ json: VALID_VALIDATION_RESULT })
    );
    await page.route("**/api/rank", (route) =>
      route.fulfill({ json: RANKED_SUPPLIERS_MOCK })
    );
    await page.route("**/api/order", (route) =>
      route.fulfill({ json: ORDER_CONFIRMATION_MOCK })
    );
    await page.route("**/api/employee/requests/**", (route) =>
      route.fulfill({ json: { ok: true } })
    );

    // Step 1: Go to procurement portal and click Process
    await goToProcurementPortal(page);
    await page.getByRole("button", { name: "Process" }).click();

    // Step 2: Validate
    await expect(
      page.getByRole("button", { name: "Validate Request" })
    ).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "Validate Request" }).click();

    // Step 3: Supplier ranking view
    await expect(
      page.getByText(/Dell Technologies|Supplier Ranking/i)
    ).toBeVisible({ timeout: 15_000 });

    // Step 4: Select top-ranked supplier
    await page
      .getByRole("button", { name: /Select|Order|Choose/i })
      .first()
      .click({ timeout: 5_000 });

    // Step 5: Order recap or confirmation
    // The recap page shows "Confirm Order" button
    const confirmOrderBtn = page.getByRole("button", {
      name: /Confirm Order|Place Order/i,
    });
    if (await confirmOrderBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmOrderBtn.click();
    }

    // Final: Order confirmation with order ID
    await expect(page.getByText("ORD-2026-001")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Refuse button marks request as refused in inbox", async ({ page }) => {
    await mockReadOnlyEndpoints(page);
    await page.route("**/api/employee/requests", (route) =>
      route.fulfill({ json: { requests: [PENDING_REQUEST] } })
    );
    await page.route("**/api/employee/requests/**", (route) =>
      route.fulfill({ json: { ok: true } })
    );

    await goToProcurementPortal(page);

    await page.getByRole("button", { name: "Refuse" }).click();

    // After refusing, the status badge changes to "refused" in the UI
    await expect(page.getByText("refused")).toBeVisible({ timeout: 5_000 });
    // Refuse button is gone for refused requests
    await expect(
      page.getByRole("button", { name: "Refuse" })
    ).not.toBeVisible();
  });
});

// ── Sidebar navigation ────────────────────────────────────────────────────

test.describe("Procurement Portal — Sidebar Navigation", () => {
  test("sidebar shows Inbox and New Manual Entry items", async ({ page }) => {
    await mockReadOnlyEndpoints(page);
    await goToProcurementPortal(page);

    await expect(page.getByText("Inbox")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("New Manual Entry")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("sidebar Switch Role button returns to role selection", async ({
    page,
  }) => {
    await mockReadOnlyEndpoints(page);
    await goToProcurementPortal(page);

    await page.getByRole("button", { name: /Switch Role/i }).click();

    await expect(
      page.getByRole("heading", { name: "Smart Procurement" })
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Select your role to continue")).toBeVisible();
  });
});
