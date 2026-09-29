"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  confirmUserImportBatch,
  getUserImportBatch,
  previewUserImportCsv,
} from "@/app/admin/users/import/user-import-actions";
import { USER_IMPORT_CSV_TEMPLATE } from "@/lib/user-import-csv";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Props = {
  initialBatchId?: string | null;
};

export function HrBulkImportWorkspace({ initialBatchId }: Props) {
  const [batchId, setBatchId] = useState<string | null>(initialBatchId ?? null);
  const [validation, setValidation] = useState<Record<string, unknown> | null>(null);
  const [batchStatus, setBatchStatus] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const summary = (validation?.summary ?? {}) as Record<string, number | boolean>;
  const canConfirm = validation?.can_confirm === true && !isPending;
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

  useEffect(() => {
    if (!batchId || !importStarted) {
      return;
    }

    if (batchStatus?.status === "completed" || batchStatus?.status === "failed") {
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
  }, [batchId, importStarted, batchStatus?.status]);

  useEffect(() => {
    if (initialBatchId) {
      refreshBatchStatus(initialBatchId);
    }
  }, [initialBatchId]);

  function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await previewUserImportCsv(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }

      setBatchId(result.batchId);
      setValidation(result.validation);
      setBatchStatus(null);
    });
  }

  function handleConfirm() {
    if (!batchId) return;

    startTransition(async () => {
      const result = await confirmUserImportBatch(batchId);
      if (!result.success) {
        setError(result.error);
        return;
      }

      refreshBatchStatus(batchId);
    });
  }

  return (
    <div className="space-y-6">
      <Card padding="md" className="shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Upload CSV</h2>
        <p className="mt-1 text-sm text-muted">
          Required columns: full_name, email, employee_id (optional). New users become Staff and
          receive an account-setup invitation by email.
        </p>
        <p className="mt-2 text-sm text-muted">
          Employee IDs must be entered as four digits; leading zeroes matter (for example, 0054).
        </p>
        <div className="mt-4">
          <Button type="button" variant="secondary" onClick={downloadTemplate}>
            Download CSV template
          </Button>
        </div>
        <form className="mt-4 space-y-3" onSubmit={handleUpload}>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            disabled={isPending}
            className="block w-full text-sm"
          />
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? "Validating…" : "Validate"}
          </Button>
        </form>
        {error ? (
          <p className="mt-3 text-sm font-medium text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </Card>

      {validation ? (
        <Card padding="md" className="shadow-sm">
          <h3 className="text-base font-semibold text-foreground">Preview</h3>
          <p className="mt-1 text-sm text-muted">
            No accounts are created until you confirm import.
          </p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-muted">Total rows</dt>
              <dd className="font-medium">{Number(summary.total_rows ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-muted">New users</dt>
              <dd className="font-medium">{Number(summary.new_users ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-muted">Existing users</dt>
              <dd className="font-medium">{Number(summary.existing_users ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-muted">Existing inactive</dt>
              <dd className="font-medium">{Number(summary.existing_inactive ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-muted">Onboarding resumes</dt>
              <dd className="font-medium">{Number(summary.onboarding_resumes ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-muted">Errors</dt>
              <dd className="font-medium">{Number(summary.errors ?? 0)}</dd>
            </div>
          </dl>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3">Row</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Employee ID</th>
                  <th className="py-2">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={String(row.row_number)} className="border-b border-border/60">
                    <td className="py-2 pr-3 align-top">{String(row.row_number)}</td>
                    <td className="py-2 pr-3 align-top">{String(row.full_name ?? "")}</td>
                    <td className="py-2 pr-3 align-top">{String(row.email ?? "")}</td>
                    <td className="py-2 pr-3 align-top">{String(row.employee_id ?? "—")}</td>
                    <td className="py-2 align-top">
                      <span className="block font-medium">{String(row.classification ?? "")}</span>
                      <span className="block text-muted">{String(row.preview_message ?? "")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="primary" disabled={!canConfirm} onClick={handleConfirm}>
              Confirm Import
            </Button>
            {batchId && importStarted ? (
              <Button
                type="button"
                variant="secondary"
                disabled={isPending}
                onClick={() => refreshBatchStatus(batchId)}
              >
                Refresh status
              </Button>
            ) : null}
            <Link href="/admin/users">
              <Button type="button" variant="ghost">
                Back to Users
              </Button>
            </Link>
          </div>
        </Card>
      ) : null}

      {batchStatus && importStarted ? (
        <Card padding="md" className="shadow-sm">
          <h3 className="text-base font-semibold text-foreground">Import progress</h3>
          <p className="mt-2 text-sm text-muted">
            Status: {String(batchStatus.status)} · Processed {String(batchStatus.processed_rows)} /{" "}
            {String(batchStatus.total_rows)} · Succeeded {String(batchStatus.succeeded_rows)} ·
            Skipped {String(batchStatus.skipped_rows)} · Failed {String(batchStatus.failed_rows)}
          </p>
          {resultRows.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 pr-3">Row</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {resultRows.map((row) => (
                    <tr key={String(row.row_number)} className="border-b border-border/60">
                      <td className="py-2 pr-3">{String(row.row_number)}</td>
                      <td className="py-2 pr-3">{String(row.email ?? "")}</td>
                      <td className="py-2 pr-3">{String(row.status ?? "")}</td>
                      <td className="py-2">{String(row.result_message ?? row.preview_message ?? "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
