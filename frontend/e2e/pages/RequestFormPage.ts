import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Page Object Model for RequestForm.
 *
 * The form is reached via RoleSelection → Employee portal.
 * goto() navigates to "/" and automatically clicks the Employee card.
 *
 * Selector strategy (in priority order):
 *   1. data-testid attributes (add to components once available)
 *   2. Accessible role + label queries
 *   3. Placeholder text as last resort
 *
 * Current form field mapping (from the running RequestForm.tsx):
 *   - request_text   → textarea placeholder "Describe your procurement need..."
 *   - category_l1    → select labeled "Category L1 (optional)"
 *   - category_l2    → select labeled "Category L2 (optional)"
 *   - quantity       → input[type="number"]
 *   - unit_of_measure → text input, placeholder '"unit" if none needed…'
 *   - delivery_country → select labeled "Delivery Country *", options are 2-letter codes
 *   - required_by_date → input[type="date"]
 *   - preferred_supplier → text input, placeholder "e.g. Dell, Accenture..."
 */
export class RequestFormPage {
  readonly page: Page;

  // Header (portal header bar)
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
  /** Delivery country select (2-letter country code options). */
  readonly deliveryCountrySelect: Locator;
  readonly requiredByDateInput: Locator;
  readonly preferredSupplierInput: Locator;

  // Submit
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page
      .getByRole("heading", { name: "Smart Procurement" })
      .first();
    // The Employee portal sub-label (distinct from role selection heading)
    this.subHeading = page.getByText("Employee Portal");

    this.demoSelect = page
      .locator("select")
      .filter({ hasText: /Select a request|Select.*request/i });

    this.requestTextArea = page.getByPlaceholder(
      "Describe your procurement need..."
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
      /"unit" if none needed/
    );
    // Delivery country is a <select> with 2-letter codes (DE, FR, CH, etc.)
    this.deliveryCountrySelect = page
      .locator("label")
      .filter({ hasText: /Delivery Country/i })
      .locator("~ select, + select");
    this.requiredByDateInput = page.locator('input[type="date"]');
    this.preferredSupplierInput = page.getByPlaceholder(
      "e.g. Dell, Accenture..."
    );
    this.submitButton = page.getByRole("button", { name: "Validate Request" });
  }

  /**
   * Navigate to "/" → wait for role selection → click Employee → wait for portal.
   */
  async goto(): Promise<void> {
    await this.page.goto("/");
    await this.page.waitForSelector("text=Select your role to continue", {
      state: "visible",
    });
    await this.page
      .getByRole("button", { name: /Employee/i })
      .first()
      .click();
    // Wait for the Employee Portal label (distinct from role selection heading)
    await this.subHeading.waitFor({ state: "visible", timeout: 10_000 });
  }

  /**
   * Fill the request form.
   *
   * deliveryCountry: 2-letter ISO code (DE, CH, FR, US…)
   * deliveryAddress: legacy alias — both map to the delivery_country select
   *
   * If neither is provided the field is left at its default empty state.
   */
  async fillForm(opts: {
    requestText: string;
    categoryL1?: string;
    categoryL2?: string;
    quantity: number;
    unitOfMeasure?: string;
    deliveryCountry?: string;
    /** Legacy alias for deliveryCountry. */
    deliveryAddress?: string;
    requiredByDate: string;
    preferredSupplier?: string;
  }): Promise<void> {
    await this.requestTextArea.fill(opts.requestText);
    if (opts.categoryL1) {
      await this.categoryL1Select.selectOption(opts.categoryL1);
      if (opts.categoryL2) {
        await this.categoryL2Select.selectOption(opts.categoryL2);
      }
    }
    await this.quantityInput.fill(String(opts.quantity));
    if (opts.unitOfMeasure) {
      await this.unitOfMeasureInput.fill(opts.unitOfMeasure);
    }
    // Accept either deliveryCountry or the legacy deliveryAddress alias
    const country =
      opts.deliveryCountry ??
      // If deliveryAddress is a 2-letter code use it directly, otherwise ignore
      (opts.deliveryAddress && opts.deliveryAddress.length === 2
        ? opts.deliveryAddress.toUpperCase()
        : undefined);
    if (country) {
      await this.deliveryCountrySelect.selectOption(country);
    }
    await this.requiredByDateInput.fill(opts.requiredByDate);
    if (opts.preferredSupplier) {
      await this.preferredSupplierInput.fill(opts.preferredSupplier);
    }
  }

  /** Select a demo request by request_id and wait for the form to populate. */
  async selectDemoRequest(requestId: string): Promise<void> {
    await this.demoSelect.selectOption(requestId);
    await expect(this.requestTextArea).not.toHaveValue("", { timeout: 5_000 });
  }

  /** Click the submit button. */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /** Assert all required form elements are visible. */
  async expectFormVisible(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.requestTextArea).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }
}
