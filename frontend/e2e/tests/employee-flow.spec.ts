/**
 * Employee Portal — End-to-End Flow Tests
 *
 * Critical journey:
 *   Role Selection → Employee portal → Fill request form
 *   → Validate → Review step → Confirm & Submit → Submitted confirmation
 *
 * Secondary journey (invalid result):
 *   Form → Validate → Validation banner inline → Fix form → Resubmit
 */
import { test, expect } from "@playwright/test";
import {
  VALID_VALIDATION_RESULT,
  INVALID_VALIDATION_RESULT,
} from "../fixtures/api-responses";
import { mockReadOnlyEndpoints } from "../fixtures/test-fixtures";
import { RequestFormPage } from "../pages/RequestFormPage";
import { ValidationViewPage } from "../pages/ValidationViewPage";

// ── Happy path ───────────────────────────────────────────────────────────

test.describe("Employee Flow — happy path", () => {
  test("full journey: role selection → form → review → submitted", async ({
    page,
  }) => {
    await mockReadOnlyEndpoints(page);
    await page.route("**/api/validate", (route) =>
      route.fulfill({ json: VALID_VALIDATION_RESULT })
    );

    // Step 1: Role selection
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Smart Procurement" })
    ).toBeVisible();
    await expect(page.getByText("Select your role to continue")).toBeVisible();

    // Step 2: Select Employee role
    await page.getByRole("button", { name: /Employee/i }).first().click();
    await expect(page.getByText("Employee Portal")).toBeVisible({
      timeout: 5_000,
    });

    // Step 3: Fill the request form
    const formPage = new RequestFormPage(page);
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

    // Step 4: Submit
    await formPage.submit();

    // Step 5: Review step appears
    const validationPage = new ValidationViewPage(page);
    await validationPage.waitForReviewStep();
    await expect(validationPage.reviewHeading).toBeVisible();
    await expect(validationPage.confirmSubmitButton).toBeVisible();
    await expect(validationPage.editButton).toBeVisible();

    // Step 6: Confirm & Submit
    await validationPage.confirmSubmitButton.click();

    // Step 7: Submitted confirmation screen
    await expect(
      page.getByRole("heading", { name: /Request Submitted/i })
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("REQ-TEST-001")).toBeVisible();
  });

  test("submitted confirmation shows a reference ID", async ({ page }) => {
    await mockReadOnlyEndpoints(page);
    await page.route("**/api/validate", (route) =>
      route.fulfill({ json: VALID_VALIDATION_RESULT })
    );

    const formPage = new RequestFormPage(page);
    const validationPage = new ValidationViewPage(page);

    await formPage.goto();
    await formPage.fillForm({
      requestText: "10 laptops for Berlin",
      quantity: 10,
      deliveryCountry: "DE",
      requiredByDate: "2026-03-31",
    });
    await formPage.submit();
    await validationPage.waitForReviewStep();
    await validationPage.confirmSubmitButton.click();

    // Reference ID from the mocked /api/employee/submit response
    await expect(page.getByText("REQ-TEST-001")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Submit a new request button resets the form after submission", async ({
    page,
  }) => {
    await mockReadOnlyEndpoints(page);
    await page.route("**/api/validate", (route) =>
      route.fulfill({ json: VALID_VALIDATION_RESULT })
    );

    const formPage = new RequestFormPage(page);
    const validationPage = new ValidationViewPage(page);

    await formPage.goto();
    await formPage.fillForm({
      requestText: "10 laptops for Berlin",
      quantity: 10,
      deliveryCountry: "DE",
      requiredByDate: "2026-03-31",
    });
    await formPage.submit();
    await validationPage.waitForReviewStep();
    await validationPage.confirmSubmitButton.click();

    // Wait for submitted screen then click "new request"
    await expect(
      page.getByRole("heading", { name: /Request Submitted/i })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /new request|submit a new/i }).click();

    // Should return to the form
    await expect(formPage.submitButton).toBeVisible({ timeout: 5_000 });
  });
});

// ── Invalid result path ───────────────────────────────────────────────────

test.describe("Employee Flow — invalid result", () => {
  test("invalid result shows banner inline above the form", async ({ page }) => {
    await mockReadOnlyEndpoints(page);
    await page.route("**/api/validate", (route) =>
      route.fulfill({ json: INVALID_VALIDATION_RESULT })
    );

    const formPage = new RequestFormPage(page);
    await formPage.goto();
    await formPage.fillForm({
      requestText: "10 laptops for Berlin",
      quantity: 10,
      deliveryCountry: "DE",
      requiredByDate: "2026-03-31",
    });
    await formPage.submit();

    // Banner shows blocking count
    const validationPage = new ValidationViewPage(page);
    await validationPage.expectInvalid(2);

    // Form is still visible for correction
    await expect(formPage.requestTextArea).toBeVisible();
    await expect(formPage.submitButton).toBeVisible();
  });

  test("user can resubmit after seeing validation issues", async ({ page }) => {
    await mockReadOnlyEndpoints(page);

    let callCount = 0;
    await page.route("**/api/validate", (route) => {
      callCount++;
      return route.fulfill({
        json: callCount === 1 ? INVALID_VALIDATION_RESULT : VALID_VALIDATION_RESULT,
      });
    });

    const formPage = new RequestFormPage(page);
    const validationPage = new ValidationViewPage(page);

    await formPage.goto();
    await formPage.fillForm({
      requestText: "10 laptops for Berlin",
      quantity: 10,
      deliveryCountry: "DE",
      requiredByDate: "2026-03-31",
    });
    await formPage.submit();

    // First submit → invalid
    await validationPage.expectInvalid(2);

    // Correct the form text and resubmit
    await formPage.requestTextArea.fill(
      "10 laptops for Berlin, budget EUR 15000"
    );
    await formPage.submit();

    // Second submit → valid → review step
    await validationPage.waitForReviewStep();
    await expect(validationPage.reviewHeading).toBeVisible();
  });

  test("review step is NOT shown after invalid result", async ({ page }) => {
    await mockReadOnlyEndpoints(page);
    await page.route("**/api/validate", (route) =>
      route.fulfill({ json: INVALID_VALIDATION_RESULT })
    );

    const formPage = new RequestFormPage(page);
    const validationPage = new ValidationViewPage(page);

    await formPage.goto();
    await formPage.fillForm({
      requestText: "10 laptops",
      quantity: 10,
      deliveryCountry: "DE",
      requiredByDate: "2026-03-31",
    });
    await formPage.submit();

    await validationPage.expectInvalid(2);
    await expect(validationPage.reviewHeading).not.toBeVisible();
  });
});

// ── Navigation ────────────────────────────────────────────────────────────

test.describe("Employee Flow — navigation", () => {
  test("back arrow in portal header returns to role selection", async ({
    page,
  }) => {
    await mockReadOnlyEndpoints(page);

    const formPage = new RequestFormPage(page);
    await formPage.goto();

    // The portal header has a back arrow button
    await page.getByRole("button", { name: /Switch Role/i }).click();

    // Returns to RoleSelection
    await expect(
      page.getByRole("heading", { name: "Smart Procurement" })
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Select your role to continue")).toBeVisible();
  });

  test("Edit Request from review step returns to the filled form", async ({
    page,
  }) => {
    await mockReadOnlyEndpoints(page);
    await page.route("**/api/validate", (route) =>
      route.fulfill({ json: VALID_VALIDATION_RESULT })
    );

    const formPage = new RequestFormPage(page);
    const validationPage = new ValidationViewPage(page);

    await formPage.goto();
    await formPage.fillForm({
      requestText: "Unique text for edit test",
      quantity: 5,
      deliveryCountry: "CH",
      requiredByDate: "2026-04-15",
    });
    await formPage.submit();
    await validationPage.waitForReviewStep();

    await validationPage.editButton.click();

    // Form is visible again with the previously entered text
    await expect(formPage.requestTextArea).toBeVisible();
    await expect(formPage.requestTextArea).toHaveValue(
      "Unique text for edit test"
    );
  });
});
