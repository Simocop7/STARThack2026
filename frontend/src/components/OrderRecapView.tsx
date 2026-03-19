import type { ScoredSupplier, RankedSupplierOutput, FormData } from "../types";
import { PLATFORMS } from "./platforms";

interface Props {
  supplier: ScoredSupplier;
  ranking: RankedSupplierOutput;
  formData: FormData;
  deliveryCountry: string;
  onConfirm: () => void;
  onBack: () => void;
  loading: boolean;
}

function fmt(n: number, currency = "EUR") {
  const decimals = n > 0 && n < 1 ? 4 : n < 10 ? 2 : 0;
  return new Intl.NumberFormat("en-DE", { style: "currency", currency, maximumFractionDigits: decimals }).format(n);
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-sm font-semibold text-gray-900 text-right">{value}</span>
    </div>
  );
}

export default function OrderRecapView({ supplier, ranking, formData, deliveryCountry, onConfirm, onBack, loading }: Props) {
  const currency = ranking.currency || "EUR";
  const pct = Math.round(supplier.composite_score * 100);
  const scoreColor = pct >= 75 ? "text-green-600" : pct >= 50 ? "text-amber-600" : "text-red-600";

  return (
    <div className="max-w-xl mx-auto space-y-5 py-2">

      {/* Header */}
      <div>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to comparison
        </button>
        <h2 className="text-2xl font-bold text-gray-900">Order Recap</h2>
        <p className="text-sm text-gray-500 mt-0.5">Review every detail before sending the official order.</p>
      </div>

      {/* Selected supplier */}
      <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-slate-700 to-slate-900 px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Selected Supplier</p>
            <p className="text-xl font-bold text-white mt-0.5">{supplier.supplier_name}</p>
            <p className="text-xs text-slate-400 mt-0.5">{supplier.supplier_id}</p>
          </div>
          <div className="text-right shrink-0">
            <span className={`text-4xl font-black ${scoreColor}`}>{pct}</span>
            <p className="text-xs text-slate-400 font-medium">/ 100</p>
          </div>
        </div>
        <div className="px-5 py-3 flex gap-2 flex-wrap">
          {supplier.is_preferred && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-semibold">⭐ Preferred</span>
          )}
          {supplier.is_incumbent && (
            <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-semibold">✓ Incumbent</span>
          )}
          {!supplier.meets_lead_time && (
            <span className="text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-semibold">⏰ Lead time risk</span>
          )}
          <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">
            Tier: {supplier.pricing_tier_applied}
          </span>
        </div>
      </section>

      {/* What's being ordered */}
      <section className="bg-white border border-gray-200 rounded-2xl px-5 py-1">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider pt-4 pb-1">What's Being Ordered</p>
        <Row label="Category" value={[formData.category_l1, formData.category_l2].filter(Boolean).join(" › ") || "—"} />
        <Row label="Quantity" value={`${(formData.quantity ?? 1).toLocaleString()} ${formData.unit_of_measure || "units"}`} />
        <Row label="Delivery country" value={deliveryCountry} />
        {formData.delivery_country && <Row label="Delivery country" value={formData.delivery_country} />}
        {formData.required_by_date && <Row label="Required by" value={formData.required_by_date} />}
        <div className="pb-2" />
      </section>

      {/* Pricing */}
      <section className="bg-white border border-gray-200 rounded-2xl px-5 py-1">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider pt-4 pb-1">Pricing</p>
        <Row label="Unit price" value={fmt(supplier.unit_price, currency)} />
        <Row
          label="Total amount"
          value={<span className="text-lg font-black text-gray-900">{fmt(supplier.total_price, currency)}</span>}
        />
        <Row label="Standard lead time" value={`${supplier.standard_lead_time_days} days`} />
        {supplier.expedited_lead_time_days && (
          <Row
            label="Expedited option"
            value={`${supplier.expedited_lead_time_days}d · ${fmt(supplier.expedited_total_price!, currency)} (≈+8%)`}
          />
        )}
        <div className="pb-2" />
      </section>

      {/* Approval & compliance */}
      {(ranking.approval_threshold_id || ranking.quotes_required) && (
        <section className="bg-indigo-50 border border-indigo-200 rounded-2xl px-5 py-1">
          <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider pt-4 pb-1">Approval Requirements</p>
          {ranking.approval_threshold_id && (
            <Row label="Threshold" value={ranking.approval_threshold_id} />
          )}
          {ranking.quotes_required && (
            <Row label="Quotes required" value={`${ranking.quotes_required} supplier quote${ranking.quotes_required > 1 ? "s" : ""}`} />
          )}
          {ranking.approval_threshold_note && (
            <p className="text-xs text-indigo-700 py-2 leading-relaxed">{ranking.approval_threshold_note}</p>
          )}
          <div className="pb-2" />
        </section>
      )}

      {/* Contact platforms */}
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
              className={`flex flex-col gap-1.5 border border-gray-200 rounded-xl p-3 transition-all bg-white ${p.color}`}
            >
              <span className="text-xl">{p.icon}</span>
              <span className={`text-xs font-bold ${p.labelColor}`}>{p.name}</span>
              <span className="text-[10px] text-gray-500 leading-tight">{p.description}</span>
              <span className="text-[10px] text-gray-400 mt-auto">Open ↗</span>
            </a>
          ))}
        </div>
        <p className="px-4 pb-3 text-[10px] text-gray-400">
          Supplier negotiations must be conducted through your company's approved channels.
        </p>
      </div>

      {/* Action buttons */}
      <div className="space-y-3 pt-1 pb-6">
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`w-full rounded-2xl py-4 text-base font-bold tracking-wide transition-all shadow-lg ${
            loading
              ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
              : "bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99] shadow-blue-200"
          }`}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Sending order…
            </span>
          ) : (
            "✓ Send Official Order"
          )}
        </button>
        <button
          onClick={onBack}
          disabled={loading}
          className="w-full rounded-2xl py-3 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          ← Back to comparison
        </button>
      </div>

    </div>
  );
}
