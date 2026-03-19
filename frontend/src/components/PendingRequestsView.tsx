import { useEffect, useState } from "react";
import type { SubmittedRequest, FormData } from "../types";

interface Props {
  onProcess: (data: FormData, empRequestId: string) => void;
  onRefuse: (empRequestId: string) => void;
  onNewManual: () => void;
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  processing: "bg-red-100 text-red-800",
  completed: "bg-gray-100 text-gray-700",
  refused: "bg-red-100 text-red-800",
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
    fetch(`/api/employee/requests/${req.id}/status?status=processing`, { method: "PATCH" }).catch(() => {});
    onProcess(formData, req.id);
  }

  function handleRefuse(req: SubmittedRequest) {
    setRequests((prev) =>
      prev.map((r) => (r.id === req.id ? { ...r, status: "refused" } : r))
    );
    fetch(`/api/employee/requests/${req.id}/status?status=refused`, { method: "PATCH" }).catch(() => {});
    onRefuse(req.id);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Incoming Requests</h2>
          <p className="mt-1 text-sm text-gray-500">
            Select an employee request to validate and process.
          </p>
        </div>
        <button
          onClick={onNewManual}
          className="flex items-center gap-2 bg-red-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-red-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Manual Request
        </button>
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
          <h3 className="text-gray-700 font-medium">No requests yet</h3>
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
        <div className="space-y-3">
          {requests.map((req) => (
            <div
              key={req.id}
              className="bg-white border border-gray-200 rounded-xl p-5 flex items-start gap-4 hover:border-red-300 hover:shadow-sm transition-all"
            >
              {/* Status dot */}
              <div className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                req.status === "completed" ? "bg-gray-500" :
                req.status === "processing" ? "bg-red-500" :
                req.status === "refused" ? "bg-red-500" : "bg-gray-400"
              }`} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-gray-400">{req.id}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[req.status] ?? "bg-gray-100 text-gray-700"}`}>
                    {req.status}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto">{formatDate(req.submitted_at)}</span>
                </div>

                <p className="text-sm text-gray-800 line-clamp-2 mb-2">{req.request_text}</p>

                <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                  {req.quantity && (
                    <span>
                      <span className="font-medium text-gray-700">{req.quantity}</span>{" "}
                      {req.unit_of_measure || "units"}
                    </span>
                  )}
                  {req.budget_amount != null && (
                    <span className="inline-flex items-center gap-1 font-medium text-gray-700">
                      <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {req.budget_amount.toLocaleString()} {req.currency || "EUR"}
                    </span>
                  )}
                  {req.delivery_country && (
                    <span>
                      <svg className="w-3 h-3 inline mr-0.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      </svg>
                      {req.delivery_country}
                    </span>
                  )}
                  {req.required_by_date && (
                    <span>
                      <svg className="w-3 h-3 inline mr-0.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      By {req.required_by_date}
                    </span>
                  )}
                  {req.preferred_supplier && (
                    <span>Preferred: {req.preferred_supplier}</span>
                  )}
                </div>
              </div>

              {req.status !== "completed" && req.status !== "refused" && (
                <div className="flex flex-shrink-0 gap-2">
                  <button
                    onClick={() => handleRefuse(req)}
                    className="text-sm font-medium rounded-lg px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Refuse
                  </button>
                  <button
                    onClick={() => handleProcess(req)}
                    className="bg-red-600 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-red-700 transition-colors"
                  >
                    Process
                  </button>
                </div>
              )}
              {req.status === "completed" && (
                <span className="flex-shrink-0 text-xs text-gray-600 font-medium px-3 py-2">
                  Done
                </span>
              )}
              {req.status === "refused" && (
                <span className="flex-shrink-0 text-xs text-red-600 font-medium px-3 py-2">
                  Refused
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
