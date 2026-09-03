import { ReplitConnectors } from "@replit/connectors-sdk";

// Send transactional email through the Resend connection.
// Never cache the connectors client across requests — tokens refresh.
async function resendRequest(path: string, init: { method: string; body?: string }) {
  const connectors = new ReplitConnectors();
  const res = await connectors.proxy("resend", path, {
    method: init.method,
    headers: { "Content-Type": "application/json" },
    body: init.body,
  });
  return res;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]!);
}

async function requireSuccessfulSend(res: Response): Promise<{ id?: string }> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${text}`);
  }
  return await res.json().catch(() => ({}));
}

// This sender was verified against Resend during rollout. The connected API
// key is intentionally send-only, so it cannot enumerate account domains.
const FROM_ADDRESS = "Website Sucker <noreply@websitesucker.com>";

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const from = FROM_ADDRESS;
  const res = await resendRequest("/emails", {
    method: "POST",
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Reset your Website Sucker password",
      html: `
        <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="margin: 0 0 16px;">Reset your password</h2>
          <p style="color: #444; line-height: 1.5;">Someone (hopefully you) requested a password reset for your Website Sucker account. Click the button below to choose a new password. This link expires in 1 hour.</p>
          <p style="margin: 24px 0;">
            <a href="${resetUrl}" style="background: #18181b; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; display: inline-block;">Reset password</a>
          </p>
          <p style="color: #888; font-size: 13px; line-height: 1.5;">If the button doesn't work, copy this link into your browser:<br><a href="${resetUrl}" style="color: #555; word-break: break-all;">${resetUrl}</a></p>
          <p style="color: #888; font-size: 13px;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
        </div>
      `,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${text}`);
  }
}

export async function sendEmailVerificationEmail(to: string, verificationUrl: string): Promise<void> {
  const from = FROM_ADDRESS;
  const res = await resendRequest("/emails", {
    method: "POST",
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Verify your Website Sucker email",
      html: `
        <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="margin: 0 0 16px;">Verify your email</h2>
          <p style="color: #444; line-height: 1.5;">Confirm this email address to activate your Website Sucker account and use your free scrape. This link expires in 1 hour.</p>
          <p style="margin: 24px 0;">
            <a href="${verificationUrl}" style="background: #18181b; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; display: inline-block;">Verify email</a>
          </p>
          <p style="color: #888; font-size: 13px; line-height: 1.5;">If the button doesn't work, copy this link into your browser:<br><a href="${verificationUrl}" style="color: #555; word-break: break-all;">${verificationUrl}</a></p>
          <p style="color: #888; font-size: 13px;">If you didn't create this account, you can safely ignore this email.</p>
        </div>
      `,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${text}`);
  }
}

export async function scheduleReviewRequestEmail(
  to: string,
  reviewUrl: string,
  scheduledAt: Date,
): Promise<string | null> {
  const safeReviewUrl = escapeHtml(reviewUrl);
  const res = await resendRequest("/emails", {
    method: "POST",
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [to],
      subject: "How did Website Sucker work for you?",
      scheduled_at: scheduledAt.toISOString(),
      html: `
        <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
          <h2 style="margin: 0 0 16px;">How did your website backup go?</h2>
          <p style="color: #444; line-height: 1.6;">Thanks for choosing Website Sucker. We'd love to hear whether it helped and what we could improve.</p>
          <p style="margin: 26px 0;">
            <a href="${safeReviewUrl}" style="background: #18181b; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; display: inline-block;">Share your review</a>
          </p>
          <p style="color: #888; font-size: 13px;">It only takes a minute. Your feedback helps us make Website Sucker better.</p>
        </div>
      `,
    }),
  });
  const result = await requireSuccessfulSend(res);
  return typeof result.id === "string" ? result.id : null;
}

export async function sendReviewSubmissionEmail(input: {
  name: string;
  email: string;
  rating: number;
  review: string;
}): Promise<void> {
  const stars = "★".repeat(input.rating) + "☆".repeat(5 - input.rating);
  const res = await resendRequest("/emails", {
    method: "POST",
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: ["hello@websitesucker.com"],
      reply_to: input.email,
      subject: `New ${input.rating}-star Website Sucker review`,
      html: `
        <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <h2 style="margin: 0 0 16px;">New customer review</h2>
          <p style="font-size: 24px; color: #f59e0b; letter-spacing: 2px; margin: 0 0 20px;">${stars}</p>
          <blockquote style="margin: 0 0 20px; padding: 16px; background: #f4f4f5; border-left: 4px solid #18181b; white-space: pre-wrap; line-height: 1.6;">${escapeHtml(input.review)}</blockquote>
          <p style="color: #444; line-height: 1.5;"><strong>${escapeHtml(input.name)}</strong><br><a href="mailto:${escapeHtml(input.email)}">${escapeHtml(input.email)}</a></p>
        </div>
      `,
    }),
  });
  await requireSuccessfulSend(res);
}
