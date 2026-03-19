import { t } from "../i18n";
import type { EnrichedRequest } from "../types";
import { ShimmerButton } from "./ui/shimmer-button";

interface Props {
  enrichedRequest: EnrichedRequest;
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
        <h2 className="app-title-secondary">{i.reviewTitle}</h2>
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
          label={i.reviewBudget}
          value={e.budget_amount ?? null}
          autoLabel={i.reviewAutoDetected}
        />
        <Row
          label={i.reviewCurrency}
          value={e.currency ?? null}
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

      {/* Actions */}
      <div className="flex gap-4">
        <ShimmerButton
          onClick={onEdit}
          background="rgb(55 65 81)"
          className="flex-1 rounded-lg px-4 py-3 font-medium"
        >
          {i.reviewEditRequest}
        </ShimmerButton>
        <ShimmerButton
          onClick={onConfirm}
          background="rgb(185 28 28)"
          className="flex-1 rounded-lg px-4 py-3 font-medium"
        >
          {i.reviewConfirmSubmit}
        </ShimmerButton>
      </div>
    </div>
  );
}
