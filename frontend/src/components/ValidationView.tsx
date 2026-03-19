import { t } from "../i18n";
import type { ValidationResult } from "../types";
import IssueCard from "./IssueCard";
import { ShimmerButton } from "./ui/shimmer-button";

interface Props {
  result: ValidationResult;
  onBack: () => void;
  lang: string;
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export default function ValidationView({ result, onBack, lang }: Props) {
  const i = t(lang);
  const { is_valid, issues, user_message, corrected_request, enriched_request } =
    result;

  const sortedIssues = [...issues].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5)
  );

  const blockingCount = issues.filter(
    (i) => i.severity === "critical" || i.severity === "high"
  ).length;

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
      >
        &larr; {i.backToForm}
      </button>

      {/* Status banner */}
      <div
        className={`rounded-lg p-4 border ${
          is_valid
            ? "bg-green-50 border-green-200"
            : "bg-red-50 border-red-200"
        }`}
      >
        <h2
          className={`text-lg font-semibold ${
            is_valid ? "text-green-800" : "text-red-800"
          }`}
        >
          {is_valid ? i.requestValidated : i.issuesToResolve(blockingCount)}
        </h2>
        {user_message?.summary && (
          <p
            className={`mt-1 text-sm ${
              is_valid ? "text-green-700" : "text-red-700"
            }`}
          >
            {user_message.summary}
          </p>
        )}
      </div>

      {/* LLM-generated issues */}
      {user_message && user_message.issues.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            {i.detailsAndFixes}
          </h3>
          {user_message.issues.map((issue, idx) => {
            const matchingIssue = sortedIssues[idx];
            return (
              <IssueCard
                key={idx}
                title={issue.title}
                explanation={issue.explanation}
                proposedFix={issue.proposed_fix}
                severity={matchingIssue?.severity || "medium"}
                fixField={issue.fix_field}
                fixValue={issue.fix_value}
                lang={lang}
              />
            );
          })}
        </div>
      )}

      {/* Fallback: raw issues if no LLM message */}
      {(!user_message || user_message.issues.length === 0) &&
        sortedIssues.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              {i.validationIssues}
            </h3>
            {sortedIssues.map((issue) => (
              <IssueCard
                key={issue.issue_id}
                title={`${issue.issue_id}: ${issue.type}`}
                explanation={issue.description}
                proposedFix={issue.proposed_fix}
                severity={issue.severity}
                fixField={issue.fix_action?.field ?? null}
                fixValue={issue.fix_action?.suggested_value ?? null}
                lang={lang}
              />
            ))}
          </div>
        )}

      {/* Enriched request preview — JSON always in English */}
      <div className="border border-gray-200 rounded-lg">
        <button
          className="w-full px-4 py-3 text-left text-sm font-medium text-gray-700 bg-gray-50 rounded-t-lg hover:bg-gray-100"
          onClick={(e) => {
            const target = e.currentTarget.nextElementSibling;
            if (target) target.classList.toggle("hidden");
          }}
        >
          {i.enrichedJson}
        </button>
        <pre className="hidden px-4 py-3 text-xs text-gray-600 overflow-auto max-h-96 bg-white rounded-b-lg">
          {JSON.stringify(enriched_request, null, 2)}
        </pre>
      </div>

      {/* Corrected request — JSON always in English */}
      {corrected_request && (
        <div className="border border-gray-200 rounded-lg">
          <button
            className="w-full px-4 py-3 text-left text-sm font-medium text-gray-700 bg-gray-50 rounded-t-lg hover:bg-gray-100"
            onClick={(e) => {
              const target = e.currentTarget.nextElementSibling;
              if (target) target.classList.toggle("hidden");
            }}
          >
            {i.correctedJson}
          </button>
          <pre className="hidden px-4 py-3 text-xs text-gray-600 overflow-auto max-h-96 bg-white rounded-b-lg">
            {JSON.stringify(corrected_request, null, 2)}
          </pre>
        </div>
      )}

      {/* Confirm button */}
      {is_valid && (
        <ShimmerButton
          background="rgb(185 28 28)"
          className="w-full rounded-lg px-4 py-3 font-medium"
        >
          {i.confirmRequest}
        </ShimmerButton>
      )}

      {!is_valid && user_message?.all_ok_message && (
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-3">
            {user_message.all_ok_message}
          </p>
          <ShimmerButton
            background="rgb(185 28 28)"
            className="rounded-lg px-6 py-3 font-medium"
          >
            {i.acceptAllFixes}
          </ShimmerButton>
        </div>
      )}
    </div>
  );
}
