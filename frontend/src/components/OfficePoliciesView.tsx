import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Upload, Trash2, CheckCircle2, XCircle } from "lucide-react";

type UploadedPolicyDoc = {
  id: string;
  name: string;
  sizeBytes: number;
  uploadedAtISO: string;
};

type PolicyAspect = {
  id: string;
  label: string;
  description: string;
};

const STORAGE_DOCS_KEY = "silvioiq_uploaded_policy_docs_v1";
const STORAGE_ASPECTS_KEY = "silvioiq_respect_policy_aspects_v1";

const POLICY_ASPECTS: PolicyAspect[] = [
  {
    id: "approval_thresholds",
    label: "Approval thresholds",
    description: "Enforce quote/approval tiers based on true contract value.",
  },
  {
    id: "restricted_suppliers",
    label: "Restricted suppliers",
    description: "Block restricted suppliers for the affected categories/countries.",
  },
  {
    id: "category_rules",
    label: "Category rules",
    description: "Apply mandatory reviews for specific categories and value levels.",
  },
  {
    id: "geography_rules",
    label: "Geography & residency",
    description: "Apply data residency and country-specific compliance rules.",
  },
  {
    id: "escalation_rules",
    label: "Escalation logic",
    description: "Escalate to the correct approvers when policy requires human review.",
  },
  {
    id: "capacity_checks",
    label: "Supplier capacity",
    description: "Ensure selected suppliers can meet required volume/capacity.",
  },
  {
    id: "esg_requirements",
    label: "ESG requirements",
    description: "Include ESG scoring and ensure ESG criteria do not block award.",
  },
  {
    id: "audit_trail",
    label: "Audit-ready evidence",
    description: "Keep policies_checked + reasoning steps for review/audit.",
  },
];

function fmtBytes(bytes: number) {
  const kb = bytes / 1024;
  const mb = kb / 1024;
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  if (kb >= 1) return `${kb.toFixed(1)} KB`;
  return `${bytes} B`;
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

function uid() {
  return `pol_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function safeParseJSON<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export default function OfficePoliciesView() {
  const [docs, setDocs] = useState<UploadedPolicyDoc[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [activeFrame, setActiveFrame] = useState<0 | 1>(0);

  const [respected, setRespected] = useState<Record<string, boolean>>({});
  const [extractedClauses, setExtractedClauses] = useState<Record<string, string[]>>({});
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  // Load from localStorage once.
  useEffect(() => {
    const storedDocs = safeParseJSON<UploadedPolicyDoc[]>(
      localStorage.getItem(STORAGE_DOCS_KEY),
    );
    if (storedDocs?.length) setDocs(storedDocs);

    const storedAspects = safeParseJSON<Record<string, boolean>>(
      localStorage.getItem(STORAGE_ASPECTS_KEY),
    );

    const initial: Record<string, boolean> = {};
    for (const a of POLICY_ASPECTS) initial[a.id] = storedAspects?.[a.id] ?? true;
    setRespected(initial);
  }, []);

  // Persist aspects selection.
  useEffect(() => {
    if (!respected || Object.keys(respected).length === 0) return;
    localStorage.setItem(STORAGE_ASPECTS_KEY, JSON.stringify(respected));
  }, [respected]);

  // Persist docs metadata.
  useEffect(() => {
    if (!docs) return;
    localStorage.setItem(STORAGE_DOCS_KEY, JSON.stringify(docs));
  }, [docs]);

  const respectedCount = useMemo(
    () => POLICY_ASPECTS.reduce((acc, a) => acc + (respected[a.id] ? 1 : 0), 0),
    [respected],
  );

  async function acceptFiles(fileList: FileList | null) {
    if (!fileList) return;

    const pdfs = Array.from(fileList).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) return;

    const newDocs: UploadedPolicyDoc[] = pdfs.map((f) => ({
      id: uid(),
      name: f.name,
      sizeBytes: f.size,
      uploadedAtISO: new Date().toISOString(),
    }));

    setDocs((prev) => [...newDocs, ...prev]);
    setActiveFrame(0);

    // Run server-side RAG to extract exact policy clauses.
    setExtracting(true);
    setExtractError(null);
    setExtractedClauses({});

    try {
      const formData = new FormData();
      for (const f of pdfs) formData.append("files", f);

      const upRes = await fetch("/api/policies/upload", { method: "POST", body: formData });
      if (!upRes.ok) throw new Error(`Policy upload failed (HTTP ${upRes.status})`);

      const exRes = await fetch("/api/policies/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aspect_ids: POLICY_ASPECTS.map((a) => a.id) }),
      });
      if (!exRes.ok) throw new Error(`Policy extraction failed (HTTP ${exRes.status})`);

      const data = await exRes.json();
      if (data?.error) {
        setExtractError(String(data.error));
        setExtractedClauses({});
        setActiveFrame(1);
        return;
      }
      const extracted = (data?.extracted ?? {}) as Record<string, { clauses?: string[] }>;

      const clausesMap: Record<string, string[]> = {};
      for (const a of POLICY_ASPECTS) {
        const val = extracted[a.id];
        clausesMap[a.id] = Array.isArray(val?.clauses) ? val.clauses.filter(Boolean) : [];
      }
      setExtractedClauses(clausesMap);
      setActiveFrame(1);
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "Policy extraction failed.");
      setExtractedClauses({});
    } finally {
      setExtracting(false);
    }
  }

  function removeDoc(docId: string) {
    setDocs((prev) => prev.filter((d) => d.id !== docId));
  }

  return (
    <div className="space-y-6">
      {/* Top upload box */}
      <div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-red-800">Policy</h1>
            <p className="text-sm text-black/60 mt-1">
              Upload PDF policy documents and choose which policy aspects to respect.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 rounded-xl border border-red-900/10 bg-white px-4 py-2">
            <CheckCircle2 className="w-4 h-4 text-red-700" />
            <span className="text-sm font-semibold text-black">
              {respectedCount}/{POLICY_ASPECTS.length} respected
            </span>
          </div>
        </div>

        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void acceptFiles(e.dataTransfer.files);
          }}
          className={[
            "mt-4 rounded-2xl border-2 border-dashed transition-colors p-6 sm:p-8",
            dragOver
              ? "border-red-600 bg-red-50"
              : "border-red-900/20 bg-white hover:bg-red-50/40",
          ].join(" ")}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
        >
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            <div className="w-12 h-12 rounded-2xl bg-black text-white flex items-center justify-center shadow-lg shadow-red-900/20">
              <Upload className="w-5 h-5 text-red-400" />
            </div>
            <div className="text-center sm:text-left flex-1">
              <p className="text-sm font-semibold text-black">
                Drag & drop your policy PDFs here
              </p>
              <p className="text-sm text-black/60 mt-1">
                Only PDF files are accepted.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-bold hover:bg-red-700 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                Upload
              </button>
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            multiple
            onChange={(e) => void acceptFiles(e.target.files)}
          />
        </div>
      </div>

      {/* Slider */}
      <div className="bg-white border border-red-900/10 rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-red-900/10 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveFrame(0)}
              className={[
                "px-3 py-2 rounded-xl text-sm font-bold border transition-colors",
                activeFrame === 0
                  ? "bg-black text-white border-black"
                  : "bg-white text-black/70 border-red-900/10 hover:bg-red-50",
              ].join(" ")}
            >
              Uploaded PDFs
            </button>
            <button
              type="button"
              onClick={() => setActiveFrame(1)}
              className={[
                "px-3 py-2 rounded-xl text-sm font-bold border transition-colors",
                activeFrame === 1
                  ? "bg-black text-white border-black"
                  : "bg-white text-black/70 border-red-900/10 hover:bg-red-50",
              ].join(" ")}
            >
              Policy aspects
            </button>
          </div>
          <div className="text-sm text-black/60">
            {activeFrame === 0 ? `${docs.length} document(s)` : `${respectedCount} enabled`}
          </div>
        </div>

        <div className="relative overflow-hidden">
          <motion.div
            className="flex w-[200%]"
            animate={{ x: `${activeFrame * -50}%` }}
            transition={{ type: "spring", stiffness: 260, damping: 25 }}
          >
            {/* Frame 1: PDFs list */}
            <div className="w-[50%] p-4 sm:p-6">
              <AnimatePresence initial={false}>
                {docs.length === 0 ? (
                  <motion.div
                    key="empty_docs"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="rounded-xl border border-red-900/10 bg-red-50/30 p-6"
                  >
                    <p className="text-sm font-semibold text-red-900">No policy PDFs yet</p>
                    <p className="text-sm text-black/60 mt-1">
                      Upload your first PDF above to start managing policy documents.
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="docs_list"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-3"
                  >
                    {docs.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between gap-4 rounded-xl border border-red-900/10 bg-white px-4 py-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center shadow-lg shadow-red-900/20">
                            <FileText className="w-5 h-5 text-red-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-black truncate">{d.name}</p>
                            <p className="text-xs text-black/50 mt-0.5">
                              {fmtBytes(d.sizeBytes)} · {fmtDate(d.uploadedAtISO)}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeDoc(d.id)}
                          className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-red-900/10 text-red-700 hover:bg-red-50 transition-colors"
                          title="Remove document"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Frame 2: Policy aspects */}
            <div className="w-[50%] p-4 sm:p-6">
              <div className="space-y-3">
                {extractError && <div className="text-sm text-red-700 font-medium">{extractError}</div>}
                {POLICY_ASPECTS.map((a) => {
                  const enabled = !!respected[a.id];
                  const clauses = extractedClauses[a.id] ?? [];
                  return (
                    <div
                      key={a.id}
                      className="rounded-2xl border border-red-900/10 bg-white px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-start gap-3">
                            <div className="mt-1 w-2 h-2 rounded-full bg-red-600" />
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-black truncate">{a.label}</p>
                              <p className="text-sm text-black/60 mt-0.5">
                                {extracting ? "Extracting exact clauses..." : a.description}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span
                            className={[
                              "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border",
                              enabled
                                ? "bg-red-50 border-red-200 text-red-700"
                                : "bg-black text-white border-black/30",
                            ].join(" ")}
                          >
                            {enabled ? (
                              <span className="inline-flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4" />
                                Enabled
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-2">
                                <XCircle className="w-4 h-4" />
                                Disabled
                              </span>
                            )}
                          </span>

                          <button
                            type="button"
                            onClick={() => setRespected((prev) => ({ ...prev, [a.id]: !enabled }))}
                            className="w-11 h-11 rounded-2xl border border-red-900/10 bg-white hover:bg-red-50 transition-colors"
                            aria-label={`Toggle policy aspect ${a.label}`}
                          >
                            <div className={`w-full h-full rounded-2xl flex items-center justify-center ${enabled ? "text-red-700" : "text-black/50"}`}>
                              <span className={`text-sm font-black`}>{enabled ? "✓" : "—"}</span>
                            </div>
                          </button>
                        </div>
                      </div>

                      {!extracting && (
                        <div className="mt-3">
                          {clauses.length > 0 ? (
                            <ul className="list-disc list-inside space-y-1">
                              {clauses.slice(0, 4).map((c, idx) => (
                                <li key={`${a.id}_${idx}`} className="text-sm text-black/70">
                                  {c}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-sm text-black/50">
                              No extracted clause found yet. Upload PDFs to extract policies.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 bg-red-50/40 border border-red-900/10 rounded-2xl px-4 py-3">
                <p className="text-sm font-bold text-red-800">What this affects (prototype)</p>
                <p className="text-sm text-black/60 mt-1">
                  These toggles are stored locally and will be used by the portal logic later to filter policy checks.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

