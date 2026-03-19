import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Page Object Model for the validation/result screens.
 *
 * NOTE: The app now has two paths depending on the portal:
 *
 * Employee portal:
 *   - Invalid: ValidationBanner is shown inline above the form.
 *     The banner contains an h2 with the issue count ("N issues to resolve").
 *     There is no separate "back" button; the form is still visible.
 *   - Valid: Transitions to EmployeeReviewStep with "Review Your Request"
 *     heading and "Confirm & Submit Request" button.
 *
 * Procurement portal:
 *   - Invalid: ValidationBanner inline above form (same as Employee).
 *   - Valid: Directly fetches supplier ranking and shows SupplierRankingView.
 *
 * This POM targets the Employee portal paths by default; individual
 * locators are resilient enough to work for both portals.
 */
export class ValidationViewPage {
  readonly page: Page;

  // ── Employee review step ──────────────────────────────────────────
  /** "Review Your Request" heading shown on EmployeeReviewStep. */
  readonly reviewHeading: Locator;
  /** "Confirm & Submit Request" button on EmployeeReviewStep. */
  readonly confirmSubmitButton: Locator;
  /** "Edit Request" button on EmployeeReviewStep. */
  readonly editButton: Locator;

  // ── Validation banner (invalid result) ────────────────────────────
  /** The red banner h2 e.g. "2 issues to resolve". */
  readonly statusBanner: Locator;

  // ── Legacy / compatibility aliases (for older tests) ──────────────
  /** Back button — not present in the new Employee portal; kept as stub. */
  readonly backButton: Locator;

  /** Confirm Request button — alias for confirmSubmitButton. */
  readonly confirmButton: Locator;

  /**
   * "Accept All Fixes" button — shown when all_ok_message is set on
   * invalid results. Not present in the new Employee portal by default.
   */
  readonly acceptAllFixesButton: Locator;

  // ── Expandable JSON panels (Procurement portal / ValidationView) ──
  readonly enrichedJsonToggle: Locator;
  readonly enrichedJsonPre: Locator;
  readonly correctedJsonToggle: Locator;
  readonly correctedJsonPre: Locator;

  constructor(page: Page) {
    this.page = page;

    this.reviewHeading = page.getByRole("heading", {
      name: /Review Your Request/i,
    });
    this.confirmSubmitButton = page.getByRole("button", {
      name: /Confirm.*Submit/i,
    });
    this.editButton = page.getByRole("button", { name: /Edit Request/i });

    // The validation banner h2 (e.g. "2 issues to resolve")
    this.statusBanner = page.locator("h2").filter({ hasText: /issue/i }).first();

    // Legacy stubs — kept for backward-compatible tests
    this.backButton = page.getByRole("button", { name: /back to form/i });
    this.confirmButton = page.getByRole("button", {
      name: /Confirm.*Submit|Confirm Request/i,
    });
    this.acceptAllFixesButton = page.getByRole("button", {
      name: /Accept All Fixes/i,
    });

    this.enrichedJsonToggle = page.getByRole("button", {
      name: /Enriched Request JSON/i,
    });
    this.enrichedJsonPre = page.locator("pre").first();
    this.correctedJsonToggle = page.getByRole("button", {
      name: /Corrected Request JSON/i,
    });
    this.correctedJsonPre = page.locator("pre").nth(1);
  }

  /**
   * Wait for the Employee Review Step to be fully rendered.
   * Use after a valid validation in the Employee portal.
   */
  async waitForReviewStep(): Promise<void> {
    await this.reviewHeading.waitFor({ state: "visible", timeout: 15_000 });
  }

  /**
   * Legacy compat: wait for something that signals the result view is up.
   * Tries review heading first, then falls back to the status banner.
   */
  async waitForView(): Promise<void> {
    await Promise.race([
      this.reviewHeading.waitFor({ state: "visible", timeout: 15_000 }),
      this.statusBanner.waitFor({ state: "visible", timeout: 15_000 }),
    ]);
  }

  /** Assert the status banner shows an invalid result with the expected issue count. */
  async expectInvalid(blockingCount: number): Promise<void> {
    const label = blockingCount === 1 ? "issue" : "issues";
    await expect(this.statusBanner).toContainText(`${blockingCount} ${label}`);
  }

  /** Get all rendered IssueCard elements. */
  issueCells(): Locator {
    return this.page.locator("div[class*='rounded-lg border']");
  }

  /** Get the severity badge locator inside the nth IssueCard (0-based). */
  severityBadge(index: number): Locator {
    return this.issueCells()
      .nth(index)
      .locator("span[class*='rounded-full']")
      .first();
  }

  /** Expand the Enriched Request JSON panel and return its text. */
  async expandEnrichedJson(): Promise<string> {
    await this.enrichedJsonToggle.click();
    await expect(this.enrichedJsonPre).toBeVisible();
    return this.enrichedJsonPre.textContent() ?? "";
  }

  /** Expand the Corrected Request JSON panel and return its text. */
  async expandCorrectedJson(): Promise<string> {
    await this.correctedJsonToggle.click();
    await expect(this.correctedJsonPre).toBeVisible();
    return this.correctedJsonPre.textContent() ?? "";
  }

  /** Click "Edit Request" to return to the form from the review step. */
  async goBack(): Promise<void> {
    // Try the review step "Edit" button first, fall back to legacy "Back to form"
    const editVisible = await this.editButton.isVisible().catch(() => false);
    if (editVisible) {
      await this.editButton.click();
    } else {
      await this.backButton.click();
    }
  }
}
