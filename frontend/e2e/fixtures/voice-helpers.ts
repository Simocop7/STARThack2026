import type { Page } from "@playwright/test";
import {
  CATEGORIES_RESPONSE,
  REQUESTS_RESPONSE,
  SINGLE_REQUEST_RESPONSE,
} from "./api-responses";

// ---------------------------------------------------------------------------
// Mock API responses for voice endpoints
// ---------------------------------------------------------------------------

/** Parsed result for a standard English laptop request. */
export const PARSE_VOICE_LAPTOP_RESPONSE = {
  request_text:
    "We need 10 business laptops for our Berlin office by end of March. Budget is EUR 15,000.",
  quantity: 10,
  unit_of_measure: "device",
  required_by_date: "2026-03-31",
  preferred_supplier: "Dell",
  missing_fields: [],
};

/** Parsed result for a French multilingual request. */
export const PARSE_VOICE_FRENCH_RESPONSE = {
  request_text:
    "Nous avons besoin de 5 ordinateurs portables pour le bureau de Paris avant fin avril.",
  quantity: 5,
  unit_of_measure: "device",
  required_by_date: "2026-04-30",
  preferred_supplier: "",
  missing_fields: [],
};

/** Parsed result for a user correction (budget + deadline fix). */
export const PARSE_VOICE_CORRECTION_RESPONSE = {
  request_text:
    "We need 10 business laptops for Berlin. Budget EUR 15,000, deliver by end of April.",
  quantity: 10,
  unit_of_measure: "device",
  required_by_date: "2026-04-30",
  preferred_supplier: "Dell",
  missing_fields: [],
};

/** A properly shaped RankedSupplierOutput mock with one supplier. */
export const RANKED_SUPPLIER_RESULT = {
  request_id: "REQ-VOICE",
  ranked_at: "2026-03-19T12:00:00Z",
  method_used: "deterministic",
  k: 3,
  scoring_weights: { price: 0.3, quality: 0.25, risk: 0.2, esg: 0.15, lead_time: 0.1 },
  ranking: [
    {
      rank: 1,
      supplier_id: "SUP-0001",
      supplier_name: "Dell Technologies",
      is_preferred: true,
      is_incumbent: false,
      meets_lead_time: true,
      pricing_tier_applied: "1-99",
      unit_price: 1200,
      total_price: 12000,
      expedited_unit_price: 1296,
      expedited_total_price: 12960,
      standard_lead_time_days: 14,
      expedited_lead_time_days: 7,
      score_breakdown: {
        price_score: 0.85,
        quality_score: 0.9,
        risk_score: 0.1,
        esg_score: 0.85,
        lead_time_score: 0.8,
      },
      composite_score: 0.82,
      compliance_checks: [],
      recommendation_note: "Preferred supplier with strong track record.",
    },
  ],
  excluded: [],
  escalations: [],
  budget_sufficient: true,
  minimum_total_cost: 12000,
  minimum_cost_supplier: "SUP-0001",
  approval_threshold_id: "AT-001",
  approval_threshold_note: "Standard approval — 1 quote required",
  quotes_required: 1,
  policies_checked: ["AT-001"],
  llm_fallback_reason: null,
};

/** Empty ranking result (no matching suppliers). */
export const EMPTY_RANKED_RESULT = {
  ...RANKED_SUPPLIER_RESULT,
  ranking: [],
  excluded: [],
};

// ---------------------------------------------------------------------------
// Browser-level mocks
// ---------------------------------------------------------------------------

/**
 * Inject a mock SpeechRecognition API into the page and mock all voice-related
 * HTTP endpoints. Call this in beforeEach.
 */
export async function mockVoiceAPIs(page: Page): Promise<void> {
  // 1. Inject a fake SpeechRecognition that the app can instantiate.
  //    Each new instance registers itself on window.__mockRecognition.
  //    A version counter tracks new instances for the correction loop.
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__mockRecognitionVersion = 0;

    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "en-US";
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        // Register this instance so tests can trigger events on it
        const win = window as unknown as Record<string, unknown>;
        win.__mockRecognition = this;
        win.__mockRecognitionVersion =
          ((win.__mockRecognitionVersion as number) || 0) + 1;
      }

      stop() {
        if (this.onend) this.onend();
      }
    }

    const win = window as unknown as Record<string, unknown>;
    win.SpeechRecognition = MockSpeechRecognition;
    win.webkitSpeechRecognition = MockSpeechRecognition;
  });

  // 2. Mock /api/tts — return a tiny valid WAV so Audio.play() resolves fast
  await page.route("**/api/tts", (route) => {
    // Minimal WAV: 44-byte header with 0 data samples → near-instant playback
    const wavHeader = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56,
      0x45, 0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00,
      0x01, 0x00, 0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02,
      0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
    ]);

    return route.fulfill({
      status: 200,
      contentType: "audio/wav",
      body: Buffer.from(wavHeader),
    });
  });

  // 3. Mock read-only endpoints
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { status: "ok" } })
  );
  await page.route("**/api/categories", (route) =>
    route.fulfill({ json: CATEGORIES_RESPONSE })
  );
  await page.route("**/api/requests", (route) =>
    route.fulfill({ json: REQUESTS_RESPONSE })
  );
  await page.route("**/api/requests/**", (route) => {
    const url = route.request().url();
    const id = url.split("/api/requests/")[1];
    if (id === "REQ-000001") {
      return route.fulfill({ json: SINGLE_REQUEST_RESPONSE });
    }
    return route.fulfill({
      status: 404,
      json: { detail: "Request not found" },
    });
  });
}

/**
 * Simulate a user speaking a transcript.
 *
 * Waits for a MockSpeechRecognition instance to be active, then triggers
 * onresult with a final transcript and fires onend to complete the session.
 */
export async function simulateVoiceTranscript(
  page: Page,
  transcript: string
): Promise<void> {
  // Wait for the recognition instance to be registered (via .start())
  await page.waitForFunction(
    () => !!(window as unknown as Record<string, unknown>).__mockRecognition,
    { timeout: 5000 }
  );

  await page.evaluate((text) => {
    const win = window as unknown as Record<string, unknown>;
    const recognition = win.__mockRecognition as {
      onresult: ((event: unknown) => void) | null;
      onend: (() => void) | null;
    };

    // Build a SpeechRecognitionEvent-like object with a final result
    const event = {
      resultIndex: 0,
      results: {
        0: {
          0: { transcript: text },
          isFinal: true,
          length: 1,
        },
        length: 1,
      },
    };

    if (recognition.onresult) recognition.onresult(event);

    // Small delay then fire onend to complete the session
    setTimeout(() => {
      if (recognition.onend) recognition.onend();
    }, 100);
  }, transcript);
}

/**
 * Wait for a new SpeechRecognition instance to be created and started.
 * Use this between consecutive simulateVoiceTranscript calls when the app
 * creates a new recognition session (e.g., after TTS playback ends).
 */
export async function waitForNewRecognitionInstance(
  page: Page,
  timeoutMs = 10000
): Promise<void> {
  const startVersion = await page.evaluate(
    () =>
      (
        window as unknown as Record<string, unknown>
      ).__mockRecognitionVersion as number
  );

  await page.waitForFunction(
    (expectedMinVersion) => {
      const win = window as unknown as Record<string, unknown>;
      return ((win.__mockRecognitionVersion as number) || 0) > expectedMinVersion;
    },
    startVersion,
    { timeout: timeoutMs }
  );
}
