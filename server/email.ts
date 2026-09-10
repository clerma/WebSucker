import { ReplitConnectors } from "@replit/connectors-sdk";

// Send transactional email through the Resend connection.
// Never cache the connectors client across requests — tokens refresh.
async function resendRequest(path: string, init: { method: string; body?: string; idempotencyKey?: string }) {
  const connectors = new ReplitConnectors();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  const res = await connectors.proxy("resend", path, {
    method: init.method,
    headers,
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
const FROM_ADDRESS = "Website Sucker <hello@websitesucker.com>";

type EmailPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  scheduled_at?: string;
  reply_to?: string;
};

function trustedEmailOrigin(actionUrl?: string): string {
  const configured = process.env.APP_BASE_URL
    || actionUrl
    || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : null);
  if (!configured) throw new Error("No trusted origin is configured for email assets");
  const origin = new URL(configured).origin;
  if (!origin.startsWith("https://")) {
    throw new Error("Email assets require a trusted HTTPS origin");
  }
  return origin;
}

function brandedEmail(input: {
  title: string;
  preheader: string;
  body: string;
  assetOrigin: string;
}): string {
  const logoUrl = `${input.assetOrigin}/website-sucker-email-logo.png`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f7fb;color:#172033;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f4f7fb;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;">
            <tr>
              <td style="padding:26px 32px 22px;border-bottom:1px solid #e8edf4;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="width:42px;vertical-align:middle;">
                      <img src="${escapeHtml(logoUrl)}" width="38" height="35" alt="Website Sucker logo" style="display:block;width:38px;height:35px;border:0;">
                    </td>
                    <td style="padding-left:10px;vertical-align:middle;font-size:21px;font-weight:800;line-height:1.1;letter-spacing:-0.5px;color:#172033;">WebsiteSucker</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 32px 32px;">
                <h1 style="margin:0 0 16px;font-size:25px;line-height:1.25;color:#172033;">${escapeHtml(input.title)}</h1>
                ${input.body}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #e8edf4;color:#718096;font-size:12px;line-height:1.5;">
                Website Sucker &middot; Reliable offline website backups
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function actionButton(url: string, label: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
    <tr>
      <td bgcolor="#172033" style="border-radius:8px;">
        <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

export function buildPasswordResetEmail(to: string, resetUrl: string): EmailPayload {
  const safeUrl = escapeHtml(resetUrl);
  return {
    from: FROM_ADDRESS,
    to: [to],
    subject: "Reset your Website Sucker password",
    html: brandedEmail({
      title: "Reset your password",
      preheader: "Choose a new password for your Website Sucker account.",
      assetOrigin: trustedEmailOrigin(resetUrl),
      body: `
        <p style="margin:0 0 16px;color:#3f4b5f;font-size:15px;line-height:1.65;">Someone (hopefully you) requested a password reset for your Website Sucker account. Click the button below to choose a new password. This link expires in 1 hour.</p>
        ${actionButton(resetUrl, "Reset password")}
        <p style="margin:0 0 14px;color:#718096;font-size:13px;line-height:1.55;">If the button doesn't work, copy this link into your browser:<br><a href="${safeUrl}" style="color:#265eff;word-break:break-all;">${safeUrl}</a></p>
        <p style="margin:0;color:#718096;font-size:13px;line-height:1.55;">If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
    }),
  };
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const res = await resendRequest("/emails", {
    method: "POST",
    body: JSON.stringify(buildPasswordResetEmail(to, resetUrl)),
  });
  await requireSuccessfulSend(res);
}

export function buildEmailVerificationEmail(to: string, verificationUrl: string): EmailPayload {
  const safeUrl = escapeHtml(verificationUrl);
  return {
    from: FROM_ADDRESS,
    to: [to],
    subject: "Verify your Website Sucker email",
    html: brandedEmail({
      title: "Verify your email",
      preheader: "Confirm your email address to activate your Website Sucker account.",
      assetOrigin: trustedEmailOrigin(verificationUrl),
      body: `
        <p style="margin:0 0 16px;color:#3f4b5f;font-size:15px;line-height:1.65;">Confirm this email address to activate your Website Sucker account and use your free scrape. This link expires in 1 hour.</p>
        ${actionButton(verificationUrl, "Verify email")}
        <p style="margin:0 0 14px;color:#718096;font-size:13px;line-height:1.55;">If the button doesn't work, copy this link into your browser:<br><a href="${safeUrl}" style="color:#265eff;word-break:break-all;">${safeUrl}</a></p>
        <p style="margin:0;color:#718096;font-size:13px;line-height:1.55;">If you didn't create this account, you can safely ignore this email.</p>`,
    }),
  };
}

export async function sendEmailVerificationEmail(to: string, verificationUrl: string): Promise<void> {
  const res = await resendRequest("/emails", {
    method: "POST",
    body: JSON.stringify(buildEmailVerificationEmail(to, verificationUrl)),
  });
  await requireSuccessfulSend(res);
}

type BackupReadyEmailInput = {
  to: string;
  resultUrl: string;
  siteUrl: string;
  expiresAt: Date;
  truncated: boolean;
};

export function buildBackupReadyEmail(input: BackupReadyEmailInput): EmailPayload {
  const hostname = new URL(input.siteUrl).hostname;
  const safeResultUrl = escapeHtml(input.resultUrl);
  const expiry = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(input.expiresAt);
  const backupKind = input.truncated ? "partial backup" : "backup";

  return {
    from: FROM_ADDRESS,
    to: [input.to],
    subject: `Your ${hostname} backup is ready`,
    html: brandedEmail({
      title: input.truncated ? "Your partial backup is ready" : "Your backup is ready",
      preheader: `Your ${hostname} ${backupKind} is ready to download.`,
      assetOrigin: trustedEmailOrigin(input.resultUrl),
      body: `
        <p style="margin:0 0 16px;color:#3f4b5f;font-size:15px;line-height:1.65;">Your ${escapeHtml(backupKind)} of <strong>${escapeHtml(hostname)}</strong> is ready. You can download it more than once for the next 8 hours.</p>
        <p style="margin:0 0 16px;color:#3f4b5f;font-size:15px;line-height:1.65;">It expires at <strong>${escapeHtml(expiry)} UTC</strong>.</p>
        ${actionButton(input.resultUrl, "Open saved result")}
        <p style="margin:0 0 14px;color:#718096;font-size:13px;line-height:1.55;">Sign in with this email address to open the result. This link does not bypass account ownership or download payment requirements.</p>
        <p style="margin:0;color:#718096;font-size:13px;line-height:1.55;">If the button doesn't work, copy this link into your browser:<br><a href="${safeResultUrl}" style="color:#265eff;word-break:break-all;">${safeResultUrl}</a></p>`,
    }),
  };
}

export async function sendBackupReadyEmail(
  input: BackupReadyEmailInput & { jobId: string },
): Promise<void> {
  const res = await resendRequest("/emails", {
    method: "POST",
    body: JSON.stringify(buildBackupReadyEmail(input)),
    idempotencyKey: `website-sucker-backup-${input.jobId}`,
  });
  await requireSuccessfulSend(res);
}

export type AdminOrderEmailInput = {
  to: string;
  chargeId: string;
  amountCents: number;
  currency: string;
  customerEmail: string | null;
  customerName: string | null;
  orderType: string;
  description: string | null;
  invoiceId: string | null;
  paidAt: Date;
};

function formatMoney(amountCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export function buildAdminOrderEmail(input: AdminOrderEmailInput): EmailPayload {
  const amount = formatMoney(input.amountCents, input.currency);
  const paidAt = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(input.paidAt);
  const detailRow = (label: string, value: string) => `
    <tr>
      <td style="padding:7px 14px 7px 0;color:#718096;font-size:13px;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:7px 0;color:#172033;font-size:14px;font-weight:600;vertical-align:top;word-break:break-word;">${escapeHtml(value)}</td>
    </tr>`;

  return {
    from: FROM_ADDRESS,
    to: [input.to],
    subject: `New Website Sucker order — ${amount}`,
    html: brandedEmail({
      title: "New successful payment",
      preheader: `${amount} received for ${input.orderType}.`,
      assetOrigin: trustedEmailOrigin(),
      body: `
        <p style="margin:0 0 18px;color:#3f4b5f;font-size:15px;line-height:1.65;">Website Sucker received a successful payment.</p>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 18px;">
          ${detailRow("Amount", amount)}
          ${detailRow("Order", input.orderType)}
          ${input.customerEmail ? detailRow("Customer email", input.customerEmail) : ""}
          ${input.customerName ? detailRow("Customer name", input.customerName) : ""}
          ${input.description ? detailRow("Description", input.description) : ""}
          ${input.invoiceId ? detailRow("Stripe invoice", input.invoiceId) : ""}
          ${detailRow("Stripe charge", input.chargeId)}
          ${detailRow("Paid", `${paidAt} UTC`)}
        </table>
        <p style="margin:0;color:#718096;font-size:13px;line-height:1.55;">This is an internal order notification. Customer access and fulfillment are handled separately.</p>`,
    }),
  };
}

export async function sendAdminOrderEmail(
  input: Omit<AdminOrderEmailInput, "to">,
): Promise<string | null> {
  const recipient = process.env.ADMIN_ORDER_EMAIL?.trim();
  if (!recipient) throw new Error("ADMIN_ORDER_EMAIL is not configured");
  const res = await resendRequest("/emails", {
    method: "POST",
    body: JSON.stringify(buildAdminOrderEmail({ ...input, to: recipient })),
    idempotencyKey: `website-sucker-order-${input.chargeId}`,
  });
  const result = await requireSuccessfulSend(res);
  return typeof result.id === "string" ? result.id : null;
}

export function buildReviewRequestEmail(
  to: string,
  reviewUrl: string,
  scheduledAt: Date,
): EmailPayload {
  return {
    from: FROM_ADDRESS,
    to: [to],
    subject: "How did Website Sucker work for you?",
    scheduled_at: scheduledAt.toISOString(),
    html: brandedEmail({
      title: "How did your website backup go?",
      preheader: "Tell us how Website Sucker worked for you.",
      assetOrigin: trustedEmailOrigin(reviewUrl),
      body: `
        <p style="margin:0 0 16px;color:#3f4b5f;font-size:15px;line-height:1.65;">Thanks for choosing Website Sucker. We'd love to hear whether it helped and what we could improve.</p>
        ${actionButton(reviewUrl, "Share your review")}
        <p style="margin:0;color:#718096;font-size:13px;line-height:1.55;">It only takes a minute. Your feedback helps us make Website Sucker better.</p>`,
    }),
  };
}

export async function scheduleReviewRequestEmail(
  to: string,
  reviewUrl: string,
  scheduledAt: Date,
): Promise<string | null> {
  const res = await resendRequest("/emails", {
    method: "POST",
    body: JSON.stringify(buildReviewRequestEmail(to, reviewUrl, scheduledAt)),
  });
  const result = await requireSuccessfulSend(res);
  return typeof result.id === "string" ? result.id : null;
}

type ReviewSubmission = {
  name: string;
  email: string;
  rating: number;
  review: string;
};

export function buildReviewSubmissionEmail(input: ReviewSubmission): EmailPayload {
  const stars = "★".repeat(input.rating) + "☆".repeat(5 - input.rating);
  return {
    from: FROM_ADDRESS,
    to: ["hello@websitesucker.com"],
    reply_to: input.email,
    subject: `New ${input.rating}-star Website Sucker review`,
    html: brandedEmail({
      title: "New customer review",
      preheader: `A customer left a ${input.rating}-star Website Sucker review.`,
      assetOrigin: trustedEmailOrigin(),
      body: `
        <p style="margin:0 0 20px;font-size:24px;color:#f59e0b;letter-spacing:2px;">${stars}</p>
        <blockquote style="margin:0 0 20px;padding:16px;background-color:#f4f7fb;border-left:4px solid #265eff;white-space:pre-wrap;color:#3f4b5f;font-size:15px;line-height:1.6;">${escapeHtml(input.review)}</blockquote>
        <p style="margin:0;color:#3f4b5f;font-size:15px;line-height:1.55;"><strong>${escapeHtml(input.name)}</strong><br><a href="mailto:${escapeHtml(input.email)}" style="color:#265eff;">${escapeHtml(input.email)}</a></p>`,
    }),
  };
}

export async function sendReviewSubmissionEmail(input: ReviewSubmission): Promise<void> {
  const res = await resendRequest("/emails", {
    method: "POST",
    body: JSON.stringify(buildReviewSubmissionEmail(input)),
  });
  await requireSuccessfulSend(res);
}
