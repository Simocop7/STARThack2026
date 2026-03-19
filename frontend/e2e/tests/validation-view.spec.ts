/**
 * ValidationView rendering tests.
 *
 * Exercises every section of the results screen: status banner, IssueCards
 * with severity badges, expandable JSON panels, confirm/accept-fixes buttons,
 * and the fallback raw-issues path (when user_message is null).
 */
import { test, expect } from "../fixtures/test-fixtures";
import {
  VALID_VALIDATION_RESULT,
  INVALID_VALIDATION_RESULT,
  VALIDATION_RESULT_NO_LLM_MESSAGE,
} from "../fixtures/api-responses";
import {
  submitFormWithMockedResult,
  submitValidForm,
} from "../fixtures/test-fixtures";

test.describe("ValidationView — valid result", () => {
  test("Confirm Request button is shown for valid results", async ({ page }) => {
    const { validationPage } = await submitValidForm(page);
    await expect(validationPage.confirmButton).toBeVisible();
  });

  test("Accept All Fixes button is NOT shown for valid results", async ({
    page,
  }) => {
    const { validationPage } = await submitValidForm(page);
    await expect(validationPage.acceptAllFixesButton).not.toBeVisible();
  });

  test("user_message summary is displayed in the status banner", async ({
    page,
  }) => {
    const { validationPage } = await submitValidForm(page);
    const expectedSummary =
      VALID_VALIDATION_RESULT.user_message!.summary;
    await expect(validationPage.page.getByText(expectedSummary)).toBeVisible();
  });

  test("IssueCards are rendered for each issue", async ({ page }) => {
    const { validationPage } = await submitValidForm(page);
    const issueCount = VALID_VALIDATION_RESULT.user_message!.issues.length;
    await expect(validationPage.issueCells()).toHaveCount(issueCount);
  });
});

test.describe("ValidationView — invalid result", () => {
  test("Confirm Request button is NOT shown for invalid results", async ({
    page,
  }) => {
    const { validationPage } = await submitFormWithMockedResult(
      page,
      INVALID_VALIDATION_RESULT
    );
    await expect(validationPage.confirmButton).not.toBeVisible();
  });

  test("Accept All Fixes button is shown when all_ok_message is set", async ({
    page,
  }) => {
    const { validationPage } = await submitFormWithMockedResult(
      page,
      INVALID_VALIDATION_RESULT
    );
    await expect(validationPage.acceptAllFixesButton).toBeVisible();
  });

  test("critical severity badge is rendered with correct label", async ({
    page,
  }) => {
    const { validationPage } = await submitFormWithMockedResult(
      page,
      INVALID_VALIDATION_RESULT
    );

    // First issue in INVALID_VALIDATION_RESULT is critical
    const firstBadge = validationPage.severityBadge(0);
    await expect(firstBadge).toBeVisible();
    await expect(firstBadge).toHaveText(/CRITICAL/i);
  });

  test("issue titles are displayed", async ({ page }) => {
    const { validationPage } = await submitFormWithMockedResult(
      page,
      INVALID_VALIDATION_RESULT
    );
    for (const issue of INVALID_VALIDATION_RESULT.user_message!.issues) {
      await expect(
        validationPage.page.getByText(issue.title)
      ).toBeVisible();
    }
  });

  test("proposed fix text is displayed for each issue", async ({ page }) => {
    const { validationPage } = await submitFormWithMockedResult(
      page,
      INVALID_VALIDATION_RESULT
    );
    for (const issue of INVALID_VALIDATION_RESULT.user_message!.issues) {
      await expect(
        validationPage.page.getByText(issue.proposed_fix)
      ).toBeVisible();
    }
  });

  test("fix_field → fix_value code block is shown when both are present", async ({
    page,
  }) => {
    const { validationPage } = await submitFormWithMockedResult(
      page,
      INVALID_VALIDATION_RESULT
    );

    // First issue has fix_field: "budget_amount", fix_value: "12000"
    await expect(
      validationPage.page.locator("code").filter({ hasText: /budget_amount.*12000/i })
    ).toBeVisible();
  });
});

test.describe("ValidationView — fallback (no user_message)", () => {
  test("raw issues section is shown when user_message is null", async ({
    page,
  }) => {
    const { validationPage } = await submitFormWithMockedResult(
      page,
      VALIDATION_RESULT_NO_LLM_MESSAGE
    );

    await expect(
      validationPage.page.getByText(/Validation Issues/i)
    ).toBeVisible();
  });

  test("raw issue type is displayed", async ({ page }) => {
    const { validationPage } = await submitFormWithMockedResult(
      page,
      VALIDATION_RESULT_NO_LLM_MESSAGE
    );

    const issue = VALIDATION_RESULT_NO_LLM_MESSAGE.issues[0];
    await expect(
      validationPage.page.getByText(issue.type, { exact: false })
    ).toBeVisible();
  });
});

test.describe("ValidationView — expandable JSON panels", () => {
  test("Enriched Request JSON is hidden by default", async ({ page }) => {
    const { validationPage } = await submitValidForm(page);

    // The pre element starts with class 'hidden'
    const pre = validationPage.page.locator("pre").first();
    await expect(pre).toBeHidden();
  });

  test("clicking Enriched Request JSON toggle reveals the JSON", async ({
    page,
  }) => {
    const { validationPage } = await submitValidForm(page);
    await validationPage.enrichedJsonToggle.click();

    const pre = validationPage.page.locator("pre").first();
    await expect(pre).toBeVisible();
  });

  test("Enriched Request JSON panel contains expected keys", async ({
    page,
  }) => {
    const { validationPage } = await submitValidForm(page);
    const jsonText = await validationPage.expandEnrichedJson();
    expect(jsonText).toContain("category_l1");
    expect(jsonText).toContain("quantity");
    expect(jsonText).toContain("delivery_country");
  });

  test("Corrected Request JSON panel is not shown for valid results", async ({
    page,
  }) => {
    const { validationPage } = await submitValidForm(page);
    // corrected_request is null in VALID_VALIDATION_RESULT
    await expect(validationPage.correctedJsonToggle).not.toBeVisible();
  });

  test("Corrected Request JSON panel is shown for invalid results with corrections", async ({
    page,
  }) => {
    const { validationPage } = await submitFormWithMockedResult(
      page,
      INVALID_VALIDATION_RESULT
    );
    await expect(validationPage.correctedJsonToggle).toBeVisible();
  });

  test("clicking Corrected Request JSON toggle reveals the JSON", async ({
    page,
  }) => {
    const { validationPage } = await submitFormWithMockedResult(
      page,
      INVALID_VALIDATION_RESULT
    );
    await validationPage.correctedJsonToggle.click();
    const pre = validationPage.page.locator("pre").nth(1);
    await expect(pre).toBeVisible();
  });
});
