import { useCallback, useRef, useState } from "react";
import CategoryDisambiguation from "./components/CategoryDisambiguation";
import RequestForm from "./components/RequestForm";
import ValidationBanner from "./components/ValidationBanner";
import SupplierRankingView from "./components/SupplierRankingView";
import OrderConfirmationView from "./components/OrderConfirmationView";
import VoiceConversation from "./components/VoiceConversation";
import { t } from "./i18n";
import type { FormData, ValidationResult, RankedSupplierOutput, ScoredSupplier, OrderConfirmation } from "./types";
import type { VoiceInputHandle } from "./components/VoiceInput";

type ConversationPhase = "idle" | "speaking" | "listening" | "processing";

export default function App() {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [ranking, setRanking] = useState<RankedSupplierOutput | null>(null);
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [language, setLanguage] = useState("en");

  // Voice conversation state
  const [voiceMode, setVoiceMode] = useState(false);
  const [ttsText, setTtsText] = useState<string | null>(null);
  const [conversationPhase, setConversationPhase] = useState<ConversationPhase>("idle");

  const voiceInputRef = useRef<VoiceInputHandle | null>(null);

  const i = t(language);

  async function handleSubmit(data: FormData) {
    setFormData(data);
    setLanguage(data.language);
    setLoading(true);
    setResult(null);
    setRanking(null);
    setError(null);
    setTtsText(null);

    if (voiceMode) {
      setConversationPhase("processing");
    }

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
        if (voiceMode) setConversationPhase("idle");
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

      // Voice mode: trigger TTS with the validation summary
      if (voiceMode && json.user_message?.summary) {
        setTtsText(json.user_message.summary);
      } else if (voiceMode) {
        setConversationPhase("idle");
      }
    } catch {
      setError(i.networkError);
      if (voiceMode) setConversationPhase("idle");
    } finally {
      setLoading(false);
    }
  }

  async function fetchRanking(enriched: Record<string, unknown>) {
    setRankingLoading(true);
    try {
      // Map EnrichedRequest fields → CleanOrderRecap
      // EnrichedRequest has: delivery_country (singular), category_suggestion for categories,
      // preferred_supplier_id/preferred_supplier_name for supplier info.
      const deliveryCountry =
        (enriched.delivery_country as string) ?? "DE";

      // Category: use direct fields first, fall back to category_suggestion
      const catSuggestion = enriched.category_suggestion as
        | { category_l1?: string; category_l2?: string }
        | undefined;
      const categoryL1 =
        (enriched.category_l1 as string) || catSuggestion?.category_l1 || "";
      const categoryL2 =
        (enriched.category_l2 as string) || catSuggestion?.category_l2 || "";

      const order = {
        request_id: "REQ-VOICE",
        category_l1: categoryL1,
        category_l2: categoryL2,
        quantity: (enriched.quantity as number) ?? 1,
        unit_of_measure: (enriched.unit_of_measure as string) ?? "unit",
        budget_amount: null,
        currency: "EUR",
        delivery_country: deliveryCountry,
        required_by_date: (enriched.required_by_date as string) ?? null,
        data_residency_required: (enriched.data_residency_required as boolean) ?? false,
        esg_requirement: (enriched.esg_requirement as boolean) ?? false,
        preferred_supplier_id: (enriched.preferred_supplier_id as string) ?? null,
        preferred_supplier_name: (enriched.preferred_supplier_name as string) ?? null,
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

  async function handleSelectSupplier(supplier: ScoredSupplier) {
    if (!ranking || !formData) return;
    setOrderLoading(true);
    try {
      const body = {
        request_id: ranking.request_id,
        category_l1: formData.category_l1,
        category_l2: formData.category_l2,
        quantity: formData.quantity ?? supplier.unit_price,
        unit_of_measure: formData.unit_of_measure || "unit",
        currency: "EUR",
        delivery_country: formData.delivery_address?.split(",").pop()?.trim() ?? "DE",
        required_by_date: formData.required_by_date || null,
        selected_supplier_id: supplier.supplier_id,
        selected_supplier_name: supplier.supplier_name,
        unit_price: supplier.unit_price,
        total_price: supplier.total_price,
        pricing_tier_applied: supplier.pricing_tier_applied,
        approval_threshold_id: ranking.approval_threshold_id,
        approval_threshold_note: ranking.approval_threshold_note,
        quotes_required: ranking.quotes_required,
        notes: null,
      };
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const conf: OrderConfirmation = await res.json();
        setOrderConfirmation(conf);
      } else {
        setError("Failed to place order. Please try again.");
      }
    } catch {
      setError(i.networkError);
    } finally {
      setOrderLoading(false);
    }
  }

  function handleNewRequest() {
    setResult(null);
    setRanking(null);
    setOrderConfirmation(null);
    setError(null);
    setFormData(null);
    setVoiceMode(false);
    setTtsText(null);
    setConversationPhase("idle");
  }

  function handleCategoryConfirm(categoryL1: string, categoryL2: string) {
    if (!formData) return;
    handleSubmit({ ...formData, category_l1: categoryL1, category_l2: categoryL2 });
  }

  // Called when TTS playback ends — activate mic for user response
  const handlePlaybackEnd = useCallback(() => {
    if (!voiceMode) return;

    // If valid, conversation is done
    if (result?.is_valid) {
      setConversationPhase("idle");
      return;
    }

    // If invalid, activate mic to listen for user's correction
    setConversationPhase("listening");
    // Small delay to avoid audio feedback
    setTimeout(() => {
      voiceInputRef.current?.startListening();
    }, 300);
  }, [voiceMode, result]);

  const handleVoiceStop = useCallback(() => {
    setVoiceMode(false);
    setTtsText(null);
    setConversationPhase("idle");
    voiceInputRef.current?.stopListening();
  }, []);

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
        {/* Voice conversation status bar */}
        <VoiceConversation
          textToSpeak={ttsText}
          language={language}
          active={voiceMode}
          onPlaybackEnd={handlePlaybackEnd}
          onStop={handleVoiceStop}
          externalPhase={conversationPhase}
        />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-800">{error}</p>
            <button onClick={() => setError(null)} className="mt-2 text-sm text-red-600 hover:text-red-800 underline">
              {i.tryAgain}
            </button>
          </div>
        )}

        {(loading || rankingLoading || orderLoading) && (
          <div className="flex flex-col items-center gap-4 py-16">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-gray-600">
              {orderLoading ? "Placing order…" : rankingLoading ? "Finding best suppliers…" : i.analyzing}
            </p>
          </div>
        )}

        {/* Order confirmation */}
        {!loading && !rankingLoading && !orderLoading && orderConfirmation && (
          <OrderConfirmationView confirmation={orderConfirmation} onNewRequest={handleNewRequest} />
        )}

        {/* Approved + ranking loaded */}
        {!loading && !rankingLoading && !orderLoading && !orderConfirmation && isApproved && ranking && (
          <SupplierRankingView
            result={ranking}
            onNewRequest={handleNewRequest}
            onSelectSupplier={handleSelectSupplier}
          />
        )}

        {/* Approved but ranking still loading or failed silently */}
        {!loading && !rankingLoading && !orderLoading && !orderConfirmation && isApproved && !ranking && (
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

            <RequestForm
              onSubmit={handleSubmit}
              initialData={formData}
              onLanguageChange={setLanguage}
              voiceMode={voiceMode}
              onVoiceModeChange={setVoiceMode}
              voiceInputRef={voiceInputRef}
            />
          </>
        )}
      </main>
    </div>
  );
}
