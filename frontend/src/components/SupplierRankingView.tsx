import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import type { RankedSupplierOutput, ScoredSupplier, Escalation, FormData } from "../types";
import { PLATFORMS } from "./platforms";
import { SupplierTable } from "./ui/supplier-table";
import { ShimmerButton } from "./ui/shimmer-button";

interface Props {
  result: RankedSupplierOutput;
  onNewRequest: () => void;
  onSelectSupplier: (supplier: ScoredSupplier) => void;
  orderContext?: FormData | null;
}

// ── Helpers ────────────────────────────────────────────────────────

function fmt(n: number, currency = "EUR") {
  const decimals = n > 0 && n < 1 ? 4 : n < 10 ? 2 : 0;
  return new Intl.NumberFormat("en-DE", { style: "currency", currency, maximumFractionDigits: decimals }).format(n);
}

function fmtTier(tier: string) {
  const m = tier.match(/^(\d+)-(\d+)(.*)$/);
  if (!m) return tier;
  const [, lo, hi, suffix] = m;
  const loN = parseInt(lo, 10), hiN = parseInt(hi, 10);
  if (hiN >= 999_999_999) return `${loN.toLocaleString("en-DE")}+${suffix}`;
  return `${loN.toLocaleString("en-DE")}–${hiN.toLocaleString("en-DE")}${suffix}`;
}

// ── Feature definitions ─────────────────────────────────────────────

type FeatureKey = "price" | "quality" | "trust" | "esg" | "speed";

interface FeatureMeta {
  key: FeatureKey;
  label: string;
  icon: string;
  tagline: string;
  activeBg: string;
  activeBorder: string;
  activeText: string;
  cardBorder: string;
  cardHeaderBg: string;
  barColor: string;
  sort: (suppliers: ScoredSupplier[]) => ScoredSupplier[];
  value: (s: ScoredSupplier, currency: string) => string;
  score: (s: ScoredSupplier) => number;
}

const FEATURES: FeatureMeta[] = [
  {
    key: "price",
    label: "Best Price",
    icon: "💰",
    tagline: "Lowest total cost",
    activeBg: "bg-emerald-600",
    activeBorder: "border-emerald-600",
    activeText: "text-white",
    cardBorder: "border-emerald-300",
    cardHeaderBg: "bg-emerald-600",
    barColor: "bg-emerald-500",
    sort: (s) => [...s].sort((a, b) => a.unit_price - b.unit_price),
    value: (s, cur) => fmt(s.unit_price, cur),
    score: (s) => Math.round(s.score_breakdown.price_score * 100),
  },
  {
    key: "quality",
    label: "Best Quality",
    icon: "⭐",
    tagline: "Highest quality score",
    activeBg: "bg-blue-600",
    activeBorder: "border-blue-600",
    activeText: "text-white",
    cardBorder: "border-blue-300",
    cardHeaderBg: "bg-blue-600",
    barColor: "bg-blue-500",
    sort: (s) => [...s].sort((a, b) => b.raw_scores.quality - a.raw_scores.quality),
    value: (s) => `${s.raw_scores.quality} / 100`,
    score: (s) => s.raw_scores.quality,
  },
  {
    key: "trust",
    label: "Most Trusted",
    icon: "🤝",
    tagline: "Lowest supply-chain risk",
    activeBg: "bg-amber-600",
    activeBorder: "border-amber-600",
    activeText: "text-white",
    cardBorder: "border-amber-300",
    cardHeaderBg: "bg-amber-600",
    barColor: "bg-amber-500",
    sort: (s) => [...s].sort((a, b) => a.raw_scores.risk - b.raw_scores.risk),
    value: (s) => `${100 - s.raw_scores.risk} / 100`,
    score: (s) => 100 - s.raw_scores.risk,
  },
  {
    key: "esg",
    label: "Best ESG",
    icon: "🌱",
    tagline: "Top sustainability rating",
    activeBg: "bg-green-600",
    activeBorder: "border-green-600",
    activeText: "text-white",
    cardBorder: "border-green-300",
    cardHeaderBg: "bg-green-600",
    barColor: "bg-green-500",
    sort: (s) => [...s].sort((a, b) => b.raw_scores.esg - a.raw_scores.esg),
    value: (s) => `${s.raw_scores.esg} / 100`,
    score: (s) => s.raw_scores.esg,
  },
  {
    key: "speed",
    label: "Fastest",
    icon: "⚡",
    tagline: "Shortest delivery time",
    activeBg: "bg-purple-600",
    activeBorder: "border-purple-600",
    activeText: "text-white",
    cardBorder: "border-purple-300",
    cardHeaderBg: "bg-purple-600",
    barColor: "bg-purple-500",
    sort: (s) => [...s].sort((a, b) => a.standard_lead_time_days - b.standard_lead_time_days),
    value: (s) => `${s.standard_lead_time_days}d`,
    score: (s) => {
      const maxDays = 90;
      return Math.max(0, Math.round((1 - s.standard_lead_time_days / maxDays) * 100));
    },
  },
];

// ── Sub-components ──────────────────────────────────────────────────

function MethodBadge({ method }: { method: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    deterministic: { label: "Deterministic", cls: "bg-blue-100 text-blue-700" },
    llm_fallback:  { label: "AI-Enhanced",   cls: "bg-purple-100 text-purple-700" },
    hybrid:        { label: "Hybrid",         cls: "bg-amber-100 text-amber-700" },
  };
  const { label, cls } = map[method] ?? { label: method, cls: "bg-gray-100 text-gray-700" };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function EscalationCard({ esc }: { esc: Escalation }) {
  const cls = esc.blocking ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200";
  const textCls = esc.blocking ? "text-red-800" : "text-amber-800";
  return (
    <div className={`border rounded-lg p-3 ${cls}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-mono text-xs font-bold ${textCls}`}>{esc.rule_id}</span>
            <span className={`text-sm font-semibold ${textCls}`}>{esc.escalate_to}</span>
            {esc.blocking && (
              <span className="text-xs font-semibold bg-red-200 text-red-800 px-1.5 py-0.5 rounded ml-auto shrink-0">BLOCKING</span>
            )}
          </div>
          <p className={`text-xs mt-1 opacity-80 ${textCls}`}>{esc.detail}</p>
        </div>
      </div>
    </div>
  );
}

// ── Supplier detail modal ────────────────────────────────────────────

function SupplierDetailModal({
  supplier,
  feature,
  currency,
  onClose,
  onSelect,
}: {
  supplier: ScoredSupplier;
  feature: FeatureMeta;
  currency: string;
  onClose: () => void;
  onSelect: (s: ScoredSupplier) => void;
}) {
  const compositeScore = Math.round(supplier.composite_score * 100);
  const scoreColor =
    compositeScore >= 75 ? "text-green-600" :
    compositeScore >= 50 ? "text-amber-600" : "text-red-500";

  const leadTimeScore = leadTimeDisplayScore(supplier);

  const breakdownRows = [
    { label: "Price",     val: Math.round(supplier.score_breakdown.price_score * 100), color: "bg-emerald-500" },
    { label: "Quality",   val: supplier.raw_scores.quality,                            color: "bg-blue-500"    },
    { label: "Trust",     val: 100 - supplier.raw_scores.risk,                         color: "bg-amber-500"   },
    { label: "ESG",       val: supplier.raw_scores.esg,                                color: "bg-green-500"   },
    { label: "Lead Time", val: leadTimeScore,                                          color: scoreBarColor(leadTimeScore), displayLabel: `${supplier.standard_lead_time_days}d` },
  ];

  const tasks = supplier.compliance_checks.map((c) => ({
    title: c.rule_description,
    completed: c.result === "pass",
  }));

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="relative z-10 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white border border-gray-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex justify-between items-start pr-8">
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-gray-900">{supplier.supplier_name}</h3>
              <p className="text-xs text-gray-400 font-mono">{supplier.supplier_id} · {fmtTier(supplier.pricing_tier_applied)}</p>
              <div className="flex gap-1.5 flex-wrap">
                {supplier.is_preferred && (
                  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 border-blue-200">Preferred</span>
                )}
                {supplier.is_incumbent && (
                  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold bg-green-50 text-green-700 border-green-200">Incumbent</span>
                )}
                {!supplier.meets_lead_time && (
                  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold bg-red-50 text-red-700 border-red-200">Lead time risk</span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-3xl font-black ${scoreColor}`}>{compositeScore}%</p>
              <p className="text-[10px] text-gray-400">overall</p>
            </div>
          </div>
        </div>

        {/* Key metrics */}
        <div className="px-6 pb-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Unit price", val: fmt(supplier.unit_price, currency) },
              { label: "Total cost", val: fmt(supplier.total_price, currency) },
              { label: "Lead time", val: `${supplier.standard_lead_time_days}d${supplier.expedited_lead_time_days ? ` / ${supplier.expedited_lead_time_days}d` : ""}` },
            ].map((item) => (
              <div key={item.label} className="bg-gray-50 rounded-lg px-3 py-2.5">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">{item.label}</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">{item.val}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Score breakdown */}
        <div className="px-6 pb-4 space-y-2">
          <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wide">Score Breakdown</h4>
          {breakdownRows.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-16 shrink-0">{item.label}</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${item.color}`}
                  style={{ width: `${Math.min(100, Math.max(0, item.val))}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-gray-600 w-8 text-right">
                {item.displayLabel ?? item.val}
              </span>
            </div>
          ))}
        </div>

        {/* Compliance */}
        {tasks.length > 0 && (
          <div className="px-6 pb-4 space-y-1.5">
            <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wide">Compliance Checks</h4>
            {tasks.map((task, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm gap-2">
                <span className="text-gray-600 text-xs leading-tight truncate">{task.title}</span>
                {task.completed && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
              </div>
            ))}
          </div>
        )}

        {/* Rationale */}
        <div className="px-6 pb-4">
          <div className="border-l-4 border-blue-400 pl-3 py-1">
            <p className="text-xs text-gray-700 leading-relaxed">{supplier.recommendation_note}</p>
          </div>
        </div>

        {/* Expedited */}
        {supplier.expedited_unit_price && (
          <div className="px-6 pb-4">
            <div className="bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-700">
              <span className="font-semibold">Expedited: </span>
              {fmt(supplier.expedited_unit_price, currency)}/unit ·{" "}
              <strong>{fmt(supplier.expedited_total_price ?? 0, currency)}</strong> ·{" "}
              {supplier.expedited_lead_time_days}d · ~+8%
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <ShimmerButton
            onClick={() => onSelect(supplier)}
            background="rgb(185 28 28)"
            className="rounded-lg px-5 py-2.5 text-sm font-bold shadow-sm"
          >
            Select supplier
          </ShimmerButton>
        </div>
      </motion.div>
    </div>
  );
}

// ── Feature Card (compact, click opens modal) ────────────────────────

function scoreBarColor(val: number): string {
  if (val >= 80) return "bg-green-500";
  if (val >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function leadTimeDisplayScore(s: ScoredSupplier): number {
  const maxDays = 90;
  return Math.max(0, Math.round((1 - s.standard_lead_time_days / maxDays) * 100));
}

function FeatureCard({
  supplier,
  featureRank,
  feature,
  currency,
  onSelect,
  onOpenDetail,
}: {
  supplier: ScoredSupplier;
  featureRank: number;
  feature: FeatureMeta;
  currency: string;
  onSelect: (s: ScoredSupplier) => void;
  onOpenDetail: (s: ScoredSupplier) => void;
}) {
  const isFirst = featureRank === 1;
  const compositeScore = Math.round(supplier.composite_score * 100);
  const featureScore = feature.score(supplier);
  const scoreColor =
    compositeScore >= 75 ? "text-green-600" :
    compositeScore >= 50 ? "text-amber-600" : "text-red-500";

  const ltScore = leadTimeDisplayScore(supplier);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ type: "spring", stiffness: 300, damping: 28, delay: featureRank * 0.07 }}
      className={`w-full transition-all duration-300 rounded-lg border bg-white shadow-sm hover:shadow-lg ${
        isFirst ? `border-2 ${feature.cardBorder}` : "border border-gray-200"
      }`}
    >
      {/* Card header */}
      <div className="flex flex-col space-y-1.5 p-5 pb-3">
        <div className="flex justify-between items-start w-full">
          <div className="space-y-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                isFirst
                  ? `${feature.activeBg} text-white border-transparent`
                  : featureRank === 2
                  ? "bg-gray-100 text-gray-600 border-transparent"
                  : "bg-orange-50 text-orange-700 border-orange-200"
              }`}
            >
              {isFirst ? feature.label : `#${featureRank} ${feature.label}`}
            </span>
            <h3 className="text-xl font-semibold text-gray-900 leading-tight">{supplier.supplier_name}</h3>
            <p className="text-xs text-gray-400 font-mono -mt-1">{supplier.supplier_id} · {fmtTier(supplier.pricing_tier_applied)}</p>
            <div className="flex gap-1 flex-wrap">
              {supplier.is_preferred && (
                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 border-blue-200">Preferred</span>
              )}
              {supplier.is_incumbent && (
                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold bg-green-50 text-green-700 border-green-200">Incumbent</span>
              )}
              {!supplier.meets_lead_time && (
                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold bg-red-50 text-red-700 border-red-200">Lead time risk</span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0 ml-3">
            <p className={`text-2xl font-black leading-none ${scoreColor}`}>
              {feature.key === "speed" ? `${supplier.standard_lead_time_days}d` : featureScore}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">{feature.key === "speed" ? "delivery" : feature.label.toLowerCase()}</p>
          </div>
        </div>
      </div>

      {/* Overall score bar */}
      <div className="px-5 pb-3">
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Overall score</span>
            <span className={`font-semibold ${scoreColor}`}>{compositeScore}%</span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div className={`h-full rounded-full transition-all ${feature.barColor}`} style={{ width: `${compositeScore}%` }} />
          </div>
        </div>
      </div>

      {/* Quick metrics row */}
      <div className="px-5 pb-3">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Unit price</p>
            <p className="text-sm font-bold text-gray-900">{fmt(supplier.unit_price, currency)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Total cost</p>
            <p className="text-sm font-bold text-gray-900">{fmt(supplier.total_price, currency)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Lead time</p>
            <p className="text-sm font-bold text-gray-900">
              {supplier.standard_lead_time_days}d
              {supplier.expedited_lead_time_days ? ` / ${supplier.expedited_lead_time_days}d` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Mini score bars */}
      <div className="px-5 pb-3 space-y-1">
        {[
          { label: "Price",     val: Math.round(supplier.score_breakdown.price_score * 100), color: "bg-emerald-500", display: undefined as string | undefined },
          { label: "Quality",   val: supplier.raw_scores.quality,                            color: "bg-blue-500",    display: undefined as string | undefined },
          { label: "Trust",     val: 100 - supplier.raw_scores.risk,                         color: "bg-amber-500",   display: undefined as string | undefined },
          { label: "ESG",       val: supplier.raw_scores.esg,                                color: "bg-green-500",   display: undefined as string | undefined },
          { label: "Lead Time", val: ltScore,                                                color: scoreBarColor(ltScore), display: `${supplier.standard_lead_time_days}d` },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 w-14 shrink-0">{item.label}</span>
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${item.color}`} style={{ width: `${Math.min(100, Math.max(0, item.val))}%` }} />
            </div>
            <span className="text-[10px] font-semibold text-gray-500 w-7 text-right">{item.display ?? item.val}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center p-5 pt-0 border-t border-gray-100 mt-2">
        <div className="flex items-center justify-between w-full gap-3">
          <button
            onClick={() => onOpenDetail(supplier)}
            className="text-xs text-gray-500 hover:text-gray-800 underline transition-colors"
          >
            Click to see details
          </button>
          <ShimmerButton
            onClick={(e) => {
              e.stopPropagation();
              onSelect(supplier);
            }}
            background={isFirst ? "rgb(185 28 28)" : "rgb(17 24 39)"}
            className="shrink-0 rounded-lg px-4 py-2 text-xs font-bold shadow-sm"
          >
            Select supplier
          </ShimmerButton>
        </div>
      </div>
    </motion.div>
  );
}

// ── Scoring methodology ─────────────────────────────────────────────

function ScoringMethodology({ weights }: {
  weights: { price: number; quality: number; risk: number; esg: number; lead_time: number };
}) {
  const [open, setOpen] = useState(false);

  const params = [
    {
      key: "price", label: "Price", icon: "💰", weight: weights.price,
      color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200",
      how: "Reciprocal proportion: cheapest supplier scores 100. Every other supplier scores (min_price ÷ their_price) × 100. A supplier 50% more expensive than the cheapest scores 66.7 — naturally penalising expensive options without collapsing the scale.",
    },
    {
      key: "quality", label: "Quality", icon: "⭐", weight: weights.quality,
      color: "text-blue-700", bg: "bg-blue-50 border-blue-200",
      how: "Raw dataset value (0–100) from the supplier master file. Reflects third-party quality audits, delivery reliability, and defect rates. Higher is better. No normalisation — the score is used as-is for stable cross-shortlist comparisons.",
    },
    {
      key: "risk", label: "Trust", icon: "🤝", weight: weights.risk,
      color: "text-amber-700", bg: "bg-amber-50 border-amber-200",
      how: "Inverted risk score: Trust = 100 − risk_score. A risk of 20 becomes a trust of 80. Higher bar = safer, more reliable supplier — consistent with all other dimensions where higher is better.",
    },
    {
      key: "esg", label: "ESG", icon: "🌱", weight: weights.esg,
      color: "text-green-700", bg: "bg-green-50 border-green-200",
      how: "Raw dataset value (0–100) from the supplier's Environmental, Social & Governance assessment. Covers carbon footprint, labour practices, and governance transparency. Higher is better.",
    },
    {
      key: "lead_time", label: "Lead Time", icon: "⚡", weight: weights.lead_time,
      color: "text-purple-700", bg: "bg-purple-50 border-purple-200",
      how: "Binary feasibility: 100 if standard lead time meets the deadline; 50 if only expedited delivery meets it (~+8% premium); 0 if neither can meet the deadline. When no deadline specified, all suppliers score 100.",
    },
  ];

  const barColors = ["bg-emerald-500", "bg-blue-500", "bg-amber-500", "bg-green-500", "bg-purple-500"];

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          Scoring Methodology
          <span className="text-xs font-normal text-gray-400">— how suppliers are ranked</span>
        </span>
        <span className="text-gray-400 text-xs">{open ? "▲ hide" : "▼ show"}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="px-5 py-4 space-y-5 bg-white">
              {/* Composite formula */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Composite Score Formula</p>
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 font-mono text-sm text-slate-800 leading-relaxed">
                  Score ={" "}
                  {params.map((p, i) => (
                    <span key={p.key}>
                      <span className="font-black">{(p.weight * 100).toFixed(0)}%</span>
                      <span className="text-slate-400"> × </span>
                      <span className={p.color}>{p.label}</span>
                      {i < params.length - 1 && <span className="text-slate-400">  +  </span>}
                    </span>
                  ))}
                  <span className="text-slate-400">  =  </span>
                  <span className="font-black text-slate-900">0–100</span>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  All dimensions normalised to 0–100 before weighting. Weights sum to{" "}
                  {(params.reduce((s, p) => s + p.weight, 0) * 100).toFixed(0)}%.
                </p>
              </div>

              {/* Weight bar */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Weight Distribution</p>
                <div className="flex h-4 rounded-full overflow-hidden w-full">
                  {params.map((p, i) => (
                    <div
                      key={p.key}
                      style={{ width: `${p.weight * 100}%` }}
                      className={`flex items-center justify-center text-[9px] font-bold text-white ${barColors[i]}`}
                      title={`${p.label}: ${(p.weight * 100).toFixed(0)}%`}
                    >
                      {(p.weight * 100).toFixed(0)}%
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                  {params.map((p) => (
                    <span key={p.key} className={`text-[10px] font-medium ${p.color}`}>
                      {p.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Per-parameter details */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Parameter Details</p>
                <div className="space-y-2.5">
                  {params.map((p) => (
                    <div key={p.key} className={`border rounded-lg px-4 py-3 ${p.bg}`}>
                      <div className="flex items-center gap-2 mb-1">
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Contact platforms footer ────────────────────────────────────────

function ContactPlatforms() {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <span className="text-base">Links</span>
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
            className={`flex flex-col gap-1.5 border border-gray-200 rounded-xl p-3 transition-all bg-white ${p.color}`}
          >
            <span className="text-xl" aria-hidden="true" />
            <span className={`text-xs font-bold ${p.labelColor}`}>{p.name}</span>
            <span className="text-[10px] text-gray-500 leading-tight">{p.description}</span>
            <span className="text-[10px] text-gray-400 mt-auto">Open</span>
          </a>
        ))}
      </div>
      <p className="px-4 pb-3 text-[10px] text-gray-400">
        These links open external procurement platforms in a new tab. Supplier negotiations and RFQ submissions must be conducted through your company's approved channels.
      </p>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export default function SupplierRankingView({ result, onNewRequest, onSelectSupplier, orderContext }: Props) {
  const [activeFeature, setActiveFeature] = useState<FeatureKey>("price");
  const [showExcluded, setShowExcluded] = useState(false);
  const [showPolicyIssues, setShowPolicyIssues] = useState(false);
  const [detailSupplier, setDetailSupplier] = useState<ScoredSupplier | null>(null);

  const currency = result.currency || "EUR";
  const blockingEscalations = result.escalations.filter((e) => e.blocking);
  const nonBlockingEscalations = result.escalations.filter((e) => !e.blocking);
  const cheapestTotal = result.ranking.length > 0
    ? Math.min(...result.ranking.map((s) => s.total_price))
    : null;

  const hasPolicyIssues = Boolean(
    blockingEscalations.length > 0 ||
      nonBlockingEscalations.length > 0 ||
      (result.approval_threshold_id && result.approval_threshold_note) ||
      (result.budget_sufficient === false && result.minimum_total_cost)
  );

  const currentFeature = FEATURES.find((f) => f.key === activeFeature)!;
  const featureSorted = currentFeature.sort(result.ranking).slice(0, 3);

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h2 className="app-title-secondary">Supplier Ranking</h2>
            <MethodBadge method={result.method_used} />
          </div>
          <p className="text-sm text-gray-500">
            {result.ranking.length} supplier{result.ranking.length !== 1 ? "s" : ""} evaluated
            {result.quotes_required ? ` · ${result.quotes_required} quote${result.quotes_required > 1 ? "s" : ""} required` : ""}
            {cheapestTotal ? ` · From ${fmt(cheapestTotal, currency)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasPolicyIssues && (
            <button
              onClick={() => setShowPolicyIssues(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white/90 hover:bg-white transition-colors text-gray-700"
              title="What policy checks failed or triggered escalations?"
            >
              Errors & escalations
            </button>
          )}
          <button
            onClick={onNewRequest}
            className="text-sm text-blue-600 hover:text-blue-800 underline shrink-0"
          >
            ← New request
          </button>
        </div>
      </div>

      {/* ── Supplier detail modal ── */}
      <AnimatePresence>
        {detailSupplier && (
          <SupplierDetailModal
            supplier={detailSupplier}
            feature={currentFeature}
            currency={currency}
            onClose={() => setDetailSupplier(null)}
            onSelect={(s) => { setDetailSupplier(null); onSelectSupplier(s); }}
          />
        )}
      </AnimatePresence>

      {/* ── Policy issues modal ── */}
      {showPolicyIssues && hasPolicyIssues && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[80] bg-black/60 flex items-start justify-center p-4"
          onClick={() => setShowPolicyIssues(false)}
        >
          <div
            className="w-full max-w-lg mt-16 rounded-xl bg-white border border-gray-200 shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-bold text-gray-900">Policy issues</p>
                <p className="text-xs text-gray-500">What triggered escalations / approval.</p>
              </div>
              <button
                onClick={() => setShowPolicyIssues(false)}
                className="text-gray-500 hover:text-gray-800 text-sm font-semibold px-2 py-1 rounded-md hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="p-4 space-y-4">
              {blockingEscalations.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-red-700 uppercase tracking-wider">Blocking escalations</h3>
                  {blockingEscalations.map((e, i) => (
                    <EscalationCard key={i} esc={e} />
                  ))}
                </div>
              )}

              {result.approval_threshold_id && result.approval_threshold_note && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-indigo-900">
                    Approval needed: {result.approval_threshold_id}
                  </p>
                  <p className="text-sm text-indigo-700 mt-0.5">{result.approval_threshold_note}</p>
                </div>
              )}

              {result.budget_sufficient === false && result.minimum_total_cost && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="font-semibold text-amber-800">Budget insufficient</p>
                  <p className="text-sm text-amber-700 mt-0.5">
                    Minimum cost is <strong>{fmt(result.minimum_total_cost, currency)}</strong>
                    {result.minimum_cost_supplier && ` (${result.minimum_cost_supplier})`}.
                    A budget increase is required to proceed.
                  </p>
                </div>
              )}

              {nonBlockingEscalations.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wider">Escalations (non-blocking)</h3>
                  {nonBlockingEscalations.map((e, i) => (
                    <EscalationCard key={i} esc={e} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Order context banner ── */}
      {orderContext && (orderContext.category_l1 || orderContext.quantity) && (
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
          {orderContext.delivery_country && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Delivery Country</p>
              <p className="text-sm font-bold text-slate-800">{orderContext.delivery_country}</p>
            </div>
          )}
          {orderContext.required_by_date && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Required by</p>
              <p className="text-sm font-bold text-slate-800">{orderContext.required_by_date}</p>
            </div>
          )}
        </div>
      )}

      {/* Policy issues moved to modal (Errors & escalations) */}

      {/* ── Section 1: Feature buttons + animated top-3 cards ── */}
      {result.ranking.length > 0 && (
        <div className="space-y-4">
          {/* Feature buttons */}
          <div className="flex flex-wrap gap-2">
            {FEATURES.map((f) => {
              const isActive = activeFeature === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setActiveFeature(f.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm border-2 transition-all ${
                    isActive
                      ? `${f.activeBg} ${f.activeText} ${f.activeBorder} shadow-sm`
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {f.label}
                  {isActive && <span className="text-[10px] opacity-80 hidden sm:inline">— {f.tagline}</span>}
                </button>
              );
            })}
          </div>

          {/* Feature label */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">
              Top 3 — {currentFeature.label}
            </span>
            <span className="text-xs text-gray-400">{currentFeature.tagline}</span>
          </div>

          {/* Animated top-3 cards */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeFeature}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {featureSorted.map((supplier, idx) => (
                <FeatureCard
                  key={supplier.supplier_id}
                  supplier={supplier}
                  featureRank={idx + 1}
                  feature={currentFeature}
                  currency={currency}
                  onSelect={onSelectSupplier}
                  onOpenDetail={setDetailSupplier}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* Empty state */}
      {result.ranking.length === 0 && (
        <div className="text-center py-16 bg-white border border-dashed border-gray-300 rounded-2xl">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">Search</span>
          </div>
          <h3 className="app-title-muted">No suppliers found</h3>
          <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">
            All candidates were excluded by hard policy filters. Open <span className="font-semibold">Errors & escalations</span> for details.
          </p>
        </div>
      )}

      {/* ── Section 2: Top-10 table ── */}
      {result.ranking.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            Overall Top 10
            <span className="text-xs font-normal text-gray-400 normal-case">— all features combined</span>
          </h3>
          <SupplierTable
            suppliers={result.ranking}
            currency={currency}
            onSelectSupplier={onSelectSupplier}
            onOpenDetail={setDetailSupplier}
          />
        </div>
      )}

      {/* ── Excluded suppliers ── */}
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

      {/* ── Audit trail ── */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Audit Trail — Policies Checked
        </p>
        <div className="flex flex-wrap gap-1.5">
          {result.policies_checked.map((p) => (
            <span key={p} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
              {p}
            </span>
          ))}
        </div>
        {result.llm_fallback_reason && (
          <p className="text-xs text-gray-400 mt-2 italic">AI note: {result.llm_fallback_reason}</p>
        )}
      </div>

      {/* ── Section 3: Scoring methodology ── */}
      <ScoringMethodology weights={result.scoring_weights} />

      {/* ── Footer: contact platforms ── */}
      <ContactPlatforms />

    </div>
  );
}
