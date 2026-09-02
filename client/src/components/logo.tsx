import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * WebsiteSucker mark — the W (left, "rising" gradient) + S (right, "falling"
 * gradient) that read as a download arrow. Per the brand guide the signature
 * gradients appear ONLY on the mark, and only at 24px and up; below that (or
 * for single-ink use) pass `flat` to render the mark in currentColor.
 */
export function WsMark({
  className,
  flat = false,
  title = "WebsiteSucker",
}: {
  className?: string;
  flat?: boolean;
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  // Five gradients from the original brand artwork (userSpaceOnUse, tied to the
  // viewBox coords below). The S steps down in cyan→blue; the W rises in
  // green→teal→blue. Below 24px / single-ink use, pass `flat` for currentColor.
  const gS1 = `wsS1-${uid}`;
  const gS2 = `wsS2-${uid}`;
  const gS3 = `wsS3-${uid}`;
  const gW1 = `wsW1-${uid}`;
  const gW2 = `wsW2-${uid}`;
  const fS1 = flat ? "currentColor" : `url(#${gS1})`;
  const fS2 = flat ? "currentColor" : `url(#${gS2})`;
  const fS3 = flat ? "currentColor" : `url(#${gS3})`;
  const fW1 = flat ? "currentColor" : `url(#${gW1})`;
  const fW2 = flat ? "currentColor" : `url(#${gW2})`;

  return (
    <svg
      viewBox="120 260 364 333"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      {!flat && (
        <defs>
          <linearGradient id={gS1} x1="347.66" y1="324.71" x2="476.11" y2="324.71" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#29E7FF" />
            <stop offset="1" stopColor="#265EFF" />
          </linearGradient>
          <linearGradient id={gS2} x1="347.69" y1="398.53" x2="476.13" y2="398.53" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#29E7FF" />
            <stop offset="1" stopColor="#265EFF" />
          </linearGradient>
          <linearGradient id={gS3} x1="347.66" y1="474.01" x2="476.11" y2="474.01" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#61D8FF" />
            <stop offset="1" stopColor="#265EFF" />
          </linearGradient>
          <linearGradient id={gW1} x1="279.82" y1="417.95" x2="391.94" y2="530.07" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#47FF87" />
            <stop offset="0.69" stopColor="#0FFFE8" />
            <stop offset="1" stopColor="#2DA9FF" />
          </linearGradient>
          <linearGradient id={gW2} x1="124.62" y1="473.73" x2="326.86" y2="473.73" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#0FFFE8" />
            <stop offset="1" stopColor="#47FF87" />
          </linearGradient>
        </defs>
      )}
      {/* S — the right stack, stepping down */}
      <path fill={fS1} d="M467.96,268.67c10.86,10.85,10.86,28.45,0,39.31l-72.82,72.78c-10.86,10.85-28.47,10.85-39.33,0-10.86-10.85-10.86-28.45,0-39.31l72.82-72.78c10.86-10.85,28.47-10.85,39.33,0h0Z" />
      <path fill={fS2} d="M355.83,342.49c10.86-10.85,28.47-10.85,39.33,0l72.82,72.78c10.86,10.85,10.86,28.45,0,39.31-10.86,10.85-28.47,10.85-39.33,0l-72.82-72.78c-10.86-10.85-10.86-28.45,0-39.31h0Z" />
      <path fill={fS3} d="M467.96,417.97c10.86,10.85,10.86,28.45,0,39.31l-72.82,72.78c-10.86,10.85-28.47,10.85-39.33,0-10.86-10.85-10.86-28.45,0-39.31l72.82-72.78c10.86-10.85,28.47-10.85,39.33,0h0Z" />
      {/* W — the left stack, rising. The two lower arms are kept as separate
          paths (not one evenodd compound path) so their overlap fills solid
          instead of punching a hole at the bottom-left vertex. */}
      <path fill={fW1} d="M279.81,417.97c10.86-10.85,28.47-10.85,39.33,0l72.82,72.78c10.86,10.85,10.86,28.45,0,39.31-10.86,10.85-28.47,10.85-39.33,0l-72.82-72.78c-10.86-10.85-10.86-28.45,0-39.31h0Z" />
      <path fill={fW2} d="M244.92,529.5c-10.86,10.85-28.47,10.85-39.33,0l-72.82-72.78c-10.86-10.85-10.86-28.45,0-39.31,10.86-10.85,28.47-10.85,39.33,0l72.82,72.78c10.86,10.85,10.86,28.45,0,39.31h0Z" />
      <path fill={fW2} d="M318.72,457.27l-72.82,72.78c-10.86,10.85-28.47,10.85-39.33,0-10.86-10.85-10.86-28.45,0-39.31l72.82-72.78c10.86-10.85,28.47-10.85,39.33,0,10.86,10.85,10.86,28.45,0,39.31h0Z" />
    </svg>
  );
}

/**
 * Horizontal lockup: mark + "WebsiteSucker" wordmark (Archivo, closed up).
 * In running copy the name stays two words; here it's the brand lockup.
 */
export function WsLogo({
  className,
  markClassName = "h-7 w-auto",
  flat = false,
  invert = false,
}: {
  className?: string;
  markClassName?: string;
  flat?: boolean;
  /** invert = white wordmark, for dark/ink backgrounds. */
  invert?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <WsMark className={markClassName} flat={flat} />
      <span
        className={cn(
          "font-sans text-lg font-extrabold leading-none tracking-tight",
          invert ? "text-ws-paper" : "text-foreground"
        )}
      >
        WebsiteSucker
      </span>
    </span>
  );
}
