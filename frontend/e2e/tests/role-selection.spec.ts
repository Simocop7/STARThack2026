/**
 * Role Selection tests.
 *
 * Verifies that:
 *   - The role selection screen is shown on initial load
 *   - Both Employee and Procurement Office cards are visible
 *   - Clicking Employee navigates to the Employee portal
 *   - Clicking Procurement Office navigates to the Procurement portal
 *   - The sidebar "Switch Role" button returns to role selection
 */
import { test, expect } from "../fixtures/test-fixtures";

test.describe("Role Selection", () => {
  test("role selection screen is shown on initial load", async ({
    roleSelectionPage,
  }) => {
    await roleSelectionPage.goto();
    await expect(roleSelectionPage.heading).toBeVisible();
    await expect(roleSelectionPage.subHeading).toBeVisible();
  });

  test("Employee card and Procurement Office card are both visible", async ({
    roleSelectionPage,
  }) => {
    await roleSelectionPage.goto();
    await expect(roleSelectionPage.employeeCard).toBeVisible();
    await expect(roleSelectionPage.procurementCard).toBeVisible();
  });

  test("clicking Employee navigates to the Employee portal", async ({
    roleSelectionPage,
  }) => {
    await roleSelectionPage.goto();
    await roleSelectionPage.selectEmployee();
    // Employee portal header identifies itself
    await expect(
      roleSelectionPage.page.getByText("Employee Portal")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("clicking Procurement Office navigates to the Procurement portal", async ({
    roleSelectionPage,
  }) => {
    await roleSelectionPage.goto();
    await roleSelectionPage.selectProcurement();
    // Procurement portal shows the Incoming Requests inbox
    await expect(
      roleSelectionPage.page.getByText("Incoming Requests")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("sidebar Switch Role button returns to role selection", async ({
    roleSelectionPage,
  }) => {
    await roleSelectionPage.goto();
    await roleSelectionPage.selectEmployee();
    await expect(
      roleSelectionPage.page.getByText("Employee Portal")
    ).toBeVisible({ timeout: 5_000 });

    // The AppShell sidebar has a "Switch Role" button
    await roleSelectionPage.page
      .getByRole("button", { name: /Switch Role/i })
      .click();

    // Should return to role selection
    await expect(roleSelectionPage.heading).toBeVisible({ timeout: 5_000 });
    await expect(roleSelectionPage.subHeading).toBeVisible();
  });

  test("Employee card label and CTA are visible", async ({
    roleSelectionPage,
  }) => {
    await roleSelectionPage.goto();
    await expect(
      roleSelectionPage.page.getByText("Submit a request")
    ).toBeVisible();
  });

  test("Procurement Office card label and CTA are visible", async ({
    roleSelectionPage,
  }) => {
    await roleSelectionPage.goto();
    await expect(
      roleSelectionPage.page.getByText("Open office dashboard")
    ).toBeVisible();
  });
});
