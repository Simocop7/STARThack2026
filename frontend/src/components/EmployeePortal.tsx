import { useState } from "react";
import RequestForm from "./RequestForm";
import type { FormData } from "../types";

interface Props {
  onBack: () => void;
}

interface SubmitResult {
  request_id: string;
}

export default function EmployeePortal({ onBack }: Props) {
  const [submitted, setSubmitted] = useState<SubmitResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(data: FormData) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/employee/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_text: data.request_text,
          quantity: data.quantity ?? null,
          unit_of_measure: data.unit_of_measure || null,
          delivery_address: data.delivery_address || null,
          required_by_date: data.required_by_date || null,
          preferred_supplier: data.preferred_supplier || null,
          language: data.language || "en",
        }),
      });
      if (!res.ok) {
        setError("Failed to submit request. Please try again.");
        return;
      }
      const json: SubmitResult = await res.json();
      setSubmitted(json);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleNewRequest() {
    setSubmitted(null);
    setError(null);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 print:hidden">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-600 transition-colors mr-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">SP</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Smart Procurement</h1>
            <p className="text-sm text-gray-500">Employee Portal</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto py-8 px-6">
        {/* Success confirmation */}
        {submitted && (
          <div className="flex flex-col items-center gap-6 py-16">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="text-center max-w-md">
              <h2 className="text-2xl font-semibold text-gray-900">Request Submitted!</h2>
              <p className="mt-3 text-gray-600">
                Your procurement request has been sent to the procurement office for review.
              </p>
              <div className="mt-4 bg-gray-100 rounded-lg px-4 py-3 inline-block">
                <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Reference ID</span>
                <p className="text-lg font-bold text-gray-800 mt-0.5 font-mono">{submitted.request_id}</p>
              </div>
              <p className="mt-4 text-sm text-gray-500">
                The procurement office will validate your request and select the best supplier. You'll be notified once it's processed.
              </p>
            </div>
            <button
              onClick={handleNewRequest}
              className="mt-2 bg-blue-600 text-white rounded-lg px-6 py-3 font-medium hover:bg-blue-700 transition-colors"
            >
              Submit Another Request
            </button>
          </div>
        )}

        {/* Loading state */}
        {!submitted && loading && (
          <div className="flex flex-col items-center gap-4 py-16">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-gray-600">Submitting your request…</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-800">{error}</p>
            <button onClick={() => setError(null)} className="mt-2 text-sm text-red-600 hover:text-red-800 underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Form */}
        {!submitted && !loading && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900">New Procurement Request</h2>
              <p className="mt-1 text-sm text-gray-500">
                Describe what you need in plain language. The procurement office will handle supplier selection and approval.
              </p>
            </div>
            <RequestForm
              onSubmit={handleSubmit}
              initialData={null}
              onLanguageChange={() => {}}
              voiceMode={false}
              onVoiceModeChange={() => {}}
              showDemoSelector={true}
              submitLabel="Submit Request"
            />
          </div>
        )}
      </main>
    </div>
  );
}
