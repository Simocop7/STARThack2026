import { motion } from "framer-motion";

// ── Scoring parameters ──────────────────────────────────────────────
const PARAMS = [
  {
    key: "price",
    label: "Price",
    icon: "💰",
    weight: 0.40,
    color: "#10b981",
    textColor: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    barBg: "bg-emerald-500",
    desc: "Reciprocal proportion: the cheapest supplier scores 100. All others score (min_price ÷ their_price) × 100 — naturally penalising expensive options without collapsing the scale.",
  },
  {
    key: "quality",
    label: "Quality",
    icon: "⭐",
    weight: 0.20,
    color: "#3b82f6",
    textColor: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-100",
    barBg: "bg-blue-500",
    desc: "Raw value (0–100) from the supplier master file, reflecting third-party quality audits, delivery reliability, and defect rates. Used as-is for stable cross-shortlist comparisons.",
  },
  {
    key: "trust",
    label: "Trust",
    icon: "🤝",
    weight: 0.20,
    color: "#f59e0b",
    textColor: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-100",
    barBg: "bg-amber-500",
    desc: "Inverted risk score: Trust = 100 − risk_score. A risk of 20 becomes a trust of 80, keeping all dimensions on the same \"higher is better\" scale.",
  },
  {
    key: "esg",
    label: "ESG",
    icon: "🌱",
    weight: 0.10,
    color: "#22c55e",
    textColor: "text-green-600",
    bg: "bg-green-50",
    border: "border-green-100",
    barBg: "bg-green-500",
    desc: "Environmental, Social & Governance assessment (0–100). Covers carbon footprint, labour practices, and governance transparency. Higher is always better.",
  },
  {
    key: "lead_time",
    label: "Lead Time",
    icon: "⚡",
    weight: 0.10,
    color: "#a855f7",
    textColor: "text-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-100",
    barBg: "bg-purple-500",
    desc: "Binary feasibility: 100 if standard lead time meets the deadline; 50 if only expedited delivery can (~+8% price premium); 0 if neither option is feasible.",
  },
];

// ── Policy sections ─────────────────────────────────────────────────
const POLICIES = [
  {
    id: "AT",
    label: "Approval Thresholds",
    desc: "5-tier value thresholds per currency (EUR / CHF / USD). Determines how many quotes are required and who must sign off.",
  },
  {
    id: "PS",
    label: "Preferred Suppliers",
    desc: "Named suppliers verified for category match, geographic coverage, and active restrictions before any preference is honoured.",
  },
  {
    id: "RS",
    label: "Restricted Suppliers",
    desc: "Hard exclusions per category, country, and value band — for example SUP-0008 for Laptops in CH/DE. Always overrides stated preferences.",
  },
  {
    id: "CR",
    label: "Category Rules",
    desc: "CR-001–CR-010: mandatory multi-supplier comparisons, engineering or design reviews, fast-track allowances, and certification checks by category.",
  },
  {
    id: "GR",
    label: "Geography Rules",
    desc: "GR-001–GR-008: data residency (CH, US, APAC), language support (FR), deployment evidence (ES), and regional regulatory compliance.",
  },
  {
    id: "ER",
    label: "Escalation Rules",
    desc: "ER-001–ER-008: defines the trigger, blocking status, and named escalation target (Requester, Procurement Manager, CPO, etc.).",
  },
];

// ── Half-circle gauge ───────────────────────────────────────────────
function HalfCircleGauge({ weight, color }: { weight: number; color: string }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const half = circ / 2;
  const offset = weight * -half;

  return (
    <svg viewBox="0 0 100 50" className="block w-full max-w-[130px] mx-auto">
      <g fill="none" strokeWidth="9" transform="translate(50, 50.5)">
        <circle stroke="#e5e7eb" r={r} strokeDasharray={`${half} ${half}`} />
        <motion.circle
          stroke={color}
          r={r}
          strokeDasharray={`${half} ${half}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1], delay: 0.2 }}
        />
      </g>
    </svg>
  );
}

// ── Scoring card ────────────────────────────────────────────────────
function ScoreCard({ param, index }: { param: typeof PARAMS[0]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.1 }}
      className={`${param.bg} border ${param.border} rounded-2xl p-5 flex flex-col items-center text-center`}
    >
      <HalfCircleGauge weight={param.weight} color={param.color} />
      <div className="mt-3">
        <span className="text-2xl font-black text-gray-900">
          {(param.weight * 100).toFixed(0)}
          <span className="text-base font-semibold text-gray-400">%</span>
        </span>
      </div>
      <div className={`flex items-center gap-1.5 mt-1 font-bold text-sm ${param.textColor}`}>
        <span>{param.icon}</span>
        <span>{param.label}</span>
      </div>
      <p className="text-xs text-gray-500 mt-2 leading-relaxed">{param.desc}</p>
    </motion.div>
  );
}

// ── Main InfoView ───────────────────────────────────────────────────
export default function InfoView() {
  return (
    <div className="bg-white min-h-full">
    <div className="w-full py-10 px-10 space-y-12">

      {/* ── Section 1: Scoring Methodology ── */}
      <div>
        <div className="mb-1">
          <h2 className="app-title-secondary">Scoring Methodology</h2>
          <p className="text-sm text-gray-500 mt-0.5">How suppliers are ranked — all dimensions normalised to 0–100 before weighting</p>
        </div>

        {/* Composite formula */}
        <div className="mt-5 bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 font-mono text-sm text-slate-800 leading-loose flex flex-wrap gap-x-1 gap-y-0.5 items-baseline">
          <span className="text-slate-500">Score =</span>
          {PARAMS.map((p, i) => (
            <span key={p.key} className="flex items-baseline gap-0.5">
              <span className={`font-black ${p.textColor}`}>{(p.weight * 100).toFixed(0)}%</span>
              <span className="text-slate-400">×</span>
              <span className="text-slate-700">{p.label}</span>
              {i < PARAMS.length - 1 && <span className="text-slate-300 mx-1">+</span>}
            </span>
          ))}
          <span className="text-slate-400 mx-1">=</span>
          <span className="font-black text-slate-900">0 – 100</span>
        </div>

        {/* Weight distribution bar */}
        <div className="mt-4">
          <div className="flex h-3 rounded-full overflow-hidden w-full">
            {PARAMS.map((p) => (
              <motion.div
                key={p.key}
                initial={{ width: 0 }}
                animate={{ width: `${p.weight * 100}%` }}
                transition={{ duration: 0.9, ease: "easeOut" }}
                className={`h-full ${p.barBg} flex items-center justify-center text-[8px] font-bold text-white`}
                title={`${p.label}: ${(p.weight * 100).toFixed(0)}%`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {PARAMS.map((p) => (
              <span key={p.key} className={`text-[11px] font-semibold flex items-center gap-1 ${p.textColor}`}>
                <span className={`inline-block w-2 h-2 rounded-full ${p.barBg}`} />
                {p.label} {(p.weight * 100).toFixed(0)}%
              </span>
            ))}
          </div>
        </div>

        {/* Parameter cards grid */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {PARAMS.map((p, i) => (
            <ScoreCard key={p.key} param={p} index={i} />
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100" />

      {/* ── Section 2: Audit Trail — Policy Checks ── */}
      <div>
        <div className="mb-1">
          <h2 className="app-title-secondary">Audit Trail — Policy Checks</h2>
          <p className="text-sm text-gray-500 mt-0.5">Every request is evaluated against all six policy sections before a recommendation is issued</p>
        </div>

        {/* Horizontal timeline */}
        <div className="mt-8 relative">
          {/* Connecting line */}
          <div className="absolute top-5 left-0 right-0 h-px bg-gray-200 z-0" />

          <div className="relative z-10 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-x-4 gap-y-8">
            {POLICIES.map((policy, i) => (
              <motion.div
                key={policy.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="flex flex-col items-center text-center"
              >
                {/* Dot */}
                <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center shadow-sm shadow-red-200 mb-3">
                  <span className="text-[10px] font-black text-white">{policy.id}</span>
                </div>

                {/* Label + desc */}
                <p className="text-xs font-bold text-gray-800 leading-tight mb-1">{policy.label}</p>
                <p className="text-[11px] text-gray-500 leading-relaxed">{policy.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

    </div>
    </div>
  );
}
