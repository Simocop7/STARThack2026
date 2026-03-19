import { useEffect, useMemo, useState } from "react";
import { TaskList, type Task, type TaskStatus } from "./ui/task-list";

type ApiRequest = {
  id: string;
  submitted_at?: string;
  status: string;
  request_text?: string;
  category_l1?: string;
  category_l2?: string;
  delivery_country?: string;
  required_by_date?: string;
};

function statusToTaskStatus(status: string): TaskStatus {
  switch ((status || "").toLowerCase()) {
    case "completed":
      return "Completed";
    case "approved":
    case "in_review":
      return "In Progress";
    case "rejected":
      return "Rejected";
    case "pending":
    default:
      return "Pending";
  }
}

function fmtDate(value?: string) {
  if (!value) return "—";
  // API uses ISO strings; show date part.
  return value.split("T")[0] || value;
}

export default function EmployeeRequestsHistory() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ApiRequest[]>([]);

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchJsonWithRetry<T>(
    url: string,
    init?: RequestInit,
    retries = 4,
    backoffMs = 400,
  ): Promise<T> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await fetch(url, init);
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status} for ${url}`) as Error & { status?: number };
          err.status = res.status;
          throw err;
        }
        return (await res.json()) as T;
      } catch (e) {
        lastError = e;
        const status = (e as any)?.status as number | undefined;
        const shouldRetry = status === undefined || status >= 500;

        if (attempt >= retries - 1 || !shouldRetry) break;
        await sleep(backoffMs * (attempt + 1));
      }
    }

    throw lastError;
  }

  useEffect(() => {
    let mounted = true;

    async function loadHistory() {
      try {
        const data = await fetchJsonWithRetry<{ requests?: ApiRequest[] }>("/api/employee/requests");
        const reqs: ApiRequest[] = Array.isArray(data?.requests)
          ? data.requests
          : [];
        if (!mounted) return;
        setHistory(reqs);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Failed to load requests history.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    loadHistory();
    return () => {
      mounted = false;
    };
  }, []);

  const tasks: Task[] = useMemo(() => {
    return history.map((r) => {
      const categoryParts = [r.category_l1, r.category_l2].filter(Boolean);
      const category = categoryParts.join(" / ") || "—";
      return {
        id: r.id,
        task: (r.request_text || "").trim() || r.id,
        category,
        status: statusToTaskStatus(r.status),
        dueDate: fmtDate(r.required_by_date),
      };
    });
  }, [history]);

  return (
    <div className="min-h-full py-8 px-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-white">Requests History</h2>
          <p className="text-sm text-white/60 mt-1">
            Your submitted requests, latest first.
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-white/70">
          <div className="w-8 h-8 border-4 border-red-200 border-t-red-600 rounded-full animate-spin" />
          Loading history...
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-950/40 border border-red-200/20 rounded-lg p-4 text-red-100">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && tasks.length === 0 && (
        <div className="w-full rounded-lg border border-white/10 bg-black/20 p-8 text-white/70 text-center">
          No requests found.
        </div>
      )}

      {!loading && !error && tasks.length > 0 && <TaskList title="Request List" tasks={tasks} />}
    </div>
  );
}

