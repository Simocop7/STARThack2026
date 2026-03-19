import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Page Object Model for ValidationView.
 *
 * All locators target the rendered DOM produced by ValidationView.tsx and
 * IssueCard.tsx. Selectors use accessible roles and visible text so that
 * minor CSS class changes do not break tests.
 */
export class ValidationViewPage {
  readonly page: Page;

  // Navigation
  readonly backButton: Locator;

  // Status banner
  readonly statusBanner: Locator;

  // Issue section headers
  readonly issuesSectionHeading: Locator;

  // Expandable JSON panels
  readonly enrichedJsonToggle: Locator;
  readonly enrichedJsonPre: Locator;
  readonly correctedJsonToggle: Locator;
  readonly correctedJsonPre: Locator;

  // Action buttons
  readonly confirmButton: Locator;
  readonly acceptAllFixesButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.backButton = page.getByRole("button", { name: /back to form/i });

    this.statusBanner = page.locator("h2").first();

    this.issuesSectionHeading = page.getByText(/Details & Suggested Fixes/i).or(
      page.getByText(/Validation Issues/i)
    );

    this.enrichedJsonToggle = page.getByRole("button", {
      name: /Enriched Request JSON/i,
    });
    this.enrichedJsonPre = page.locator("pre").first();

    this.correctedJsonToggle = page.getByRole("button", {
      name: /Corrected Request JSON/i,
    });
    this.correctedJsonPre = page.locator("pre").nth(1);

    this.confirmButton = page.getByRole("button", { name: /Confirm Request/i });
    this.acceptAllFixesButton = page.getByRole("button", {
      name: /Accept All Fixes/i,
    });
  }

  /** Wait for the ValidationView to be fully rendered. */
  async waitForView(): Promise<void> {
    await this.backButton.waitFor({ state: "visible", timeout: 15_000 });
  }

  /** Assert the status banner shows a valid result. */
  async expectValid(): Promise<void> {
    await expect(this.statusBanner).toHaveText(/Request validated/i);
    await expect(
      this.page.locator("div").filter({ has: this.statusBanner }).first()
    ).toHaveClass(/green/);
  }

  /** Assert the status banner shows an invalid result with the expected issue count. */
  async expectInvalid(blockingCount: number): Promise<void> {
    const label = blockingCount === 1 ? "issue" : "issues";
    await expect(this.statusBanner).toContainText(`${blockingCount} ${label}`);
  }

  /** Get all rendered IssueCard elements. */
  issueCells(): Locator {
    // Each IssueCard renders a div with a severity badge <span> inside
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

  /** Click the back button to return to the form. */
  async goBack(): Promise<void> {
    await this.backButton.click();
  }
}
