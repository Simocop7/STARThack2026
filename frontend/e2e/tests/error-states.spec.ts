/**
 * Error and edge-case handling.
 *
 * Tests:
 *   - HTML5 native required-field validation prevents blank form submission
 *   - Network / 500 error from /api/validate is handled gracefully
 *   - API categories endpoint failure is handled gracefully
 */
import { test, expect } from "@playwright/test";
import { RequestFormPage } from "../pages/RequestFormPage";
import { ValidationViewPage } from "../pages/ValidationViewPage";
import { CATEGORIES_RESPONSE, VALID_VALIDATION_RESULT } from "../fixtures/api-responses";

// ---------------------------------------------------------------------------
// Helpers shared within this file
// ---------------------------------------------------------------------------

async function setupBasicMocks(page: import("@playwright/test").Page) {
  await page.route("**/api/health", (r) =>
    r.fulfill({ json: { status: "ok" } })
  );
  await page.route("**/api/categories", (r) =>
    r.fulfill({ json: CATEGORIES_RESPONSE })
  );
  await page.route("**/api/requests", (r) =>
    r.fulfill({ json: { requests: [] } })
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Empty form submission", () => {
  test("submitting without request_text does not show ValidationView", async ({
    page,
  }) => {
    await setupBasicMocks(page);

    const formPage = new RequestFormPage(page);
    await formPage.goto();

    // Click submit without filling anything
    await formPage.submit();

    // HTML5 required validation fires — the browser prevents the fetch.
    // The validation view back button must not appear.
    const validationPage = new ValidationViewPage(page);
    await expect(validationPage.backButton).not.toBeVisible();
  });

  test("form remains visible after a failed required-field attempt", async ({
    page,
  }) => {
    await setupBasicMocks(page);

    const formPage = new RequestFormPage(page);
    await formPage.goto();
    await formPage.submit();

    await expect(formPage.submitButton).toBeVisible();
  });
});

test.describe("API error handling", () => {
  test("network error on /api/validate does not crash the UI", async ({
    page,
  }) => {
    await setupBasicMocks(page);
    await page.route("**/api/validate", (route) => route.abort("failed"));

    const formPage = new RequestFormPage(page);
    await formPage.goto();
    await formPage.fillForm({
      requestText: "10 laptops for Berlin",
      categoryL1: "IT",
      categoryL2: "Laptops",
      quantity: 10,
      deliveryCountry: "DE",
      requiredByDate: "2026-03-31",
    });
    await formPage.submit();

    // The catch block in App.tsx sets result to null, keeping the form visible.
    // After the error resolves, the spinner disappears and the form returns.
    await expect(page.getByText("Analyzing your request...")).not.toBeVisible({
      timeout: 8_000,
    });
    // ValidationView must not be visible — the back button is the sentinel
    const validationPage = new ValidationViewPage(page);
    await expect(validationPage.backButton).not.toBeVisible();
  });

  test("500 response from /api/validate does not crash the UI", async ({
    page,
  }) => {
    await setupBasicMocks(page);
    await page.route("**/api/validate", (route) =>
      route.fulfill({ status: 500, body: "Internal Server Error" })
    );

    const formPage = new RequestFormPage(page);
    await formPage.goto();
    await formPage.fillForm({
      requestText: "10 laptops for Berlin",
      categoryL1: "IT",
      categoryL2: "Laptops",
      quantity: 10,
      deliveryCountry: "DE",
      requiredByDate: "2026-03-31",
    });
    await formPage.submit();

    // Form should recover silently (no crash, no broken UI)
    await expect(page.getByText("Analyzing your request...")).not.toBeVisible({
      timeout: 8_000,
    });
  });

  test("categories API failure renders an empty L1 select without crashing", async ({
    page,
  }) => {
    await page.route("**/api/health", (r) =>
      r.fulfill({ json: { status: "ok" } })
    );
    // Simulate categories endpoint being unavailable
    await page.route("**/api/categories", (route) => route.abort("failed"));
    await page.route("**/api/requests", (r) =>
      r.fulfill({ json: { requests: [] } })
    );

    const formPage = new RequestFormPage(page);
    await formPage.goto();

    // The form should still render — empty categories just means no options
    await expect(formPage.submitButton).toBeVisible();
    await expect(formPage.requestTextArea).toBeVisible();
  });

  test("requests API failure renders no demo selector without crashing", async ({
    page,
  }) => {
    await page.route("**/api/health", (r) =>
      r.fulfill({ json: { status: "ok" } })
    );
    await page.route("**/api/categories", (r) =>
      r.fulfill({ json: CATEGORIES_RESPONSE })
    );
    // Simulate requests endpoint being unavailable
    await page.route("**/api/requests", (route) => route.abort("failed"));

    const formPage = new RequestFormPage(page);
    await formPage.goto();

    // Form should render; demo selector is conditionally rendered only when
    // demoRequests.length > 0, so it should be absent.
    await expect(formPage.submitButton).toBeVisible();
    await expect(
      page.getByText("Load a demo request")
    ).not.toBeVisible();
  });
});

test.describe("Re-submission after viewing results", () => {
  test("back button restores the form with previously entered data", async ({
    page,
  }) => {
    await setupBasicMocks(page);
    await page.route("**/api/validate", (r) =>
      r.fulfill({ json: VALID_VALIDATION_RESULT })
    );

    const formPage = new RequestFormPage(page);
    const validationPage = new ValidationViewPage(page);

    await formPage.goto();
    await formPage.fillForm({
      requestText: "10 laptops for Berlin unique text",
      categoryL1: "IT",
      categoryL2: "Laptops",
      quantity: 10,
      deliveryCountry: "DE",
      requiredByDate: "2026-03-31",
    });
    await formPage.submit();
    await validationPage.waitForView();

    await validationPage.goBack();

    // App passes initialData back to the form — text should be preserved
    await expect(formPage.requestTextArea).toHaveValue(
      "10 laptops for Berlin unique text"
    );
  });
});
