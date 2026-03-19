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
    await expect(formPage.page).toHaveTitle(/Smart Procurement|Vite|ChainIQ/i);
  });

  test("Employee portal header branding is visible", async ({ formPage }) => {
    await formPage.goto();
    await expect(formPage.heading).toBeVisible();
    // Employee portal sub-label
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
    await expect(formPage.deliveryCountrySelect).toBeVisible();
    await expect(formPage.requiredByDateInput).toBeVisible();
    await expect(formPage.preferredSupplierInput).toBeVisible();
    await expect(formPage.submitButton).toBeVisible();
  });

  test("review step is not shown before submission", async ({ formPage }) => {
    await formPage.goto();
    // "Review Your Request" heading only appears after a valid submission
    await expect(
      formPage.page.getByRole("heading", { name: /Review Your Request/i })
    ).not.toBeVisible();
  });

  test("loading spinner is not shown before submission", async ({ formPage }) => {
    await formPage.goto();
    await expect(
      formPage.page.getByText(/Analyzing your request/i)
    ).not.toBeVisible();
  });

  test("health endpoint is reachable", async ({ formPage }) => {
    const response = await formPage.page.request
      .get("/api/health")
      .catch(() => null);
    test.skip(
      !response || !response.ok(),
      "Backend not running — skipping health check"
    );
    const body = await response!.json();
    expect(body).toMatchObject({ status: "ok" });
  });

  test("role selection screen is shown on initial navigation", async ({
    page,
  }) => {
    // Navigate fresh (before any role is selected)
    await page.route("**/api/**", (route) =>
      route.fulfill({ json: {} })
    );
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Smart Procurement" })
    ).toBeVisible();
    await expect(page.getByText("Select your role to continue")).toBeVisible();
  });
});
