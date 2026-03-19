import { test as base, type Page } from "@playwright/test";
import { RequestFormPage } from "../pages/RequestFormPage";
import { ValidationViewPage } from "../pages/ValidationViewPage";
import {
  CATEGORIES_RESPONSE,
  REQUESTS_RESPONSE,
  SINGLE_REQUEST_RESPONSE,
  VALID_VALIDATION_RESULT,
} from "./api-responses";

/**
 * Extended test fixture that:
 *   - Provides typed POM instances (formPage, validationPage)
 *   - Pre-mocks the lightweight read-only API endpoints (/api/categories,
 *     /api/requests, /api/requests/:id, /api/health) for every test
 *   - Leaves /api/validate un-mocked so individual tests can control it
 */

type SmartProcurementFixtures = {
  formPage: RequestFormPage;
  validationPage: ValidationViewPage;
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
});

export { expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mock all non-LLM endpoints so tests run without a running FastAPI backend. */
async function mockReadOnlyEndpoints(page: Page): Promise<void> {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { status: "ok" } })
  );

  await page.route("**/api/categories", (route) =>
    route.fulfill({ json: CATEGORIES_RESPONSE })
  );

  await page.route("**/api/requests", (route) =>
    route.fulfill({ json: REQUESTS_RESPONSE })
  );

  // Match /api/requests/:id — only the first demo request is fully mocked
  await page.route("**/api/requests/**", (route) => {
    const url = route.request().url();
    const id = url.split("/api/requests/")[1];
    if (id === "REQ-000001") {
      return route.fulfill({ json: SINGLE_REQUEST_RESPONSE });
    }
    return route.fulfill({ status: 404, json: { detail: "Request not found" } });
  });
}

/**
 * Mock /api/validate with the provided payload, then navigate to "/"
 * and submit the form with default valid data.
 *
 * Returns the formPage and validationPage POMs ready for assertions.
 */
export async function submitFormWithMockedResult(
  page: Page,
  validationResult: unknown
): Promise<{ formPage: RequestFormPage; validationPage: ValidationViewPage }> {
  await mockReadOnlyEndpoints(page);

  await page.route("**/api/validate", (route) =>
    route.fulfill({ json: validationResult })
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
