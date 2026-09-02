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
  const w = `wsW-${uid}`;
  const s = `wsS-${uid}`;
  const sFill = flat ? "currentColor" : `url(#${s})`;
  const wFill = flat ? "currentColor" : `url(#${w})`;

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
          {/* W — rising: teal → blue (210°) */}
          <linearGradient id={w} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#0FE8D8" />
            <stop offset="1" stopColor="#2DA9FF" />
          </linearGradient>
          {/* S — falling: cyan → blue (150°) */}
          <linearGradient id={s} x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#29E7FF" />
            <stop offset="1" stopColor="#265EFF" />
          </linearGradient>
        </defs>
      )}
      {/* S — the right stack, stepping down */}
      <path fillRule="evenodd" fill={sFill} d="M467.96,268.67c10.86,10.85,10.86,28.45,0,39.31l-72.82,72.78c-10.86,10.85-28.47,10.85-39.33,0-10.86-10.85-10.86-28.45,0-39.31l72.82-72.78c10.86-10.85,28.47-10.85,39.33,0h0Z" />
      <path fillRule="evenodd" fill={sFill} d="M355.83,342.49c10.86-10.85,28.47-10.85,39.33,0l72.82,72.78c10.86,10.85,10.86,28.45,0,39.31-10.86,10.85-28.47,10.85-39.33,0l-72.82-72.78c-10.86-10.85-10.86-28.45,0-39.31h0Z" />
      <path fillRule="evenodd" fill={sFill} d="M467.96,417.97c10.86,10.85,10.86,28.45,0,39.31l-72.82,72.78c-10.86,10.85-28.47,10.85-39.33,0-10.86-10.85-10.86-28.45,0-39.31l72.82-72.78c10.86-10.85,28.47-10.85,39.33,0h0Z" />
      {/* W — the left stack, rising */}
      <path fillRule="evenodd" fill={wFill} d="M279.81,417.97c10.86-10.85,28.47-10.85,39.33,0l72.82,72.78c10.86,10.85,10.86,28.45,0,39.31-10.86,10.85-28.47,10.85-39.33,0l-72.82-72.78c-10.86-10.85-10.86-28.45,0-39.31h0Z" />
      <path fillRule="evenodd" fill={wFill} d="M244.92,529.5c-10.86,10.85-28.47,10.85-39.33,0l-72.82-72.78c-10.86-10.85-10.86-28.45,0-39.31,10.86-10.85,28.47-10.85,39.33,0l72.82,72.78c10.86,10.85,10.86,28.45,0,39.31h0ZM318.72,457.27l-72.82,72.78c-10.86,10.85-28.47,10.85-39.33,0-10.86-10.85-10.86-28.45,0-39.31l72.82-72.78c10.86-10.85,28.47-10.85,39.33,0,10.86,10.85,10.86,28.45,0,39.31h0Z" />
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
}: {
  className?: string;
  markClassName?: string;
  flat?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <WsMark className={markClassName} flat={flat} />
      <span className="font-sans text-lg font-extrabold leading-none tracking-tight text-foreground">
        WebsiteSucker
      </span>
    </span>
  );
}
