"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  confirmUserImportBatch,
  getUserImportBatch,
  previewUserImportCsv,
} from "@/app/admin/users/import/user-import-actions";
import {
  USER_IMPORT_CSV_TEMPLATE,
  USER_IMPORT_MAX_BYTES,
  USER_IMPORT_MAX_ROWS,
} from "@/lib/user-import-csv";
import { IconArrowRight, IconCircleX, IconClipboard } from "@/components/icons/line-icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { sanitizeUserImportResultMessage } from "@/lib/user-import-runtime-errors";
import {
  resolveUserImportResultsPhase,
  userImportResultsDescription,
  userImportResultsHeading,
  userImportResultsLiveStatusText,
  userImportResultsProgressIndeterminate,
  userImportResultsShowsActivity,
} from "@/lib/user-import-results-presentation";

const WORKFLOW_MAX_WIDTH = "mx-auto w-full max-w-6xl";

type Props = {
  initialBatchId?: string | null;
};

type WizardStep = 1 | 2 | 3;

const MAX_FILE_LABEL = `${Math.round(USER_IMPORT_MAX_BYTES / 1024)} KB`;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function classificationLabel(classification: string): string {
  switch (classification) {
    case "new_company":
    case "new_external":
      return "New user";
    case "existing_active":
      return "Existing active";
    case "existing_privileged":
      return "Existing privileged";
    case "existing_inactive":
      return "Existing inactive";
    case "pending_signup":
      return "Pending signup";
    case "approved_incomplete":
      return "Approved incomplete";
    case "previously_rejected":
      return "Previously rejected";
    case "error":
      return "Error";
    default:
      return classification.replace(/_/g, " ");
  }
}

function classificationChipClass(classification: string): string {
  switch (classification) {
    case "new_company":
    case "new_external":
      return "bg-teal-50 text-teal-900 ring-teal-200";
    case "existing_active":
      return "bg-blue-50 text-blue-900 ring-blue-200";
    case "existing_privileged":
      return "bg-violet-50 text-violet-900 ring-violet-200";
    case "existing_inactive":
      return "bg-amber-50 text-amber-950 ring-amber-200";
    case "pending_signup":
    case "approved_incomplete":
    case "previously_rejected":
      return "bg-sky-50 text-sky-900 ring-sky-200";
    case "error":
      return "bg-red-50 text-red-900 ring-red-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function resultStatusChipClass(status: string): string {
  switch (status) {
    case "succeeded":
      return "bg-emerald-50 text-emerald-900 ring-emerald-200";
    case "skipped":
      return "bg-amber-50 text-amber-950 ring-amber-200";
    case "failed":
      return "bg-red-50 text-red-900 ring-red-200";
    case "processing":
    case "queued":
      return "bg-sky-50 text-sky-900 ring-sky-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function resultStatusLabel(status: string): string {
  switch (status) {
    case "succeeded":
      return "Succeeded";
    case "skipped":
      return "Skipped";
    case "failed":
      return "Failed";
    case "processing":
      return "Processing";
    case "queued":
      return "Queued";
    default:
      return status.replace(/_/g, " ");
  }
}

function ImportStepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const steps = [
    { id: 1 as const, label: "Upload CSV" },
    { id: 2 as const, label: "Review & validate" },
    { id: 3 as const, label: "Import results" },
  ];

  return (
    <nav aria-label="Bulk import progress" className="mb-6 w-full">
      <ol className="flex w-full flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
        {steps.map((step, index) => {
          const isComplete = currentStep > step.id;
          const isCurrent = currentStep === step.id;

          return (
            <li
              key={step.id}
              className="flex flex-1 items-center sm:flex-col sm:items-center sm:px-1"
            >
              <div className="flex w-full items-center sm:justify-center">
                {index > 0 ? (
                  <div
                    className={`mr-2 hidden h-px flex-1 sm:mr-0 sm:block sm:w-full sm:max-w-[4.5rem] ${
                      currentStep > step.id - 1 ? "bg-teal-300" : "bg-border"
                    }`}
                    aria-hidden
                  />
                ) : (
                  <div className="hidden flex-1 sm:block sm:max-w-[4.5rem]" aria-hidden />
                )}

                <div className="flex shrink-0 flex-col items-center gap-2 sm:min-w-[7.5rem]">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ring-1 ring-inset ${
                      isCurrent
                        ? "bg-primary text-white ring-primary shadow-sm"
                        : isComplete
                          ? "bg-teal-100 text-teal-800 ring-teal-400"
                          : "bg-white text-slate-600 ring-slate-300"
                    }`}
                    aria-current={isCurrent ? "step" : undefined}
                    data-step-state={
                      isCurrent ? "active" : isComplete ? "completed" : "upcoming"
                    }
                  >
                    {isComplete ? (
                      <span className="text-base font-bold text-teal-700" aria-hidden>
                        ✓
                      </span>
                    ) : (
                      step.id
                    )}
                  </span>
                  <span
                    className={`text-center text-sm font-medium leading-snug ${
                      isCurrent
                        ? "text-foreground"
                        : isComplete
                          ? "text-teal-900/90"
                          : "text-muted"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>

                {index < steps.length - 1 ? (
                  <div
                    className={`ml-2 hidden h-px flex-1 sm:ml-0 sm:block sm:w-full sm:max-w-[4.5rem] ${
                      currentStep > step.id ? "bg-teal-300" : "bg-border"
                    }`}
                    aria-hidden
                  />
                ) : (
                  <div className="hidden flex-1 sm:block sm:max-w-[4.5rem]" aria-hidden />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function SummaryStatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warning" | "danger";
}) {
  const valueClass =
    tone === "danger"
      ? "text-red-700"
      : tone === "warning"
        ? "text-amber-800"
        : "text-foreground";

  return (
    <div className="rounded-lg border border-border bg-surface/60 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function ClassificationChip({ classification }: { classification: string }) {
  const label = classificationLabel(classification);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${classificationChipClass(classification)}`}
    >
      {label}
    </span>
  );
}

function ResultStatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${resultStatusChipClass(status)}`}
    >
      {resultStatusLabel(status)}
    </span>
  );
}

function BulkImportActivityIndicator() {
  return (
    <span
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-50 ring-1 ring-inset ring-sky-200"
      data-testid="bulk-import-activity-indicator"
      aria-hidden
    >
      <svg
        className="size-5 text-sky-700 motion-safe:animate-spin motion-reduce:animate-none"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="opacity-90"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
        />
      </svg>
    </span>
  );
}

function BulkImportIndeterminateProgressBar() {
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-muted/40"
      role="progressbar"
      aria-valuetext="Preparing import"
      aria-label="Import progress"
      data-testid="bulk-import-indeterminate-progress"
    >
      <div className="relative h-full w-full overflow-hidden rounded-full bg-sky-100">
        <div
          className="h-full w-full rounded-full bg-gradient-to-r from-sky-200 via-primary/75 to-sky-200 motion-safe:animate-pulse motion-reduce:animate-none motion-reduce:bg-primary/60"
          aria-hidden
        />
      </div>
    </div>
  );
}

export function HrBulkImportWorkspace({ initialBatchId }: Props) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadErrorRef = useRef<HTMLDivElement>(null);
  const [batchId, setBatchId] = useState<string | null>(initialBatchId ?? null);
  const [validation, setValidation] = useState<Record<string, unknown> | null>(null);
  const [batchStatus, setBatchStatus] = useState<Record<string, unknown> | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const summary = (validation?.summary ?? {}) as Record<string, number | boolean>;
  const canConfirm = validation?.can_confirm === true && !isPending;
  const blockingErrors = summary.blocking_errors === true || validation?.can_confirm === false;
  const previewRows = Array.isArray(validation?.rows)
    ? (validation.rows as Record<string, unknown>[])
    : [];
  const resultRows = Array.isArray(batchStatus?.rows)
    ? (batchStatus.rows as Record<string, unknown>[])
    : [];

  const importStarted =
    batchStatus &&
    batchStatus.status !== "draft" &&
    batchStatus.status !== undefined;

  const currentStep: WizardStep = importStarted ? 3 : validation ? 2 : 1;

  const processedRows = Number(batchStatus?.processed_rows ?? 0);
  const totalRows = Number(batchStatus?.total_rows ?? 0);
  const progressPercent =
    totalRows > 0 ? Math.min(100, Math.round((processedRows / totalRows) * 100)) : 0;

  const batchComplete =
    batchStatus?.status === "completed" || batchStatus?.status === "failed";

  const resultsPhase = importStarted
    ? resolveUserImportResultsPhase(
        batchStatus ? String(batchStatus.status) : undefined,
        processedRows,
      )
    : null;

  const resultsHeading = resultsPhase ? userImportResultsHeading(resultsPhase) : "";
  const resultsDescription = resultsPhase ? userImportResultsDescription(resultsPhase) : "";
  const resultsShowsActivity = resultsPhase ? userImportResultsShowsActivity(resultsPhase) : false;
  const resultsProgressIndeterminate = resultsPhase
    ? userImportResultsProgressIndeterminate(resultsPhase)
    : false;
  const resultsLiveStatusText =
    resultsPhase !== null
      ? userImportResultsLiveStatusText(resultsPhase, processedRows, totalRows)
      : "";

  function downloadTemplate() {
    const blob = new Blob([USER_IMPORT_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "bulk-user-import-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function refreshBatchStatus(id: string) {
    startTransition(async () => {
      const data = await getUserImportBatch(id);
      if (data) {
        setBatchStatus(data);
      }
    });
  }

  function resetWorkflow() {
    setBatchId(null);
    setValidation(null);
    setBatchStatus(null);
    setSelectedFile(null);
    setUploadError(null);
    setConfirmError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function assignSelectedFile(file: File | null) {
    setSelectedFile(file);
    setUploadError(null);
    if (fileInputRef.current && file) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInputRef.current.files = dataTransfer.files;
    }
    if (fileInputRef.current && !file) {
      fileInputRef.current.value = "";
    }
  }

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      assignSelectedFile(null);
      return;
    }
    if (file.size > USER_IMPORT_MAX_BYTES) {
      setUploadError(`This file exceeds the ${MAX_FILE_LABEL} limit.`);
      assignSelectedFile(null);
      return;
    }
    assignSelectedFile(file);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      setUploadError("Please choose a CSV file (.csv).");
      return;
    }
    if (file.size > USER_IMPORT_MAX_BYTES) {
      setUploadError(`This file exceeds the ${MAX_FILE_LABEL} limit.`);
      return;
    }
    assignSelectedFile(file);
  }

  useEffect(() => {
    if (!batchId || !importStarted) {
      return;
    }

    if (batchComplete) {
      return;
    }

    const timer = window.setInterval(() => {
      void getUserImportBatch(batchId).then((data) => {
        if (data) {
          setBatchStatus(data);
        }
      });
    }, 5000);

    return () => window.clearInterval(timer);
  }, [batchId, importStarted, batchComplete]);

  useEffect(() => {
    if (initialBatchId) {
      refreshBatchStatus(initialBatchId);
    }
  }, [initialBatchId]);

  useEffect(() => {
    if (!uploadError || !uploadErrorRef.current) {
      return;
    }

    uploadErrorRef.current.focus({ preventScroll: false });
    uploadErrorRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [uploadError]);

  function handleValidate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadError(null);

    if (!selectedFile) {
      setUploadError("Choose a CSV file before validating.");
      fileInputRef.current?.focus();
      return;
    }

    const formData = new FormData();
    formData.set("file", selectedFile);

    startTransition(async () => {
      const result = await previewUserImportCsv(formData);
      if (!result.success) {
        setUploadError(result.error);
        return;
      }

      setUploadError(null);
      setBatchId(result.batchId);
      setValidation(result.validation);
      setBatchStatus(null);
    });
  }

  function handleConfirm() {
    if (!batchId) return;

    startTransition(async () => {
      setConfirmError(null);
      const result = await confirmUserImportBatch(batchId);
      if (!result.success) {
        setConfirmError(result.error);
        return;
      }

      refreshBatchStatus(batchId);
    });
  }

  const skippedPreviewCount = Number(summary.existing_inactive ?? 0);
  const errorCount = Number(summary.errors ?? 0);

  return (
    <div className={`${WORKFLOW_MAX_WIDTH} space-y-6`} data-testid="bulk-import-workflow">
      <ImportStepIndicator currentStep={currentStep} />

      {currentStep === 1 ? (
        <Card padding="md" className="shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xl">
              <h2 className="text-lg font-semibold text-foreground">Upload CSV</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Choose a CSV file containing the staff you want to import.
              </p>
            </div>
            <div className="flex shrink-0 items-start sm:items-end">
              <Button type="button" variant="secondary" onClick={downloadTemplate}>
                Download CSV template
              </Button>
            </div>
          </div>

          <div
            className="mt-5 rounded-lg border border-sky-200 bg-sky-50/80 px-4 py-4 text-sm text-sky-950"
            aria-labelledby="bulk-import-before-upload-heading"
          >
            <h3 id="bulk-import-before-upload-heading" className="font-semibold text-sky-950">
              Before you upload
            </h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sky-900/95">
              <li>Your CSV should include the employee&apos;s name and email address.</li>
              <li>Employee ID is optional.</li>
              <li>New users will be created as Staff and sent an account setup email invitation.</li>
              <li>
                The CSV should use these columns:{" "}
                <code className="rounded bg-sky-100/80 px-1 py-0.5 text-[11px] text-sky-950">
                  full_name
                </code>
                ,{" "}
                <code className="rounded bg-sky-100/80 px-1 py-0.5 text-[11px] text-sky-950">
                  email
                </code>
                ,{" "}
                <code className="rounded bg-sky-100/80 px-1 py-0.5 text-[11px] text-sky-950">
                  employee_id
                </code>
                .
              </li>
            </ul>
            <p className="mt-4 text-xs text-sky-900/75">
              Maximum file size: {MAX_FILE_LABEL}
              <br />
              Maximum rows: {USER_IMPORT_MAX_ROWS.toLocaleString()}
            </p>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleValidate}>
            <input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              name="file"
              accept=".csv,text/csv"
              disabled={isPending}
              className="sr-only"
              onChange={handleFileInputChange}
              aria-describedby={`${fileInputId}-hint`}
            />

            <div
              role="group"
              aria-labelledby={`${fileInputId}-label`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragActive(false);
              }}
              onDrop={handleDrop}
              className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                isPending ? "pointer-events-none opacity-60" : ""
              } ${
                dragActive
                  ? "border-primary bg-teal-50/50"
                  : "border-border bg-muted/10 hover:border-slate-300"
              }`}
            >
              <p id={`${fileInputId}-label`} className="text-sm font-medium text-foreground">
                Drag and drop your CSV file here
              </p>
              <p className="mt-1 text-sm text-muted">or</p>
              <Button
                type="button"
                variant="primary"
                className="mt-4"
                disabled={isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                Choose CSV file
              </Button>
              <p id={`${fileInputId}-hint`} className="mt-3 text-xs text-muted">
                CSV files only (.csv)
              </p>
            </div>

            {selectedFile ? (
              <div className="flex items-start justify-between gap-4 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  <IconClipboard
                    size={22}
                    className="mt-0.5 shrink-0 text-emerald-800"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-emerald-950">{selectedFile.name}</p>
                    <p className="mt-0.5 text-xs text-emerald-900/80">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="shrink-0"
                  disabled={isPending}
                  onClick={() => assignSelectedFile(null)}
                  aria-label="Remove file"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <IconCircleX size={16} className="opacity-80" aria-hidden />
                    Remove file
                  </span>
                </Button>
              </div>
            ) : null}

            {uploadError ? (
              <div
                ref={uploadErrorRef}
                tabIndex={-1}
                data-testid="bulk-import-upload-error"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 outline-none"
                role="alert"
              >
                {uploadError}
              </div>
            ) : null}

            <div
              className="flex justify-end pt-2 sm:pt-3"
              data-testid="bulk-import-validate-action"
            >
              <Button
                type="submit"
                variant="primary"
                className="w-full sm:w-auto"
                disabled={isPending || !selectedFile}
              >
                {isPending ? (
                  "Validating…"
                ) : (
                  <span className="inline-flex items-center gap-2">
                    Validate CSV
                    <IconArrowRight size={18} className="opacity-90" aria-hidden />
                  </span>
                )}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {currentStep === 2 && validation ? (
        <Card padding="md" className="shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Review &amp; validate</h2>
            <p className="mt-1 text-sm text-muted">
              No accounts are created until you confirm import. Review each row before continuing.
            </p>
          </div>

          {confirmError ? (
            <div
              className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
              role="alert"
            >
              {confirmError}
            </div>
          ) : null}

          {blockingErrors ? (
            <div
              className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              role="alert"
            >
              <p className="font-semibold">This file cannot be imported yet</p>
              <p className="mt-1">
                Fix the errors below and upload a corrected CSV. Confirm Import stays disabled
                until validation passes.
              </p>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryStatCard label="Total rows" value={Number(summary.total_rows ?? 0)} />
            <SummaryStatCard label="New users" value={Number(summary.new_users ?? 0)} />
            <SummaryStatCard label="Existing users" value={Number(summary.existing_users ?? 0)} />
            <SummaryStatCard
              label="Skipped"
              value={skippedPreviewCount}
              tone={skippedPreviewCount > 0 ? "warning" : "default"}
            />
            <SummaryStatCard
              label="Errors"
              value={errorCount}
              tone={errorCount > 0 ? "danger" : "default"}
            />
          </div>

          <div
            className="mt-6 overflow-x-auto rounded-lg border border-border"
            data-testid="bulk-import-review-table"
          >
            <table className="min-w-[56rem] w-full table-fixed text-sm">
              <thead className="bg-muted/30">
                <tr className="border-b border-border text-left">
                  <th className="w-12 px-2 py-2.5 font-medium text-muted">Row</th>
                  <th className="w-[14%] px-3 py-2.5 font-medium text-muted">Name</th>
                  <th className="w-[22%] px-3 py-2.5 font-medium text-muted">Email</th>
                  <th className="w-24 px-3 py-2.5 font-medium text-muted whitespace-nowrap">
                    Employee ID
                  </th>
                  <th className="w-36 px-3 py-2.5 font-medium text-muted">Classification</th>
                  <th className="min-w-[12rem] px-3 py-2.5 font-medium text-muted">
                    Planned action
                  </th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => {
                  const classification = String(row.classification ?? "");
                  return (
                    <tr key={String(row.row_number)} className="border-b border-border/60 align-top">
                      <td className="px-2 py-3 text-center tabular-nums text-xs text-muted">
                        {String(row.row_number)}
                      </td>
                      <td className="px-3 py-3 font-medium text-foreground">
                        {String(row.full_name ?? "")}
                      </td>
                      <td className="px-3 py-3 text-foreground break-all">{String(row.email ?? "")}</td>
                      <td className="px-3 py-3 tabular-nums text-foreground whitespace-nowrap">
                        {row.employee_id ? String(row.employee_id) : "—"}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <ClassificationChip classification={classification} />
                      </td>
                      <td className="px-3 py-3 text-muted">{String(row.preview_message ?? "")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-4"
            data-testid="bulk-import-review-actions"
          >
            <Button type="button" variant="secondary" disabled={isPending} onClick={resetWorkflow}>
              Upload another file
            </Button>
            <Button type="button" variant="primary" disabled={!canConfirm} onClick={handleConfirm}>
              <span className="inline-flex items-center gap-2">
                Confirm Import
                <IconArrowRight size={18} className="opacity-90" aria-hidden />
              </span>
            </Button>
          </div>
        </Card>
      ) : null}

      {currentStep === 3 && batchStatus && importStarted ? (
        <Card padding="md" className="shadow-sm">
          <div
            className="min-w-0"
            aria-live="polite"
            aria-atomic="true"
            data-testid="bulk-import-status-announcement"
          >
            <span className="sr-only">{resultsLiveStatusText}</span>
            <div className="flex items-start gap-3">
              {resultsShowsActivity ? <BulkImportActivityIndicator /> : null}
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground">{resultsHeading}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">{resultsDescription}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <ResultStatusChip status={String(batchStatus.status ?? "processing")} />
            <span className="text-sm text-muted">
              Processed {processedRows} of {totalRows} rows
              {resultsPhase === "processing" && totalRows > 0
                ? ` (${progressPercent}%)`
                : null}
            </span>
          </div>

          <div className="mt-4">
            {resultsProgressIndeterminate ? (
              <BulkImportIndeterminateProgressBar />
            ) : (
              <div
                className="h-2 overflow-hidden rounded-full bg-muted/40"
                role="progressbar"
                aria-valuenow={progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Import progress"
              >
                <div
                  className={`h-full rounded-full transition-all duration-300 motion-reduce:transition-none ${
                    resultsPhase === "completed" ? "bg-emerald-600" : "bg-primary"
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryStatCard
              label="Created / updated"
              value={Number(batchStatus.succeeded_rows ?? 0)}
            />
            <SummaryStatCard label="Skipped" value={Number(batchStatus.skipped_rows ?? 0)} />
            <SummaryStatCard
              label="Failed"
              value={Number(batchStatus.failed_rows ?? 0)}
              tone={Number(batchStatus.failed_rows ?? 0) > 0 ? "danger" : "default"}
            />
            <SummaryStatCard label="Total rows" value={totalRows} />
          </div>

          {resultRows.length > 0 ? (
            <div
              className="mt-6 overflow-x-auto rounded-lg border border-border"
              data-testid="bulk-import-results-table"
            >
              <table className="min-w-[48rem] w-full table-fixed text-sm">
                <thead className="bg-muted/30">
                  <tr className="border-b border-border text-left">
                    <th className="w-12 px-2 py-2.5 font-medium text-muted">Row</th>
                    <th className="w-[16%] px-3 py-2.5 font-medium text-muted">Name</th>
                    <th className="w-[24%] px-3 py-2.5 font-medium text-muted">Email</th>
                    <th className="w-32 px-3 py-2.5 font-medium text-muted">Status</th>
                    <th className="min-w-[12rem] px-3 py-2.5 font-medium text-muted">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {resultRows.map((row) => (
                    <tr key={String(row.row_number)} className="border-b border-border/60 align-top">
                      <td className="px-2 py-3 text-center tabular-nums text-xs text-muted">
                        {String(row.row_number)}
                      </td>
                      <td className="px-3 py-3 font-medium text-foreground">
                        {String(row.full_name ?? "—")}
                      </td>
                      <td className="px-3 py-3 break-all">{String(row.email ?? "")}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <ResultStatusChip status={String(row.status ?? "queued")} />
                      </td>
                      <td className="px-3 py-3 text-muted">
                        {sanitizeUserImportResultMessage(
                          String(row.result_message ?? row.preview_message ?? ""),
                          {
                            status: String(row.status ?? "queued"),
                            employeeId:
                              typeof row.employee_id === "string" ? row.employee_id : null,
                          },
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div
            className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-4"
            data-testid="bulk-import-results-actions"
          >
            <Button type="button" variant="secondary" onClick={resetWorkflow}>
              Import another file
            </Button>
            <Link href="/admin/users">
              <Button type="button" variant="secondary">
                Back to Users
              </Button>
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
