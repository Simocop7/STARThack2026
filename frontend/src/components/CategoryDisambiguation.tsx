import { t } from "../i18n";
import type { CategorySuggestion } from "../types";

interface Props {
  suggestion: CategorySuggestion;
  lang: string;
  onConfirm: (categoryL1: string, categoryL2: string) => void;
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.85) return "text-green-700 bg-green-100";
  if (confidence >= 0.7) return "text-yellow-700 bg-yellow-100";
  return "text-red-700 bg-red-100";
}

export default function CategoryDisambiguation({ suggestion, lang, onConfirm }: Props) {
  const i = t(lang);

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg p-5 mb-6">
      <h3 className="text-lg font-semibold text-amber-900 mb-3">
        {i.categoryDetected}
      </h3>

      {/* Primary suggestion */}
      <div className="bg-white border border-amber-200 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium text-gray-900">
            {suggestion.category_l1} &gt; {suggestion.category_l2}
          </span>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${confidenceColor(suggestion.confidence)}`}>
            {i.categoryConfidence}: {Math.round(suggestion.confidence * 100)}%
          </span>
        </div>
        {suggestion.reasoning && (
          <p className="text-sm text-gray-600 mb-3">
            {i.categoryReason}: {suggestion.reasoning}
          </p>
        )}
        <button
          type="button"
          onClick={() => onConfirm(suggestion.category_l1, suggestion.category_l2)}
          className="bg-amber-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-amber-700 transition-colors"
        >
          {i.categoryConfirm}
        </button>
      </div>

      {/* Alternatives */}
      {suggestion.alternatives.length > 0 && (
        <div>
          <p className="text-sm font-medium text-amber-800 mb-2">
            {i.categoryAlternatives}
          </p>
          <div className="space-y-2">
            {suggestion.alternatives.map((alt, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3"
              >
                <div>
                  <span className="font-medium text-gray-800">
                    {alt.category_l1} &gt; {alt.category_l2}
                  </span>
                  <p className="text-xs text-gray-500 mt-0.5">{alt.reason}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onConfirm(alt.category_l1, alt.category_l2)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap ml-4"
                >
                  {i.categorySelect}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
