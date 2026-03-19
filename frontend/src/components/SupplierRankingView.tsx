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

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-16 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="text-xs text-gray-600 w-8 text-right">{Math.round(value * 100)}%</span>
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    deterministic: { label: "Deterministic", cls: "bg-blue-100 text-blue-700" },
    llm_fallback:  { label: "AI-Enhanced",   cls: "bg-purple-100 text-purple-700" },
    hybrid:        { label: "Hybrid",         cls: "bg-amber-100 text-amber-700" },
  };
  const { label, cls } = map[method] ?? { label: method, cls: "bg-gray-100 text-gray-700" };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function RankBadge({ rank }: { rank: number }) {
  const colors = ["bg-amber-400 text-white", "bg-gray-300 text-gray-800", "bg-orange-300 text-white"];
  const cls = colors[rank - 1] ?? "bg-gray-100 text-gray-600";
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${cls}`}>
      #{rank}
    </div>
  );
}

function EscalationCard({ esc }: { esc: Escalation }) {
  const cls = esc.blocking
    ? "bg-red-50 border-red-200 text-red-800"
    : "bg-amber-50 border-amber-200 text-amber-800";
  return (
    <div className={`border rounded-lg p-3 ${cls}`}>
      <div className="flex items-start gap-2">
        <span className="font-mono text-xs font-bold mt-0.5">{esc.rule_id}</span>
        <div className="flex-1">
          <p className="text-sm font-medium">{esc.escalate_to}</p>
          <p className="text-xs mt-0.5 opacity-80">{esc.detail}</p>
        </div>
        {esc.blocking && (
          <span className="text-xs font-semibold bg-red-200 text-red-800 px-1.5 py-0.5 rounded shrink-0">
            BLOCKING
          </span>
        )}
      </div>
    </div>
  );
}

function SupplierCard({
  supplier,
  currency,
  onSelect,
}: {
  supplier: ScoredSupplier;
  currency: string;
  onSelect: (s: ScoredSupplier) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sb = supplier.score_breakdown;

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      {/* Header row */}
      <div className="flex items-start gap-3 p-4">
        <RankBadge rank={supplier.rank} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{supplier.supplier_name}</span>
            {supplier.is_preferred && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Preferred</span>
            )}
            {supplier.is_incumbent && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Incumbent</span>
            )}
            {!supplier.meets_lead_time && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Lead time risk</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{supplier.supplier_id} · Tier: {supplier.pricing_tier_applied}</p>
        </div>
        {/* Composite score pill */}
        <div className="text-right shrink-0">
          <div className="text-lg font-bold text-gray-900">{Math.round(supplier.composite_score * 100)}</div>
          <div className="text-xs text-gray-400">/ 100</div>
        </div>
      </div>

      {/* Pricing + lead time row */}
      <div className="grid grid-cols-3 gap-px bg-gray-100 border-t border-gray-100">
        <div className="bg-white px-4 py-2">
          <p className="text-xs text-gray-400">Unit price</p>
          <p className="font-semibold text-gray-900">{fmt(supplier.unit_price, currency)}</p>
        </div>
        <div className="bg-white px-4 py-2">
          <p className="text-xs text-gray-400">Total (standard)</p>
          <p className="font-semibold text-gray-900">{fmt(supplier.total_price, currency)}</p>
        </div>
        <div className="bg-white px-4 py-2">
          <p className="text-xs text-gray-400">Lead time</p>
          <p className="font-semibold text-gray-900">{supplier.standard_lead_time_days}d
            {supplier.expedited_lead_time_days && (
              <span className="text-xs text-gray-400 font-normal"> / {supplier.expedited_lead_time_days}d exp.</span>
            )}
          </p>
        </div>
      </div>

      {/* Score bars */}
      <div className="px-4 py-3 space-y-1.5 border-t border-gray-100">
        <ScoreBar label="Price"     value={sb.price_score}     color="bg-emerald-500" />
        <ScoreBar label="Quality"   value={sb.quality_score}   color="bg-blue-500" />
        <ScoreBar label="Risk"      value={sb.risk_score}      color="bg-amber-500" />
        <ScoreBar label="ESG"       value={sb.esg_score}       color="bg-green-500" />
        <ScoreBar label="Lead time" value={sb.lead_time_score} color="bg-purple-500" />
      </div>

      {/* Select supplier */}
      <div className="border-t border-gray-100 px-4 py-3">
        <button
          onClick={() => onSelect(supplier)}
          className={`w-full rounded-lg py-2 text-sm font-semibold transition-colors ${
            supplier.rank === 1
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          {supplier.rank === 1 ? "Select Recommended Supplier" : "Select this Supplier"}
        </button>
      </div>

      {/* Expandable details */}
      <div className="border-t border-gray-100">
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full px-4 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 text-left flex items-center gap-1"
        >
          <span>{expanded ? "▲" : "▼"}</span>
          <span>{expanded ? "Hide" : "Show"} compliance checks & rationale</span>
        </button>
        {expanded && (
          <div className="px-4 pb-4 space-y-3">
            {/* Rationale */}
            <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 leading-relaxed">
              {supplier.recommendation_note}
            </p>
            {/* Compliance checks */}
            {supplier.compliance_checks.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 shrink-0 font-bold ${
                  c.result === "pass" ? "text-green-600" :
                  c.result === "fail" ? "text-red-600" :
                  c.result === "warning" ? "text-amber-600" : "text-gray-400"
                }`}>
                  {c.result === "pass" ? "✓" : c.result === "fail" ? "✗" : c.result === "warning" ? "⚠" : "–"}
                </span>
                <span className="font-mono text-gray-400 shrink-0">{c.rule_id}</span>
                <span className="text-gray-600">{c.detail}</span>
              </div>
            ))}
            {/* Expedited pricing if available */}
            {supplier.expedited_unit_price != null && supplier.expedited_total_price != null && (
              <p className="text-xs text-gray-500">
                Expedited option: {fmt(supplier.expedited_unit_price, currency)}/unit
                → {fmt(supplier.expedited_total_price, currency)} total
              </p>
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

  // Guess currency from first supplier's pricing (fallback EUR)
  const currency = "EUR";

  const blockingEscalations = result.escalations.filter(e => e.blocking);
  const nonBlockingEscalations = result.escalations.filter(e => !e.blocking);

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-semibold text-gray-900">Supplier Ranking</h2>
            <MethodBadge method={result.method_used} />
          </div>
          <p className="text-sm text-gray-500">
            {result.request_id} · {result.ranking.length} supplier{result.ranking.length !== 1 ? "s" : ""} ranked
            {result.quotes_required && ` · ${result.quotes_required} quote${result.quotes_required > 1 ? "s" : ""} required`}
          </p>
        </div>
        <button
          onClick={onNewRequest}
          className="text-sm text-blue-600 hover:text-blue-800 underline"
        >
          New request
        </button>
      </div>

      {/* Budget banner */}
      {result.budget_sufficient === false && result.minimum_total_cost && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-amber-500 text-lg shrink-0">⚠</span>
            <div>
              <p className="font-semibold text-amber-800">Budget insufficient</p>
              <p className="text-sm text-amber-700 mt-0.5">
                Minimum cost is <strong>{fmt(result.minimum_total_cost, currency)}</strong>
                {result.minimum_cost_supplier && ` (${result.minimum_cost_supplier})`}.
                Ranking is shown for reference — budget increase required to proceed.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Blocking escalations */}
      {blockingEscalations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-red-700 uppercase tracking-wide">Blocking Escalations</h3>
          {blockingEscalations.map((e, i) => <EscalationCard key={i} esc={e} />)}
        </div>
      )}

      {/* Non-blocking escalations */}
      {nonBlockingEscalations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wide">Escalations</h3>
          {nonBlockingEscalations.map((e, i) => <EscalationCard key={i} esc={e} />)}
        </div>
      )}

      {/* Approval threshold */}
      {result.approval_threshold_note && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="font-mono text-xs font-bold text-blue-700 mt-0.5">{result.approval_threshold_id}</span>
            <p className="text-sm text-blue-800">{result.approval_threshold_note}</p>
          </div>
        </div>
      )}

      {/* Supplier cards */}
      {result.ranking.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Ranked Suppliers</h3>
          {result.ranking.map(s => (
            <SupplierCard key={s.supplier_id} supplier={s} currency={currency} onSelect={onSelectSupplier} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No suppliers found</p>
          <p className="text-sm mt-1">All candidates were excluded by hard filters.</p>
        </div>
      )}

      {/* Excluded suppliers */}
      {result.excluded.length > 0 && (
        <div>
          <button
            onClick={() => setShowExcluded(v => !v)}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            {showExcluded ? "Hide" : "Show"} {result.excluded.length} excluded supplier{result.excluded.length !== 1 ? "s" : ""}
          </button>
          {showExcluded && (
            <div className="mt-3 border border-gray-200 rounded-xl overflow-hidden">
              {result.excluded.map((e, i) => (
                <div key={i} className={`flex items-start gap-3 px-4 py-3 ${i > 0 ? "border-t border-gray-100" : ""}`}>
                  <span className="text-red-400 shrink-0 mt-0.5">✗</span>
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
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Audit Trail</p>
        <div className="flex flex-wrap gap-1.5">
          {result.policies_checked.map(p => (
            <span key={p} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{p}</span>
          ))}
        </div>
        {result.llm_fallback_reason && (
          <p className="text-xs text-gray-400 mt-2">LLM note: {result.llm_fallback_reason}</p>
        )}
      </div>
    </div>
  );
}
