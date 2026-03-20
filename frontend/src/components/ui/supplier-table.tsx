import { useState, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Download, ChevronDown, X } from "lucide-react";
import type { ScoredSupplier } from "../../types";

type SortField = "rank" | "composite_score" | "unit_price" | "quality" | "trust" | "esg" | "lead_time";

interface SupplierTableProps {
  suppliers: ScoredSupplier[];
  currency?: string;
  className?: string;
  onSelectSupplier?: (s: ScoredSupplier) => void;
  onOpenDetail?: (s: ScoredSupplier) => void;
}

function ScoreChip({ value }: { value: number }) {
  const color =
    value >= 75
      ? "bg-green-100 text-green-700 border-green-200"
      : value >= 50
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-red-100 text-red-700 border-red-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-bold border rounded-md ${color}`}>
      {value}
    </span>
  );
}

function fmt(n: number, currency: string) {
  const decimals = n > 0 && n < 1 ? 4 : n < 10 ? 2 : 0;
  return new Intl.NumberFormat("en-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: decimals,
  }).format(n);
}

const containerVariants = {
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
};

const rowVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98, filter: "blur(4px)" },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { type: "spring" as const, stiffness: 400, damping: 25, mass: 0.7 },
  },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

export function SupplierTable({
  suppliers,
  currency = "EUR",
  className = "",
  onSelectSupplier,
  onOpenDetail,
}: SupplierTableProps) {
  const top10 = suppliers.slice(0, 10);

  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<ScoredSupplier | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = !shouldReduceMotion;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder(
        field === "rank" || field === "unit_price" || field === "lead_time" ? "asc" : "desc"
      );
    }
    setShowSortMenu(false);
  };

  const sortedSuppliers = useMemo(() => {
    if (!sortField) return top10;
    return [...top10].sort((a, b) => {
      let aVal = 0, bVal = 0;
      if (sortField === "rank")           { aVal = a.rank;                       bVal = b.rank; }
      else if (sortField === "composite_score") { aVal = a.composite_score;        bVal = b.composite_score; }
      else if (sortField === "unit_price") { aVal = a.unit_price;                 bVal = b.unit_price; }
      else if (sortField === "quality")   { aVal = a.raw_scores.quality;          bVal = b.raw_scores.quality; }
      else if (sortField === "trust")     { aVal = 100 - a.raw_scores.risk;       bVal = 100 - b.raw_scores.risk; }
      else if (sortField === "esg")       { aVal = a.raw_scores.esg;              bVal = b.raw_scores.esg; }
      else if (sortField === "lead_time") { aVal = a.standard_lead_time_days;     bVal = b.standard_lead_time_days; }
      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [top10, sortField, sortOrder]);

  const exportToCSV = () => {
    const headers = ["Rank", "Supplier", "ID", "Score", "Unit Price", "Total", "Quality", "Trust", "ESG", "Lead Time (d)"];
    const rows = top10.map((s) => [
      s.rank, s.supplier_name, s.supplier_id,
      Math.round(s.composite_score * 100),
      fmt(s.unit_price, currency), fmt(s.total_price, currency),
      s.raw_scores.quality, 100 - s.raw_scores.risk, s.raw_scores.esg,
      s.standard_lead_time_days,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `suppliers-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const sortOptions: { field: SortField; label: string }[] = [
    { field: "rank",            label: "Overall Rank"  },
    { field: "composite_score", label: "Score"         },
    { field: "unit_price",      label: "Unit Price"    },
    { field: "quality",         label: "Quality"       },
    { field: "trust",           label: "Trust"         },
    { field: "esg",             label: "ESG"           },
    { field: "lead_time",       label: "Lead Time"     },
  ];

  return (
    <div className={`w-full ${className}`}>
      {/* Toolbar */}
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-bold text-gray-800 uppercase tracking-wider">
          Overall top {top10.length}
          <span className="text-xs font-normal text-gray-400 normal-case ml-1">— all features combined</span>
        </span>
        <div className="flex items-center gap-2">
          {/* Sort */}
          <div className="relative">
            <button
              onClick={() => { setShowSortMenu(!showSortMenu); setShowExportMenu(false); }}
              className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-sm hover:bg-gray-50 transition-colors flex items-center gap-1.5 rounded-md"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M3 6L6 3L9 6M6 3V13M13 10L10 13L7 10M10 13V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Sort
              {sortField && (
                <span className="ml-0.5 text-[10px] bg-blue-600 text-white rounded-sm px-1">1</span>
              )}
              <ChevronDown size={12} className="opacity-50" />
            </button>
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
                <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 shadow-lg rounded-md z-20 py-1">
                  {sortOptions.map((opt) => (
                    <button
                      key={opt.field}
                      onClick={() => handleSort(opt.field)}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors ${
                        sortField === opt.field ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"
                      }`}
                    >
                      {opt.label}{" "}
                      {sortField === opt.field && (sortOrder === "asc" ? "↑" : "↓")}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Export */}
          <div className="relative">
            <button
              onClick={() => { setShowExportMenu(!showExportMenu); setShowSortMenu(false); }}
              className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-sm hover:bg-gray-50 transition-colors flex items-center gap-1.5 rounded-md"
            >
              <Download size={14} />
              Export
              <ChevronDown size={12} className="opacity-50" />
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 mt-1 w-28 bg-white border border-gray-200 shadow-lg rounded-md z-20">
                  <button
                    onClick={() => { exportToCSV(); setShowExportMenu(false); }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors text-gray-700"
                  >
                    CSV
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 overflow-hidden rounded-lg relative">
        <div className="overflow-x-auto">
          <div className="min-w-[880px]">
            {/* Header */}
            <div
              className="px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-200"
              style={{
                display: "grid",
                gridTemplateColumns: "48px 1fr 72px 110px 64px 64px 64px 88px 40px",
              }}
            >
              <div className="border-r border-gray-200 pr-2 flex items-center justify-center">#</div>
              <div className="border-r border-gray-200 px-3 flex items-center gap-1">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="opacity-40">
                  <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <path d="M3 14C3 11.5 5 10 8 10C11 10 13 11.5 13 14" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
                Supplier
              </div>
              <div className="border-r border-gray-200 px-2 flex items-center">Score</div>
              <div className="border-r border-gray-200 px-3 flex items-center">Unit Price</div>
              <div className="border-r border-gray-200 px-2 flex items-center">Qual.</div>
              <div className="border-r border-gray-200 px-2 flex items-center">Trust</div>
              <div className="border-r border-gray-200 px-2 flex items-center">ESG</div>
              <div className="border-r border-gray-200 px-3 flex items-center">Lead Time</div>
              <div className="flex items-center justify-center px-2">···</div>
            </div>

            {/* Rows */}
            <AnimatePresence mode="wait">
              <motion.div
                key={sortField ?? "default"}
                variants={shouldAnimate ? containerVariants : {}}
                initial={shouldAnimate ? "hidden" : "visible"}
                animate="visible"
              >
                {sortedSuppliers.map((supplier) => {
                  const pct = Math.round(supplier.composite_score * 100);
                  const trust = 100 - supplier.raw_scores.risk;
                  const isTop = supplier.rank === 1;

                  return (
                    <motion.div key={supplier.supplier_id} variants={shouldAnimate ? rowVariants : {}}>
                      <div
                        className={`px-3 py-3 group transition-all border-b border-gray-100 last:border-0 ${
                          isTop ? "bg-blue-50/40" : "bg-white hover:bg-gray-50/60"
                        }`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "48px 1fr 72px 110px 64px 64px 64px 88px 40px",
                          alignItems: "center",
                        }}
                      >
                        {/* Rank badge */}
                        <div className="border-r border-gray-100 pr-2 flex items-center justify-center">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${
                              supplier.rank === 1 ? "bg-amber-400 text-white shadow-amber-200"
                              : supplier.rank === 2 ? "bg-gray-300 text-gray-700"
                              : supplier.rank === 3 ? "bg-orange-300 text-white shadow-orange-200"
                              : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {supplier.rank}
                          </div>
                        </div>

                        {/* Supplier name + badges */}
                        <div className="border-r border-gray-100 px-3 min-w-0">
                          <span className="text-sm font-semibold text-gray-900 truncate block">
                            {supplier.supplier_name}
                          </span>
                          <div className="flex gap-1 mt-0.5 flex-wrap items-center">
                            <span className="text-[9px] font-mono text-gray-400">{supplier.supplier_id}</span>
                            {supplier.is_preferred && (
                              <span className="text-[9px] bg-blue-100 text-blue-700 px-1 rounded-full font-medium">Preferred</span>
                            )}
                            {supplier.is_incumbent && (
                              <span className="text-[9px] bg-green-100 text-green-700 px-1 rounded-full font-medium">Incumbent</span>
                            )}
                            {!supplier.meets_lead_time && (
                              <span className="text-[9px] bg-red-100 text-red-700 px-1 rounded-full font-medium">⏰ Risk</span>
                            )}
                          </div>
                        </div>

                        {/* Composite score */}
                        <div className="border-r border-gray-100 px-2 flex items-center">
                          <ScoreChip value={pct} />
                        </div>

                        {/* Unit price */}
                        <div className="border-r border-gray-100 px-3">
                          <span className="text-sm font-semibold text-gray-800">
                            {fmt(supplier.unit_price, currency)}
                          </span>
                        </div>

                        {/* Quality */}
                        <div className="border-r border-gray-100 px-2 flex items-center">
                          <ScoreChip value={supplier.raw_scores.quality} />
                        </div>

                        {/* Trust */}
                        <div className="border-r border-gray-100 px-2 flex items-center">
                          <ScoreChip value={trust} />
                        </div>

                        {/* ESG */}
                        <div className="border-r border-gray-100 px-2 flex items-center">
                          <ScoreChip value={supplier.raw_scores.esg} />
                        </div>

                        {/* Lead time */}
                        <div className="border-r border-gray-100 px-3">
                          <span className="text-sm font-medium text-gray-800">
                            {supplier.standard_lead_time_days}d
                          </span>
                          {supplier.expedited_lead_time_days && (
                            <span className="text-[10px] text-gray-400 ml-1">
                              /{supplier.expedited_lead_time_days}d
                            </span>
                          )}
                        </div>

                        {/* Detail button */}
                        <div className="px-2 flex items-center justify-center">
                          <button
                            onClick={() => {
                              if (onOpenDetail) {
                                onOpenDetail(supplier);
                                return;
                              }
                              setSelectedDetail(supplier);
                            }}
                            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-gray-500 cursor-pointer"
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                              <circle cx="8" cy="3" r="1.5" fill="currentColor"/>
                              <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
                              <circle cx="8" cy="13" r="1.5" fill="currentColor"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Detail popup modal (fallback when external detail modal is not provided) */}
        <AnimatePresence>
          {!onOpenDetail && selectedDetail && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center z-10"
              onClick={() => setSelectedDetail(null)}
            >
              <motion.div
                initial={{ scale: 0.85, opacity: 0, y: 16 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.85, opacity: 0, y: 16 }}
                transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.8 }}
                className="bg-white border border-gray-200 rounded-xl p-5 mx-4 shadow-xl relative max-w-md w-full max-h-[80vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setSelectedDetail(null)}
                  className="absolute top-3 right-3 w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                >
                  <X size={12} className="text-gray-500" />
                </button>

                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-start gap-3 pr-6">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-gray-900">{selectedDetail.supplier_name}</h3>
                      <p className="text-xs font-mono text-gray-400 mt-0.5">{selectedDetail.supplier_id}</p>
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {selectedDetail.is_preferred && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">⭐ Preferred</span>
                        )}
                        {selectedDetail.is_incumbent && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">✓ Incumbent</span>
                        )}
                        {!selectedDetail.meets_lead_time && (
                          <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">⏰ Lead time risk</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span
                        className={`text-3xl font-black leading-none ${
                          Math.round(selectedDetail.composite_score * 100) >= 75 ? "text-green-600"
                          : Math.round(selectedDetail.composite_score * 100) >= 50 ? "text-amber-600"
                          : "text-red-600"
                        }`}
                      >
                        {Math.round(selectedDetail.composite_score * 100)}
                      </span>
                      <p className="text-xs text-gray-400">/ 100</p>
                    </div>
                  </div>

                  {/* Score bars */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Score Breakdown</p>
                    <div className="space-y-2">
                      {[
                        { label: "Price",     value: Math.round(selectedDetail.score_breakdown.price_score * 100),     color: "bg-emerald-500" },
                        { label: "Quality",   value: selectedDetail.raw_scores.quality,                                color: "bg-blue-500"    },
                        { label: "Trust",     value: 100 - selectedDetail.raw_scores.risk,                             color: "bg-amber-500"   },
                        { label: "ESG",       value: selectedDetail.raw_scores.esg,                                    color: "bg-green-500"   },
                        { label: "Lead Time", value: Math.round(selectedDetail.score_breakdown.lead_time_score * 100), color: "bg-purple-500"  },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-16 shrink-0">{item.label}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${item.color}`}
                              style={{ width: `${Math.min(100, Math.max(0, item.value))}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-gray-700 w-8 text-right">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pricing */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Pricing</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Unit",      val: fmt(selectedDetail.unit_price, currency)   },
                        { label: "Total",     val: fmt(selectedDetail.total_price, currency)  },
                        { label: "Lead Time", val: `${selectedDetail.standard_lead_time_days}d` },
                      ].map((item) => (
                        <div key={item.label} className="bg-gray-50 rounded-lg px-3 py-2">
                          <p className="text-[10px] text-gray-400">{item.label}</p>
                          <p className="text-sm font-bold text-gray-900">{item.val}</p>
                        </div>
                      ))}
                    </div>
                    {selectedDetail.expedited_unit_price && (
                      <div className="mt-2 bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-700">
                        <span className="font-semibold">⚡ Expedited: </span>
                        {fmt(selectedDetail.expedited_unit_price, currency)}/unit ·{" "}
                        <strong>{fmt(selectedDetail.expedited_total_price ?? 0, currency)}</strong> total ·{" "}
                        {selectedDetail.expedited_lead_time_days}d · ≈+8%
                      </div>
                    )}
                  </div>

                  {/* Rationale */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Rationale</p>
                    <div className="border-l-4 border-blue-400 pl-3 py-0.5">
                      <p className="text-xs text-gray-700 leading-relaxed">{selectedDetail.recommendation_note}</p>
                    </div>
                  </div>

                  {/* Compliance checks */}
                  {selectedDetail.compliance_checks.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Compliance</p>
                      <div className="space-y-1.5">
                        {selectedDetail.compliance_checks.map((c, idx) => {
                          const icon = c.result === "pass" ? "✓" : c.result === "fail" ? "✗" : c.result === "warning" ? "⚠" : "–";
                          const cls =
                            c.result === "pass"    ? "bg-green-50 text-green-700"
                            : c.result === "fail"    ? "bg-red-50 text-red-700"
                            : c.result === "warning" ? "bg-amber-50 text-amber-700"
                            : "bg-gray-50 text-gray-500";
                          return (
                            <div key={idx} className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg ${cls}`}>
                              <span className="text-xs font-bold shrink-0 mt-px">{icon}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold leading-snug">{c.rule_description}</p>
                                {c.detail && (
                                  <p className="text-[10px] opacity-70 mt-0.5 leading-snug">{c.detail}</p>
                                )}
                              </div>
                              <span className="text-[9px] font-mono opacity-40 shrink-0">{c.rule_id}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Select button */}
                  {onSelectSupplier && (
                    <button
                      onClick={() => {
                        onSelectSupplier(selectedDetail);
                        setSelectedDetail(null);
                      }}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors mt-1"
                    >
                      ✓ Select this Supplier
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
