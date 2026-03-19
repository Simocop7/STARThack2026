/**
 * Form submission flow.
 *
 * Tests the full path: user fills the form → submits → loading spinner
 * appears → result is shown.
 *
 * Employee portal behaviour on valid result:
 *   → EmployeeReviewStep ("Review Your Request" heading + "Confirm & Submit" button)
 *
 * Employee portal behaviour on invalid result:
 *   → ValidationBanner (inline, "N issues to resolve" h2) above the form
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
  mockReadOnlyEndpoints,
} from "../fixtures/test-fixtures";
import { ValidationViewPage } from "../pages/ValidationViewPage";
import { RequestFormPage } from "../pages/RequestFormPage";

test.describe("Form submission", () => {
  test("loading spinner is shown while the API call is in flight", async ({
    page,
  }) => {
    let resolveValidate!: (value: unknown) => void;
    const validatePromise = new Promise((resolve) => {
      resolveValidate = resolve;
    });

    await mockReadOnlyEndpoints(page);

    await page.route("**/api/validate", async (route) => {
      await validatePromise;
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
    await expect(
      page.getByText(/Analyzing your request/i)
    ).toBeVisible();

    // Release the API mock and verify spinner disappears
    resolveValidate(undefined);
    await expect(
      page.getByText(/Analyzing your request/i)
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test("valid result renders EmployeeReviewStep after submission", async ({
    page,
  }) => {
    const { validationPage } = await submitValidForm(page);
    await expect(validationPage.reviewHeading).toBeVisible();
  });

  test("valid result shows Confirm & Submit button", async ({ page }) => {
    const { validationPage } = await submitValidForm(page);
    await expect(validationPage.confirmSubmitButton).toBeVisible();
  });

  test("valid result shows Edit Request button", async ({ page }) => {
    const { validationPage } = await submitValidForm(page);
    await expect(validationPage.editButton).toBeVisible();
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

  test("form is still visible after invalid result (inline banner)", async ({
    page,
  }) => {
    const { formPage } = await submitFormWithMockedResult(
      page,
      INVALID_VALIDATION_RESULT
    );
    // In the Employee portal, the form remains visible with validation banner above it
    await expect(formPage.submitButton).toBeVisible();
    await expect(formPage.requestTextArea).toBeVisible();
  });

  test("form is no longer visible after valid result (review step shown)", async ({
    page,
  }) => {
    const { formPage } = await submitValidForm(page);
    // After valid result → EmployeeReviewStep is shown; form is hidden
    await expect(formPage.submitButton).not.toBeVisible();
    await expect(formPage.requestTextArea).not.toBeVisible();
  });

  test("API request body contains all form field values", async ({ page }) => {
    await mockReadOnlyEndpoints(page);

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
      required_by_date: "2026-03-31",
      preferred_supplier: "Dell",
    });
    // delivery_country should be the selected 2-letter code
    expect(capturedBody.delivery_country ?? capturedBody.delivery_address).toBe("DE");
  });

  test("Edit Request button returns to the form from review step", async ({
    page,
  }) => {
    const { validationPage, formPage } = await submitValidForm(page);
    await validationPage.goBack();
    await expect(formPage.submitButton).toBeVisible();
    await expect(formPage.requestTextArea).toBeVisible();
  });
});
