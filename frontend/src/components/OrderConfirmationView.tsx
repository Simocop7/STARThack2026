import type { OrderConfirmation } from "../types";
import { PLATFORMS } from "./platforms";

interface Props {
  confirmation: OrderConfirmation;
  onNewRequest: () => void;
}

function fmt(n: number, currency = "EUR") {
  const decimals = n > 0 && n < 1 ? 4 : n < 10 ? 2 : 0;
  return new Intl.NumberFormat("en-DE", { style: "currency", currency, maximumFractionDigits: decimals }).format(n);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
}

export default function OrderConfirmationView({ confirmation: c, onNewRequest }: Props) {
  const isPending = c.status === "pending_approval";

  return (
    <div className="space-y-5">

      {/* Status banner */}
      <div className={`rounded-2xl px-5 py-4 flex items-center gap-4 print:hidden ${
        isPending ? "bg-amber-50 border border-amber-200" : "bg-green-50 border border-green-200"
      }`}>
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
          <p className={`font-bold text-base ${isPending ? "text-amber-800" : "text-green-800"}`}>
            {isPending ? "Order submitted — awaiting approval" : "Order submitted successfully"}
          </p>
          <p className={`text-sm mt-0.5 ${isPending ? "text-amber-600" : "text-green-600"}`}>
            {isPending
              ? "Approval is required before a purchase order can be issued to the supplier."
              : "A purchase order can now be issued to the supplier."}
          </p>
        </div>
      </div>

      {/* ── Purchase order document ── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden print:rounded-none print:border-0 print:shadow-none" id="order-receipt">

        {/* Document header */}
        <div className="flex items-start justify-between px-8 py-6 border-b border-gray-100 print:border-gray-300">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 bg-indigo-600 rounded-md flex items-center justify-center print:bg-gray-800">
                <span className="text-white font-black text-xs">CQ</span>
              </div>
              <span className="text-sm font-bold text-indigo-700 print:text-gray-700 tracking-wide uppercase">ChainIQ Smart Procurement</span>
            </div>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium mt-2">Purchase Order Confirmation</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-gray-900 font-mono tracking-tight">{c.order_id}</p>
            <p className="text-xs text-gray-400 mt-1">{fmtDate(c.placed_at)}</p>
            <span className={`inline-block mt-2 text-xs font-bold px-3 py-0.5 rounded-full ${
              isPending ? "bg-amber-100 text-amber-700 print:bg-gray-100 print:text-gray-700" : "bg-green-100 text-green-700"
            }`}>
              {isPending ? "PENDING APPROVAL" : "SUBMITTED"}
            </span>
          </div>
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-2 divide-x divide-gray-100 print:divide-gray-300">

          {/* Left: Order details */}
          <div className="px-8 py-5">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Order Details</p>
            <dl className="space-y-3">
              <div>
                <dt className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Request ID</dt>
                <dd className="text-sm font-mono font-semibold text-gray-800 mt-0.5">{c.request_id}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Category</dt>
                <dd className="text-sm font-semibold text-gray-800 mt-0.5">{c.category_l1} › {c.category_l2}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Quantity</dt>
                <dd className="text-sm font-semibold text-gray-800 mt-0.5">{c.quantity.toLocaleString()} {c.unit_of_measure}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Delivery country</dt>
                <dd className="text-sm font-semibold text-gray-800 mt-0.5">{c.delivery_country}</dd>
              </div>
              {c.required_by_date && (
                <div>
                  <dt className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Required by</dt>
                  <dd className="text-sm font-semibold text-gray-800 mt-0.5">{c.required_by_date}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Right: Supplier + pricing */}
          <div className="px-8 py-5">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Supplier & Pricing</p>
            <dl className="space-y-3">
              <div>
                <dt className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Supplier</dt>
                <dd className="text-sm font-bold text-gray-900 mt-0.5">{c.selected_supplier_name}</dd>
                <dd className="text-[10px] font-mono text-gray-400">{c.selected_supplier_id}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Pricing tier</dt>
                <dd className="text-sm font-semibold text-gray-800 mt-0.5">{c.pricing_tier_applied}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Unit price</dt>
                <dd className="text-sm font-semibold text-gray-800 mt-0.5">{fmt(c.unit_price, c.currency)}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Total value</dt>
                <dd className="text-xl font-black text-gray-900 mt-0.5">{fmt(c.total_price, c.currency)}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Approval requirements */}
        {c.approval_required && (
          <div className="border-t border-gray-100 print:border-gray-300 px-8 py-5">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Approval Requirements</p>
            <div className="flex items-start gap-3 bg-amber-50 print:bg-transparent border border-amber-200 print:border-gray-300 rounded-xl px-4 py-3">
              <span className="font-mono text-sm font-black text-amber-700 shrink-0">{c.approval_threshold_id}</span>
              <div>
                <p className="text-sm text-amber-800 print:text-gray-800">{c.approval_threshold_note}</p>
                {c.quotes_required && c.quotes_required > 1 && (
                  <p className="text-xs text-amber-600 print:text-gray-600 mt-1 font-medium">
                    {c.quotes_required} competitive quotes required before award.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Next steps */}
        {c.next_steps.length > 0 && (
          <div className="border-t border-gray-100 print:border-gray-300 px-8 py-5">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Next Steps</p>
            <ol className="space-y-2.5">
              {c.next_steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 print:bg-gray-100 text-indigo-700 print:text-gray-700 flex items-center justify-center text-xs font-black shrink-0 mt-px">
                    {i + 1}
                  </span>
                  <span className="text-sm text-gray-700 pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Notes */}
        {c.notes && (
          <div className="border-t border-gray-100 print:border-gray-300 px-8 py-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Notes</p>
            <p className="text-sm text-gray-600 italic">{c.notes}</p>
          </div>
        )}

        {/* Document footer */}
        <div className="border-t border-gray-100 print:border-gray-300 px-8 py-3 flex items-center justify-between bg-gray-50 print:bg-transparent">
          <p className="text-[10px] text-gray-400">
            Generated by ChainIQ Smart Procurement · {c.order_id} · {c.request_id}
          </p>
          <p className="text-[10px] text-gray-400">Confidential — Internal Use Only</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 print:hidden">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-gray-900 text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print / Save PDF
        </button>
        <button onClick={onNewRequest} className="text-sm text-blue-600 hover:text-blue-800 underline">
          New request
        </button>
      </div>

      {/* Contact platforms footer */}
      <div className="border border-gray-200 rounded-xl overflow-hidden print:hidden">
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
          Supplier negotiations and RFQ submissions must be conducted through your company's approved channels.
        </p>
      </div>

    </div>
  );
}
