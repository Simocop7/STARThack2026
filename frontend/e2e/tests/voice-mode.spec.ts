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
 * Strategy: Web Speech API and Audio playback are mocked at the browser level:
 *   - window.SpeechRecognition is stubbed; tests trigger events programmatically
 *   - /api/parse-voice returns structured form data
 *   - /api/tts returns a tiny silent WAV
 *   - /api/validate and /api/rank are mocked per scenario
 */

test.describe("Voice Mode", () => {
  test.beforeEach(async ({ page }) => {
    await mockVoiceAPIs(page);
  });

  test("Scenario 1: standard English request — valid on first try", async ({
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

    // Form gets populated, auto-submits to validate, then ranks
    // Valid → shows supplier ranking or approved message
    await expect(
      page
        .getByText("Supplier Ranking")
        .or(page.getByText("Request approved"))
    ).toBeVisible({ timeout: 20000 });
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

    // Valid → shows approved state
    await expect(
      page
        .getByText("Supplier Ranking")
        .or(page.getByText(/approuvée|approved/i))
    ).toBeVisible({ timeout: 20000 });
  });

  test("Scenario 3: invalid request triggers TTS and correction loop", async ({
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

    // Validation fails → TTS plays summary → then listening phase
    await expect(
      page
        .getByText("Listening for your response...")
        .or(page.getByText("Listening..."))
    ).toBeVisible({ timeout: 20000 });

    // Wait for new recognition instance after TTS triggers startListening
    await waitForNewRecognitionInstance(page);

    // Simulate user correction
    await simulateVoiceTranscript(
      page,
      "Increase budget to 15000 euros, extend deadline to end of April"
    );

    // Second validation succeeds → approved
    await expect(
      page
        .getByText("Supplier Ranking")
        .or(page.getByText(/approved|approuvée/i))
    ).toBeVisible({ timeout: 20000 });
  });

  test("Scenario 4: voice input populates form fields correctly", async ({
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

    await page.getByRole("button", { name: "Voice Input" }).click();
    await simulateVoiceTranscript(
      page,
      "We need 10 business laptops for Berlin by March 31st"
    );

    // Form fields populated from parse-voice response
    await expect(
      page.getByPlaceholder("Describe your procurement need...")
    ).toHaveValue(/laptops/i, { timeout: 10000 });

    await expect(page.locator('input[type="number"]')).toHaveValue("10");

    await expect(
      page.getByPlaceholder("e.g. Dell, Accenture...")
    ).toHaveValue("Dell");
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

    // Start voice conversation
    await page.getByRole("button", { name: "Voice Input" }).click();
    await simulateVoiceTranscript(page, "10 laptops for Berlin");

    // Wait for conversation bar
    const stopButton = page.getByRole("button", { name: "Stop conversation" });
    await expect(stopButton).toBeVisible({ timeout: 15000 });

    // Click stop
    await stopButton.click();

    // Voice bar should disappear (VoiceConversation returns null when !active)
    await expect(stopButton).not.toBeVisible({ timeout: 10000 });
  });
});
