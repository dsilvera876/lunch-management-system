export function isTransferOwnershipButtonDisabled(
  newOwnerId: string,
  isPending: boolean,
): boolean {
  return isPending || newOwnerId.trim().length === 0;
}

export function buildOwnershipTransferConfirmMessage(input: {
  newOwnerName: string;
  currentOwnerName: string;
}): string {
  return [
    `Transfer system ownership to ${input.newOwnerName}?`,
    "",
    `${input.currentOwnerName} will become Admin.`,
    `${input.newOwnerName} will become Owner.`,
    "",
    "This is a privileged ownership change.",
  ].join("\n");
}

export function shouldInvokeOwnershipTransfer(confirmed: boolean): boolean {
  return confirmed;
}

export type OwnershipTransferAttemptResult =
  | "missing-selection"
  | "cancelled"
  | "transferred";

export async function runOwnershipTransferWithConfirmation(input: {
  newOwnerId: string;
  confirm: () => boolean;
  transfer: (newOwnerId: string) => Promise<unknown>;
}): Promise<OwnershipTransferAttemptResult> {
  if (input.newOwnerId.trim().length === 0) {
    return "missing-selection";
  }

  if (!shouldInvokeOwnershipTransfer(input.confirm())) {
    return "cancelled";
  }

  await input.transfer(input.newOwnerId);
  return "transferred";
}
