/** Keys that activate buttons in browsers (click synthesis). */
export function isButtonActivationKey(key: string): boolean {
  return key === "Enter" || key === " " || key === "Spacebar";
}

export function shouldBlockAriaDisabledActivation(
  accessibilityBlocked: boolean,
  key: string,
): boolean {
  return accessibilityBlocked && isButtonActivationKey(key);
}
