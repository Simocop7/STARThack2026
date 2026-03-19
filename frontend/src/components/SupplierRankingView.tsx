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
  isComparing,
  onToggleCompare,
}: {
  supplier: ScoredSupplier;
  currency: string;
  weights: { price: number; quality: number; risk: number; esg: number; lead_time: number };
  onSelect: (s: ScoredSupplier) => void;
  isComparing: boolean;
  onToggleCompare: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sb = supplier.score_breakdown;
  const isTop = supplier.rank === 1;

  return (
    <div
      className={`border rounded-xl bg-white overflow-hidden transition-shadow hover:shadow-md ${
        isTop ? "border-blue-300 shadow-blue-50 shadow-sm" :
        isComparing ? "border-indigo-300 shadow-indigo-50 shadow-sm" : "border-gray-200"
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

      {/* Action buttons */}
      <div className="border-t border-gray-100 px-4 py-3 flex gap-2">
        <button
          onClick={() => onSelect(supplier)}
          className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
            isTop
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          {isTop ? "✓ Select Recommended Supplier" : "Select this Supplier"}
        </button>
        <button
          onClick={() => onToggleCompare(supplier.supplier_id)}
          className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors border ${
            isComparing
              ? "bg-indigo-50 border-indigo-300 text-indigo-700"
              : "bg-white border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600"
          }`}
          title={isComparing ? "Remove from comparison" : "Add to comparison"}
        >
          {isComparing ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
              <rect x="3" y="3" width="18" height="18" rx="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="18" height="18" rx="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
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

// ── Comparison Panel ──────────────────────────────────────────────

function ComparisonPanel({
  suppliers,
  currency,
  onClose,
  onSelect,
}: {
  suppliers: ScoredSupplier[];
  currency: string;
  onClose: () => void;
  onSelect: (s: ScoredSupplier) => void;
}) {
  const scoreDims = [
    { key: "price_score" as const, label: "Price", color: "bg-emerald-500" },
    { key: "quality_score" as const, label: "Quality", color: "bg-blue-500" },
    { key: "risk_score" as const, label: "Risk", color: "bg-amber-500" },
    { key: "esg_score" as const, label: "ESG", color: "bg-green-500" },
    { key: "lead_time_score" as const, label: "Lead Time", color: "bg-purple-500" },
  ];

  function bestOf(vals: number[], mode: "max" | "min") {
    return mode === "max" ? Math.max(...vals) : Math.min(...vals);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-5xl max-h-[85vh] overflow-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Compare Suppliers</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {suppliers.length} suppliers selected — side-by-side comparison
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4">
          {/* Comparison table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider py-3 pr-4 w-36">Attribute</th>
                  {suppliers.map((s) => (
                    <th key={s.supplier_id} className="text-center py-3 px-3 min-w-[160px]">
                      <div className="flex flex-col items-center gap-1">
                        <RankBadge rank={s.rank} />
                        <span className="font-semibold text-gray-900 text-sm">{s.supplier_name}</span>
                        <div className="flex gap-1 flex-wrap justify-center">
                          {s.is_preferred && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">Preferred</span>
                          )}
                          {s.is_incumbent && (
                            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Incumbent</span>
                          )}
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {/* Composite Score */}
                <tr>
                  <td className="py-3 pr-4 text-xs font-semibold text-gray-500">Composite Score</td>
                  {suppliers.map((s) => {
                    const pct = Math.round(s.composite_score * 100);
                    const isBest = pct === Math.round(bestOf(suppliers.map((x) => x.composite_score), "max") * 100);
                    return (
                      <td key={s.supplier_id} className="text-center py-3 px-3">
                        <span className={`text-lg font-bold ${isBest ? "text-green-600" : "text-gray-700"}`}>
                          {pct}
                        </span>
                        <span className="text-xs text-gray-400"> / 100</span>
                      </td>
                    );
                  })}
                </tr>

                {/* Unit Price */}
                <tr>
                  <td className="py-3 pr-4 text-xs font-semibold text-gray-500">Unit Price</td>
                  {suppliers.map((s) => {
                    const isBest = s.unit_price === bestOf(suppliers.map((x) => x.unit_price), "min");
                    return (
                      <td key={s.supplier_id} className={`text-center py-3 px-3 font-semibold ${isBest ? "text-green-600" : "text-gray-700"}`}>
                        {fmt(s.unit_price, currency)}
                      </td>
                    );
                  })}
                </tr>

                {/* Total Cost */}
                <tr>
                  <td className="py-3 pr-4 text-xs font-semibold text-gray-500">Total Cost</td>
                  {suppliers.map((s) => {
                    const isBest = s.total_price === bestOf(suppliers.map((x) => x.total_price), "min");
                    return (
                      <td key={s.supplier_id} className={`text-center py-3 px-3 font-semibold ${isBest ? "text-green-600" : "text-gray-700"}`}>
                        {fmt(s.total_price, currency)}
                      </td>
                    );
                  })}
                </tr>

                {/* Lead Time */}
                <tr>
                  <td className="py-3 pr-4 text-xs font-semibold text-gray-500">Standard Lead Time</td>
                  {suppliers.map((s) => {
                    const isBest = s.standard_lead_time_days === bestOf(suppliers.map((x) => x.standard_lead_time_days), "min");
                    return (
                      <td key={s.supplier_id} className={`text-center py-3 px-3 font-semibold ${isBest ? "text-green-600" : "text-gray-700"}`}>
                        {s.standard_lead_time_days}d
                        {s.expedited_lead_time_days && (
                          <span className="text-xs text-gray-400 font-normal block">({s.expedited_lead_time_days}d exp.)</span>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* Expedited Pricing */}
                <tr>
                  <td className="py-3 pr-4 text-xs font-semibold text-gray-500">Expedited Total</td>
                  {suppliers.map((s) => (
                    <td key={s.supplier_id} className="text-center py-3 px-3 text-gray-700">
                      {s.expedited_total_price ? (
                        <span className="font-semibold">{fmt(s.expedited_total_price, currency)}</span>
                      ) : (
                        <span className="text-gray-300">N/A</span>
                      )}
                    </td>
                  ))}
                </tr>

                {/* Pricing Tier */}
                <tr>
                  <td className="py-3 pr-4 text-xs font-semibold text-gray-500">Pricing Tier</td>
                  {suppliers.map((s) => (
                    <td key={s.supplier_id} className="text-center py-3 px-3 text-xs text-gray-600">
                      {s.pricing_tier_applied}
                    </td>
                  ))}
                </tr>

                {/* Lead Time Met */}
                <tr>
                  <td className="py-3 pr-4 text-xs font-semibold text-gray-500">Meets Lead Time</td>
                  {suppliers.map((s) => (
                    <td key={s.supplier_id} className="text-center py-3 px-3">
                      {s.meets_lead_time ? (
                        <span className="text-green-600 font-bold">✓ Yes</span>
                      ) : (
                        <span className="text-red-600 font-bold">✗ No</span>
                      )}
                    </td>
                  ))}
                </tr>

                {/* Score dimensions */}
                {scoreDims.map(({ key, label, color }) => (
                  <tr key={key}>
                    <td className="py-3 pr-4 text-xs font-semibold text-gray-500">{label} Score</td>
                    {suppliers.map((s) => {
                      const val = Math.round(s.score_breakdown[key] * 100);
                      const isBest = val === Math.round(bestOf(suppliers.map((x) => x.score_breakdown[key]), "max") * 100);
                      return (
                        <td key={s.supplier_id} className="py-3 px-3">
                          <div className="flex items-center gap-2 justify-center">
                            <div className="w-16 bg-gray-100 rounded-full h-2">
                              <div className={`h-2 rounded-full ${color}`} style={{ width: `${val}%` }} />
                            </div>
                            <span className={`text-xs font-semibold w-8 ${isBest ? "text-green-600" : "text-gray-600"}`}>{val}</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Compliance summary */}
                <tr>
                  <td className="py-3 pr-4 text-xs font-semibold text-gray-500">Compliance</td>
                  {suppliers.map((s) => {
                    const pass = s.compliance_checks.filter((c) => c.result === "pass").length;
                    const fail = s.compliance_checks.filter((c) => c.result === "fail").length;
                    const warn = s.compliance_checks.filter((c) => c.result === "warning").length;
                    return (
                      <td key={s.supplier_id} className="text-center py-3 px-3 text-xs">
                        <div className="flex items-center justify-center gap-2">
                          {pass > 0 && <span className="text-green-600 font-medium">✓{pass}</span>}
                          {warn > 0 && <span className="text-amber-600 font-medium">⚠{warn}</span>}
                          {fail > 0 && <span className="text-red-600 font-medium">✗{fail}</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Recommendation note */}
                <tr>
                  <td className="py-3 pr-4 text-xs font-semibold text-gray-500 align-top">Rationale</td>
                  {suppliers.map((s) => (
                    <td key={s.supplier_id} className="py-3 px-3 text-xs text-gray-600 leading-relaxed align-top">
                      {s.recommendation_note}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Select buttons */}
          <div className="mt-4 flex gap-3 justify-center border-t border-gray-100 pt-4">
            {suppliers.map((s) => (
              <button
                key={s.supplier_id}
                onClick={() => { onSelect(s); onClose(); }}
                className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors ${
                  s.rank === 1
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Select {s.supplier_name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

export default function SupplierRankingView({ result, onNewRequest, onSelectSupplier }: Props) {
  const [showExcluded, setShowExcluded] = useState(false);
  const [showWeights, setShowWeights] = useState(false);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);

  const currency = result.currency || "EUR";
  const blockingEscalations = result.escalations.filter((e) => e.blocking);
  const nonBlockingEscalations = result.escalations.filter((e) => !e.blocking);
  const weights = result.scoring_weights;

  const cheapestTotal = result.ranking.length > 0
    ? Math.min(...result.ranking.map((s) => s.total_price))
    : null;

  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const comparedSuppliers = result.ranking.filter((s) => compareIds.has(s.supplier_id));

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

      {/* Comparison floating bar */}
      {compareIds.size > 0 && (
        <div className="sticky top-0 z-30 bg-indigo-600 text-white rounded-xl px-4 py-3 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              {compareIds.size} supplier{compareIds.size !== 1 ? "s" : ""} selected
            </span>
            <div className="flex gap-1.5">
              {comparedSuppliers.map((s) => (
                <span key={s.supplier_id} className="bg-white/20 rounded-full px-2 py-0.5 text-xs font-medium">
                  {s.supplier_name}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCompareIds(new Set())}
              className="text-xs text-white/70 hover:text-white underline"
            >
              Clear
            </button>
            <button
              onClick={() => setShowCompare(true)}
              disabled={compareIds.size < 2}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                compareIds.size >= 2
                  ? "bg-white text-indigo-700 hover:bg-indigo-50"
                  : "bg-white/30 text-white/60 cursor-not-allowed"
              }`}
            >
              Compare{compareIds.size < 2 ? " (select 2+)" : ""}
            </button>
          </div>
        </div>
      )}

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
              isComparing={compareIds.has(s.supplier_id)}
              onToggleCompare={toggleCompare}
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

      {/* Comparison modal */}
      {showCompare && comparedSuppliers.length >= 2 && (
        <ComparisonPanel
          suppliers={comparedSuppliers}
          currency={currency}
          onClose={() => setShowCompare(false)}
          onSelect={onSelectSupplier}
        />
      )}
    </div>
  );
}
