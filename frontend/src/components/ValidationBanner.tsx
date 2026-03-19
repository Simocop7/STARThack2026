import { t } from "../i18n";
import type { ValidationResult } from "../types";
import IssueCard from "./IssueCard";

interface Props {
  result: ValidationResult;
  lang: string;
}

export default function ValidationBanner({ result, lang }: Props) {
  const i = t(lang);
  const { issues, user_message } = result;

  const blockingIssues = issues.filter(
    (issue) => issue.severity === "critical" || issue.severity === "high"
  );

  const blockingCount = blockingIssues.length;

  // Match LLM-generated user message issues to blocking issues only
  const blockingUserIssues = (user_message?.issues ?? []).filter((_item, idx) => {
    const matchedIssue = issues[idx];
    return (
      matchedIssue &&
      (matchedIssue.severity === "critical" || matchedIssue.severity === "high")
    );
  });

  return (
    <div className="mb-6 space-y-4">
      {/* Red banner */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-red-800">
          {i.issuesToResolve(blockingCount)}
        </h2>
        {user_message?.summary && (
          <p className="mt-1 text-sm text-red-700">
            {user_message.summary}
          </p>
        )}
      </div>

      {/* Blocking issues only */}
      {blockingUserIssues.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            {i.detailsAndFixes}
          </h3>
          {blockingUserIssues.map((issue, idx) => (
            <IssueCard
              key={idx}
              title={issue.title}
              explanation={issue.explanation}
              proposedFix={issue.proposed_fix}
              severity={blockingIssues[idx]?.severity || "high"}
              fixField={issue.fix_field}
              fixValue={issue.fix_value}
              lang={lang}
            />
          ))}
        </div>
      )}

      {/* Fallback: raw blocking issues if no LLM message */}
      {blockingUserIssues.length === 0 && blockingIssues.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            {i.detailsAndFixes}
          </h3>
          {blockingIssues.map((issue) => (
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
    </div>
  );
}
