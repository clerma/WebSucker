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
