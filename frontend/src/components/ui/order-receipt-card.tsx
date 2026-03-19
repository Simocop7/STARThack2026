import * as React from "react";
import type { OrderConfirmation } from "@/types";

function fmt(n: number, currency = "EUR") {
  const decimals = n > 0 && n < 1 ? 4 : n < 10 ? 2 : 0;
  return new Intl.NumberFormat("en-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: decimals,
  }).format(n);
}

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface ReceiptItemProps {
  label: string;
  value: React.ReactNode;
}

function ReceiptItem({ label, value }: ReceiptItemProps) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-red-900/50">{label}</span>
      <span className="text-sm font-semibold text-black mt-0.5">{value}</span>
    </div>
  );
}

export default function OrderReceiptCard({ order }: { order: OrderConfirmation }) {
  const isPendingApproval = order.status === "pending_approval";

  return (
    <div
      id="order-receipt"
      className="w-full bg-white border border-red-900/10 rounded-2xl shadow-lg overflow-hidden print:shadow-none print:border-0"
    >
      {/* Header */}
      <div className="px-8 py-6 border-b border-red-900/10 bg-red-950/3">
        <div className="flex items-start justify-between gap-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-900/30">
                <svg
                  className="w-4 h-4 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 8v4l3 3" />
                  <path d="M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-black text-red-900 tracking-wider uppercase">
                  Procurement Receipt
                </p>
                <p className="text-sm font-bold text-black mt-1 font-mono">{order.order_id}</p>
              </div>
            </div>
            <p className="text-xs text-black/50 mt-3">
              Placed: <span className="font-semibold">{fmtDate(order.placed_at)}</span>
            </p>
          </div>

          {/* QR placeholder (no external dependencies/network) */}
          <div className="flex flex-col items-end gap-2">
            <div className="w-16 h-16 bg-black rounded-xl p-3 flex items-center justify-center">
              <span className="text-white font-black text-xs text-center leading-tight">
                QR
                <br />
                {order.order_id.slice(-4)}
              </span>
            </div>
            <span
              className={`inline-flex items-center px-3 py-1 text-[11px] font-bold rounded-full border ${
                isPendingApproval
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-black text-white border-black/10"
              }`}
            >
              {isPendingApproval ? "PENDING APPROVAL" : "SUBMITTED"}
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-8 py-6 space-y-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-6">
          <ReceiptItem label="Request ID" value={<span className="font-mono">{order.request_id}</span>} />
          <ReceiptItem
            label="Category"
            value={
              <span>
                {order.category_l1} › {order.category_l2}
              </span>
            }
          />
          <ReceiptItem label="Quantity" value={`${order.quantity.toLocaleString()} ${order.unit_of_measure}`} />
          <ReceiptItem label="Delivery country" value={order.delivery_country} />
          <ReceiptItem label="Supplier" value={order.selected_supplier_name} />
          <ReceiptItem label="Supplier ID" value={<span className="font-mono">{order.selected_supplier_id}</span>} />
          <ReceiptItem label="Required by" value={order.required_by_date ?? "—"} />
          <ReceiptItem label="Pricing tier" value={order.pricing_tier_applied} />
          <ReceiptItem label="Unit price" value={fmt(order.unit_price, order.currency)} />
          <ReceiptItem label="Total value" value={<span className="text-red-700">{fmt(order.total_price, order.currency)}</span>} />
        </div>

        {/* Approval requirements */}
        {order.approval_required && (
          <div className="border border-red-900/10 rounded-2xl bg-red-950/3 p-5">
            <p className="text-xs font-black text-red-900/70 uppercase tracking-wider mb-2">
              Approval requirements
            </p>
            <p className="text-sm font-semibold text-black">
              {order.approval_threshold_id}
            </p>
            {order.approval_threshold_note && (
              <p className="text-sm text-black/70 mt-2">{order.approval_threshold_note}</p>
            )}
            {order.quotes_required && order.quotes_required > 1 && (
              <p className="text-xs text-black/60 mt-2">
                {order.quotes_required} competitive quotes required before award.
              </p>
            )}
          </div>
        )}

        {/* Next steps */}
        {order.next_steps?.length > 0 && (
          <div className="border border-red-900/10 rounded-2xl bg-white p-5">
            <p className="text-xs font-black text-red-900/70 uppercase tracking-wider mb-3">
              Next steps
            </p>
            <ol className="space-y-2">
              {order.next_steps.map((step, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-black shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-sm text-black/80 pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-8 py-4 border-t border-red-900/10 bg-red-950/2 flex items-center justify-between">
        <p className="text-[10px] text-black/50">
          Generated by <span className="font-bold">SilvioIQ</span> · {order.order_id}
        </p>
        <p className="text-[10px] text-black/50">Confidential — Internal Use Only</p>
      </div>
    </div>
  );
}

