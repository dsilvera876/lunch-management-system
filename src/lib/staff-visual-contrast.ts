/** Staff-scoped color pairs for WCAG AA checks (Phase C1). Global --primary/--muted unchanged. */

export type ContrastPair = {
  name: string;
  foreground: string;
  background: string;
  minimumRatio: number;
};

export const STAFF_CONTRAST_PAIRS: ContrastPair[] = [
  {
    name: "white on staff CTA teal",
    foreground: "#ffffff",
    background: "#0f766e",
    minimumRatio: 4.5,
  },
  {
    name: "staff teal text on white",
    foreground: "#0f766e",
    background: "#ffffff",
    minimumRatio: 4.5,
  },
  {
    name: "staff instruction text on white",
    foreground: "#475569",
    background: "#ffffff",
    minimumRatio: 4.5,
  },
  {
    name: "staff instruction text on app background",
    foreground: "#475569",
    background: "#f4f6f9",
    minimumRatio: 4.5,
  },
  {
    name: "staff teal on primary/10 tint",
    foreground: "#115e59",
    background: "#e6f4f2",
    minimumRatio: 4.5,
  },
  {
    name: "staff teal on primary/10 (mobile nav active)",
    foreground: "#0f766e",
    background: "#e6f4f2",
    minimumRatio: 4.5,
  },
];

function relativeLuminance(r: number, g: number, b: number): number {
  const transform = (v: number) => {
    const channel = v / 255;
    return channel <= 0.03928 ? channel / 12.9 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

function parseHex(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function contrastRatio(foreground: string, background: string): number {
  const [fr, fg, fb] = parseHex(foreground);
  const [br, bg, bb] = parseHex(background);
  const l1 = relativeLuminance(fr, fg, fb);
  const l2 = relativeLuminance(br, bg, bb);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function staffContrastPairsMeetMinimum(): boolean {
  return STAFF_CONTRAST_PAIRS.every(
    (pair) => contrastRatio(pair.foreground, pair.background) >= pair.minimumRatio,
  );
}

/** Primary staff submit / finish actions — darker teal for label contrast. */
export const STAFF_PRIMARY_CTA_CLASS =
  "bg-staff-cta hover:bg-[#115e59] border-transparent text-white";

/** Focus ring without low-opacity teal. */
export const STAFF_SOLID_FOCUS_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 staff-focus-ring";
