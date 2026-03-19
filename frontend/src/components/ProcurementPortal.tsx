import { useCallback, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import CategoryDisambiguation from "./CategoryDisambiguation";
import { ProcurementLoading } from "./ui/procurement-loading";
import RequestForm from "./RequestForm";
import ValidationBanner from "./ValidationBanner";
import SupplierRankingView from "./SupplierRankingView";
import OrderConfirmationView from "./OrderConfirmationView";
import OrderRecapView from "./OrderRecapView";
import VoiceConversation from "./VoiceConversation";
import PendingRequestsView from "./PendingRequestsView";
import { t } from "../i18n";
import type {
  FormData,
  ValidationResult,
  RankedSupplierOutput,
  ScoredSupplier,
  OrderConfirmation,
  EnrichedRequest,
} from "../types";
import type { VoiceInputHandle } from "./VoiceInput";

type ConversationPhase = "idle" | "speaking" | "listening" | "processing";
type OfficePhase = "inbox" | "process";

interface Props {
  onBack: () => void;
}

export default function ProcurementPortal({ onBack }: Props) {
  // ── Office navigation state ─────────────────────────────────────
  const [officePhase, setOfficePhase] = useState<OfficePhase>("inbox");

  // ── Processing state (mirrors original App.tsx) ─────────────────
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [ranking, setRanking] = useState<RankedSupplierOutput | null>(null);
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [language, setLanguage] = useState("en");
  const [selectedSupplier, setSelectedSupplier] = useState<ScoredSupplier | null>(null);

  // Employee request tracking
  const [activeEmpRequestId, setActiveEmpRequestId] = useState<string | null>(null);

  // Voice conversation state
  const [voiceMode, setVoiceMode] = useState(false);
  const [ttsText, setTtsText] = useState<string | null>(null);
  const [conversationPhase, setConversationPhase] = useState<ConversationPhase>("idle");

  const voiceInputRef = useRef<VoiceInputHandle | null>(null);
  const i = t(language);

  // ── Currency helper ──────────────────────────────────────────────
  function currencyForCountry(country: string): string {
    if (country === "CH") return "CHF";
    if (["US", "CA", "BR", "MX", "SG", "AU", "IN", "JP", "UAE", "ZA"].includes(country)) return "USD";
    return "EUR";
  }

  // ── Enter processing flow from inbox ────────────────────────────
  function handleProcessRequest(data: FormData, empRequestId: string) {
    setActiveEmpRequestId(empRequestId);
    setFormData(data);
    setLanguage(data.language || "en");
    setResult(null);
    setRanking(null);
    setOrderConfirmation(null);
    setError(null);
    setOfficePhase("process");
  }

  function handleNewManual() {
    setActiveEmpRequestId(null);
    setFormData(null);
    setResult(null);
    setRanking(null);
    setOrderConfirmation(null);
    setError(null);
    setOfficePhase("process");
  }

  // ── Validate request ────────────────────────────────────────────
  async function handleSubmit(data: FormData) {
    setFormData(data);
    setLanguage(data.language);
    setLoading(true);
    setResult(null);
    setRanking(null);
    setError(null);
    setTtsText(null);

    if (voiceMode) setConversationPhase("processing");

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

      if (!json.is_valid && json.corrected_request) {
        const c = json.corrected_request;
        setFormData({
          request_text: (c.request_text as string) || data.request_text,
          quantity: (c.quantity as number) ?? data.quantity,
          unit_of_measure: (c.unit_of_measure as string) || data.unit_of_measure,
          category_l1: (c.category_l1 as string) || data.category_l1,
          category_l2: (c.category_l2 as string) || data.category_l2,
          delivery_address: (c.delivery_address as string) || data.delivery_address,
          required_by_date: ((c.required_by_date as string) || data.required_by_date || "").split("T")[0],
          preferred_supplier: (c.preferred_supplier as string) || data.preferred_supplier,
          language: data.language,
        });
      }

      if (json.is_valid && json.enriched_request) {
        await fetchRanking(json.enriched_request);
      }

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

  // ── Rank suppliers ───────────────────────────────────────────────
  async function fetchRanking(enriched: EnrichedRequest) {
    setRankingLoading(true);
    try {
      const deliveryCountry = enriched.delivery_country ?? "DE";
      const catSuggestion = enriched.category_suggestion as
        | { category_l1?: string; category_l2?: string }
        | undefined;
      const categoryL1 = enriched.category_l1 || catSuggestion?.category_l1 || "";
      const categoryL2 = enriched.category_l2 || catSuggestion?.category_l2 || "";
      const currency = currencyForCountry(deliveryCountry);

      const order = {
        request_id: "REQ-UNKNOWN",
        category_l1: categoryL1,
        category_l2: categoryL2,
        quantity: enriched.quantity ?? 1,
        unit_of_measure: enriched.unit_of_measure ?? "unit",
        budget_amount: null,
        currency,
        delivery_country: deliveryCountry,
        required_by_date: enriched.required_by_date ?? null,
        data_residency_required: enriched.data_residency_required ?? false,
        esg_requirement: enriched.esg_requirement ?? false,
        preferred_supplier_id: enriched.preferred_supplier_id ?? null,
        preferred_supplier_name: enriched.preferred_supplier_name ?? null,
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
      // Ranking failure is non-fatal
    } finally {
      setRankingLoading(false);
    }
  }

  // ── Step 1: supplier selected → show recap page ──────────────────
  function handleSelectSupplier(supplier: ScoredSupplier) {
    setSelectedSupplier(supplier);
  }

  // ── Step 2: confirmed on recap page → place order ─────────────────
  async function handleConfirmOrder() {
    if (!ranking || !formData || !selectedSupplier) return;
    const enriched = result?.enriched_request;
    setOrderLoading(true);
    try {
      const deliveryCountry = enriched?.delivery_country ?? "DE";
      const body = {
        request_id: ranking.request_id,
        category_l1: formData.category_l1,
        category_l2: formData.category_l2,
        quantity: formData.quantity ?? 1,
        unit_of_measure: formData.unit_of_measure || "unit",
        currency: currencyForCountry(deliveryCountry),
        delivery_country: deliveryCountry,
        required_by_date: formData.required_by_date || null,
        selected_supplier_id: selectedSupplier.supplier_id,
        selected_supplier_name: selectedSupplier.supplier_name,
        unit_price: selectedSupplier.unit_price,
        total_price: selectedSupplier.total_price,
        pricing_tier_applied: selectedSupplier.pricing_tier_applied,
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
        setSelectedSupplier(null);
        if (activeEmpRequestId) {
          fetch(`/api/employee/requests/${activeEmpRequestId}/status?status=completed`, {
            method: "PATCH",
          }).catch(() => {});
        }
      } else {
        setError("Failed to place order. Please try again.");
      }
    } catch {
      setError(i.networkError);
    } finally {
      setOrderLoading(false);
    }
  }

  // ── Refuse request ──────────────────────────────────────────────
  function handleRefuseRequest(empRequestId: string) {
    // Status already updated by PendingRequestsView — just stay on inbox
  }

  function handleRefuseDuringProcessing() {
    if (activeEmpRequestId) {
      fetch(`/api/employee/requests/${activeEmpRequestId}/status?status=refused`, {
        method: "PATCH",
      }).catch(() => {});
    }
    setResult(null);
    setRanking(null);
    setOrderConfirmation(null);
    setError(null);
    setFormData(null);
    setVoiceMode(false);
    setTtsText(null);
    setConversationPhase("idle");
    setActiveEmpRequestId(null);
    setOfficePhase("inbox");
  }

  // ── Reset to inbox ───────────────────────────────────────────────
  function handleNewRequest() {
    setResult(null);
    setRanking(null);
    setOrderConfirmation(null);
    setSelectedSupplier(null);
    setError(null);
    setFormData(null);
    setVoiceMode(false);
    setTtsText(null);
    setConversationPhase("idle");
    setActiveEmpRequestId(null);
    setOfficePhase("inbox");
  }

  function handleCategoryConfirm(categoryL1: string, categoryL2: string) {
    if (!formData) return;
    handleSubmit({ ...formData, category_l1: categoryL1, category_l2: categoryL2 });
  }

  const handlePlaybackEnd = useCallback(() => {
    if (!voiceMode) return;
    if (result?.is_valid) {
      setConversationPhase("idle");
      return;
    }
    setConversationPhase("listening");
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
      <header className="bg-white border-b border-gray-200 px-6 py-4 print:hidden">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-600 transition-colors mr-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">SP</span>
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-gray-900">Smart Procurement</h1>
            <p className="text-sm text-gray-500">Procurement Office</p>
          </div>

          {/* Breadcrumb nav */}
          {officePhase === "process" && (
            <div className="flex items-center gap-3">
              {activeEmpRequestId && !orderConfirmation && (
                <button
                  onClick={handleRefuseDuringProcessing}
                  className="text-sm font-medium rounded-lg px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                >
                  Refuse Request
                </button>
              )}
              <button
                onClick={() => {
                  setOfficePhase("inbox");
                  setResult(null);
                  setRanking(null);
                  setOrderConfirmation(null);
                  setError(null);
                }}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back to Inbox
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto py-8 px-6">
        {/* ── Inbox view ── */}
        {officePhase === "inbox" && (
          <PendingRequestsView
            onProcess={handleProcessRequest}
            onRefuse={handleRefuseRequest}
            onNewManual={handleNewManual}
          />
        )}

        {/* ── Processing view ── */}
        {officePhase === "process" && (
          <>
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

            <AnimatePresence mode="wait">
              {(loading || rankingLoading || orderLoading) && (
                <ProcurementLoading
                  phase={orderLoading ? "ordering" : rankingLoading ? "ranking" : "validating"}
                />
              )}
            </AnimatePresence>

            {!loading && !rankingLoading && !orderLoading && orderConfirmation && (
              <OrderConfirmationView confirmation={orderConfirmation} onNewRequest={handleNewRequest} />
            )}

            {/* Order recap — shown after supplier selected, before sending */}
            {!loading && !rankingLoading && !orderLoading && !orderConfirmation && selectedSupplier && ranking && formData && (
              <OrderRecapView
                supplier={selectedSupplier}
                ranking={ranking}
                formData={formData}
                deliveryCountry={result?.enriched_request?.delivery_country ?? "DE"}
                onConfirm={handleConfirmOrder}
                onBack={() => setSelectedSupplier(null)}
                loading={orderLoading}
              />
            )}

            {!loading && !rankingLoading && !orderLoading && !orderConfirmation && !selectedSupplier && isApproved && ranking && (
              <SupplierRankingView
                result={ranking}
                onNewRequest={handleNewRequest}
                onSelectSupplier={handleSelectSupplier}
                orderContext={formData}
              />
            )}

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
                <button onClick={handleNewRequest} className="bg-indigo-600 text-white rounded-lg px-6 py-3 font-medium hover:bg-indigo-700 transition-colors">
                  {i.newRequest}
                </button>
              </div>
            )}

            {!loading && result?.category_suggestion?.needs_disambiguation && (
              <CategoryDisambiguation suggestion={result.category_suggestion} lang={language} onConfirm={handleCategoryConfirm} />
            )}

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
                  showDemoSelector={true}
                  submitLabel={i.validateRequest}
                />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
