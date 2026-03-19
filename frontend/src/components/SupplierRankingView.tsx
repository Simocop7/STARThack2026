import { useState } from "react";
import type { RankedSupplierOutput, ScoredSupplier, Escalation, RawScores, FormData } from "../types";

interface Props {
  result: RankedSupplierOutput;
  onNewRequest: () => void;
  onSelectSupplier: (supplier: ScoredSupplier) => void;
  /** Optional: the original form data so we can display what was ordered */
  orderContext?: FormData | null;
}

// ── Helpers ────────────────────────────────────────────────────────

function fmt(n: number, currency = "EUR") {
  // Use enough decimal places so small per-unit prices (e.g. €0.0855) don't round to €0
  const decimals = n > 0 && n < 1 ? 4 : n < 10 ? 2 : 0;
  return new Intl.NumberFormat("en-DE", { style: "currency", currency, maximumFractionDigits: decimals }).format(n);
}

function fmtTier(tier: string): string {
  // "200000-999999999 units" → "200,000+ units", "1-99 units" → "1–99 units"
  const m = tier.match(/^(\d+)-(\d+)(.*)$/);
  if (!m) return tier;
  const [, lo, hi, suffix] = m;
  const loN = parseInt(lo, 10);
  const hiN = parseInt(hi, 10);
  const loFmt = loN.toLocaleString("en-DE");
  if (hiN >= 999_999_999) return `${loFmt}+${suffix}`;
  return `${loFmt}–${hiN.toLocaleString("en-DE")}${suffix}`;
}

function ScoreBar({
  label,
  value,
  barPct,
  color,
  weight,
  hint,
  unit,
}: {
  label: string;
  /** Number displayed next to the bar (the raw/meaningful value) */
  value: number | string;
  /** Bar fill percentage (0-100). Defaults to `value` when value is numeric. */
  barPct?: number;
  color: string;
  weight?: number;
  hint?: string;
  /** Optional unit suffix shown after the value, e.g. "d" for days */
  unit?: string;
}) {
  const pct = barPct ?? (typeof value === "number" ? value : 0);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-20 shrink-0 leading-tight">
        {label}
        {hint && <span className="block text-[10px] text-gray-400">{hint}</span>}
      </span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${color} transition-all`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-700 w-10 text-right">
        {value}{unit}
      </span>
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
  const raw: RawScores = supplier.raw_scores;
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
            {supplier.supplier_id} · Tier: {fmtTier(supplier.pricing_tier_applied)}
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
        {/* Price: relative competitiveness score (100 = cheapest in this shortlist) */}
        <ScoreBar
          label="Price"
          value={Math.round(sb.price_score * 100)}
          color="bg-emerald-500"
          weight={weights.price}
          hint="100 = cheapest, others proportional"
        />
        {/* Quality / Trustworthiness / ESG: exact 0-100 values from dataset */}
        <ScoreBar label="Quality" value={raw.quality} color="bg-blue-500" weight={weights.quality} />
        <ScoreBar label="Trustworthiness" value={100 - raw.risk} barPct={100 - raw.risk} color="bg-amber-500" weight={weights.risk} hint="higher = better" />
        <ScoreBar label="ESG" value={raw.esg} color="bg-green-500" weight={weights.esg} />
        {/* Lead time: display actual days; bar shows deadline compliance (100=on time, 50=expedited only, 0=infeasible) */}
        <ScoreBar
          label="Lead time"
          value={supplier.standard_lead_time_days}
          unit="d"
          barPct={Math.round(sb.lead_time_score * 100)}
          color="bg-purple-500"
          weight={weights.lead_time}
          hint="days to deliver"
        />
        <p className="text-xs text-gray-400 pt-1">
          Quality, Trustworthiness &amp; ESG are 0–100 (higher = better). Price: 100 = cheapest, others = cheapest ÷ their price × 100. Lead time bar shows deadline compliance; days are actual delivery days.
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
          className="w-full px-4 py-2.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 text-left flex items-center justify-between"
        >
          <span className="flex items-center gap-2 font-medium">
            <span className="text-gray-400">{expanded ? "▲" : "▼"}</span>
            {expanded ? "Hide" : "Show"} compliance checks &amp; rationale
          </span>
          {/* Mini pass/fail summary */}
          {!expanded && (
            <span className="flex items-center gap-1.5">
              {["pass", "warning", "fail"].map((r) => {
                const count = supplier.compliance_checks.filter((c) => c.result === r).length;
                if (!count) return null;
                const cfg = r === "pass"
                  ? { cls: "bg-green-100 text-green-700", label: "✓" }
                  : r === "warning"
                  ? { cls: "bg-amber-100 text-amber-700", label: "⚠" }
                  : { cls: "bg-red-100 text-red-700", label: "✗" };
                return (
                  <span key={r} className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${cfg.cls}`}>
                    {cfg.label} {count}
                  </span>
                );
              })}
            </span>
          )}
        </button>
        {expanded && (
          <div className="px-4 pb-4 space-y-3">
            {/* Rationale box */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-700 mb-1">Audit Rationale</p>
              <p className="text-xs text-blue-800 leading-relaxed">{supplier.recommendation_note}</p>
            </div>

            {/* Compliance check cards */}
            <div className="space-y-2">
              {supplier.compliance_checks.map((c, idx) => {
                const cfg =
                  c.result === "pass"
                    ? { border: "border-green-200 bg-green-50", badge: "bg-green-100 text-green-700", icon: "✓", label: "Pass" }
                    : c.result === "fail"
                    ? { border: "border-red-200 bg-red-50", badge: "bg-red-100 text-red-700", icon: "✗", label: "Fail" }
                    : c.result === "warning"
                    ? { border: "border-amber-200 bg-amber-50", badge: "bg-amber-100 text-amber-700", icon: "⚠", label: "Warning" }
                    : { border: "border-gray-200 bg-gray-50", badge: "bg-gray-100 text-gray-500", icon: "–", label: "N/A" };
                return (
                  <div key={idx} className={`border rounded-lg p-3 ${cfg.border}`}>
                    <div className="flex items-start gap-2">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${cfg.badge}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800">{c.rule_description}</p>
                        <p className="text-xs text-gray-600 mt-0.5">{c.detail}</p>
                        <span className="text-[10px] font-mono text-gray-400">{c.rule_id}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Expedited option */}
            {supplier.expedited_unit_price && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
                <p className="font-semibold mb-0.5">⚡ Expedited delivery available</p>
                <p>
                  {fmt(supplier.expedited_unit_price, currency)}/unit →{" "}
                  <strong>{fmt(supplier.expedited_total_price!, currency)}</strong> total
                  {" "}({supplier.expedited_lead_time_days}d, ≈+8% premium)
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Best-per-parameter helpers ──────────────────────────────────────

type ParamKey = "price" | "quality" | "risk" | "esg" | "lead_time";

interface ParamMeta {
  key: ParamKey;
  label: string;
  icon: string;
  tagCls: string;       // badge colours
  borderCls: string;    // card accent border
  bgCls: string;        // card tint
  barColor: string;
  winner: (ranking: ScoredSupplier[]) => ScoredSupplier;
  displayValue: (s: ScoredSupplier, currency: string) => string;
  hint?: string;
}

const PARAMS: ParamMeta[] = [
  {
    key: "price",
    label: "Best Price",
    icon: "💰",
    tagCls: "bg-emerald-100 text-emerald-700",
    borderCls: "border-emerald-300",
    bgCls: "bg-emerald-50",
    barColor: "bg-emerald-500",
    winner: (r) => r.reduce((a, b) => a.score_breakdown.price_score >= b.score_breakdown.price_score ? a : b),
    displayValue: (s, cur) => `${fmt(s.unit_price, cur)}/unit · ${fmt(s.total_price, cur)} total`,
  },
  {
    key: "quality",
    label: "Best Quality",
    icon: "⭐",
    tagCls: "bg-blue-100 text-blue-700",
    borderCls: "border-blue-300",
    bgCls: "bg-blue-50",
    barColor: "bg-blue-500",
    winner: (r) => r.reduce((a, b) => a.raw_scores.quality >= b.raw_scores.quality ? a : b),
    displayValue: (s) => `Score ${s.raw_scores.quality}/100`,
  },
  {
    key: "risk",
    label: "Most Trusted",
    icon: "🤝",
    tagCls: "bg-amber-100 text-amber-700",
    borderCls: "border-amber-300",
    bgCls: "bg-amber-50",
    barColor: "bg-amber-500",
    winner: (r) => r.reduce((a, b) => a.raw_scores.risk <= b.raw_scores.risk ? a : b),
    displayValue: (s) => `Trustworthiness ${100 - s.raw_scores.risk}/100`,
    hint: "higher = better",
  },
  {
    key: "esg",
    label: "Best ESG",
    icon: "🌱",
    tagCls: "bg-green-100 text-green-700",
    borderCls: "border-green-300",
    bgCls: "bg-green-50",
    barColor: "bg-green-500",
    winner: (r) => r.reduce((a, b) => a.raw_scores.esg >= b.raw_scores.esg ? a : b),
    displayValue: (s) => `Score ${s.raw_scores.esg}/100`,
  },
  {
    key: "lead_time",
    label: "Fastest Delivery",
    icon: "⚡",
    tagCls: "bg-purple-100 text-purple-700",
    borderCls: "border-purple-300",
    bgCls: "bg-purple-50",
    barColor: "bg-purple-500",
    winner: (r) => r.reduce((a, b) => a.standard_lead_time_days <= b.standard_lead_time_days ? a : b),
    displayValue: (s) => `${s.standard_lead_time_days}d standard${s.expedited_lead_time_days ? ` · ${s.expedited_lead_time_days}d expedited` : ""}`,
  },
];

/** Returns a map: supplierId → list of params they won (in order) */
function computeWinners(ranking: ScoredSupplier[]): Map<string, ParamKey[]> {
  const result = new Map<string, ParamKey[]>();
  if (!ranking.length) return result;
  for (const pm of PARAMS) {
    const winner = pm.winner(ranking);
    const existing = result.get(winner.supplier_id) ?? [];
    existing.push(pm.key);
    result.set(winner.supplier_id, existing);
  }
  return result;
}

// ── Best-in-category card ───────────────────────────────────────────

// Short labels for the compact score accordion
const SCORE_LABEL: Record<ParamKey, string> = {
  price: "Price",
  quality: "Quality",
  risk: "Trustworthiness",
  esg: "ESG",
  lead_time: "Delivery",
};

function BestInCategoryCard({
  supplier,
  wonParams,
  currency,
  onSelect,
}: {
  supplier: ScoredSupplier;
  wonParams: ParamKey[];
  currency: string;
  onSelect: (s: ScoredSupplier) => void;
}) {
  const [showScores, setShowScores] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const isOverall = supplier.rank === 1;
  const wonMeta = PARAMS.filter((p) => wonParams.includes(p.key));
  const accent = wonMeta[0];
  const sb = supplier.score_breakdown;
  const raw = supplier.raw_scores;

  return (
    <div
      className={`border-2 rounded-xl bg-white overflow-hidden transition-shadow hover:shadow-md flex flex-col ${
        isOverall ? "border-blue-400 shadow-blue-100 shadow-sm" : accent.borderCls
      }`}
    >
      {/* ── Won-param badges ── */}
      <div className={`px-3 py-2 flex items-center gap-1.5 flex-wrap ${isOverall ? "bg-blue-600" : accent.bgCls}`}>
        {isOverall && <span className="text-xs font-bold text-white shrink-0">⭐ Overall Best ·</span>}
        {wonMeta.map((pm) => (
          <span
            key={pm.key}
            className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full border ${
              isOverall ? "bg-white/20 text-white border-white/30" : pm.tagCls + " border-transparent"
            }`}
          >
            {pm.icon} {pm.label}
          </span>
        ))}
      </div>

      {/* ── Name + score ── */}
      <div className="flex items-start gap-3 px-4 pt-3 pb-2">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-base leading-snug">{supplier.supplier_name}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {supplier.supplier_id} · {fmtTier(supplier.pricing_tier_applied)}
          </p>
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {supplier.is_preferred && (
              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">Preferred</span>
            )}
            {supplier.is_incumbent && (
              <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">Incumbent</span>
            )}
            {!supplier.meets_lead_time && (
              <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold">⏰ Lead time risk</span>
            )}
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-center">
          <span className={`text-3xl font-black leading-none ${
            Math.round(supplier.composite_score * 100) >= 75 ? "text-green-600"
            : Math.round(supplier.composite_score * 100) >= 50 ? "text-amber-600"
            : "text-red-600"
          }`}>
            {Math.round(supplier.composite_score * 100)}
          </span>
          <span className="text-[10px] text-gray-400 font-medium">/ 100</span>
        </div>
      </div>

      {/* ── 3 key metrics ── */}
      <div className="grid grid-cols-3 gap-px bg-gray-100 border-t border-b border-gray-100">
        <div className="bg-white px-3 py-2.5">
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Unit</p>
          <p className="font-bold text-gray-900 text-sm">{fmt(supplier.unit_price, currency)}</p>
        </div>
        <div className="bg-white px-3 py-2.5">
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Total</p>
          <p className="font-bold text-gray-900 text-sm">{fmt(supplier.total_price, currency)}</p>
        </div>
        <div className="bg-white px-3 py-2.5">
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Delivery</p>
          <p className="font-bold text-gray-900 text-sm">
            {supplier.standard_lead_time_days}d
            {supplier.expedited_lead_time_days && (
              <span className="text-[10px] text-gray-400 font-normal"> /{supplier.expedited_lead_time_days}d</span>
            )}
          </p>
        </div>
      </div>

      {/* ── Confirm order button ── */}
      <div className="px-4 py-3">
        <button
          onClick={() => onSelect(supplier)}
          className={`w-full rounded-xl py-3 text-sm font-bold tracking-wide transition-all active:scale-[0.98] ${
            isOverall
              ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-200"
              : "bg-gray-900 text-white hover:bg-gray-800"
          }`}
        >
          ✓ Confirm &amp; Place Order
        </button>
      </div>

      {/* ── Accordion 1: Scores ── */}
      <div className="border-t border-gray-100">
        <button
          onClick={() => setShowScores((v) => !v)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <span>📊</span> Scores
          </span>
          <span className="text-gray-400 text-[10px]">{showScores ? "▲" : "▼"}</span>
        </button>

        {showScores && (
          <div className="px-4 pb-4 pt-1 space-y-2.5">
            {PARAMS.map((pm) => {
              const isWon = wonParams.includes(pm.key);

              const barPct =
                pm.key === "price" ? Math.round(sb.price_score * 100)
                : pm.key === "quality" ? raw.quality
                : pm.key === "risk" ? 100 - raw.risk
                : pm.key === "esg" ? raw.esg
                : Math.round(sb.lead_time_score * 100);

              const displayVal =
                pm.key === "lead_time"
                  ? `${supplier.standard_lead_time_days}d${supplier.expedited_lead_time_days ? ` / ${supplier.expedited_lead_time_days}d` : ""}`
                  : pm.key === "price" ? `${Math.round(sb.price_score * 100)}`
                  : pm.key === "risk" ? `${100 - raw.risk}`
                  : pm.key === "quality" ? `${raw.quality}`
                  : `${raw.esg}`;

              return (
                <div key={pm.key} className="flex items-center gap-2">
                  <span className={`text-xs w-[90px] shrink-0 font-${isWon ? "semibold" : "normal"} ${
                    isWon ? pm.tagCls.split(" ")[1] : "text-gray-400"
                  }`}>
                    {pm.icon} {SCORE_LABEL[pm.key]}
                    {isWon && <span className="ml-0.5 text-[9px]">★</span>}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${isWon ? pm.barColor : "bg-gray-300"}`}
                      style={{ width: `${Math.min(100, Math.max(0, barPct))}%` }}
                    />
                  </div>
                  <span className={`text-xs font-semibold w-12 text-right ${isWon ? "text-gray-800" : "text-gray-400"}`}>
                    {displayVal}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Accordion 2: Rationale & compliance ── */}
      <div className="border-t border-gray-100">
        <button
          onClick={() => setShowDetails((v) => !v)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <span>📋</span> Rationale &amp; Compliance
            {/* compact pass/fail summary when collapsed */}
            {!showDetails && (
              <span className="flex items-center gap-1 ml-1">
                {(["pass", "warning", "fail"] as const).map((r) => {
                  const count = supplier.compliance_checks.filter((c) => c.result === r).length;
                  if (!count) return null;
                  const cls = r === "pass" ? "bg-green-100 text-green-700"
                    : r === "warning" ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700";
                  const icon = r === "pass" ? "✓" : r === "warning" ? "⚠" : "✗";
                  return (
                    <span key={r} className={`text-[10px] font-bold px-1 py-0.5 rounded ${cls}`}>
                      {icon}{count}
                    </span>
                  );
                })}
              </span>
            )}
          </span>
          <span className="text-gray-400 text-[10px]">{showDetails ? "▲" : "▼"}</span>
        </button>

        {showDetails && (
          <div className="px-4 pb-4 space-y-3">
            {/* Rationale — styled as a quote */}
            <div className="border-l-4 border-blue-400 pl-3 py-1">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-1">Why this supplier?</p>
              <p className="text-xs text-gray-700 leading-relaxed">{supplier.recommendation_note}</p>
            </div>

            {/* Compliance checks — compact rows */}
            <div className="space-y-1.5">
              {supplier.compliance_checks.map((c, idx) => {
                const icon = c.result === "pass" ? "✓" : c.result === "fail" ? "✗" : c.result === "warning" ? "⚠" : "–";
                const textCls = c.result === "pass" ? "text-green-700"
                  : c.result === "fail" ? "text-red-700"
                  : c.result === "warning" ? "text-amber-700"
                  : "text-gray-500";
                const bgCls = c.result === "pass" ? "bg-green-50"
                  : c.result === "fail" ? "bg-red-50"
                  : c.result === "warning" ? "bg-amber-50"
                  : "bg-gray-50";
                return (
                  <div key={idx} className={`flex items-start gap-2 rounded-lg px-2.5 py-2 ${bgCls}`}>
                    <span className={`text-xs font-bold shrink-0 mt-px ${textCls}`}>{icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold leading-snug ${textCls}`}>{c.rule_description}</p>
                      {c.detail && (
                        <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">{c.detail}</p>
                      )}
                    </div>
                    <span className="text-[9px] font-mono text-gray-300 shrink-0">{c.rule_id}</span>
                  </div>
                );
              })}
            </div>

            {/* Expedited option */}
            {supplier.expedited_unit_price && (
              <div className="flex items-start gap-2 bg-amber-50 rounded-lg px-3 py-2.5">
                <span className="text-sm shrink-0">⚡</span>
                <div>
                  <p className="text-xs font-semibold text-amber-800">Expedited available</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {fmt(supplier.expedited_unit_price, currency)}/unit · <strong>{fmt(supplier.expedited_total_price!, currency)}</strong> total · {supplier.expedited_lead_time_days}d · ≈+8%
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Scoring methodology panel ───────────────────────────────────────

function ScoringMethodologyPanel({ weights }: { weights: { price: number; quality: number; risk: number; esg: number; lead_time: number } }) {
  const [open, setOpen] = useState(false);

  const params = [
    {
      key: "price",
      label: "Price",
      icon: "💰",
      weight: weights.price,
      color: "text-emerald-700",
      bg: "bg-emerald-50 border-emerald-200",
      how: "Reciprocal proportion: the cheapest supplier scores 100. Every other supplier scores (min_price ÷ their_price) × 100. A supplier costing 50% more than the cheapest scores 66.7 — naturally penalising expensive options without collapsing the scale to 0/100 extremes.",
    },
    {
      key: "quality",
      label: "Quality",
      icon: "⭐",
      weight: weights.quality,
      color: "text-blue-700",
      bg: "bg-blue-50 border-blue-200",
      how: "Raw dataset value (0–100) sourced directly from the supplier master file. Reflects third-party quality audits, delivery reliability, and defect rates. Higher is better. No normalisation applied — the score is used as-is so comparisons remain stable across different shortlists.",
    },
    {
      key: "risk",
      label: "Trustworthiness",
      icon: "🤝",
      weight: weights.risk,
      color: "text-amber-700",
      bg: "bg-amber-50 border-amber-200",
      how: "Derived from the supplier's raw risk score (0–100) by inversion: Trustworthiness = 100 − risk_score. A risk score of 20 becomes a trustworthiness of 80. This ensures a higher bar always means a safer, more reliable supplier — consistent with all other dimensions.",
    },
    {
      key: "esg",
      label: "ESG",
      icon: "🌱",
      weight: weights.esg,
      color: "text-green-700",
      bg: "bg-green-50 border-green-200",
      how: "Raw dataset value (0–100) from the supplier's Environmental, Social & Governance assessment. Covers carbon footprint, labour practices, and governance transparency. Higher is better. Applied directly without normalisation.",
    },
    {
      key: "lead_time",
      label: "Lead Time",
      icon: "⚡",
      weight: weights.lead_time,
      color: "text-purple-700",
      bg: "bg-purple-50 border-purple-200",
      how: "Binary feasibility score against the requested delivery deadline: 100 if the standard lead time meets the deadline; 50 if only expedited delivery meets it (≈+8% price premium required); 0 if neither option can meet the deadline. When no deadline is specified, all suppliers default to 100.",
    },
  ];

  const totalWeight = params.reduce((s, p) => s + p.weight, 0);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span className="text-base">📐</span>
          Scoring Methodology
          <span className="text-xs font-normal text-gray-400">— how suppliers are ranked</span>
        </span>
        <span className="text-gray-400 text-xs">{open ? "▲ hide" : "▼ show"}</span>
      </button>

      {open && (
        <div className="px-5 py-4 space-y-5 bg-white">

          {/* Composite formula */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Composite Score Formula</p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 font-mono text-sm text-slate-800 leading-relaxed">
              Score = {params.map((p, i) => (
                <span key={p.key}>
                  <span className="font-bold">{(p.weight * 100).toFixed(0)}%</span>
                  <span className="text-slate-500"> × </span>
                  <span className={p.color}>{p.label}</span>
                  {i < params.length - 1 && <span className="text-slate-400">  +  </span>}
                </span>
              ))}
              <span className="text-slate-400">  =  </span>
              <span className="font-bold text-slate-900">0–100</span>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              All dimensions are normalised to a 0–100 scale before weighting. The composite score therefore also sits on a 0–100 scale. Weights must sum to 100% — current total: {(totalWeight * 100).toFixed(0)}%.
            </p>
          </div>

          {/* Per-parameter breakdown */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Parameter Details</p>
            <div className="space-y-2.5">
              {params.map((p) => (
                <div key={p.key} className={`border rounded-lg px-4 py-3 ${p.bg}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{p.icon}</span>
                    <span className={`text-sm font-bold ${p.color}`}>{p.label}</span>
                    <span className="ml-auto text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                      ×{(p.weight * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{p.how}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Weights bar */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Weight Distribution</p>
            <div className="flex h-4 rounded-full overflow-hidden w-full">
              {params.map((p) => (
                <div
                  key={p.key}
                  style={{ width: `${p.weight * 100}%` }}
                  className={`flex items-center justify-center text-[9px] font-bold text-white ${
                    p.key === "price" ? "bg-emerald-500"
                    : p.key === "quality" ? "bg-blue-500"
                    : p.key === "risk" ? "bg-amber-500"
                    : p.key === "esg" ? "bg-green-500"
                    : "bg-purple-500"
                  }`}
                  title={`${p.label}: ${(p.weight * 100).toFixed(0)}%`}
                >
                  {(p.weight * 100).toFixed(0)}%
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
              {params.map((p) => (
                <span key={p.key} className={`text-[10px] font-medium ${p.color}`}>
                  {p.icon} {p.label}
                </span>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// ── Contact platforms footer ─────────────────────────────────────────

const PLATFORMS = [
  {
    name: "SAP Ariba",
    description: "Supplier discovery & sourcing events",
    icon: "🔷",
    url: "https://service.ariba.com/Supplier.aw/109537048/aw?awh=r&awssk=YV_gM3EE&dard=1",
    color: "hover:border-blue-300 hover:bg-blue-50",
    labelColor: "text-blue-700",
  },
  {
    name: "Coupa",
    description: "Procurement & supplier management",
    icon: "🟠",
    url: "https://supplier.coupahost.com/sessions/new",
    color: "hover:border-orange-300 hover:bg-orange-50",
    labelColor: "text-orange-700",
  },
  {
    name: "Archlet",
    description: "Sourcing optimisation & analytics",
    icon: "🟣",
    url: "https://www.archlet.io/",
    color: "hover:border-purple-300 hover:bg-purple-50",
    labelColor: "text-purple-700",
  },
  {
    name: "Apadua",
    description: "Strategic category management",
    icon: "🟢",
    url: "https://apadua.com/",
    color: "hover:border-green-300 hover:bg-green-50",
    labelColor: "text-green-700",
  },
  {
    name: "Keelvar",
    description: "AI-powered sourcing automation",
    icon: "🔵",
    url: "https://www.keelvar.com/",
    color: "hover:border-cyan-300 hover:bg-cyan-50",
    labelColor: "text-cyan-700",
  },
];

function ContactPlatforms() {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <span className="text-base">🔗</span>
        <span className="text-sm font-semibold text-gray-700">Contact Suppliers Directly</span>
        <span className="text-xs text-gray-400 ml-1">— via external procurement platforms</span>
      </div>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {PLATFORMS.map((p) => (
          <a
            key={p.name}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex flex-col gap-1.5 border border-gray-200 rounded-xl p-3 transition-all cursor-pointer bg-white ${p.color}`}
          >
            <span className="text-xl">{p.icon}</span>
            <span className={`text-xs font-bold ${p.labelColor}`}>{p.name}</span>
            <span className="text-[10px] text-gray-500 leading-tight">{p.description}</span>
            <span className="text-[10px] text-gray-400 mt-auto flex items-center gap-0.5">
              Open ↗
            </span>
          </a>
        ))}
      </div>
      <p className="px-4 pb-3 text-[10px] text-gray-400">
        These links open external procurement platforms in a new tab. Supplier negotiations and RFQ submissions must be conducted through your company's approved channels.
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

export default function SupplierRankingView({ result, onNewRequest, onSelectSupplier, orderContext }: Props) {
  const [showExcluded, setShowExcluded] = useState(false);

  const currency = result.currency || "EUR";
  const blockingEscalations = result.escalations.filter((e) => e.blocking);
  const nonBlockingEscalations = result.escalations.filter((e) => !e.blocking);

  const cheapestTotal = result.ranking.length > 0
    ? Math.min(...result.ranking.map((s) => s.total_price))
    : null;

  // Build winner map: supplierId → params won
  const winnerMap = computeWinners(result.ranking);

  // Unique suppliers that won at least one param, ordered by most wins then by rank
  const winnerSuppliers: ScoredSupplier[] = [];
  const seen = new Set<string>();
  // iterate in param order so the first card is always the overall #1
  const overallBest = result.ranking[0];
  if (overallBest) {
    winnerSuppliers.push(overallBest);
    seen.add(overallBest.supplier_id);
  }
  for (const [supplierId] of winnerMap) {
    if (!seen.has(supplierId)) {
      const sup = result.ranking.find((s) => s.supplier_id === supplierId);
      if (sup) {
        winnerSuppliers.push(sup);
        seen.add(supplierId);
      }
    }
  }

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
            {result.ranking.length} supplier{result.ranking.length !== 1 ? "s" : ""} evaluated
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

      {/* What was ordered — context banner */}
      {orderContext && (orderContext.category_l1 || orderContext.category_l2 || orderContext.quantity) && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap gap-5 items-center">
          <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold uppercase tracking-wide shrink-0">
            <span>📋</span> Order Context
          </div>
          {(orderContext.category_l1 || orderContext.category_l2) && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Category</p>
              <p className="text-sm font-bold text-slate-800">
                {[orderContext.category_l1, orderContext.category_l2].filter(Boolean).join(" › ")}
              </p>
            </div>
          )}
          {orderContext.quantity && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Quantity</p>
              <p className="text-sm font-bold text-slate-800">
                {orderContext.quantity.toLocaleString()} {orderContext.unit_of_measure || "units"}
              </p>
            </div>
          )}
          {orderContext.delivery_address && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Delivery</p>
              <p className="text-sm font-bold text-slate-800">{orderContext.delivery_address}</p>
            </div>
          )}
          {orderContext.required_by_date && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Required by</p>
              <p className="text-sm font-bold text-slate-800">{orderContext.required_by_date}</p>
            </div>
          )}
          {orderContext.preferred_supplier && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Preferred supplier</p>
              <p className="text-sm font-bold text-slate-800">{orderContext.preferred_supplier}</p>
            </div>
          )}
        </div>
      )}

      {/* Scoring methodology */}
      <ScoringMethodologyPanel weights={result.scoring_weights} />

      {/* Blocking escalations */}
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
              <p className="text-sm font-semibold text-indigo-900">Approval: {result.approval_threshold_id}</p>
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
                Minimum cost is <strong>{fmt(result.minimum_total_cost, currency)}</strong>
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

      {/* Best-per-parameter cards — horizontal scroll */}
      {result.ranking.length > 0 ? (
        <div>
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">
            Supplier Comparison
          </h3>
          <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1">
            {winnerSuppliers.map((supplier) => (
              <div key={supplier.supplier_id} className="min-w-[300px] max-w-[340px] flex-shrink-0">
                <BestInCategoryCard
                  supplier={supplier}
                  wonParams={winnerMap.get(supplier.supplier_id) ?? []}
                  currency={currency}
                  onSelect={onSelectSupplier}
                />
              </div>
            ))}
          </div>
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

      {/* Contact platforms */}
      <ContactPlatforms />

    </div>
  );
}
