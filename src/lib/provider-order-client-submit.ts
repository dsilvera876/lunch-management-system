/** In-memory guard for ProviderOrderForm's onClientSubmit path. */
export type ClientSubmitLock = {
  held: boolean;
};

export function createClientSubmitLock(): ClientSubmitLock {
  return { held: false };
}

/**
 * Claims the submit lock. A second call while held returns false so rapid clicks
 * or repeated keyboard activation cannot start another client submit.
 */
export function tryBeginClientSubmit(lock: ClientSubmitLock): boolean {
  if (lock.held) {
    return false;
  }
  lock.held = true;
  return true;
}

/**
 * Releases the lock after a validation or server error so the user can correct
 * the form and submit again. A successful submit keeps the lock until unmount.
 */
export function releaseClientSubmitLock(lock: ClientSubmitLock): void {
  lock.held = false;
}
