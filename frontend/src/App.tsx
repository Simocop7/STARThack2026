import { useState } from "react";
import CategoryDisambiguation from "./components/CategoryDisambiguation";
import RequestForm from "./components/RequestForm";
import ValidationBanner from "./components/ValidationBanner";
import SupplierRankingView from "./components/SupplierRankingView";
import { t } from "./i18n";
import type { FormData, ValidationResult, RankedSupplierOutput } from "./types";

export default function App() {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [ranking, setRanking] = useState<RankedSupplierOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [language, setLanguage] = useState("en");

  const i = t(language);

  async function handleSubmit(data: FormData) {
    setFormData(data);
    setLanguage(data.language);
    setLoading(true);
    setResult(null);
    setRanking(null);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        request_text: data.request_text,
        quantity: data.quantity || null,
        unit_of_measure: data.unit_of_measure || null,
        category_l1: data.category_l1 || null,
        category_l2: data.category_l2 || null,
        delivery_address: data.delivery_address || null,
        required_by_date: data.required_by_date || null,
        preferred_supplier: data.preferred_supplier || null,
        language: data.language || "en",
      };

      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const detail = await res.text();
        setError(`Validation failed (${res.status}): ${detail}`);
        return;
      }

      const json: ValidationResult = await res.json();
      setResult(json);

      // If invalid, pre-fill form with corrected values
      if (!json.is_valid && json.corrected_request) {
        const c = json.corrected_request;
        setFormData({
          request_text: (c.request_text as string) || data.request_text,
          quantity: (c.quantity as number) ?? data.quantity,
          unit_of_measure: (c.unit_of_measure as string) || data.unit_of_measure,
          category_l1: (c.category_l1 as string) || data.category_l1,
          category_l2: (c.category_l2 as string) || data.category_l2,
          delivery_address: (c.delivery_address as string) || data.delivery_address,
          required_by_date: ((c.required_by_date as string) || data.required_by_date).split("T")[0],
          preferred_supplier: (c.preferred_supplier as string) || data.preferred_supplier,
          language: data.language,
        });
      }

      // If valid, auto-trigger ranking
      if (json.is_valid && json.enriched_request) {
        await fetchRanking(json.enriched_request);
      }
    } catch {
      setError(i.networkError);
    } finally {
      setLoading(false);
    }
  }

  async function fetchRanking(enriched: Record<string, unknown>) {
    setRankingLoading(true);
    try {
      // Map enriched_request fields → CleanOrderRecap
      const deliveryCountries = enriched.delivery_countries as string[] | undefined;
      const deliveryCountry =
        Array.isArray(deliveryCountries) && deliveryCountries.length > 0
          ? deliveryCountries[0]
          : (enriched.country as string) ?? "DE";

      const order = {
        request_id: (enriched.request_id as string) ?? "REQ-UNKNOWN",
        category_l1: enriched.category_l1 as string,
        category_l2: enriched.category_l2 as string,
        quantity: (enriched.quantity as number) ?? 1,
        unit_of_measure: (enriched.unit_of_measure as string) ?? "unit",
        budget_amount: (enriched.budget_amount as number) ?? null,
        currency: (enriched.currency as string) ?? "EUR",
        delivery_country: deliveryCountry,
        required_by_date: (enriched.required_by_date as string) ?? null,
        data_residency_required: (enriched.data_residency_constraint as boolean) ?? false,
        esg_requirement: (enriched.esg_requirement as boolean) ?? false,
        preferred_supplier_id: null,
        preferred_supplier_name: (enriched.preferred_supplier_mentioned as string) ?? null,
      };

      const res = await fetch("/api/rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order),
      });

      if (res.ok) {
        const rankResult: RankedSupplierOutput = await res.json();
        setRanking(rankResult);
      }
    } catch {
      // Ranking failure is non-fatal — just don't show ranking
    } finally {
      setRankingLoading(false);
    }
  }

  function handleNewRequest() {
    setResult(null);
    setRanking(null);
    setError(null);
    setFormData(null);
  }

  function handleCategoryConfirm(categoryL1: string, categoryL2: string) {
    if (!formData) return;
    handleSubmit({ ...formData, category_l1: categoryL1, category_l2: categoryL2 });
  }

  const isApproved = result?.is_valid === true;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">SP</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{i.appTitle}</h1>
            <p className="text-sm text-gray-500">{i.appSubtitle}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto py-8 px-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-800">{error}</p>
            <button onClick={() => setError(null)} className="mt-2 text-sm text-red-600 hover:text-red-800 underline">
              {i.tryAgain}
            </button>
          </div>
        )}

        {(loading || rankingLoading) && (
          <div className="flex flex-col items-center gap-4 py-16">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-gray-600">{rankingLoading ? "Finding best suppliers…" : i.analyzing}</p>
          </div>
        )}

        {/* Approved + ranking loaded */}
        {!loading && !rankingLoading && isApproved && ranking && (
          <SupplierRankingView result={ranking} onNewRequest={handleNewRequest} />
        )}

        {/* Approved but ranking still loading or failed silently */}
        {!loading && !rankingLoading && isApproved && !ranking && (
          <div className="flex flex-col items-center gap-6 py-16">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-green-800">{i.requestApproved}</h2>
              <p className="mt-2 text-gray-600 max-w-lg">{i.approvedMessage}</p>
            </div>
            <button onClick={handleNewRequest} className="bg-blue-600 text-white rounded-lg px-6 py-3 font-medium hover:bg-blue-700 transition-colors">
              {i.newRequest}
            </button>
          </div>
        )}

        {/* Category disambiguation */}
        {!loading && result?.category_suggestion?.needs_disambiguation && (
          <CategoryDisambiguation suggestion={result.category_suggestion} lang={language} onConfirm={handleCategoryConfirm} />
        )}

        {/* Invalid: show banner + form */}
        {!loading && !rankingLoading && !isApproved && (
          <>
            {result && !result.category_suggestion?.needs_disambiguation && (
              <ValidationBanner result={result} lang={language} />
            )}
            <RequestForm onSubmit={handleSubmit} initialData={formData} onLanguageChange={setLanguage} />
          </>
        )}
      </main>
    </div>
  );
}
