import { createRequire } from "node:module";
import type { BrowserContext } from "@playwright/test";

const loadCjs = createRequire(__filename);
const { patchJamaicaToday } = loadCjs("./simulated-jamaica-today.cjs") as {
  patchJamaicaToday: (target: string) => unknown;
};

/** Set when the app server runs with the simulated-jamaica-today preload (local E2E only). */
export function simulatedJamaicaToday(): string | null {
  return process.env.E2E_SIMULATED_JAMAICA_TODAY?.trim() || null;
}

/** Keeps browser "Jamaica today" aligned with the simulated server so hydration matches. */
export async function applySimulatedJamaicaToday(context: BrowserContext): Promise<void> {
  const target = simulatedJamaicaToday();
  if (!target) {
    return;
  }
  await context.addInitScript(patchJamaicaToday, target);
}
