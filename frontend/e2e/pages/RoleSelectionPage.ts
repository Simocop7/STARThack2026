import { type Page, type Locator } from "@playwright/test";

/**
 * Page Object Model for RoleSelection.
 *
 * The app always starts here. Tests that need to reach Employee or
 * Procurement portals must call one of the helper methods on this POM
 * before interacting with the target portal.
 */
export class RoleSelectionPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly subHeading: Locator;
  readonly employeeCard: Locator;
  readonly procurementCard: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole("heading", { name: "Smart Procurement" });
    this.subHeading = page.getByText("Select your role to continue");

    this.employeeCard = page.getByRole("button", { name: /Employee/i }).first();
    this.procurementCard = page.getByRole("button", {
      name: /Procurement Office/i,
    });
  }

  async goto(): Promise<void> {
    await this.page.goto("/");
    await this.heading.waitFor({ state: "visible" });
  }

  async selectEmployee(): Promise<void> {
    await this.employeeCard.click();
  }

  async selectProcurement(): Promise<void> {
    await this.procurementCard.click();
  }
}
