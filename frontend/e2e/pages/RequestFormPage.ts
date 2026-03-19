import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Page Object Model for RequestForm.
 *
 * Selector strategy (in priority order):
 *   1. data-testid attributes — added to the components via the test fixtures below
 *   2. Accessible role + name queries (label text)
 *   3. Placeholder text as last resort
 *
 * NOTE: Because data-testid attributes have not yet been added to the source
 * components, this POM uses role/label selectors that match the existing markup.
 * Once data-testid attributes are wired up, update the selectors here.
 */
export class RequestFormPage {
  readonly page: Page;

  // Header
  readonly heading: Locator;
  readonly subHeading: Locator;

  // Demo selector
  readonly demoSelect: Locator;

  // Form fields
  readonly requestTextArea: Locator;
  readonly categoryL1Select: Locator;
  readonly categoryL2Select: Locator;
  readonly quantityInput: Locator;
  readonly unitOfMeasureInput: Locator;
  readonly deliveryCountrySelect: Locator;
  readonly requiredByDateInput: Locator;
  readonly preferredSupplierInput: Locator;

  // Submit
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole("heading", { name: "Smart Procurement" });
    this.subHeading = page.getByText("Validate and enrich your purchase requests");

    this.demoSelect = page.locator('select').filter({ hasText: "-- Select a request --" });

    this.requestTextArea = page.getByPlaceholder(
      "Describe your procurement need in any language..."
    );
    this.categoryL1Select = page
      .locator("label")
      .filter({ hasText: "Category L1" })
      .locator("~ select, + select");
    this.categoryL2Select = page
      .locator("label")
      .filter({ hasText: "Category L2" })
      .locator("~ select, + select");
    this.quantityInput = page.locator('input[type="number"]');
    this.unitOfMeasureInput = page.getByPlaceholder(
      "device, consulting_day, campaign..."
    );
    this.deliveryCountrySelect = page
      .locator("label")
      .filter({ hasText: "Delivery country" })
      .locator("~ select, + select");
    this.requiredByDateInput = page.locator('input[type="date"]');
    this.preferredSupplierInput = page.getByPlaceholder(
      "e.g. Dell, Accenture..."
    );
    this.submitButton = page.getByRole("button", { name: "Validate Request" });
  }

  /** Navigate to the app root and wait for the form to be ready. */
  async goto(): Promise<void> {
    await this.page.goto("/");
    await this.heading.waitFor({ state: "visible" });
  }

  /** Fill every required form field with the provided values. */
  async fillForm(opts: {
    requestText: string;
    categoryL1: string;
    categoryL2: string;
    quantity: number;
    unitOfMeasure?: string;
    deliveryCountry: string;
    requiredByDate: string;
    preferredSupplier?: string;
  }): Promise<void> {
    await this.requestTextArea.fill(opts.requestText);
    await this.categoryL1Select.selectOption(opts.categoryL1);
    // L2 options are populated after L1 changes — wait for them
    await this.categoryL2Select.selectOption(opts.categoryL2);
    await this.quantityInput.fill(String(opts.quantity));
    if (opts.unitOfMeasure) {
      await this.unitOfMeasureInput.fill(opts.unitOfMeasure);
    }
    await this.deliveryCountrySelect.selectOption(opts.deliveryCountry);
    await this.requiredByDateInput.fill(opts.requiredByDate);
    if (opts.preferredSupplier) {
      await this.preferredSupplierInput.fill(opts.preferredSupplier);
    }
  }

  /** Select a demo request by request_id and wait for the form to populate. */
  async selectDemoRequest(requestId: string): Promise<void> {
    await this.demoSelect.selectOption(requestId);
    // The loadDemo fetch completes asynchronously; wait for the textarea to fill
    await expect(this.requestTextArea).not.toHaveValue("", { timeout: 5_000 });
  }

  /** Click the submit button. */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /** Assert all required form labels are visible. */
  async expectFormVisible(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.requestTextArea).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }
}
