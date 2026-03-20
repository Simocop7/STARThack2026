import { AppLoader } from "./app-loader";

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
  ranking:    "Ranking Suppliers",
  ordering:   "Placing Order",
};

export function ProcurementLoading({ phase }: ProcurementLoadingProps) {
  return (
    <AppLoader
      title={PHASE_TITLES[phase]}
      sentences={SENTENCES[phase]}
    />
  );
}
