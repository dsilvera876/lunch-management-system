export const APP_SHELL_INERTIBLE_ID = "app-shell-inertible";
export const STAFF_MODAL_LAYER_ID = "staff-modal-layer";

export type InertElement = {
  inert: boolean;
};

export type InertDocument = {
  getElementById(id: string): InertElement | null;
};

/** Reference-counted inert lock for app shell background. */
export function createModalInertController(getDocument: () => InertDocument = () => document) {
  let depth = 0;
  const lockedRoots: InertElement[] = [];

  function acquire(rootIds: readonly string[] = [APP_SHELL_INERTIBLE_ID]): void {
    depth += 1;
    if (depth > 1) {
      return;
    }

    for (const id of rootIds) {
      const element = getDocument().getElementById(id);
      if (!element) {
        continue;
      }
      element.inert = true;
      lockedRoots.push(element);
    }
  }

  function release(): void {
    if (depth === 0) {
      return;
    }

    depth -= 1;
    if (depth > 0) {
      return;
    }

    for (const element of lockedRoots) {
      element.inert = false;
    }
    lockedRoots.length = 0;
  }

  function isLocked(): boolean {
    return depth > 0;
  }

  function lockedCount(): number {
    return lockedRoots.length;
  }

  return { acquire, release, isLocked, lockedCount, depth: () => depth };
}

/** Reference-counted overflow lock on the document element while modals are open. */
export function createDocumentScrollLock(getDocument: () => Document = () => document) {
  let depth = 0;
  let previousOverflow = "";

  function acquire(): void {
    depth += 1;
    if (depth > 1) {
      return;
    }

    const root = getDocument().documentElement;
    previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
  }

  function release(): void {
    if (depth === 0) {
      return;
    }

    depth -= 1;
    if (depth > 0) {
      return;
    }

    getDocument().documentElement.style.overflow = previousOverflow;
    previousOverflow = "";
  }

  return { acquire, release, depth: () => depth };
}

export const staffModalScrollLock = createDocumentScrollLock();

/** Shared controller for staff modal popovers (single page, no nesting expected). */
export const staffModalInert = createModalInertController();

function isTransientFocusRecoveryTarget(activeElement: Node): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  return (
    activeElement === document.body || activeElement === document.documentElement
  );
}

export function shouldRecoverFocusIntoModal(options: {
  modalOpen: boolean;
  modalRoot: Node | null;
  activeElement: Node | null;
  allowTriggerFocus?: boolean;
  triggerElement: Node | null;
}): boolean {
  if (!options.modalOpen || !options.modalRoot) {
    return false;
  }

  const { activeElement, modalRoot, triggerElement, allowTriggerFocus = false } = options;

  if (!activeElement) {
    return false;
  }

  if (isTransientFocusRecoveryTarget(activeElement)) {
    return false;
  }

  if (modalRoot.contains(activeElement)) {
    return false;
  }

  if (allowTriggerFocus && triggerElement?.contains(activeElement)) {
    return false;
  }

  return true;
}

export function computeAnchorFixedStyle(
  anchorRect: DOMRect,
  panelWidth: number,
  viewportWidth: number,
  gapPx = 8,
): { top: number; left: number } {
  const top = anchorRect.bottom + gapPx;
  const maxLeft = Math.max(8, viewportWidth - panelWidth - 8);
  const left = Math.min(Math.max(8, anchorRect.right - panelWidth), maxLeft);
  return { top, left };
}
