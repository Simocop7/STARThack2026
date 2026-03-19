import { useState } from "react";
import type { RankedSupplierOutput, ScoredSupplier, Escalation } from "../types";

interface Props {
  result: RankedSupplierOutput;
  onNewRequest: () => void;
  onSelectSupplier: (supplier: ScoredSupplier) => void;
}

// ── Helpers ────────────────────────────────────────────────────────

function fmt(n: number, currency = "EUR") {
  return new Intl.NumberFormat("en-DE", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

function ScoreBar({
  label,
  value,
  color,
  weight,
}: {
  label: string;
  value: number;
  color: string;
  weight?: number;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-20 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-700 w-8 text-right">{pct}</span>
      {weight !== undefined && (
        <span className="text-xs text-gray-400 w-8 text-right">×{Math.round(weight * 100)}%</span>
      )}
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    deterministic: { label: "Deterministic", cls: "bg-blue-100 text-blue-700" },
    llm_fallback: { label: "AI-Enhanced", cls: "bg-purple-100 text-purple-700" },
    hybrid: { label: "Hybrid", cls: "bg-amber-100 text-amber-700" },
  };
  const { label, cls } = map[method] ?? { label: method, cls: "bg-gray-100 text-gray-700" };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const colors = [
    "bg-amber-400 text-white shadow-amber-200",
    "bg-gray-300 text-gray-700 shadow-gray-200",
    "bg-orange-300 text-white shadow-orange-200",
  ];
  const cls = colors[rank - 1] ?? "bg-gray-100 text-gray-600";
  return (
    <div
      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 shadow-sm ${cls}`}
    >
      #{rank}
    </div>
  );
}

function CompositeRing({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 75 ? "text-green-600" : pct >= 50 ? "text-amber-600" : "text-red-600";
  return (
    <div className="flex flex-col items-center shrink-0">
      <div className={`text-2xl font-bold ${color}`}>{pct}</div>
      <div className="text-xs text-gray-400">/ 100</div>
    </div>
  );
}

function EscalationCard({ esc }: { esc: Escalation }) {
  const cls = esc.blocking
    ? "bg-red-50 border-red-200"
    : "bg-amber-50 border-amber-200";
  const textCls = esc.blocking ? "text-red-800" : "text-amber-800";
  const icon = esc.blocking ? "🚫" : "⚠️";
  return (
    <div className={`border rounded-lg p-3 ${cls}`}>
      <div className="flex items-start gap-2">
        <span className="text-base shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-mono text-xs font-bold ${textCls}`}>{esc.rule_id}</span>
            <span className={`text-sm font-semibold ${textCls}`}>{esc.escalate_to}</span>
            {esc.blocking && (
              <span className="text-xs font-semibold bg-red-200 text-red-800 px-1.5 py-0.5 rounded ml-auto shrink-0">
                BLOCKING
              </span>
            )}
          </div>
          <p className={`text-xs mt-1 opacity-80 ${textCls}`}>{esc.detail}</p>
        </div>
      </div>
    </div>
  );
}

function SupplierCard({
  supplier,
  currency,
  weights,
  onSelect,
}: {
  supplier: ScoredSupplier;
  currency: string;
  weights: { price: number; quality: number; risk: number; esg: number; lead_time: number };
  onSelect: (s: ScoredSupplier) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sb = supplier.score_breakdown;
  const isTop = supplier.rank === 1;

  return (
    <div
      className={`border rounded-xl bg-white overflow-hidden transition-shadow hover:shadow-md ${
        isTop ? "border-blue-300 shadow-blue-50 shadow-sm" : "border-gray-200"
      }`}
    >
      {isTop && (
        <div className="bg-blue-600 text-white text-xs font-semibold px-4 py-1.5 flex items-center gap-1.5">
          <span>⭐</span> Recommended Supplier
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center gap-3 p-4">
        <RankBadge rank={supplier.rank} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-base">{supplier.supplier_name}</span>
            {supplier.is_preferred && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                Preferred
              </span>
            )}
            {supplier.is_incumbent && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                Incumbent
              </span>
            )}
            {!supplier.meets_lead_time && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                ⏰ Lead time risk
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {supplier.supplier_id} · Tier: {supplier.pricing_tier_applied}
          </p>
        </div>
        <CompositeRing score={supplier.composite_score} />
      </div>

      {/* Pricing + lead time */}
      <div className="grid grid-cols-3 gap-px bg-gray-100 border-t border-b border-gray-100">
        <div className="bg-white px-4 py-2.5">
          <p className="text-xs text-gray-400 mb-0.5">Unit price</p>
          <p className="font-bold text-gray-900">{fmt(supplier.unit_price, currency)}</p>
        </div>
        <div className="bg-white px-4 py-2.5">
          <p className="text-xs text-gray-400 mb-0.5">Total cost</p>
          <p className="font-bold text-gray-900">{fmt(supplier.total_price, currency)}</p>
        </div>
        <div className="bg-white px-4 py-2.5">
          <p className="text-xs text-gray-400 mb-0.5">Lead time</p>
          <p className="font-bold text-gray-900">
            {supplier.standard_lead_time_days}d
            {supplier.expedited_lead_time_days && (
              <span className="text-xs text-gray-400 font-normal">
                {" "}/ {supplier.expedited_lead_time_days}d exp.
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Score bars */}
      <div className="px-4 py-3 space-y-2">
        <ScoreBar label="Price" value={sb.price_score} color="bg-emerald-500" weight={weights.price} />
        <ScoreBar label="Quality" value={sb.quality_score} color="bg-blue-500" weight={weights.quality} />
        <ScoreBar label="Risk" value={sb.risk_score} color="bg-amber-500" weight={weights.risk} />
        <ScoreBar label="ESG" value={sb.esg_score} color="bg-green-500" weight={weights.esg} />
        <ScoreBar label="Lead time" value={sb.lead_time_score} color="bg-purple-500" weight={weights.lead_time} />
        <p className="text-xs text-gray-400 pt-1">
          Scores are normalised relative to all ranked suppliers. ×Weight column shows contribution to composite score.
        </p>
      </div>

      {/* Select button */}
      <div className="border-t border-gray-100 px-4 py-3">
        <button
          onClick={() => onSelect(supplier)}
          className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-colors ${
            isTop
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          {isTop ? "✓ Select Recommended Supplier" : "Select this Supplier"}
        </button>
      </div>

      {/* Expandable compliance details */}
      <div className="border-t border-gray-100">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-4 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 text-left flex items-center gap-1.5"
        >
          <span className="text-gray-400">{expanded ? "▲" : "▼"}</span>
          {expanded ? "Hide" : "Show"} compliance checks &amp; rationale
        </button>
        {expanded && (
          <div className="px-4 pb-4 space-y-3">
            <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 leading-relaxed">
              {supplier.recommendation_note}
            </p>
            {supplier.compliance_checks.map((c, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs">
                <span
                  className={`mt-0.5 shrink-0 font-bold ${
                    c.result === "pass"
                      ? "text-green-600"
                      : c.result === "fail"
                      ? "text-red-600"
                      : c.result === "warning"
                      ? "text-amber-600"
                      : "text-gray-400"
                  }`}
                >
                  {c.result === "pass" ? "✓" : c.result === "fail" ? "✗" : c.result === "warning" ? "⚠" : "–"}
                </span>
                <span className="font-mono text-gray-400 shrink-0 w-28">{c.rule_id}</span>
                <span className="text-gray-600">{c.detail}</span>
              </div>
            ))}
            {supplier.expedited_unit_price && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                <span className="font-semibold">Expedited option:</span>{" "}
                {fmt(supplier.expedited_unit_price, currency)}/unit →{" "}
                {fmt(supplier.expedited_total_price!, currency)} total (≈+8%)
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

export default function SupplierRankingView({ result, onNewRequest, onSelectSupplier }: Props) {
  const [showExcluded, setShowExcluded] = useState(false);
  const [showWeights, setShowWeights] = useState(false);

  const currency = result.currency || "EUR";
  const blockingEscalations = result.escalations.filter((e) => e.blocking);
  const nonBlockingEscalations = result.escalations.filter((e) => !e.blocking);
  const weights = result.scoring_weights;

  const cheapestTotal = result.ranking.length > 0
    ? Math.min(...result.ranking.map((s) => s.total_price))
    : null;

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h2 className="text-xl font-semibold text-gray-900">Supplier Ranking</h2>
            <MethodBadge method={result.method_used} />
          </div>
          <p className="text-sm text-gray-500">
            {result.ranking.length} supplier{result.ranking.length !== 1 ? "s" : ""} ranked
            {result.quotes_required ? ` · ${result.quotes_required} quote${result.quotes_required > 1 ? "s" : ""} required` : ""}
            {cheapestTotal ? ` · From ${fmt(cheapestTotal, currency)}` : ""}
          </p>
        </div>
        <button
          onClick={onNewRequest}
          className="text-sm text-blue-600 hover:text-blue-800 underline shrink-0"
        >
          ← New request
        </button>
      </div>

      {/* Blocking escalations — shown first so they're unmissable */}
      {blockingEscalations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-red-700 uppercase tracking-wider">
            🚫 Blocking Escalations — Action Required
          </h3>
          {blockingEscalations.map((e, i) => (
            <EscalationCard key={i} esc={e} />
          ))}
        </div>
      )}

      {/* Approval threshold banner */}
      {result.approval_threshold_id && result.approval_threshold_note && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
              <span className="text-indigo-700 text-sm font-bold">✓</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-indigo-900">
                Approval: {result.approval_threshold_id}
              </p>
              <p className="text-sm text-indigo-700 mt-0.5">{result.approval_threshold_note}</p>
            </div>
          </div>
        </div>
      )}

      {/* Budget warning */}
      {result.budget_sufficient === false && result.minimum_total_cost && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">⚠️</span>
            <div>
              <p className="font-semibold text-amber-800">Budget insufficient</p>
              <p className="text-sm text-amber-700 mt-0.5">
                Minimum cost is{" "}
                <strong>{fmt(result.minimum_total_cost, currency)}</strong>
                {result.minimum_cost_supplier && ` (${result.minimum_cost_supplier})`}.
                A budget increase is required to proceed.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Non-blocking escalations */}
      {nonBlockingEscalations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wider">
            ⚠️ Escalations (non-blocking)
          </h3>
          {nonBlockingEscalations.map((e, i) => (
            <EscalationCard key={i} esc={e} />
          ))}
        </div>
      )}

      {/* Supplier cards */}
      {result.ranking.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
              Ranked Suppliers
            </h3>
            <button
              onClick={() => setShowWeights((v) => !v)}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              {showWeights ? "Hide" : "Show"} scoring weights
            </button>
          </div>

          {showWeights && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Scoring Weights
              </p>
              {[
                { label: "Price", w: weights.price, color: "bg-emerald-500" },
                { label: "Quality", w: weights.quality, color: "bg-blue-500" },
                { label: "Risk (lower is better)", w: weights.risk, color: "bg-amber-500" },
                { label: "ESG", w: weights.esg, color: "bg-green-500" },
                { label: "Lead Time", w: weights.lead_time, color: "bg-purple-500" },
              ].map(({ label, w, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-44 shrink-0">{label}</span>
                  <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${color}`}
                      style={{ width: `${Math.round(w * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 w-8 text-right">
                    {Math.round(w * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {result.ranking.map((s) => (
            <SupplierCard
              key={s.supplier_id}
              supplier={s}
              currency={currency}
              weights={weights}
              onSelect={onSelectSupplier}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white border border-dashed border-gray-300 rounded-2xl">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🔍</span>
          </div>
          <h3 className="text-gray-700 font-semibold">No suppliers found</h3>
          <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">
            All candidates were excluded by hard policy filters. Check the escalations above for details.
          </p>
        </div>
      )}

      {/* Excluded suppliers */}
      {result.excluded.length > 0 && (
        <div>
          <button
            onClick={() => setShowExcluded((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            <span className="text-gray-400">{showExcluded ? "▲" : "▼"}</span>
            {showExcluded ? "Hide" : "Show"} {result.excluded.length} excluded supplier
            {result.excluded.length !== 1 ? "s" : ""}
          </button>
          {showExcluded && (
            <div className="mt-3 border border-gray-200 rounded-xl overflow-hidden">
              {result.excluded.map((e, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 px-4 py-3 ${i > 0 ? "border-t border-gray-100" : ""}`}
                >
                  <span className="text-red-400 shrink-0 mt-0.5 font-bold">✗</span>
                  <div>
                    <span className="text-sm font-medium text-gray-700">{e.supplier_name}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{e.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Audit trail */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Audit Trail — Policies Checked
        </p>
        <div className="flex flex-wrap gap-1.5">
          {result.policies_checked.map((p) => (
            <span
              key={p}
              className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full"
            >
              {p}
            </span>
          ))}
        </div>
        {result.llm_fallback_reason && (
          <p className="text-xs text-gray-400 mt-2 italic">AI note: {result.llm_fallback_reason}</p>
        )}
      </div>
    </div>
  );
}
