import { t } from "../i18n";
import type { EnrichedRequest, ValidationIssue } from "../types";

interface Props {
  enrichedRequest: EnrichedRequest;
  warnings: ValidationIssue[];
  language: string;
  /** Fields that the user left empty and the LLM auto-filled */
  autoDetectedFields: string[];
  onConfirm: () => void;
  onEdit: () => void;
}

function Badge({ label }: { label: string }) {
  return (
    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
      {label}
    </span>
  );
}

function Row({
  label,
  value,
  isAutoDetected,
  autoLabel,
}: {
  label: string;
  value: string | number | null | undefined;
  isAutoDetected?: boolean;
  autoLabel: string;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-100 last:border-b-0">
      <span className="text-sm text-gray-500 w-1/3">
        {label}
        {isAutoDetected && <Badge label={autoLabel} />}
      </span>
      <span className="text-sm font-medium text-gray-900 w-2/3 text-right">
        {String(value)}
      </span>
    </div>
  );
}

export default function EmployeeReviewStep({
  enrichedRequest,
  warnings,
  language,
  autoDetectedFields,
  onConfirm,
  onEdit,
}: Props) {
  const i = t(language);
  const e = enrichedRequest;

  const isAuto = (field: string) => autoDetectedFields.includes(field);

  const categoryDisplay =
    e.category_l1 && e.category_l2
      ? `${e.category_l1} > ${e.category_l2}`
      : e.category_l1 || "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mb-4">
          <svg
            className="w-7 h-7 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">{i.reviewTitle}</h2>
        <p className="mt-1 text-sm text-gray-500">{i.reviewSubtitle}</p>
      </div>

      {/* Data card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <Row
          label={i.reviewItemDescription}
          value={(e as Record<string, unknown>).item_description as string}
          isAutoDetected
          autoLabel={i.reviewAutoDetected}
        />
        <Row
          label={i.reviewCategory}
          value={categoryDisplay}
          isAutoDetected={isAuto("category_l1")}
          autoLabel={i.reviewAutoDetected}
        />
        <Row
          label={i.reviewQuantity}
          value={e.quantity}
          autoLabel={i.reviewAutoDetected}
        />
        <Row
          label={i.reviewDelivery}
          value={e.delivery_address}
          autoLabel={i.reviewAutoDetected}
        />
        <Row
          label={i.reviewDeliveryCountry}
          value={e.delivery_country}
          isAutoDetected={isAuto("delivery_country")}
          autoLabel={i.reviewAutoDetected}
        />
        <Row
          label={i.reviewRequiredBy}
          value={e.required_by_date}
          autoLabel={i.reviewAutoDetected}
        />
        <Row
          label={i.reviewPreferredSupplier}
          value={e.preferred_supplier_name || e.preferred_supplier}
          autoLabel={i.reviewAutoDetected}
        />
        <Row
          label={i.reviewUrgency}
          value={(e as Record<string, unknown>).urgency as string}
          isAutoDetected
          autoLabel={i.reviewAutoDetected}
        />
        <Row
          label={i.reviewDataResidency}
          value={e.data_residency_required ? i.reviewYes : i.reviewNo}
          autoLabel={i.reviewAutoDetected}
        />
        <Row
          label={i.reviewEsg}
          value={e.esg_requirement ? i.reviewYes : i.reviewNo}
          autoLabel={i.reviewAutoDetected}
        />
      </div>

      {/* Warnings (medium/low/info severity) */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-amber-800 mb-3">
            {i.reviewWarnings}
          </h3>
          <ul className="space-y-2">
            {warnings.map((w) => (
              <li key={w.issue_id} className="flex items-start gap-2 text-sm text-amber-700">
                <svg
                  className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                <span>{w.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={onEdit}
          className="flex-1 border border-gray-300 text-gray-700 rounded-lg px-4 py-3 font-medium hover:bg-gray-50 transition-colors"
        >
          {i.reviewEditRequest}
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 bg-green-600 text-white rounded-lg px-4 py-3 font-medium hover:bg-green-700 transition-colors"
        >
          {i.reviewConfirmSubmit}
        </button>
      </div>
    </div>
  );
}
