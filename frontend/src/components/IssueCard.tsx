interface Props {
  title: string;
  explanation: string;
  proposedFix: string;
  severity: string;
  fixField: string | null;
  fixValue: string | null;
}

const SEVERITY_STYLES: Record<string, { bg: string; text: string; badge: string }> = {
  critical: { bg: "bg-red-50", text: "text-red-800", badge: "bg-red-100 text-red-700" },
  high: { bg: "bg-orange-50", text: "text-orange-800", badge: "bg-orange-100 text-orange-700" },
  medium: { bg: "bg-yellow-50", text: "text-yellow-800", badge: "bg-yellow-100 text-yellow-700" },
  low: { bg: "bg-blue-50", text: "text-blue-800", badge: "bg-blue-100 text-blue-700" },
  info: { bg: "bg-gray-50", text: "text-gray-700", badge: "bg-gray-100 text-gray-600" },
};

export default function IssueCard({
  title,
  explanation,
  proposedFix,
  severity,
  fixField,
  fixValue,
}: Props) {
  const style = SEVERITY_STYLES[severity] || SEVERITY_STYLES.medium;

  return (
    <div className={`rounded-lg border p-4 ${style.bg}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${style.badge}`}
            >
              {severity.toUpperCase()}
            </span>
            <h4 className={`font-medium text-sm ${style.text}`}>{title}</h4>
          </div>
          <p className="text-sm text-gray-700 mt-1">{explanation}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-gray-500">Suggested fix:</span>
            <span className="text-sm font-medium text-gray-800">
              {proposedFix}
            </span>
          </div>
          {fixField && fixValue && (
            <div className="mt-2">
              <code className="text-xs bg-white/50 px-2 py-1 rounded border border-gray-200">
                {fixField} &rarr; {fixValue}
              </code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
