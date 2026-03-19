/**
 * Validation result rendering tests.
 *
 * Employee portal validation behaviour:
 *   - Valid result  → EmployeeReviewStep (review heading + confirm/edit buttons)
 *   - Invalid result → ValidationBanner inline above the form
 *                      (issue count h2, IssueCards with severity badges)
 *
 * Tests here cover both states using the Employee portal flow.
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

// ── Valid result — EmployeeReviewStep ─────────────────────────────────────

test.describe("Valid result — EmployeeReviewStep", () => {
  test("Review Your Request heading is shown for valid results", async ({
    page,
  }) => {
    const { validationPage } = await submitValidForm(page);
    await expect(validationPage.reviewHeading).toBeVisible();
  });

  test("Confirm & Submit button is visible on valid result", async ({
    page,
  }) => {
    const { validationPage } = await submitValidForm(page);
    await expect(validationPage.confirmSubmitButton).toBeVisible();
  });

  test("Edit Request button is visible on valid result", async ({ page }) => {
    const { validationPage } = await submitValidForm(page);
    await expect(validationPage.editButton).toBeVisible();
  });

  test("form fields are hidden while review step is shown", async ({
    page,
  }) => {
    const { formPage } = await submitValidForm(page);
    await expect(formPage.requestTextArea).not.toBeVisible();
    await expect(formPage.submitButton).not.toBeVisible();
  });

  test("Edit Request returns user to the form", async ({ page }) => {
    const { validationPage, formPage } = await submitValidForm(page);
    await validationPage.editButton.click();
    await expect(formPage.requestTextArea).toBeVisible();
    await expect(formPage.submitButton).toBeVisible();
  });
});

// ── Invalid result — ValidationBanner ────────────────────────────────────

test.describe("Invalid result — ValidationBanner", () => {
  test("issue count banner is shown for invalid results", async ({ page }) => {
    const { validationPage } = await submitFormWithMockedResult(
      page,
      INVALID_VALIDATION_RESULT
    );
    await validationPage.expectInvalid(2);
  });

  test("form is still visible after invalid result", async ({ page }) => {
    const { formPage } = await submitFormWithMockedResult(
      page,
      INVALID_VALIDATION_RESULT
    );
    await expect(formPage.requestTextArea).toBeVisible();
    await expect(formPage.submitButton).toBeVisible();
  });

  test("issue titles from LLM user_message are displayed", async ({ page }) => {
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

  test("user_message summary is displayed in the banner", async ({ page }) => {
    const { validationPage } = await submitFormWithMockedResult(
      page,
      INVALID_VALIDATION_RESULT
    );
    const expectedSummary = INVALID_VALIDATION_RESULT.user_message!.summary;
    await expect(
      validationPage.page.getByText(expectedSummary)
    ).toBeVisible();
  });
});

// ── Fallback (no user_message) ─────────────────────────────────────────────

test.describe("Fallback — no user_message", () => {
  test("raw issue type is displayed when user_message is null", async ({
    page,
  }) => {
    const { validationPage } = await submitFormWithMockedResult(
      page,
      VALIDATION_RESULT_NO_LLM_MESSAGE
    );

    const issue = VALIDATION_RESULT_NO_LLM_MESSAGE.issues[0];
    await expect(
      validationPage.page.getByText(issue.type, { exact: false })
    ).toBeVisible();
  });

  test("issue count banner is still shown without user_message", async ({
    page,
  }) => {
    const { validationPage } = await submitFormWithMockedResult(
      page,
      VALIDATION_RESULT_NO_LLM_MESSAGE
    );
    // 1 high-severity issue → "1 issue to resolve"
    await validationPage.expectInvalid(1);
  });
});
