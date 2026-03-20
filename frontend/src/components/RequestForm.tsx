import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import type { FormData } from "../types";
import VoiceInput, { type VoiceInputHandle } from "./VoiceInput";
import { ShimmerButton } from "./ui/shimmer-button";


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
  /** Stop/close the immersive voice overlay */
  onDeactivateVoiceOverlay?: () => void;
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
  /** Called when voice parsing fails (network/auth/server error) */
  onVoiceParseError?: (message: string) => void;
  /** Show voice widget and voice parsing flow (default: true) */
  showVoiceWidget?: boolean;
}

const VALID_COUNTRY_CODES: Record<string, string> = {
  DE: "Germany", FR: "France", NL: "Netherlands", BE: "Belgium",
  AT: "Austria", IT: "Italy", ES: "Spain", PL: "Poland",
  UK: "United Kingdom", CH: "Switzerland", US: "United States",
  CA: "Canada", BR: "Brazil", MX: "Mexico", SG: "Singapore",
  AU: "Australia", IN: "India", JP: "Japan", UAE: "UAE", ZA: "South Africa",
};

const FALLBACK_CATEGORY_INDEX: Record<string, string[]> = {
  IT: ["Laptops", "Cloud Compute", "Software Development", "Cybersecurity"],
  Facilities: ["Reception/Lounge Furniture", "Printers", "Office Equipment"],
  "Professional Services": ["Consulting Days", "Engineering/CAD", "Security Advisory"],
  Marketing: ["SEM", "Influencer Campaigns"],
};

const FALLBACK_DEMO_REQUESTS: Array<{
  request_id: string;
  title: string;
  scenario_tags: string[];
}> = [
  {
    request_id: "REQ-000001",
    title: "Laptop refresh for new hires",
    scenario_tags: ["standard", "hardware"],
  },
  {
    request_id: "REQ-000002",
    title: "Cloud compute capacity for analytics workloads",
    scenario_tags: ["standard", "cloud"],
  },
  {
    request_id: "REQ-000003",
    title: "Security review (break-fix / advisory) for internal systems",
    scenario_tags: ["standard", "cyber"],
  },
];

function isoDateFromNow(daysFromNow: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function extractQuantity(transcript: string): number | null {
  // Best-effort: first integer found
  const m = transcript.match(/(?:^|\s)(\d{1,6})(?:\s)?(?:units|unit|pcs|pc|laptops|devices|seats)?/i);
  if (m?.[1]) {
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const m2 = transcript.match(/\b(\d{1,6})\b/);
  if (m2?.[1]) {
    const n = parseInt(m2[1], 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function extractCountryCode(transcript: string): string | null {
  const t = transcript.toLowerCase();
  const entries = Object.entries(VALID_COUNTRY_CODES);
  for (const [code, name] of entries) {
    const c = code.toLowerCase();
    const n = name.toLowerCase();
    if (t.includes(c) || (n && t.includes(n))) return code;
  }
  return null;
}

function extractBudget(transcript: string): number | null {
  const t = transcript.toLowerCase();
  // Match patterns like "5000 euros", "10k", "2.5K EUR", "budget of 50000", "ten thousand"
  const shorthand = t.match(/\b(\d+(?:\.\d+)?)\s*k\b/i);
  if (shorthand?.[1]) return parseFloat(shorthand[1]) * 1000;
  const millions = t.match(/\b(\d+(?:\.\d+)?)\s*m\b/i);
  if (millions?.[1]) return parseFloat(millions[1]) * 1_000_000;
  const plain = t.match(/\b(\d{3,}(?:[.,]\d+)?)\b/);
  if (plain?.[1]) {
    const n = parseFloat(plain[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function extractDate(transcript: string): string | null {
  const iso = transcript.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso?.[1]) return iso[1];

  const t = transcript.toLowerCase();
  if (t.includes("tomorrow")) return isoDateFromNow(1);
  if (t.includes("next week")) return isoDateFromNow(7);

  const inDays = t.match(/in\s+(\d{1,3})\s+days?/);
  if (inDays?.[1]) {
    const n = parseInt(inDays[1], 10);
    if (Number.isFinite(n) && n > 0) return isoDateFromNow(n);
  }

  // Default so voice parsing can proceed in demo mode.
  return isoDateFromNow(7);
}

function localParseVoiceTranscript(transcript: string, language: string) {
  const quantity = extractQuantity(transcript);
  const delivery_country = extractCountryCode(transcript) ?? "DE";
  const required_by_date = extractDate(transcript) ?? isoDateFromNow(7);
  const budget_amount = extractBudget(transcript);

  return {
    request_text: transcript.trim(),
    quantity: quantity ?? 10,
    unit_of_measure: "units",
    category_l1: "",
    category_l2: "",
    delivery_country,
    required_by_date,
    budget_amount,
    preferred_supplier: "",
    language,
  };
}

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
  onDeactivateVoiceOverlay,
  onInterimTranscriptChange,
  overlayActive,
  onRegisterForceTranscript,
  onMissingFieldsDetected,
  onListeningChange,
  onEmptyEnd,
  onVoiceParseError,
  showVoiceWidget = true,
}: Props) {
  const [form, setForm] = useState<FormData>(
    initialData ?? {
      request_text: "",
      quantity: null,
      unit_of_measure: "",
      budget_amount: null,
      currency: "EUR",
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

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchJsonWithRetry<T>(
    url: string,
    init?: RequestInit,
    retries = 4,
    backoffMs = 400,
  ): Promise<T> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await fetch(url, init);
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status} for ${url}`) as Error & { status?: number };
          err.status = res.status;
          throw err;
        }
        return (await res.json()) as T;
      } catch (e) {
        lastError = e;
        const status = (e as any)?.status as number | undefined;
        const shouldRetry = status === undefined || status >= 500;

        if (attempt >= retries - 1 || !shouldRetry) break;
        await sleep(backoffMs * (attempt + 1));
      }
    }

    throw lastError;
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialOptions() {
      try {
        const [reqData, catData] = await Promise.all([
          fetchJsonWithRetry<{ requests?: any[] }>("/api/requests"),
          fetchJsonWithRetry<{ categories?: Record<string, string[]> }>("/api/categories"),
        ]);

        if (cancelled) return;

        setDemoRequests(reqData.requests?.slice(0, 50) || []);
        setCategoryIndex(catData.categories ?? {});
      } catch (e) {
        if (cancelled) return;
        // Backend is temporarily unavailable: keep the UI usable with demo data.
        setDemoRequests(FALLBACK_DEMO_REQUESTS);
        setCategoryIndex(FALLBACK_CATEGORY_INDEX);
        setLoadError(null);
      }
    }

    loadInitialOptions();

    return () => {
      cancelled = true;
    };
  }, [i.loadError]);

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
        budget_amount: r.budget_amount ?? null,
        currency: r.currency || "EUR",
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

    // Use formRef.current.language to avoid stale closure issues (Bug 1)
    const currentLanguage = formRef.current.language;
    let parsed: any = null;
    try {
      parsed = await fetchJsonWithRetry<any>(
        "/api/parse-voice",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript,
            language: currentLanguage,
          }),
        },
        3,
        500,
      );
    } catch (e) {
      // Demo fallback: best-effort extraction so voice UI still works.
      parsed = localParseVoiceTranscript(transcript, currentLanguage);
    }

    // Merge parsed fields into form, preserving existing non-empty values.
    // Build updatedForm explicitly before calling setForm (Bug 2) — this avoids
    // depending on the side-effect inside the setState updater for stillMissing logic.
    const currentForm = formRef.current;
    const newRequestText = parsed.request_text || transcript;
    const requestTextChanged = newRequestText !== currentForm.request_text;
    const updatedForm: FormData = {
      ...currentForm,
      request_text: newRequestText,
      quantity: parsed.quantity ?? currentForm.quantity,
      unit_of_measure: parsed.unit_of_measure || currentForm.unit_of_measure,
      budget_amount: parsed.budget_amount ?? currentForm.budget_amount,
      currency: parsed.currency || currentForm.currency,
      required_by_date: parsed.required_by_date || currentForm.required_by_date,
      preferred_supplier: parsed.preferred_supplier || currentForm.preferred_supplier,
      delivery_country: parsed.delivery_country || currentForm.delivery_country,
      // Clear stale categories when request text changes so the backend re-infers them
      category_l1: requestTextChanged ? "" : currentForm.category_l1,
      category_l2: requestTextChanged ? "" : currentForm.category_l2,
    };
    formRef.current = updatedForm;
    setForm(updatedForm);

    // Check which required fields are still missing
    const stillMissing: string[] = [];
    if (!updatedForm.quantity) stillMissing.push("quantity");
    if (updatedForm.budget_amount === null || updatedForm.budget_amount === undefined || updatedForm.budget_amount <= 0) stillMissing.push("budget");
    if (!updatedForm.required_by_date) stillMissing.push("delivery date");
    if (!updatedForm.delivery_country) stillMissing.push("delivery_country");

    setMissingFields(stillMissing);

    if (overlayActive) {
      onMissingFieldsDetected?.(stillMissing);
    } else if (voiceMode) {
      pendingAutoSubmit.current = true;
    }

    setVoiceParsing(false);
  }

  // Keep ref pointing to latest handleVoiceTranscript to avoid stale closures
  handleVoiceTranscriptRef.current = handleVoiceTranscript;

  // Register force-transcript callback for parent to bypass VoiceInput
  useEffect(() => {
    onRegisterForceTranscript?.((transcript: string) => handleVoiceTranscriptRef.current(transcript));
  }, [onRegisterForceTranscript]);

  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());

  function clearFieldError(field: string) {
    setFieldErrors((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const errors = new Set<string>();
    if (!form.request_text.trim()) errors.add("request_text");
    if (form.quantity === null || form.quantity < 1) errors.add("quantity");
    if (form.budget_amount === null || form.budget_amount === undefined || isNaN(form.budget_amount) || form.budget_amount < 0) errors.add("budget_amount");
    if (!form.delivery_country || !(form.delivery_country in VALID_COUNTRY_CODES)) errors.add("delivery_country");
    if (!form.required_by_date) {
      errors.add("required_by_date");
    } else {
      const maxDate = new Date();
      maxDate.setFullYear(maxDate.getFullYear() + 10);
      if (new Date(form.required_by_date) > maxDate) errors.add("required_by_date_range");
    }

    if (errors.size > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors(new Set());
    onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 w-full">
      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12 w-full">
        <div className="lg:col-span-7 space-y-6">
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
                      ? "bg-red-700 text-white border-red-700"
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
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <label className="block text-sm font-medium text-red-800 mb-2">
                {i.loadDemo}
              </label>
              <select
                className="w-full border border-red-300 rounded-md px-3 py-2 text-sm bg-white"
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
                <option value="" className="text-gray-400">
                  {i.categoryOptionalHint}
                </option>
                {Object.keys(categoryIndex).map((l1) => (
                  <option key={l1} value={l1}>
                    {l1}
                  </option>
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
                <option value="" className="text-gray-400">
                  {i.categoryOptionalHint}
                </option>
                {(categoryIndex[form.category_l1] ?? []).map((l2) => (
                  <option key={l2} value={l2}>
                    {l2}
                  </option>
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
                type="number"
                onInvalid={(e) => e.preventDefault()}
                className={`w-full border rounded-lg px-3 py-2 text-sm ${fieldErrors.has("quantity") ? "border-red-500" : "border-gray-300"}`}
                value={form.quantity ?? ""}
                onChange={(e) => { clearFieldError("quantity"); update("quantity", e.target.value ? Number(e.target.value) : null); }}
              />
              {fieldErrors.has("quantity") && <p className="mt-1 text-xs text-red-600">{i.quantity}</p>}
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

          {/* Budget (required, EUR default) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {i.budgetAmount} <span className="text-red-600">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                step="any"
                onInvalid={(e) => e.preventDefault()}
                className={`flex-1 border rounded-lg px-3 py-2 text-sm ${fieldErrors.has("budget_amount") ? "border-red-500" : "border-gray-300"}`}
                placeholder={i.budgetPlaceholder}
                value={form.budget_amount ?? ""}
                onChange={(e) => {
                  clearFieldError("budget_amount");
                  update("budget_amount", e.target.value ? Number(e.target.value) : null);
                }}
              />
              <span className="flex items-center px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-500 select-none">
                EUR
              </span>
            </div>
            {fieldErrors.has("budget_amount") && (
              <p className="mt-1 text-xs text-red-600">Please enter a valid budget (positive number)</p>
            )}
          </div>

          {/* Delivery country + date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {i.deliveryCountry}
              </label>
              <select
                className={`w-full border rounded-lg px-3 py-2 text-sm bg-white ${
                  fieldErrors.has("delivery_country") || (form.delivery_country && !(form.delivery_country in VALID_COUNTRY_CODES))
                    ? "border-red-500 text-red-700"
                    : "border-gray-300"
                }`}
                value={form.delivery_country}
                onChange={(e) => { clearFieldError("delivery_country"); update("delivery_country", e.target.value); }}
              >
                <option value="">{i.deliveryCountryPlaceholder}</option>
                {Object.entries(VALID_COUNTRY_CODES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {code} — {name}
                  </option>
                ))}
              </select>
              {fieldErrors.has("delivery_country") && !form.delivery_country && (
                <p className="mt-1 text-xs text-red-600">{i.deliveryCountry}</p>
              )}
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
                type="date"
                onInvalid={(e) => e.preventDefault()}
                className={`w-full border rounded-lg px-3 py-2 text-sm ${fieldErrors.has("required_by_date") || fieldErrors.has("required_by_date_range") ? "border-red-500" : "border-gray-300"}`}
                value={form.required_by_date}
                onChange={(e) => {
                  const val = e.target.value;
                  const yearPart = val.split("-")[0];
                  if (yearPart && yearPart.length > 4) return;
                  clearFieldError("required_by_date");
                  clearFieldError("required_by_date_range");
                  update("required_by_date", val);
                }}
              />
              {fieldErrors.has("required_by_date") && <p className="mt-1 text-xs text-red-600">{i.requiredByDate}</p>}
              {fieldErrors.has("required_by_date_range") && <p className="mt-1 text-xs text-red-600">{i.dateInvalidRange}</p>}
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
        </div>

        <div className={`lg:col-span-5 space-y-6 ${showDemoSelector ? "lg:pt-14" : ""}`}>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {i.requestDescription}
            </label>
            <textarea
              rows={5}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 ${fieldErrors.has("request_text") ? "border-red-500" : "border-gray-300"}`}
              placeholder={i.requestPlaceholder}
              value={form.request_text}
              onChange={(e) => { clearFieldError("request_text"); update("request_text", e.target.value); }}
            />
            {fieldErrors.has("request_text") && <p className="mt-1 text-xs text-red-600">{i.requestDescription}</p>}
            <p className="mt-2 text-xs text-gray-500">{i.categoryAutoDetectHint}</p>
          </div>

          {showVoiceWidget && (
            <div className="bg-gradient-to-r from-red-50 via-white to-red-50 border border-red-200 rounded-xl p-5">
              <div className="mb-3">
                <label className="block text-sm font-semibold text-red-900">
                  {i.voiceInputLabel}
                </label>
                <p className="text-xs text-gray-500 mt-0.5">{i.voiceInputHint}</p>
              </div>

              {/* Origin voice activation button (kept during merge conflict resolution) */}
              {onActivateVoiceOverlay && (
                <div className={voiceParsing ? "pointer-events-none opacity-70" : undefined}>
                  <button
                    type="button"
                    onClick={onActivateVoiceOverlay}
                    disabled={voiceParsing}
                    className="relative flex items-center gap-2 px-5 py-3 rounded-full font-medium text-sm
                      bg-gradient-to-r from-red-600 via-red-700 to-red-800 text-white
                      hover:from-red-500 hover:via-red-600 hover:to-red-700
                      shadow-lg shadow-red-200 hover:shadow-xl hover:shadow-red-300
                      transition-all
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    Voice Mode
                  </button>
                </div>
              )}

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
                <div className="mt-3 flex items-center gap-2 text-sm text-red-700">
                  <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                  {i.voiceParsing}
                </div>
              )}

              {voiceError && !overlayActive && (
                <div className="mt-2 text-sm text-red-600">{voiceError}</div>
              )}

              {missingFields.length > 0 && !voiceMode && !overlayActive && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-sm font-medium text-red-800">{i.voiceMissingFields}</p>
                  <ul className="mt-1 text-xs text-red-700 list-disc list-inside">
                    {missingFields.map((field) => (
                      <li key={field}>{field}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ShimmerButton
        type="submit"
        background="rgb(185 28 28)"
        className="w-full rounded-lg px-4 py-3 font-medium hover:opacity-95"
      >
        {submitLabel ?? i.validateRequest}
      </ShimmerButton>
    </form>
  );
}
