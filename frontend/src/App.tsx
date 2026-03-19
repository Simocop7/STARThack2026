import { useState } from "react";
import RequestForm from "./components/RequestForm";
import ValidationView from "./components/ValidationView";
import type { FormData, ValidationResult } from "./types";

export default function App() {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<FormData | null>(null);

  async function handleSubmit(data: FormData) {
    setFormData(data);
    setLoading(true);
    setResult(null);

    try {
      const body: Record<string, unknown> = {
        request_text: data.request_text,
        quantity: data.quantity || null,
        unit_of_measure: data.unit_of_measure || null,
        category_l1: data.category_l1 || null,
        category_l2: data.category_l2 || null,
        delivery_country: data.delivery_country || null,
        required_by_date: data.required_by_date || null,
        preferred_supplier: data.preferred_supplier || null,
      };

      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      setResult(json);
    } catch (err) {
      console.error(err);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setResult(null);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">SP</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Smart Procurement
            </h1>
            <p className="text-sm text-gray-500">
              Validate and enrich your purchase requests
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto py-8 px-6">
        {loading && (
          <div className="flex flex-col items-center gap-4 py-16">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-gray-600">Analyzing your request...</p>
          </div>
        )}

        {!loading && !result && (
          <RequestForm onSubmit={handleSubmit} initialData={formData} />
        )}

        {!loading && result && (
          <ValidationView result={result} onBack={handleBack} />
        )}
      </main>
    </div>
  );
}
