import { useEffect, useState } from "react";
import { t } from "../i18n";
import type { FormData } from "../types";
import VoiceInput from "./VoiceInput";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "it", label: "Italiano" },
  { code: "ja", label: "日本語" },
];

interface Props {
  onSubmit: (data: FormData) => void;
  initialData: FormData | null;
  onLanguageChange: (lang: string) => void;
}

const DEFAULT_DELIVERY_ADDRESS = "St. Gallen, Olma Halle 9";

export default function RequestForm({ onSubmit, initialData, onLanguageChange }: Props) {
  const [form, setForm] = useState<FormData>(
    initialData ?? {
      request_text: "",
      quantity: null,
      unit_of_measure: "",
      category_l1: "",
      category_l2: "",
      delivery_address: DEFAULT_DELIVERY_ADDRESS,
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

  useEffect(() => {
    fetch("/api/requests")
      .then((r) => r.json())
      .then((data) => setDemoRequests(data.requests?.slice(0, 50) || []))
      .catch(() => {
        setLoadError(i.loadError);
      });
  }, []);

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
        delivery_address: r.delivery_countries?.[0] || r.country || "",
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

    try {
      const res = await fetch("/api/parse-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, language: form.language }),
      });

      if (!res.ok) {
        setVoiceError(i.voiceParseError);
        return;
      }

      const parsed = await res.json();

      setForm((prev) => ({
        ...prev,
        request_text: parsed.request_text || transcript,
        quantity: parsed.quantity ?? prev.quantity,
        unit_of_measure: parsed.unit_of_measure || prev.unit_of_measure,
        required_by_date: parsed.required_by_date || prev.required_by_date,
        preferred_supplier: parsed.preferred_supplier || prev.preferred_supplier,
        delivery_address: prev.delivery_address || DEFAULT_DELIVERY_ADDRESS,
      }));

      if (parsed.missing_fields?.length) {
        setMissingFields(parsed.missing_fields);
      }
    } catch {
      setVoiceError(i.voiceParseError);
    } finally {
      setVoiceParsing(false);
    }
  }

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
      {demoRequests.length > 0 && (
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
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
        <label className="block text-sm font-medium text-blue-800 mb-2">
          {i.voiceInputLabel}
        </label>
        <p className="text-xs text-blue-600 mb-3">{i.voiceInputHint}</p>
        <VoiceInput
          language={form.language}
          onTranscript={handleVoiceTranscript}
          onParsing={setVoiceParsing}
          disabled={voiceParsing}
        />
        {voiceParsing && (
          <div className="mt-3 flex items-center gap-2 text-sm text-blue-700">
            <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
            {i.voiceParsing}
          </div>
        )}
        {voiceError && (
          <div className="mt-2 text-sm text-red-600">{voiceError}</div>
        )}
        {missingFields.length > 0 && (
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

      {/* Delivery address + date */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {i.deliveryAddress}
          </label>
          <input
            required
            type="text"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder={i.deliveryPlaceholder}
            value={form.delivery_address}
            onChange={(e) => update("delivery_address", e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {i.requiredByDate}
          </label>
          <input
            required
            type="date"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={form.required_by_date}
            onChange={(e) => update("required_by_date", e.target.value)}
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
        {i.validateRequest}
      </button>
    </form>
  );
}
