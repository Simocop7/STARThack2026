import { useEffect, useState } from "react";
import type { SubmittedRequest, FormData } from "../types";
import { ShimmerButton } from "./ui/shimmer-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

interface Props {
  onProcess: (data: FormData, empRequestId: string) => void;
  onRefuse: (empRequestId: string) => void;
  onNewManual: () => void;
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700 border border-gray-200",
  processing: "bg-red-100 text-red-800 border border-red-200",
  completed: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  refused: "bg-red-100 text-red-800 border border-red-200",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function PendingRequestsView({ onProcess, onRefuse, onNewManual }: Props) {
  const [requests, setRequests] = useState<SubmittedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/employee/requests")
      .then((r) => r.json())
      .then((d) => setRequests(d.requests || []))
      .catch(() => setError("Failed to load requests."))
      .finally(() => setLoading(false));
  }, []);

  function handleProcess(req: SubmittedRequest) {
    const formData: FormData = {
      request_text: req.request_text,
      quantity: req.quantity,
      unit_of_measure: req.unit_of_measure,
      budget_amount: req.budget_amount ?? null,
      currency: req.currency || "EUR",
      category_l1: req.category_l1,
      category_l2: req.category_l2,
      delivery_country: req.delivery_country,
      required_by_date: req.required_by_date,
      preferred_supplier: req.preferred_supplier,
      language: req.language || "en",
    };
    // Optimistically mark as processing in local state
    setRequests((prev) =>
      prev.map((r) => (r.id === req.id ? { ...r, status: "processing" } : r))
    );
    fetch(`/api/employee/requests/${req.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "processing" }),
    }).catch(() => {});
    onProcess(formData, req.id);
  }

  function handleRefuse(req: SubmittedRequest) {
    setRequests((prev) =>
      prev.map((r) => (r.id === req.id ? { ...r, status: "refused" } : r))
    );
    fetch(`/api/employee/requests/${req.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "refused" }),
    }).catch(() => {});
    onRefuse(req.id);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="app-title-secondary">Incoming Requests</h2>
          <p className="mt-1 text-sm text-gray-500">
            Select an employee request to validate and process.
          </p>
        </div>
        <ShimmerButton
          onClick={onNewManual}
          background="rgb(185 28 28)"
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Manual Request
        </ShimmerButton>
      </div>

      {loading && (
        <div className="flex items-center gap-3 py-12 justify-center text-gray-500">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-red-600 rounded-full animate-spin" />
          Loading requests…
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">{error}</div>
      )}

      {!loading && !error && requests.length === 0 && (
        <div className="text-center py-20 bg-white border border-dashed border-gray-300 rounded-2xl">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="app-title-muted">No requests yet</h3>
          <p className="text-sm text-gray-400 mt-1">
            Employee requests will appear here once submitted.
          </p>
          <button
            onClick={onNewManual}
            className="mt-5 text-sm text-red-600 font-medium hover:underline"
          >
            Or create a manual request →
          </button>
        </div>
      )}

      {!loading && requests.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-[130px] font-semibold text-gray-600">Request ID</TableHead>
                <TableHead className="min-w-[320px] font-semibold text-gray-600">Description</TableHead>
                <TableHead className="font-semibold text-gray-600">Quantity</TableHead>
                <TableHead className="font-semibold text-gray-600">Budget</TableHead>
                <TableHead className="font-semibold text-gray-600">Country</TableHead>
                <TableHead className="font-semibold text-gray-600">Required by</TableHead>
                <TableHead className="font-semibold text-gray-600">Status</TableHead>
                <TableHead className="font-semibold text-gray-600">Submitted</TableHead>
                <TableHead className="text-right font-semibold text-gray-600">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {requests.map((req) => {
                const canAct = req.status !== "completed" && req.status !== "refused";
                return (
                  <TableRow key={req.id}>
                    <TableCell className="font-mono text-xs text-gray-500">{req.id}</TableCell>
                    <TableCell className="max-w-[420px]">
                      <p className="line-clamp-2 text-sm text-gray-800">{req.request_text}</p>
                      {req.preferred_supplier && (
                        <p className="mt-1 text-xs text-gray-500">
                          Preferred: <span className="font-medium text-gray-700">{req.preferred_supplier}</span>
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-700">
                      {req.quantity ? `${req.quantity} ${req.unit_of_measure || "units"}` : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-gray-700">
                      {req.budget_amount != null
                        ? `${req.budget_amount.toLocaleString()} ${req.currency || "EUR"}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-gray-700">{req.delivery_country || "—"}</TableCell>
                    <TableCell className="text-sm text-gray-700">{req.required_by_date || "—"}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_BADGE[req.status] ?? "bg-gray-100 text-gray-700 border border-gray-200"
                        }`}
                      >
                        {req.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 whitespace-nowrap">{formatDate(req.submitted_at)}</TableCell>
                    <TableCell className="text-right">
                      {canAct ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleRefuse(req)}
                            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                          >
                            Refuse
                          </button>
                          <ShimmerButton
                            onClick={() => handleProcess(req)}
                            background="rgb(185 28 28)"
                            className="rounded-lg px-3 py-2 text-xs font-medium"
                          >
                            Process
                          </ShimmerButton>
                        </div>
                      ) : (
                        <span className={`text-xs font-medium ${req.status === "refused" ? "text-red-600" : "text-emerald-700"}`}>
                          {req.status === "refused" ? "Refused" : "Done"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
