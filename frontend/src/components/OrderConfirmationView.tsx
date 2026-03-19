import type { OrderConfirmation } from "../types";

interface Props {
  confirmation: OrderConfirmation;
  onNewRequest: () => void;
}

function fmt(n: number, currency = "EUR") {
  return new Intl.NumberFormat("en-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right max-w-xs">{value}</span>
    </div>
  );
}

export default function OrderConfirmationView({ confirmation: c, onNewRequest }: Props) {
  const isPending = c.status === "pending_approval";

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <div className={`rounded-xl p-5 flex items-start gap-4 ${isPending ? "bg-amber-50 border border-amber-200" : "bg-green-50 border border-green-200"}`}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isPending ? "bg-amber-100" : "bg-green-100"}`}>
          {isPending ? (
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <div>
          <p className={`font-semibold text-lg ${isPending ? "text-amber-800" : "text-green-800"}`}>
            {isPending ? "Order Submitted — Pending Approval" : "Order Submitted Successfully"}
          </p>
          <p className={`text-sm mt-0.5 ${isPending ? "text-amber-700" : "text-green-700"}`}>
            {isPending
              ? "This order requires approval before a purchase order can be issued."
              : "The purchase order can now be issued to the supplier."}
          </p>
        </div>
      </div>

      {/* Receipt card */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden print:shadow-none" id="order-receipt">
        {/* Receipt header */}
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Order Confirmation</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5 font-mono">{c.order_id}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Placed at</p>
            <p className="text-sm text-gray-700">{fmtDate(c.placed_at)}</p>
          </div>
        </div>

        <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Order details */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Order Details</p>
            <Row label="Request ID" value={<span className="font-mono">{c.request_id}</span>} />
            <Row label="Category" value={`${c.category_l1} › ${c.category_l2}`} />
            <Row label="Quantity" value={`${c.quantity} ${c.unit_of_measure}`} />
            <Row label="Delivery country" value={c.delivery_country} />
            {c.required_by_date && (
              <Row label="Required by" value={c.required_by_date} />
            )}
          </div>

          {/* Right: Supplier + pricing */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Selected Supplier</p>
            <Row label="Supplier" value={c.selected_supplier_name} />
            <Row label="Supplier ID" value={<span className="font-mono text-gray-500">{c.selected_supplier_id}</span>} />
            <Row label="Pricing tier" value={c.pricing_tier_applied} />
            <Row label="Unit price" value={fmt(c.unit_price, c.currency)} />
            <Row
              label="Total value"
              value={
                <span className="text-base font-bold text-gray-900">{fmt(c.total_price, c.currency)}</span>
              }
            />
          </div>
        </div>

        {/* Approval info */}
        {c.approval_required && (
          <div className="border-t border-gray-100 px-6 py-4 bg-amber-50">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Approval Required</p>
            <div className="flex items-start gap-2">
              <span className="font-mono text-xs font-bold text-amber-700 mt-0.5">{c.approval_threshold_id}</span>
              <p className="text-sm text-amber-800">{c.approval_threshold_note}</p>
            </div>
            {c.quotes_required && c.quotes_required > 1 && (
              <p className="text-xs text-amber-600 mt-1">
                {c.quotes_required} competitive quotes required before award.
              </p>
            )}
          </div>
        )}

        {/* Notes */}
        {c.notes && (
          <div className="border-t border-gray-100 px-6 py-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-gray-600">{c.notes}</p>
          </div>
        )}

        {/* Next steps */}
        <div className="border-t border-gray-200 px-6 py-4 bg-blue-50">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-3">Next Steps</p>
          <ol className="space-y-2">
            {c.next_steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-blue-900">
                <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-3 bg-gray-50 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Generated by Smart Procurement · {c.order_id} · {c.request_id}
          </p>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isPending ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
            {isPending ? "PENDING APPROVAL" : "SUBMITTED"}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 print:hidden">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-gray-900 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print / Save PDF
        </button>
        <button
          onClick={onNewRequest}
          className="text-sm text-blue-600 hover:text-blue-800 underline"
        >
          New request
        </button>
      </div>
    </div>
  );
}
