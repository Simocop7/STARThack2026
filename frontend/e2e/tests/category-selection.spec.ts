/**
 * Category L1/L2 selection behaviour.
 *
 * The CategoryL2 select should:
 *   - Be empty (only the placeholder) until L1 is chosen
 *   - Populate with the correct sub-categories after L1 is selected
 *   - Reset when L1 changes
 */
import { test, expect } from "../fixtures/test-fixtures";
import { CATEGORIES_RESPONSE } from "../fixtures/api-responses";

test.describe("Category selection", () => {
  test("L2 select has only placeholder before L1 is chosen", async ({
    formPage,
  }) => {
    await formPage.goto();

    // Only the empty placeholder option should be present initially
    const l2Options = await formPage.categoryL2Select.locator("option").all();
    expect(l2Options).toHaveLength(1);
    const first = await l2Options[0].textContent();
    expect(first?.trim()).toBe("Select...");
  });

  test("selecting L1 'IT' populates L2 with IT sub-categories", async ({
    formPage,
  }) => {
    await formPage.goto();

    await formPage.categoryL1Select.selectOption("IT");

    const expectedL2 = CATEGORIES_RESPONSE.categories["IT"];

    for (const subCat of expectedL2) {
      await expect(
        formPage.categoryL2Select.locator(`option[value="${subCat}"]`)
      ).toHaveCount(1);
    }
  });

  test("selecting L1 'Marketing' populates L2 with Marketing sub-categories", async ({
    formPage,
  }) => {
    await formPage.goto();

    await formPage.categoryL1Select.selectOption("Marketing");

    const expectedL2 = CATEGORIES_RESPONSE.categories["Marketing"];
    for (const subCat of expectedL2) {
      await expect(
        formPage.categoryL2Select.locator(`option[value="${subCat}"]`)
      ).toHaveCount(1);
    }
  });

  test("changing L1 resets the L2 selection", async ({ formPage }) => {
    await formPage.goto();

    // Choose IT → select Laptops
    await formPage.categoryL1Select.selectOption("IT");
    await formPage.categoryL2Select.selectOption("Laptops");
    await expect(formPage.categoryL2Select).toHaveValue("Laptops");

    // Switch to Marketing — L2 should reset
    await formPage.categoryL1Select.selectOption("Marketing");
    await expect(formPage.categoryL2Select).toHaveValue("");
  });

  test("L2 options do not include L1 values from other categories", async ({
    formPage,
  }) => {
    await formPage.goto();

    await formPage.categoryL1Select.selectOption("Facilities");

    // IT-specific options should not appear
    await expect(
      formPage.categoryL2Select.locator('option[value="Laptops"]')
    ).toHaveCount(0);
    await expect(
      formPage.categoryL2Select.locator('option[value="Cloud Compute"]')
    ).toHaveCount(0);
  });

  test("all four L1 categories are available in the select", async ({
    formPage,
  }) => {
    await formPage.goto();

    const expectedL1 = Object.keys(CATEGORIES_RESPONSE.categories);
    for (const cat of expectedL1) {
      await expect(
        formPage.categoryL1Select.locator(`option[value="${cat}"]`)
      ).toHaveCount(1);
    }
  });
});
