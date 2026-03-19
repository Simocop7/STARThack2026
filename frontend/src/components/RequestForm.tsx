import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import type { FormData } from "../types";
import VoiceInput, { type VoiceInputHandle } from "./VoiceInput";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Fran\u00e7ais" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Espa\u00f1ol" },
  { code: "pt", label: "Portugu\u00eas" },
  { code: "it", label: "Italiano" },
  { code: "ja", label: "\u65e5\u672c\u8a9e" },
];

interface Props {
  onSubmit: (data: FormData) => void;
  initialData: FormData | null;
  onLanguageChange: (lang: string) => void;
  /** Whether voice conversation mode is active */
  voiceMode: boolean;
  /** Notify parent that user started voice input */
  onVoiceModeChange: (active: boolean) => void;
  /** Ref to access VoiceInput's startListening */
  voiceInputRef?: React.RefObject<VoiceInputHandle | null>;
  /** Hide the demo request selector (default: true) */
  showDemoSelector?: boolean;
  /** Label for the submit button */
  submitLabel?: string;
  /** Activate the immersive voice overlay */
  onActivateVoiceOverlay?: () => void;
  /** Called with interim transcript text */
  onInterimTranscriptChange?: (text: string) => void;
  /** Whether the voice overlay is currently active */
  overlayActive?: boolean;
  /** Expose a way for parent to force-submit a transcript (bypass VoiceInput) */
  onRegisterForceTranscript?: (fn: (transcript: string) => void) => void;
  /** Called after voice parse with list of still-missing required fields */
  onMissingFieldsDetected?: (fields: string[]) => void;
  /** Called when mic listening state actually changes */
  onListeningChange?: (listening: boolean) => void;
  /** Called when recognition ends with no transcript (no-speech, timeout) */
  onEmptyEnd?: () => void;
}

const VALID_COUNTRY_CODES: Record<string, string> = {
  DE: "Germany", FR: "France", NL: "Netherlands", BE: "Belgium",
  AT: "Austria", IT: "Italy", ES: "Spain", PL: "Poland",
  UK: "United Kingdom", CH: "Switzerland", US: "United States",
  CA: "Canada", BR: "Brazil", MX: "Mexico", SG: "Singapore",
  AU: "Australia", IN: "India", JP: "Japan", UAE: "UAE", ZA: "South Africa",
};

export default function RequestForm({
  onSubmit,
  initialData,
  onLanguageChange,
  voiceMode,
  onVoiceModeChange,
  voiceInputRef,
  showDemoSelector = true,
  submitLabel,
  onActivateVoiceOverlay,
  onInterimTranscriptChange,
  overlayActive,
  onRegisterForceTranscript,
  onMissingFieldsDetected,
  onListeningChange,
  onEmptyEnd,
}: Props) {
  const [form, setForm] = useState<FormData>(
    initialData ?? {
      request_text: "",
      quantity: null,
      unit_of_measure: "",
      category_l1: "",
      category_l2: "",
      delivery_country: "",
      required_by_date: "",
      preferred_supplier: "",
      language: "en",
    }
  );

  const i = t(form.language);

  const [demoRequests, setDemoRequests] = useState<
    { request_id: string; title: string; scenario_tags: string[] }[]
  >([]);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [voiceParsing, setVoiceParsing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [categoryIndex, setCategoryIndex] = useState<Record<string, string[]>>({});

  const internalVoiceRef = useRef<VoiceInputHandle | null>(null);
  const effectiveVoiceRef = voiceInputRef ?? internalVoiceRef;

  // Track latest form for auto-submit (avoid stale closures)
  const formRef = useRef(form);
  formRef.current = form;

  // Stable ref to always call the latest handleVoiceTranscript (avoids stale closure in forceTranscript)
  const handleVoiceTranscriptRef = useRef<(transcript: string) => void>(() => {});

  const pendingAutoSubmit = useRef(false);

  useEffect(() => {
    fetch("/api/requests")
      .then((r) => r.json())
      .then((data) => setDemoRequests(data.requests?.slice(0, 50) || []))
      .catch(() => {
        setLoadError(i.loadError);
      });
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => setCategoryIndex(data.categories ?? {}))
      .catch(() => {});
  }, []);

  // Sync initialData changes (e.g. corrected form from validation)
  useEffect(() => {
    if (initialData) {
      setForm(initialData);
    }
  }, [initialData]);

  // Auto-submit after voice parse fills form
  useEffect(() => {
    if (pendingAutoSubmit.current) {
      pendingAutoSubmit.current = false;
      onSubmit(formRef.current);
    }
  }, [form, onSubmit]);

  function update(field: keyof FormData, value: string | number | null) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "language" && typeof value === "string") {
      onLanguageChange(value);
    }
  }

  async function loadDemo(requestId: string) {
    try {
      const res = await fetch(`/api/requests/${requestId}`);
      if (!res.ok) return;
      const data = await res.json();
      const r = data.request;
      if (!r) return;
      setForm((prev) => ({
        request_text: r.request_text || "",
        quantity: r.quantity ?? null,
        unit_of_measure: r.unit_of_measure || "",
        category_l1: r.category_l1 || "",
        category_l2: r.category_l2 || "",
        delivery_country: r.delivery_countries?.[0] || r.country || "",
        required_by_date: r.required_by_date?.split("T")[0] || "",
        preferred_supplier: r.preferred_supplier_mentioned || "",
        language: prev.language,
      }));
    } catch {
      /* ignore */
    }
  }

  async function handleVoiceTranscript(transcript: string) {
    setVoiceParsing(true);
    setVoiceError(null);
    setMissingFields([]);

    // Activate voice mode on first voice input
    if (!voiceMode) {
      onVoiceModeChange(true);
    }

    try {
      const res = await fetch("/api/parse-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          language: form.language,
        }),
      });

      if (!res.ok) {
        setVoiceError(i.voiceParseError);
        return;
      }

      const parsed = await res.json();

      // Merge parsed fields into form, preserving existing non-empty values
      let updatedForm: FormData = formRef.current;
      setForm((prev) => {
        const updated = {
          ...prev,
          request_text: prev.request_text || parsed.request_text || transcript,
          quantity: parsed.quantity ?? prev.quantity,
          unit_of_measure: parsed.unit_of_measure || prev.unit_of_measure,
          required_by_date: parsed.required_by_date || prev.required_by_date,
          preferred_supplier: parsed.preferred_supplier || prev.preferred_supplier,
          delivery_country: parsed.delivery_country || prev.delivery_country,
        };
        formRef.current = updated;
        updatedForm = updated;
        return updated;
      });

      // Check which required fields are still missing
      const stillMissing: string[] = [];
      if (!updatedForm.quantity) stillMissing.push("quantity");
      if (!updatedForm.required_by_date) stillMissing.push("delivery date");
      if (!updatedForm.delivery_country) stillMissing.push("delivery_country");

      setMissingFields(stillMissing);

      if (overlayActive) {
        onMissingFieldsDetected?.(stillMissing);
      } else if (voiceMode) {
        pendingAutoSubmit.current = true;
      }
    } catch {
      setVoiceError(i.voiceParseError);
    } finally {
      setVoiceParsing(false);
    }
  }

  // Keep ref pointing to latest handleVoiceTranscript to avoid stale closures
  handleVoiceTranscriptRef.current = handleVoiceTranscript;

  // Register force-transcript callback for parent to bypass VoiceInput
  useEffect(() => {
    onRegisterForceTranscript?.((transcript: string) => handleVoiceTranscriptRef.current(transcript));
  }, [onRegisterForceTranscript]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* Language selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">{i.language}</label>
        <div className="flex gap-1 flex-wrap">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                form.language === lang.code
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
              onClick={() => update("language", lang.code)}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      {/* Demo selector */}
      {showDemoSelector && demoRequests.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <label className="block text-sm font-medium text-blue-800 mb-2">
            {i.loadDemo}
          </label>
          <select
            className="w-full border border-blue-300 rounded-md px-3 py-2 text-sm bg-white"
            value=""
            onChange={(e) => {
              if (e.target.value) loadDemo(e.target.value);
            }}
          >
            <option value="">{i.selectRequest}</option>
            {demoRequests.map((r) => (
              <option key={r.request_id} value={r.request_id}>
                {r.request_id} — {r.title}{" "}
                {r.scenario_tags?.length
                  ? `[${r.scenario_tags.join(", ")}]`
                  : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Voice input */}
      <div className="bg-gradient-to-r from-indigo-50 via-violet-50 to-purple-50 border border-indigo-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <label className="block text-sm font-semibold text-indigo-900">
              {i.voiceInputLabel}
            </label>
            <p className="text-xs text-indigo-500 mt-0.5">{i.voiceInputHint}</p>
          </div>

          {/* Immersive voice activation button */}
          {onActivateVoiceOverlay && (
            <button
              type="button"
              onClick={onActivateVoiceOverlay}
              disabled={voiceParsing}
              className="relative flex items-center gap-2 px-5 py-3 rounded-full font-medium text-sm
                bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white
                hover:from-indigo-500 hover:via-violet-500 hover:to-purple-500
                shadow-lg shadow-indigo-200 hover:shadow-xl hover:shadow-indigo-300
                transition-all active:voice-activate-pulse
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
              Voice Mode
            </button>
          )}
        </div>

        {/* Hidden VoiceInput — imperative ref still works for overlay */}
        <VoiceInput
          ref={effectiveVoiceRef}
          language={form.language}
          onTranscript={handleVoiceTranscript}
          onParsing={setVoiceParsing}
          disabled={voiceParsing}
          hidden
          onInterimChange={onInterimTranscriptChange}
          autoStopOnSilence={overlayActive}
          onListeningChange={onListeningChange}
          onEmptyEnd={onEmptyEnd}
        />
        {voiceParsing && !overlayActive && (
          <div className="mt-3 flex items-center gap-2 text-sm text-indigo-700">
            <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            {i.voiceParsing}
          </div>
        )}
        {voiceError && !overlayActive && (
          <div className="mt-2 text-sm text-red-600">{voiceError}</div>
        )}
        {missingFields.length > 0 && !voiceMode && !overlayActive && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-md p-3">
            <p className="text-sm font-medium text-amber-800">{i.voiceMissingFields}</p>
            <ul className="mt-1 text-xs text-amber-700 list-disc list-inside">
              {missingFields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Request text */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {i.requestDescription}
        </label>
        <textarea
          required
          rows={4}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder={i.requestPlaceholder}
          value={form.request_text}
          onChange={(e) => update("request_text", e.target.value)}
        />
        <p className="mt-1 text-xs text-gray-500">{i.categoryAutoDetectHint}</p>
      </div>

      {/* Category selectors (optional) */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {i.categoryL1Optional}
          </label>
          <select
            className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white ${!form.category_l1 ? "text-gray-400" : "text-gray-900"}`}
            value={form.category_l1}
            onChange={(e) => {
              update("category_l1", e.target.value);
              update("category_l2", "");
            }}
          >
            <option value="" className="text-gray-400">{i.categoryOptionalHint}</option>
            {Object.keys(categoryIndex).map((l1) => (
              <option key={l1} value={l1}>{l1}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {i.categoryL2Optional}
          </label>
          <select
            className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white ${!form.category_l2 ? "text-gray-400" : "text-gray-900"}`}
            value={form.category_l2}
            disabled={!form.category_l1}
            onChange={(e) => update("category_l2", e.target.value)}
          >
            <option value="" className="text-gray-400">{i.categoryOptionalHint}</option>
            {(categoryIndex[form.category_l1] ?? []).map((l2) => (
              <option key={l2} value={l2}>{l2}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Quantity + unit */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {i.quantity}
          </label>
          <input
            required
            type="number"
            min={1}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={form.quantity ?? ""}
            onChange={(e) =>
              update("quantity", e.target.value ? Number(e.target.value) : null)
            }
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {i.unitOfMeasure}
          </label>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder={i.unitPlaceholder}
            value={form.unit_of_measure}
            onChange={(e) => update("unit_of_measure", e.target.value)}
          />
        </div>
      </div>

      {/* Delivery country + date */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {i.deliveryCountry}
          </label>
          <select
            required
            className={`w-full border rounded-lg px-3 py-2 text-sm bg-white ${
              form.delivery_country && !(form.delivery_country in VALID_COUNTRY_CODES)
                ? "border-red-500 text-red-700"
                : "border-gray-300"
            }`}
            value={form.delivery_country}
            onChange={(e) => update("delivery_country", e.target.value)}
          >
            <option value="">{i.deliveryCountryPlaceholder}</option>
            {Object.entries(VALID_COUNTRY_CODES).map(([code, name]) => (
              <option key={code} value={code}>{code} — {name}</option>
            ))}
          </select>
          {form.delivery_country && !(form.delivery_country in VALID_COUNTRY_CODES) && (
            <p className="mt-1 text-xs text-red-600">
              Invalid country code. Please select a valid country.
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {i.requiredByDate}
          </label>
          <input
            required
            type="date"
            min="2020-01-01"
            max="9999-12-31"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={form.required_by_date}
            onChange={(e) => {
              const val = e.target.value;
              // Reject dates with year > 4 digits
              const yearPart = val.split("-")[0];
              if (yearPart && yearPart.length > 4) return;
              update("required_by_date", val);
            }}
          />
        </div>
      </div>

      {/* Preferred supplier */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {i.preferredSupplier}
        </label>
        <input
          type="text"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          placeholder={i.supplierPlaceholder}
          value={form.preferred_supplier}
          onChange={(e) => update("preferred_supplier", e.target.value)}
        />
      </div>

      <button
        type="submit"
        className="w-full bg-blue-600 text-white rounded-lg px-4 py-3 font-medium hover:bg-blue-700 transition-colors"
      >
        {submitLabel ?? i.validateRequest}
      </button>
    </form>
  );
}
