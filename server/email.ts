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

let cachedFrom: string | null = null;

// Pick a "from" address: use the first verified domain on the Resend account,
// falling back to Resend's shared onboarding sender (delivers only to the
// account owner's own email — fine for testing, not production).
async function getFromAddress(): Promise<string> {
  if (cachedFrom) return cachedFrom;
  try {
    const res = await resendRequest("/domains", { method: "GET" });
    const data: any = await res.json();
    const verified = (data?.data || []).find((d: any) => d.status === "verified");
    if (verified) {
      cachedFrom = `Website Sucker <noreply@${verified.name}>`;
      return cachedFrom;
    }
  } catch (err) {
    console.error("Resend domain lookup failed:", err);
  }
  // Don't cache the fallback — once the user verifies a domain in Resend,
  // the next send should pick it up without needing a server restart.
  return "Website Sucker <onboarding@resend.dev>";
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const from = await getFromAddress();
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
