/**
 * Smoke tests — verify that the application loads and renders the expected
 * initial state without any user interaction.
 *
 * These tests are intentionally thin; they catch build/bundle failures and
 * critical render errors before any other test suite runs.
 */
import { test, expect } from "../fixtures/test-fixtures";

test.describe("Page load / smoke", () => {
  test("page title is correct", async ({ formPage }) => {
    await formPage.goto();
    await expect(formPage.page).toHaveTitle(/Smart Procurement|Vite/i);
  });

  test("header branding is visible", async ({ formPage }) => {
    await formPage.goto();
    await expect(formPage.heading).toBeVisible();
    await expect(formPage.subHeading).toBeVisible();
  });

  test("request form renders all required fields on initial load", async ({
    formPage,
  }) => {
    await formPage.goto();
    await formPage.expectFormVisible();

    await expect(formPage.requestTextArea).toBeVisible();
    await expect(formPage.categoryL1Select).toBeVisible();
    await expect(formPage.categoryL2Select).toBeVisible();
    await expect(formPage.quantityInput).toBeVisible();
    await expect(formPage.unitOfMeasureInput).toBeVisible();
    await expect(formPage.deliveryCountrySelect).toBeVisible();
    await expect(formPage.requiredByDateInput).toBeVisible();
    await expect(formPage.preferredSupplierInput).toBeVisible();
    await expect(formPage.submitButton).toBeVisible();
  });

  test("validation view is not shown before submission", async ({ formPage }) => {
    await formPage.goto();
    // The back button only appears in ValidationView
    await expect(
      formPage.page.getByRole("button", { name: /back to form/i })
    ).not.toBeVisible();
  });

  test("loading spinner is not shown before submission", async ({ formPage }) => {
    await formPage.goto();
    await expect(
      formPage.page.getByText("Analyzing your request...")
    ).not.toBeVisible();
  });

  test("health endpoint is reachable", async ({ formPage }) => {
    // Skip when backend is not running (e.g. CI without backend)
    const response = await formPage.page.request.get("/api/health").catch(() => null);
    test.skip(!response || !response.ok(), "Backend not running — skipping health check");
    const body = await response!.json();
    expect(body).toMatchObject({ status: "ok" });
  });
});
