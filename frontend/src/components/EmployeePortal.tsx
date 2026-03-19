import { useCallback, useRef, useState } from "react";
import CategoryDisambiguation from "./CategoryDisambiguation";
import EmployeeReviewStep from "./EmployeeReviewStep";
import RequestForm from "./RequestForm";
import ValidationBanner from "./ValidationBanner";
import VoiceConversation from "./VoiceConversation";
import VoiceOverlay from "./VoiceOverlay";
import { useAudioAnalyser } from "../hooks/useAudioAnalyser";
import { t } from "../i18n";
import type {
  FormData,
  ValidationResult,
} from "../types";
import type { VoiceInputHandle } from "./VoiceInput";

type Phase = "form" | "review" | "submitted";
type ConversationPhase = "idle" | "speaking" | "listening" | "processing";
type OverlayPhase = "listening" | "processing" | "speaking" | "closing";

const VOICE_SUCCESS_TEXT =
  "Perfect! I'll estimate the category for you. Please check that the form is filled in correctly.";

interface Props {
  onBack: () => void;
}

interface SubmitResult {
  request_id: string;
}

export default function EmployeePortal({ onBack }: Props) {
  const [phase, setPhase] = useState<Phase>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState("en");

  // Validation state
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [originalFormData, setOriginalFormData] = useState<FormData | null>(null);

  // Submit state
  const [submitted, setSubmitted] = useState<SubmitResult | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  // Voice state
  const [voiceMode, setVoiceMode] = useState(false);
  const [ttsText, setTtsText] = useState<string | null>(null);
  const [conversationPhase, setConversationPhase] = useState<ConversationPhase>("idle");
  const voiceInputRef = useRef<VoiceInputHandle | null>(null);

  // Overlay state
  const [overlayActive, setOverlayActive] = useState(false);
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("listening");
  const [interimTranscript, setInterimTranscript] = useState("");

  const volumeLevel = useAudioAnalyser(overlayActive);
  const forceTranscriptRef = useRef<((transcript: string) => void) | null>(null);
  // Tracks whether the overlay is waiting for a follow-up answer (fields still missing)
  const pendingFollowUpRef = useRef(false);
  // Tracks the voice conversation round (0 = first interaction)
  const voiceRoundRef = useRef(0);
  // Delivery address conversation phase from RequestForm
  const deliveryAddressPhaseRef = useRef<string>("not_asked");
  const vagueAddressCityRef = useRef<string | null>(null);

  const i = t(language);

  // ── Activate voice overlay (one-shot flow) ──────────────────
  const handleActivateVoice = useCallback(() => {
    // Micro-interaction: haptic feedback
    if (navigator.vibrate) navigator.vibrate(50);

    setOverlayActive(true);
    setOverlayPhase("listening");
    setInterimTranscript("");
    setVoiceMode(true);
    setTtsText(null);
    setConversationPhase("idle");
    voiceRoundRef.current = 0;
    deliveryAddressPhaseRef.current = "not_asked";
    vagueAddressCityRef.current = null;

    // Start listening after a brief delay for overlay to mount
    setTimeout(() => {
      voiceInputRef.current?.startListening();
    }, 300);
  }, []);

  // ── Close overlay ───────────────────────────────────────────
  const handleOverlayClose = useCallback(() => {
    setOverlayPhase("closing");
    voiceInputRef.current?.stopListening();
    pendingFollowUpRef.current = false;
    setTimeout(() => {
      setOverlayActive(false);
      setVoiceMode(false);
      setTtsText(null);
      setConversationPhase("idle");
      setInterimTranscript("");
    }, 400);
  }, []);

  // ── Called by RequestForm after voice parse with missing required fields ──
  const handleMissingFieldsFromOverlay = useCallback(async (
    fields: string[],
    addrPhase?: string,
    vagueCity?: string | null,
  ) => {
    setOverlayPhase("processing");
    setInterimTranscript("");

    // Store delivery address context for the follow-up API
    if (addrPhase) deliveryAddressPhaseRef.current = addrPhase;
    if (vagueCity !== undefined) vagueAddressCityRef.current = vagueCity;

    const isFirstRound = voiceRoundRef.current === 0;
    voiceRoundRef.current += 1;

    if (fields.length === 0) {
      // All required fields filled — success
      pendingFollowUpRef.current = false;
      const prefix = isFirstRound ? "Got it! " : "";
      setTimeout(() => {
        setTtsText(prefix + VOICE_SUCCESS_TEXT);
        setConversationPhase("speaking");
      }, 500);
    } else {
      // Fields still missing — ask follow-up via LLM
      pendingFollowUpRef.current = true;

      // Determine delivery address phase to send to backend
      const deliveryPhase = fields.includes("delivery_location")
        ? deliveryAddressPhaseRef.current
        : null;

      try {
        const res = await fetch("/api/generate-followup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            missing_fields: fields,
            language,
            is_first_round: isFirstRound,
            delivery_address_phase: deliveryPhase,
            delivery_address_city: vagueAddressCityRef.current,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setTtsText(data.text);
        } else {
          setTtsText("Could you provide a few more details?");
        }
      } catch {
        setTtsText("Could you provide a few more details?");
      }
      setConversationPhase("speaking");
    }
  }, [language]);

  // ── Called when TTS audio starts playing ────────────────────
  const handleSpeakingStart = useCallback(() => {
    setOverlayPhase("speaking");
  }, []);

  // ── Called when TTS playback ends ───────────────────────────
  const handlePlaybackEnd = useCallback(() => {
    if (!voiceMode) return;

    if (overlayActive) {
      if (pendingFollowUpRef.current) {
        // Follow-up question was asked — re-open listening for the answer
        setOverlayPhase("listening");
        setInterimTranscript("");
        setTtsText(null);
        // Reset conversationPhase so the next setConversationPhase("speaking")
        // is seen as a change by React and re-triggers VoiceConversation's TTS effect
        setConversationPhase("idle");
        // Longer delay gives browser time to release audio resources after TTS
        setTimeout(() => {
          voiceInputRef.current?.startListening();
        }, 800);
      } else {
        // All fields filled — close overlay
        setOverlayPhase("closing");
        setTimeout(() => {
          setOverlayActive(false);
          setVoiceMode(false);
          setTtsText(null);
          setConversationPhase("idle");
        }, 400);
      }
      return;
    }

    // Legacy non-overlay flow (fallback)
    if (result?.is_valid) {
      setConversationPhase("idle");
      return;
    }
    setConversationPhase("listening");
    setTimeout(() => {
      voiceInputRef.current?.startListening();
    }, 300);
  }, [voiceMode, overlayActive, result?.is_valid]);

  const handleVoiceStop = useCallback(() => {
    setVoiceMode(false);
    setTtsText(null);
    setConversationPhase("idle");
    setOverlayActive(false);
    setInterimTranscript("");
    pendingFollowUpRef.current = false;
    voiceInputRef.current?.stopListening();
  }, []);

  // ── Validate request ────────────────────────────────────────────
  async function handleSubmit(data: FormData) {
    setFormData(data);
    setOriginalFormData(data);
    setLanguage(data.language);
    setLoading(true);
    setResult(null);
    setError(null);

    // In overlay mode, don't set ttsText from validation — it's already set
    if (voiceMode && !overlayActive) {
      setConversationPhase("processing");
      setTtsText(null);
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
        if (voiceMode && !overlayActive) setConversationPhase("idle");
        return;
      }

      const json: ValidationResult = await res.json();
      setResult(json);

      // Pre-fill corrected values in form
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

      // If valid → move to review step
      if (json.is_valid) {
        setPhase("review");
      }

      // Only set TTS from validation if NOT in overlay mode
      if (voiceMode && !overlayActive && json.user_message?.summary) {
        setTtsText(json.user_message.summary);
      } else if (voiceMode && !overlayActive) {
        setConversationPhase("idle");
      }
    } catch {
      setError(i.networkError);
      if (voiceMode && !overlayActive) setConversationPhase("idle");
    } finally {
      setLoading(false);
    }
  }

  // ── Confirm and submit to procurement office ───────────────────
  async function handleConfirmSubmit() {
    if (!result?.enriched_request || !formData) return;
    setSubmitLoading(true);
    setError(null);

    try {
      const enriched = result.enriched_request;
      const res = await fetch("/api/employee/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_text: formData.request_text,
          quantity: enriched.quantity ?? formData.quantity ?? null,
          unit_of_measure: enriched.unit_of_measure || formData.unit_of_measure || null,
          category_l1: enriched.category_l1 || null,
          category_l2: enriched.category_l2 || null,
          delivery_address: enriched.delivery_address || formData.delivery_address || null,
          required_by_date: enriched.required_by_date || formData.required_by_date || null,
          preferred_supplier: enriched.preferred_supplier || formData.preferred_supplier || null,
          language: formData.language || "en",
          validated: true,
          enriched_data: enriched,
        }),
      });

      if (!res.ok) {
        setError("Failed to submit request. Please try again.");
        return;
      }
      const json: SubmitResult = await res.json();
      setSubmitted(json);
      setPhase("submitted");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitLoading(false);
    }
  }

  // ── Go back to form from review ────────────────────────────────
  function handleEditFromReview() {
    if (result?.enriched_request && formData) {
      const enriched = result.enriched_request;
      setFormData({
        ...formData,
        category_l1: enriched.category_l1 || formData.category_l1,
        category_l2: enriched.category_l2 || formData.category_l2,
      });
    }
    setResult(null);
    setPhase("form");
  }

  function handleCategoryConfirm(categoryL1: string, categoryL2: string) {
    if (!formData) return;
    handleSubmit({ ...formData, category_l1: categoryL1, category_l2: categoryL2 });
  }

  function handleNewRequest() {
    setPhase("form");
    setResult(null);
    setFormData(null);
    setOriginalFormData(null);
    setSubmitted(null);
    setError(null);
    setVoiceMode(false);
    setTtsText(null);
    setConversationPhase("idle");
    setOverlayActive(false);
    setInterimTranscript("");
    deliveryAddressPhaseRef.current = "not_asked";
    vagueAddressCityRef.current = null;
  }

  function getAutoDetectedFields(): string[] {
    if (!originalFormData || !result?.enriched_request) return [];
    const fields: string[] = [];
    if (!originalFormData.category_l1 && result.enriched_request.category_l1) {
      fields.push("category_l1");
    }
    if (!originalFormData.category_l2 && result.enriched_request.category_l2) {
      fields.push("category_l2");
    }
    if (result.enriched_request.delivery_country) {
      fields.push("delivery_country");
    }
    return fields;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Voice Overlay */}
      <VoiceOverlay
        active={overlayActive}
        phase={overlayPhase}
        volumeLevel={volumeLevel}
        interimTranscript={interimTranscript}
        onClose={handleOverlayClose}
        onStopListening={() => {
          voiceInputRef.current?.stopListening();
          const transcript = interimTranscript.trim();
          if (transcript) {
            setOverlayPhase("processing");
            setInterimTranscript("");
            // Send transcript to parse — missing fields callback will handle the flow
            forceTranscriptRef.current?.(transcript);
          } else {
            handleOverlayClose();
          }
        }}
      />

      {/* VoiceConversation — hidden when overlay active, but TTS logic still runs */}
      <VoiceConversation
        textToSpeak={ttsText}
        language={language}
        active={voiceMode}
        onPlaybackEnd={handlePlaybackEnd}
        onStop={handleVoiceStop}
        externalPhase={conversationPhase}
        hidden={overlayActive}
        onSpeakingStart={handleSpeakingStart}
      />

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
        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-800">{error}</p>
            <button onClick={() => setError(null)} className="mt-2 text-sm text-red-600 hover:text-red-800 underline">
              {i.tryAgain}
            </button>
          </div>
        )}

        {/* Loading */}
        {(loading || submitLoading) && (
          <div className="flex flex-col items-center gap-4 py-16">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-gray-600">
              {submitLoading ? "Submitting your request..." : i.analyzing}
            </p>
          </div>
        )}

        {/* Phase: Submitted */}
        {!loading && !submitLoading && phase === "submitted" && submitted && (
          <div className="flex flex-col items-center gap-6 py-16">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="text-center max-w-md">
              <h2 className="text-2xl font-semibold text-gray-900">Request Submitted!</h2>
              <p className="mt-3 text-gray-600">
                Your procurement request has been validated and sent to the procurement office for processing.
              </p>
              <div className="mt-4 bg-gray-100 rounded-lg px-4 py-3 inline-block">
                <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Reference ID</span>
                <p className="text-lg font-bold text-gray-800 mt-0.5 font-mono">{submitted.request_id}</p>
              </div>
              <p className="mt-4 text-sm text-gray-500">
                The procurement office will select the best supplier and complete the order.
              </p>
            </div>
            <button
              onClick={handleNewRequest}
              className="mt-2 bg-blue-600 text-white rounded-lg px-6 py-3 font-medium hover:bg-blue-700 transition-colors"
            >
              {i.newRequest}
            </button>
          </div>
        )}

        {/* Phase: Review */}
        {!loading && !submitLoading && phase === "review" && result?.enriched_request && (
          <EmployeeReviewStep
            enrichedRequest={result.enriched_request}
            language={language}
            autoDetectedFields={getAutoDetectedFields()}
            onConfirm={handleConfirmSubmit}
            onEdit={handleEditFromReview}
          />
        )}

        {/* Phase: Form */}
        {!loading && !submitLoading && phase === "form" && (
          <>
            {result?.category_suggestion?.needs_disambiguation && (
              <CategoryDisambiguation
                suggestion={result.category_suggestion}
                lang={language}
                onConfirm={handleCategoryConfirm}
              />
            )}

            {result && !result.is_valid && !result.category_suggestion?.needs_disambiguation && (
              <ValidationBanner result={result} lang={language} />
            )}

            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900">New Procurement Request</h2>
              <p className="mt-1 text-sm text-gray-500">
                Describe what you need in plain language. Your request will be validated before submission.
              </p>
            </div>
            <RequestForm
              onSubmit={handleSubmit}
              initialData={formData}
              onLanguageChange={setLanguage}
              voiceMode={voiceMode}
              onVoiceModeChange={setVoiceMode}
              voiceInputRef={voiceInputRef}
              showDemoSelector={true}
              submitLabel={i.validateRequest}
              onActivateVoiceOverlay={handleActivateVoice}
              onInterimTranscriptChange={setInterimTranscript}
              overlayActive={overlayActive}
              onRegisterForceTranscript={(fn) => { forceTranscriptRef.current = fn; }}
              onMissingFieldsDetected={handleMissingFieldsFromOverlay}
            />
          </>
        )}
      </main>
    </div>
  );
}
