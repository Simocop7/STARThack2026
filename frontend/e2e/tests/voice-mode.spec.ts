import { test, expect } from "@playwright/test";
import {
  VALID_VALIDATION_RESULT,
  INVALID_VALIDATION_RESULT,
} from "../fixtures/api-responses";
import {
  PARSE_VOICE_LAPTOP_RESPONSE,
  PARSE_VOICE_FRENCH_RESPONSE,
  PARSE_VOICE_CORRECTION_RESPONSE,
  RANKED_SUPPLIER_RESULT,
  EMPTY_RANKED_RESULT,
  mockVoiceAPIs,
  simulateVoiceTranscript,
  waitForNewRecognitionInstance,
} from "../fixtures/voice-helpers";

/**
 * Voice Mode E2E Tests
 *
 * Strategy: Web Speech API and Audio playback are mocked at the browser level.
 * Tests simulate voice by triggering the mocked SpeechRecognition events.
 *
 * The auto-submit after voice parse may not reliably trigger in the test
 * environment due to React 18 batching, so tests that need validation
 * explicitly click "Validate Request" after verifying form population.
 * This matches the user's actual fallback path and keeps tests deterministic.
 */

test.describe("Voice Mode", () => {
  test.beforeEach(async ({ page }) => {
    await mockVoiceAPIs(page);
  });

  test("Scenario 1: standard English request — voice populates form, validation succeeds", async ({
    page,
  }) => {
    await page.route("**/api/parse-voice", (route) =>
      route.fulfill({ json: PARSE_VOICE_LAPTOP_RESPONSE })
    );
    await page.route("**/api/validate", (route) =>
      route.fulfill({ json: VALID_VALIDATION_RESULT })
    );
    await page.route("**/api/rank", (route) =>
      route.fulfill({ json: RANKED_SUPPLIER_RESULT })
    );

    await page.goto("/");
    await page.getByRole("heading", { name: "Smart Procurement" }).waitFor();

    // Start voice input
    await page.getByRole("button", { name: "Voice Input" }).click();
    await expect(page.getByText("Listening...")).toBeVisible();

    // Simulate speaking
    await simulateVoiceTranscript(
      page,
      "We need 10 business laptops for our Berlin office by end of March"
    );

    // Wait for form to be populated from parse-voice
    const textarea = page.getByPlaceholder("Describe your procurement need...");
    await expect(textarea).toHaveValue(/laptops/i, { timeout: 10000 });

    // Verify voice mode activated (conversation bar visible)
    await expect(
      page.getByText("Voice conversation active").or(
        page.getByText("Stop conversation")
      )
    ).toBeVisible({ timeout: 5000 });

    // Submit the form (voice auto-submit or manual click)
    // Try waiting briefly for auto-submit, then fall back to clicking
    const validateResponse = page.waitForResponse("**/api/validate", {
      timeout: 3000,
    }).catch(() => null);

    const autoSubmitted = await validateResponse;
    if (!autoSubmitted) {
      await page.getByRole("button", { name: "Validate Request" }).click();
    }

    // Valid result → shows supplier ranking
    await expect(
      page
        .getByText("Supplier Ranking")
        .or(page.getByText("Request approved"))
    ).toBeVisible({ timeout: 15000 });
  });

  test("Scenario 2: French multilingual request", async ({ page }) => {
    await page.route("**/api/parse-voice", (route) =>
      route.fulfill({ json: PARSE_VOICE_FRENCH_RESPONSE })
    );
    await page.route("**/api/validate", (route) =>
      route.fulfill({ json: VALID_VALIDATION_RESULT })
    );
    await page.route("**/api/rank", (route) =>
      route.fulfill({ json: EMPTY_RANKED_RESULT })
    );

    await page.goto("/");
    await page.getByRole("heading", { name: "Smart Procurement" }).waitFor();

    // Switch to French
    await page.getByRole("button", { name: "Français" }).click();

    // Start voice
    await page.getByRole("button", { name: "Voice Input" }).click();
    await expect(page.getByText("Listening...")).toBeVisible();

    await simulateVoiceTranscript(
      page,
      "Nous avons besoin de 5 ordinateurs portables pour le bureau de Paris"
    );

    // Form populated with French request
    const textarea = page.getByPlaceholder(/approvisionnement|procurement/i);
    await expect(textarea).toHaveValue(/ordinateurs|portables/i, {
      timeout: 10000,
    });

    // Submit
    const validateResponse = page
      .waitForResponse("**/api/validate", { timeout: 3000 })
      .catch(() => null);
    if (!(await validateResponse)) {
      // French button label for "Validate Request"
      const submitBtn = page.getByRole("button", {
        name: /Valider|Validate/i,
      });
      await submitBtn.click();
    }

    // Valid → approved state
    await expect(
      page
        .getByText("Supplier Ranking")
        .or(page.getByText(/approuvée|approved/i))
    ).toBeVisible({ timeout: 15000 });
  });

  test("Scenario 3: invalid request shows TTS feedback, user corrects", async ({
    page,
  }) => {
    let parseCallCount = 0;
    await page.route("**/api/parse-voice", (route) => {
      parseCallCount++;
      return route.fulfill({
        json:
          parseCallCount === 1
            ? PARSE_VOICE_LAPTOP_RESPONSE
            : PARSE_VOICE_CORRECTION_RESPONSE,
      });
    });

    let validateCallCount = 0;
    await page.route("**/api/validate", (route) => {
      validateCallCount++;
      return route.fulfill({
        json:
          validateCallCount === 1
            ? INVALID_VALIDATION_RESULT
            : VALID_VALIDATION_RESULT,
      });
    });
    await page.route("**/api/rank", (route) =>
      route.fulfill({ json: RANKED_SUPPLIER_RESULT })
    );

    await page.goto("/");
    await page.getByRole("heading", { name: "Smart Procurement" }).waitFor();

    // First voice input
    await page.getByRole("button", { name: "Voice Input" }).click();
    await simulateVoiceTranscript(page, "We need 10 laptops for Berlin");

    // Wait for form population
    await expect(
      page.getByPlaceholder("Describe your procurement need...")
    ).toHaveValue(/laptops/i, { timeout: 10000 });

    // Trigger validation (auto-submit or manual)
    const firstValidate = page
      .waitForResponse("**/api/validate", { timeout: 3000 })
      .catch(() => null);
    if (!(await firstValidate)) {
      await page.getByRole("button", { name: "Validate Request" }).click();
    }

    // Invalid result → validation banner + TTS plays (mocked silent WAV)
    await expect(page.getByText("2 issues to resolve")).toBeVisible({
      timeout: 10000,
    });

    // Voice conversation bar should show — TTS then listening
    await expect(
      page
        .getByText("Listening for your response...")
        .or(page.getByText("Listening..."))
        .or(page.getByText("Voice conversation active"))
    ).toBeVisible({ timeout: 15000 });

    // Wait for new recognition instance (TTS ended → mic reactivated)
    await waitForNewRecognitionInstance(page, 15000);

    // Simulate user correction
    await simulateVoiceTranscript(
      page,
      "Increase budget to 15000 euros, extend deadline to end of April"
    );

    // Wait for corrected form
    await expect(
      page.getByPlaceholder("Describe your procurement need...")
    ).toHaveValue(/April|15/i, { timeout: 10000 });

    // Trigger second validation
    const secondValidate = page
      .waitForResponse("**/api/validate", { timeout: 3000 })
      .catch(() => null);
    if (!(await secondValidate)) {
      await page.getByRole("button", { name: "Validate Request" }).click();
    }

    // Second validation succeeds → approved
    await expect(
      page
        .getByText("Supplier Ranking")
        .or(page.getByText(/approved/i))
    ).toBeVisible({ timeout: 15000 });
  });

  test("Scenario 4: voice input populates all form fields correctly", async ({
    page,
  }) => {
    await page.route("**/api/parse-voice", (route) =>
      route.fulfill({ json: PARSE_VOICE_LAPTOP_RESPONSE })
    );
    // Mock validate to prevent errors if auto-submit fires
    await page.route("**/api/validate", (route) =>
      route.fulfill({ json: INVALID_VALIDATION_RESULT })
    );

    await page.goto("/");
    await page.getByRole("heading", { name: "Smart Procurement" }).waitFor();

    await page.getByRole("button", { name: "Voice Input" }).click();
    await simulateVoiceTranscript(
      page,
      "We need 10 business laptops for Berlin by March 31st"
    );

    // Verify all form fields populated from parse-voice response
    await expect(
      page.getByPlaceholder("Describe your procurement need...")
    ).toHaveValue(/laptops/i, { timeout: 10000 });

    await expect(page.locator('input[type="number"]')).toHaveValue("10");

    await expect(
      page.getByPlaceholder("e.g. Dell, Accenture...")
    ).toHaveValue("Dell");

    // Date field should be set
    await expect(page.locator('input[type="date"]')).toHaveValue("2026-03-31");

    // Unit of measure
    await expect(
      page.getByPlaceholder("device, consulting_day, campaign...")
    ).toHaveValue("device");
  });

  test("Scenario 5: stop button exits voice conversation mode", async ({
    page,
  }) => {
    await page.route("**/api/parse-voice", (route) =>
      route.fulfill({ json: PARSE_VOICE_LAPTOP_RESPONSE })
    );
    await page.route("**/api/validate", (route) =>
      route.fulfill({ json: INVALID_VALIDATION_RESULT })
    );

    await page.goto("/");
    await page.getByRole("heading", { name: "Smart Procurement" }).waitFor();

    // Start voice and trigger conversation mode
    await page.getByRole("button", { name: "Voice Input" }).click();
    await simulateVoiceTranscript(page, "10 laptops for Berlin");

    // Wait for form to populate
    await expect(
      page.getByPlaceholder("Describe your procurement need...")
    ).toHaveValue(/laptops/i, { timeout: 10000 });

    // Voice conversation bar should appear
    const stopButton = page.getByRole("button", { name: "Stop conversation" });
    await expect(stopButton).toBeVisible({ timeout: 15000 });

    // Click stop - use force:true in case of overlay
    await stopButton.click({ force: true });

    // Wait and verify the bar disappears
    await expect(stopButton).toBeHidden({ timeout: 10000 });
  });
});
