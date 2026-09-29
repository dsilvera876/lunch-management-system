export type UserImportBatchStatus = "draft" | "queued" | "processing" | "completed" | "failed";

export type UserImportResultsPhase = "preparing" | "processing" | "completed" | "failed";

export function resolveUserImportResultsPhase(
  batchStatus: string | undefined,
  processedRows: number,
): UserImportResultsPhase {
  if (batchStatus === "failed") {
    return "failed";
  }

  if (batchStatus === "completed") {
    return "completed";
  }

  if (batchStatus === "queued" && processedRows === 0) {
    return "preparing";
  }

  if (batchStatus === "processing" || batchStatus === "queued") {
    return "processing";
  }

  return "processing";
}

export function userImportResultsHeading(phase: UserImportResultsPhase): string {
  switch (phase) {
    case "preparing":
      return "Getting your import ready…";
    case "processing":
      return "Import in progress…";
    case "completed":
      return "Import results";
    case "failed":
      return "Import results";
    default:
      return "Import results";
  }
}

export function userImportResultsDescription(phase: UserImportResultsPhase): string {
  switch (phase) {
    case "preparing":
      return "Your import has been submitted and will start shortly. This page will update automatically.";
    case "processing":
      return "Accounts are being processed. This page will update automatically.";
    case "completed":
      return "Import processing has finished. Review row outcomes below.";
    case "failed":
      return "Import processing stopped before completion. Review row outcomes below, fix any issues, and try importing again if needed.";
    default:
      return "";
  }
}

export function userImportResultsShowsActivity(phase: UserImportResultsPhase): boolean {
  return phase === "preparing" || phase === "processing";
}

export function userImportResultsProgressIndeterminate(phase: UserImportResultsPhase): boolean {
  return phase === "preparing";
}

export function userImportResultsLiveStatusText(
  phase: UserImportResultsPhase,
  processedRows: number,
  totalRows: number,
): string {
  const heading = userImportResultsHeading(phase);
  const description = userImportResultsDescription(phase);
  const progress =
    totalRows > 0 ? `Processed ${processedRows} of ${totalRows} rows.` : "Waiting to begin processing.";
  return `${heading} ${description} ${progress}`;
}
