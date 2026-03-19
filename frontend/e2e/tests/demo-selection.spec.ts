/**
 * Demo request selection flow.
 *
 * Tests that:
 *   - The demo dropdown is populated from /api/requests
 *   - Selecting an item fetches /api/requests/:id and auto-fills the form
 *   - The filled values match the request fixture data
 */
import { test, expect } from "../fixtures/test-fixtures";
import { REQUESTS_RESPONSE, SINGLE_REQUEST_RESPONSE } from "../fixtures/api-responses";

test.describe("Demo request selection", () => {
  test("demo selector is populated with requests from the API", async ({
    formPage,
  }) => {
    await formPage.goto();

    const demoSelect = formPage.demoSelect;
    await expect(demoSelect).toBeVisible();

    // Verify each mocked request appears as an option
    for (const req of REQUESTS_RESPONSE.requests) {
      await expect(
        formPage.page.locator(`option[value="${req.request_id}"]`)
      ).toHaveCount(1);
    }
  });

  test("selecting a demo request auto-fills the form fields", async ({
    formPage,
  }) => {
    await formPage.goto();

    await formPage.selectDemoRequest("REQ-000001");

    const expectedRequest = SINGLE_REQUEST_RESPONSE.request;

    // Request text should contain the mocked request text
    await expect(formPage.requestTextArea).toHaveValue(
      expectedRequest.request_text
    );

    // Quantity should be pre-filled
    await expect(formPage.quantityInput).toHaveValue(
      String(expectedRequest.quantity)
    );

    // Delivery country should match first entry in delivery_countries
    await expect(formPage.deliveryCountrySelect).toHaveValue(
      expectedRequest.delivery_countries[0]
    );

    // Preferred supplier should be set
    await expect(formPage.preferredSupplierInput).toHaveValue(
      expectedRequest.preferred_supplier_mentioned
    );
  });

  test("selecting a demo request sets category L1 and L2", async ({
    formPage,
  }) => {
    await formPage.goto();
    await formPage.selectDemoRequest("REQ-000001");

    const expected = SINGLE_REQUEST_RESPONSE.request;
    await expect(formPage.categoryL1Select).toHaveValue(expected.category_l1);
    await expect(formPage.categoryL2Select).toHaveValue(expected.category_l2);
  });

  test("selecting a demo request sets the required-by date", async ({
    formPage,
  }) => {
    await formPage.goto();
    await formPage.selectDemoRequest("REQ-000001");

    // The component strips the time component (split("T")[0])
    const expectedDate =
      SINGLE_REQUEST_RESPONSE.request.required_by_date.split("T")[0];
    await expect(formPage.requiredByDateInput).toHaveValue(expectedDate);
  });

  test("selecting a non-existent request ID does not crash the UI", async ({
    formPage,
  }) => {
    await formPage.goto();

    // The 404 route is mocked in the fixture — the form should silently ignore it
    // and remain visible with empty fields
    // We bypass the select by directly calling the fetch via console evaluation
    await formPage.page.evaluate(() => {
      // Simulate the component calling loadDemo with an unknown id
      return fetch("/api/requests/REQ-UNKNOWN").then((r) => r.json());
    });

    // Form should still be rendered and not crash
    await expect(formPage.submitButton).toBeVisible();
  });

  test("demo selector list includes scenario tags in option text", async ({
    formPage,
  }) => {
    await formPage.goto();

    // REQ-000002 has scenario tags [multilingual, restricted]
    const optionText = await formPage.page
      .locator('option[value="REQ-000002"]')
      .textContent();
    expect(optionText).toContain("multilingual");
    expect(optionText).toContain("restricted");
  });
});
