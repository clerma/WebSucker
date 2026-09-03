export function isSafeInternalReturnPath(value: string | null | undefined): value is string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return false;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return false;

  try {
    const parsed = new URL(value, "https://website-sucker.invalid");
    return parsed.origin === "https://website-sucker.invalid";
  } catch {
    return false;
  }
}

export function safeInternalReturnPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  return isSafeInternalReturnPath(value) ? value : fallback;
}