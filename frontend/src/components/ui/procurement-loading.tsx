import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageLoading } from "./message-loading";

type LoadingPhase = "validating" | "ranking" | "ordering";

interface ProcurementLoadingProps {
  phase: LoadingPhase;
}

const SENTENCES: Record<LoadingPhase, string[]> = {
  validating: [
    "Parsing your procurement request…",
    "Detecting language and intent…",
    "Validating quantities and specifications…",
    "Cross-referencing category taxonomy…",
    "Checking completeness of required fields…",
    "Applying internal consistency rules…",
    "Extracting delivery constraints…",
  ],
  ranking: [
    "Scanning 40+ suppliers in the database…",
    "Applying governance and policy rules…",
    "Calculating price competitiveness scores…",
    "Evaluating quality and reliability…",
    "Checking ESG compliance ratings…",
    "Verifying delivery feasibility…",
    "Running approval threshold checks…",
    "Filtering by geographic coverage…",
    "Computing composite supplier scores…",
    "Building your ranked shortlist…",
  ],
  ordering: [
    "Confirming supplier selection…",
    "Preparing your purchase order…",
    "Checking approval requirements…",
    "Generating order confirmation…",
    "Logging to audit trail…",
  ],
};

const PHASE_META: Record<LoadingPhase, { icon: string; title: string; color: string; bg: string; ring: string }> = {
  validating: {
    icon: "🔍",
    title: "Analyzing Request",
    color: "text-blue-600",
    bg: "bg-blue-50",
    ring: "ring-blue-200",
  },
  ranking: {
    icon: "📊",
    title: "Ranking Suppliers",
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    ring: "ring-indigo-200",
  },
  ordering: {
    icon: "📋",
    title: "Placing Order",
    color: "text-green-600",
    bg: "bg-green-50",
    ring: "ring-green-200",
  },
};

export function ProcurementLoading({ phase }: ProcurementLoadingProps) {
  const sentences = SENTENCES[phase];
  const meta = PHASE_META[phase];

  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % sentences.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [phase, sentences.length]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center gap-8 py-20 px-6 text-center"
    >
      {/* Animated icon */}
      <motion.div
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
        className={`w-20 h-20 rounded-2xl ${meta.bg} ring-4 ${meta.ring} flex items-center justify-center shadow-sm`}
      >
        <span className="text-4xl leading-none">{meta.icon}</span>
      </motion.div>

      {/* Phase title */}
      <div className="space-y-2">
        <h2 className={`text-xl font-bold ${meta.color}`}>{meta.title}</h2>

        {/* Rotating sentence */}
        <div className="h-6 relative overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35 }}
              className="text-sm text-gray-500 absolute inset-x-0 text-center"
            >
              {sentences[index]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      {/* Bouncing dots */}
      <div className={meta.color}>
        <MessageLoading />
      </div>

      {/* Progress dots indicator */}
      <div className="flex gap-1.5">
        {sentences.map((_, i) => (
          <motion.div
            key={i}
            animate={{ opacity: i === index ? 1 : 0.25, scale: i === index ? 1.3 : 1 }}
            transition={{ duration: 0.3 }}
            className={`w-1.5 h-1.5 rounded-full ${
              i === index ? meta.color.replace("text-", "bg-") : "bg-gray-300"
            }`}
          />
        ))}
      </div>
    </motion.div>
  );
}
