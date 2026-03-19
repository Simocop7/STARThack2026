import { useEffect, useMemo, useState } from "react";
import type { OrderConfirmation } from "../types";
import OrderReceiptCard from "./ui/order-receipt-card";

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(n: number, currency = "EUR") {
  const decimals = n > 0 && n < 1 ? 4 : n < 10 ? 2 : 0;
  return new Intl.NumberFormat("en-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: decimals,
  }).format(n);
}

export default function OfficeOrdersView({ orders }: { orders: OrderConfirmation[] }) {
  const [printOrder, setPrintOrder] = useState<OrderConfirmation | null>(null);
  const [printNonce, setPrintNonce] = useState(0);

  const totalOrders = orders.length;
  const hasOrders = totalOrders > 0;

  const statusLabel = (o: OrderConfirmation) =>
    o.status === "pending_approval" ? "Pending approval" : "Submitted";

  const statusBadge = (o: OrderConfirmation) =>
    o.status === "pending_approval"
      ? "bg-red-50 border border-red-200 text-red-700"
      : "bg-black text-white border border-black/10";

  const hint = useMemo(() => {
    if (!hasOrders) return "No orders have been placed yet.";
    return "Use “Print receipt” to save each order as PDF.";
  }, [hasOrders]);

  useEffect(() => {
    if (printNonce <= 0) return;
    // Give React time to render the selected receipt into the DOM before printing.
    const t = window.setTimeout(() => window.print(), 150);
    return () => window.clearTimeout(t);
  }, [printNonce]);

  function handlePrint(order: OrderConfirmation) {
    setPrintOrder(order);
    setPrintNonce((n) => n + 1);
  }

  return (
    <div className="space-y-6">
      {/* Table section */}
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="app-title-primary">Orders</h1>
          <p className="text-sm text-black/60 mt-1">{hint}</p>
        </div>
        <div className="text-sm font-semibold text-black/50">
          {totalOrders} order{totalOrders === 1 ? "" : "s"}
        </div>
      </div>

      {!hasOrders ? (
        <div className="bg-white border border-red-900/10 rounded-2xl p-6 print:hidden">
          <p className="text-sm text-black/70">
            Place an order from the office flow, then come back here to print the receipts.
          </p>
        </div>
      ) : (
        <div className="print:hidden overflow-x-auto bg-white border border-red-900/10 rounded-2xl">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-black text-white/90">
                <th className="text-left font-bold px-4 py-3 w-40">Order</th>
                <th className="text-left font-bold px-4 py-3 w-44">Request</th>
                <th className="text-left font-bold px-4 py-3">Supplier</th>
                <th className="text-left font-bold px-4 py-3 w-28">Status</th>
                <th className="text-left font-bold px-4 py-3 w-32">Total</th>
                <th className="text-left font-bold px-4 py-3 w-28">Date</th>
                <th className="text-right font-bold px-4 py-3 w-44">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.order_id} className="border-b border-red-900/10 last:border-b-0">
                  <td className="px-4 py-3 font-mono text-xs text-black">
                    {o.order_id}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-black/70">
                    {o.request_id}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-black">{o.selected_supplier_name}</div>
                    <div className="text-xs text-black/50 font-mono">{o.selected_supplier_id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-3 py-1 text-xs font-bold rounded-full ${statusBadge(o)}`}>
                      {statusLabel(o)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-black font-semibold">
                    {fmtMoney(o.total_price, o.currency)}
                  </td>
                  <td className="px-4 py-3 text-black/70 font-semibold">{fmtDate(o.placed_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handlePrint(o)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 text-white px-4 py-2 text-xs font-bold hover:bg-red-700 transition-colors"
                    >
                      Print receipt
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Single hidden print target (only visible in print media) */}
      <div className="hidden print:block">
        {printOrder ? <OrderReceiptCard order={printOrder} /> : null}
      </div>
    </div>
  );
}

