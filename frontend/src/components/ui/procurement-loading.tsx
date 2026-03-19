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

const PHASE_TITLES: Record<LoadingPhase, string> = {
  validating: "Analyzing Request",
  ranking: "Ranking Suppliers",
  ordering: "Placing Order",
};

export function ProcurementLoading({ phase }: ProcurementLoadingProps) {
  const sentences = SENTENCES[phase];
  const title = PHASE_TITLES[phase];

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
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-red-200">{title}</h2>

        {/* Rotating sentence */}
        <div className="h-6 relative overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35 }}
              className="text-sm text-white/60 absolute inset-x-0 text-center"
            >
              {sentences[index]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Loading icon directly under the changing sentence */}
        <div className="flex items-center justify-center mt-2 text-red-200">
          <MessageLoading />
        </div>
      </div>
    </motion.div>
  );
}
