import { useEffect, useState } from "react";
import type { FormData } from "../types";

const COUNTRIES = [
  "DE", "FR", "NL", "BE", "AT", "CH", "IT", "ES", "PL", "UK",
  "US", "CA", "BR", "MX", "SG", "AU", "IN", "JP", "UAE", "ZA",
];

interface Props {
  onSubmit: (data: FormData) => void;
  initialData: FormData | null;
}

export default function RequestForm({ onSubmit, initialData }: Props) {
  const [categories, setCategories] = useState<Record<string, string[]>>({});
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
    }
  );

  // Demo requests
  const [demoRequests, setDemoRequests] = useState<
    { request_id: string; title: string; scenario_tags: string[] }[]
  >([]);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => setCategories(data.categories || {}))
      .catch(() => {});

    fetch("/api/requests")
      .then((r) => r.json())
      .then((data) => setDemoRequests(data.requests?.slice(0, 50) || []))
      .catch(() => {});
  }, []);

  function update(field: keyof FormData, value: string | number | null) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function loadDemo(requestId: string) {
    try {
      const res = await fetch(`/api/requests/${requestId}`);
      const data = await res.json();
      const r = data.request;
      if (!r) return;
      setForm({
        request_text: r.request_text || "",
        quantity: r.quantity ?? null,
        unit_of_measure: r.unit_of_measure || "",
        category_l1: r.category_l1 || "",
        category_l2: r.category_l2 || "",
        delivery_country: r.delivery_countries?.[0] || r.country || "",
        required_by_date: r.required_by_date?.split("T")[0] || "",
        preferred_supplier: r.preferred_supplier_mentioned || "",
      });
    } catch {
      /* ignore */
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  const l2Options = form.category_l1 ? categories[form.category_l1] || [] : [];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Demo selector */}
      {demoRequests.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <label className="block text-sm font-medium text-blue-800 mb-2">
            Load a demo request
          </label>
          <select
            className="w-full border border-blue-300 rounded-md px-3 py-2 text-sm bg-white"
            value=""
            onChange={(e) => {
              if (e.target.value) loadDemo(e.target.value);
            }}
          >
            <option value="">-- Select a request --</option>
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

      {/* Request text */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Request description *
        </label>
        <textarea
          required
          rows={4}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Describe your procurement need in any language..."
          value={form.request_text}
          onChange={(e) => update("request_text", e.target.value)}
        />
      </div>

      {/* Category dropdowns */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category L1 *
          </label>
          <select
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={form.category_l1}
            onChange={(e) => {
              update("category_l1", e.target.value);
              update("category_l2", "");
            }}
          >
            <option value="">Select...</option>
            {Object.keys(categories).map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category L2 *
          </label>
          <select
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={form.category_l2}
            onChange={(e) => update("category_l2", e.target.value)}
          >
            <option value="">Select...</option>
            {l2Options.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Quantity + unit */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Quantity *
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
            Unit of measure
          </label>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="device, consulting_day, campaign..."
            value={form.unit_of_measure}
            onChange={(e) => update("unit_of_measure", e.target.value)}
          />
        </div>
      </div>

      {/* Country + date */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Delivery country *
          </label>
          <select
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={form.delivery_country}
            onChange={(e) => update("delivery_country", e.target.value)}
          >
            <option value="">Select...</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Required by date *
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
          Preferred supplier (optional)
        </label>
        <input
          type="text"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          placeholder="e.g. Dell, Accenture..."
          value={form.preferred_supplier}
          onChange={(e) => update("preferred_supplier", e.target.value)}
        />
      </div>

      <button
        type="submit"
        className="w-full bg-blue-600 text-white rounded-lg px-4 py-3 font-medium hover:bg-blue-700 transition-colors"
      >
        Validate Request
      </button>
    </form>
  );
}
