/**
 * Form submission flow.
 *
 * Tests the full path: user fills the form → submits → loading spinner appears
 * → ValidationView renders.
 *
 * /api/validate is mocked in each test so that no real LLM calls are made.
 */
import { test, expect } from "../fixtures/test-fixtures";
import {
  VALID_VALIDATION_RESULT,
  INVALID_VALIDATION_RESULT,
} from "../fixtures/api-responses";
import {
  submitFormWithMockedResult,
  submitValidForm,
} from "../fixtures/test-fixtures";
import { ValidationViewPage } from "../pages/ValidationViewPage";
import { RequestFormPage } from "../pages/RequestFormPage";

test.describe("Form submission", () => {
  test("loading spinner is shown while the API call is in flight", async ({
    page,
  }) => {
    // Mock validate with an artificial delay so we can catch the spinner
    let resolveValidate!: (value: unknown) => void;
    const validatePromise = new Promise((resolve) => {
      resolveValidate = resolve;
    });

    // Set up read-only mocks first
    await page.route("**/api/health", (r) =>
      r.fulfill({ json: { status: "ok" } })
    );
    await page.route("**/api/categories", (r) =>
      r.fulfill({
        json: {
          categories: {
            IT: ["Laptops"],
            Facilities: [],
            "Professional Services": [],
            Marketing: [],
          },
        },
      })
    );
    await page.route("**/api/requests", (r) =>
      r.fulfill({ json: { requests: [] } })
    );

    await page.route("**/api/validate", async (route) => {
      await validatePromise; // hold until we resolve it manually
      await route.fulfill({ json: VALID_VALIDATION_RESULT });
    });

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

    // Spinner should appear immediately after click
    await expect(page.getByText("Analyzing your request...")).toBeVisible();

    // Release the API mock and verify spinner disappears
    resolveValidate(undefined);
    await expect(page.getByText("Analyzing your request...")).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test("valid result renders ValidationView after submission", async ({
    page,
  }) => {
    const { validationPage } = await submitValidForm(page);
    await validationPage.waitForView();
    await expect(validationPage.backButton).toBeVisible();
  });

  test("valid result shows green status banner", async ({ page }) => {
    const { validationPage } = await submitValidForm(page);
    await expect(validationPage.statusBanner).toHaveText(/Request validated/i);
  });

  test("invalid result shows red banner with correct blocking count", async ({
    page,
  }) => {
    const { validationPage } = await submitFormWithMockedResult(
      page,
      INVALID_VALIDATION_RESULT
    );

    // INVALID_VALIDATION_RESULT has 2 blocking issues (critical + high)
    await validationPage.expectInvalid(2);
  });

  test("form is no longer visible after submission", async ({ page }) => {
    const { formPage } = await submitValidForm(page);
    await expect(formPage.submitButton).not.toBeVisible();
    await expect(formPage.requestTextArea).not.toBeVisible();
  });

  test("API request body contains all form field values", async ({ page }) => {
    await page.route("**/api/health", (r) =>
      r.fulfill({ json: { status: "ok" } })
    );
    await page.route("**/api/categories", (r) =>
      r.fulfill({
        json: {
          categories: { IT: ["Laptops"], Facilities: [], "Professional Services": [], Marketing: [] },
        },
      })
    );
    await page.route("**/api/requests", (r) =>
      r.fulfill({ json: { requests: [] } })
    );

    let capturedBody: Record<string, unknown> = {};
    await page.route("**/api/validate", async (route) => {
      capturedBody = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({ json: VALID_VALIDATION_RESULT });
    });

    const formPage = new RequestFormPage(page);
    await formPage.goto();
    await formPage.fillForm({
      requestText: "10 laptops for Berlin office",
      categoryL1: "IT",
      categoryL2: "Laptops",
      quantity: 10,
      unitOfMeasure: "device",
      deliveryCountry: "DE",
      requiredByDate: "2026-03-31",
      preferredSupplier: "Dell",
    });
    await formPage.submit();

    const validationPage = new ValidationViewPage(page);
    await validationPage.waitForView();

    expect(capturedBody).toMatchObject({
      request_text: "10 laptops for Berlin office",
      category_l1: "IT",
      category_l2: "Laptops",
      quantity: 10,
      unit_of_measure: "device",
      delivery_country: "DE",
      required_by_date: "2026-03-31",
      preferred_supplier: "Dell",
    });
  });

  test("back button returns to the form", async ({ page }) => {
    const { validationPage, formPage } = await submitValidForm(page);
    await validationPage.goBack();
    await expect(formPage.submitButton).toBeVisible();
    await expect(formPage.requestTextArea).toBeVisible();
  });
});
