import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { and, asc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { adminOrderNotifications } from "@shared/schema";
import { db } from "./db";
import { sendAdminOrderEmail, type AdminOrderEmailInput } from "./email";
import { getUncachableStripeClient } from "./stripeClient";

const CLAIM_MS = 2 * 60_000;
const RETRY_INTERVAL_MS = 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;
// Resend guarantees idempotency keys for 24 hours. Keeping every automatic
// retry inside 23 hours closes the post-send/pre-commit crash window without
// risking a late duplicate after the provider guarantee expires.
const IDEMPOTENT_RETRY_WINDOW_MS = 23 * 60 * 60_000;

export type AdminOrderNotificationStatus = "retrying" | "reconciliation_required";

export type AdminOrderNotificationSummary = {
  stripeChargeId: string;
  amountCents: number;
  currency: string;
  customerEmail: string | null;
  customerName: string | null;
  orderType: string;
  attempts: number;
  lastError: string | null;
  paidAt: Date;
  createdAt: Date;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date;
  retryUntil: Date;
  status: AdminOrderNotificationStatus;
};

export type AdminOrderNotificationInput = Omit<AdminOrderEmailInput, "to"> & {
  paymentIntentId: string | null;
};

type AdminOrderSender = (
  input: Omit<AdminOrderEmailInput, "to">,
) => Promise<string | null>;

type InvoiceContext = {
  invoiceId: string;
  billingReason: Stripe.Invoice.BillingReason | null;
  customerEmail: string | null;
  customerName: string | null;
  description: string | null;
};

type InvoiceContextResolver = (
  paymentIntentId: string | null,
  invoiceId: string | null,
) => Promise<InvoiceContext | null>;

function objectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

export function notificationInputFromCharge(
  charge: Stripe.Charge,
): AdminOrderNotificationInput | null {
  if (!Number.isSafeInteger(charge.amount) || charge.amount <= 0 || charge.paid === false) {
    return null;
  }
  const paymentIntentId = objectId(charge.payment_intent);
  const metadataType = charge.metadata?.type;
  const orderType = metadataType === "credits"
      ? "Credit pack"
      : metadataType === "subscription"
        ? "New subscription"
        : charge.metadata?.jobId
          ? "Backup download"
          : "One-time payment";

  return {
    chargeId: charge.id,
    amountCents: charge.amount,
    currency: charge.currency || "usd",
    customerEmail: charge.billing_details?.email ?? charge.receipt_email ?? null,
    customerName: charge.billing_details?.name ?? null,
    orderType,
    description: charge.description ?? null,
    invoiceId: null,
    paymentIntentId,
    paidAt: new Date(charge.created * 1000),
  };
}

export function orderTypeFromBillingReason(
  billingReason: Stripe.Invoice.BillingReason | null,
): string {
  if (billingReason === "subscription_cycle") return "Subscription renewal";
  if (billingReason === "subscription_create") return "New subscription";
  if (billingReason === "subscription_update") return "Subscription update";
  if (billingReason === "subscription_threshold") return "Subscription threshold payment";
  return "Subscription payment";
}

async function resolveInvoiceContext(
  paymentIntentId: string | null,
  knownInvoiceId: string | null,
): Promise<InvoiceContext | null> {
  const stripe = await getUncachableStripeClient();
  let invoiceId = knownInvoiceId;
  let expandedInvoice: Stripe.Invoice | null = null;
  if (!invoiceId && paymentIntentId) {
    // Stripe API v20 removed Charge.invoice. Invoice Payments is the
    // supported association from a PaymentIntent to its invoice.
    const payments = await stripe.invoicePayments.list({
      payment: {
        type: "payment_intent",
        payment_intent: paymentIntentId,
      },
      status: "paid",
      limit: 1,
      expand: ["data.invoice"],
    });
    const invoiceRef = payments.data[0]?.invoice;
    invoiceId = objectId(invoiceRef);
    if (invoiceRef && typeof invoiceRef === "object" && !("deleted" in invoiceRef)) {
      expandedInvoice = invoiceRef;
    }
  }
  if (!invoiceId) return null;
  const invoice = expandedInvoice ?? await stripe.invoices.retrieve(invoiceId);
  return {
    invoiceId,
    billingReason: invoice.billing_reason,
    customerEmail: invoice.customer_email ?? null,
    customerName: invoice.customer_name ?? null,
    description: invoice.description ?? null,
  };
}

export async function enrichSubscriptionContext(
  input: AdminOrderNotificationInput,
  resolver: InvoiceContextResolver = resolveInvoiceContext,
): Promise<AdminOrderNotificationInput> {
  if (!input.paymentIntentId && !input.invoiceId) return input;
  try {
    const invoice = await resolver(input.paymentIntentId, input.invoiceId);
    if (!invoice) return input;
    return {
      ...input,
      invoiceId: invoice.invoiceId,
      orderType: orderTypeFromBillingReason(invoice.billingReason),
      customerEmail: input.customerEmail ?? invoice.customerEmail,
      customerName: input.customerName ?? invoice.customerName,
      description: input.description ?? invoice.description,
    };
  } catch (error) {
    console.warn(
      `Could not enrich order notification for payment ${input.paymentIntentId ?? input.invoiceId}:`,
      error,
    );
    return input;
  }
}

function asEmailInput(row: typeof adminOrderNotifications.$inferSelect): Omit<AdminOrderEmailInput, "to"> {
  return {
    chargeId: row.stripeChargeId,
    amountCents: row.amountCents,
    currency: row.currency,
    customerEmail: row.customerEmail,
    customerName: row.customerName,
    orderType: row.orderType,
    description: row.description,
    invoiceId: row.invoiceId,
    paidAt: row.paidAt,
  };
}

export async function attemptAdminOrderNotification(
  stripeChargeId: string,
  sender: AdminOrderSender = sendAdminOrderEmail,
): Promise<"sent" | "failed" | "unavailable"> {
  const now = new Date();
  const leaseToken = randomUUID();
  const [claim] = await db.update(adminOrderNotifications).set({
    leaseToken,
    leaseUntil: new Date(now.getTime() + CLAIM_MS),
    lastAttemptAt: now,
    attempts: sql`${adminOrderNotifications.attempts} + 1`,
  }).where(and(
    eq(adminOrderNotifications.stripeChargeId, stripeChargeId),
    isNull(adminOrderNotifications.sentAt),
    lte(adminOrderNotifications.nextAttemptAt, now),
    gte(adminOrderNotifications.retryUntil, now),
    or(
      isNull(adminOrderNotifications.leaseUntil),
      lt(adminOrderNotifications.leaseUntil, now),
    ),
  )).returning();
  if (!claim) return "unavailable";

  let leaseLost = false;
  const renewal = setInterval(() => {
    void db.update(adminOrderNotifications).set({
      leaseUntil: new Date(Date.now() + CLAIM_MS),
    }).where(and(
      eq(adminOrderNotifications.stripeChargeId, stripeChargeId),
      eq(adminOrderNotifications.leaseToken, leaseToken),
      isNull(adminOrderNotifications.sentAt),
    )).returning({ stripeChargeId: adminOrderNotifications.stripeChargeId })
      .then(rows => {
        if (rows.length !== 1) leaseLost = true;
      })
      .catch(error => {
        leaseLost = true;
        console.error(`Admin order email lease renewal failed for ${stripeChargeId}:`, error);
      });
  }, 30_000);
  renewal.unref?.();

  try {
    const resendEmailId = await sender(asEmailInput(claim));
    const marked = await db.update(adminOrderNotifications).set({
      sentAt: new Date(),
      resendEmailId,
      lastError: null,
      leaseToken: null,
      leaseUntil: null,
    }).where(and(
      eq(adminOrderNotifications.stripeChargeId, stripeChargeId),
      eq(adminOrderNotifications.leaseToken, leaseToken),
    )).returning({ stripeChargeId: adminOrderNotifications.stripeChargeId });
    if (marked.length !== 1 || leaseLost) {
      console.error(`Admin order email sent but delivery state was not fenced for ${stripeChargeId}`);
      return "unavailable";
    }
    return "sent";
  } catch (error) {
    const backoffMs = Math.min(
      MAX_BACKOFF_MS,
      RETRY_INTERVAL_MS * 2 ** Math.min(Math.max(claim.attempts - 1, 0), 6),
    );
    const message = error instanceof Error ? error.message : String(error);
    await db.update(adminOrderNotifications).set({
      nextAttemptAt: new Date(Date.now() + backoffMs),
      lastError: message.slice(0, 2000),
      leaseToken: null,
      leaseUntil: null,
    }).where(and(
      eq(adminOrderNotifications.stripeChargeId, stripeChargeId),
      eq(adminOrderNotifications.leaseToken, leaseToken),
    ));
    console.error(`Admin order email failed for charge ${stripeChargeId}:`, error);
    return "failed";
  } finally {
    clearInterval(renewal);
  }
}

export async function queueAdminOrderNotification(
  rawInput: AdminOrderNotificationInput,
  sender: AdminOrderSender = sendAdminOrderEmail,
  invoiceResolver: InvoiceContextResolver = resolveInvoiceContext,
): Promise<"sent" | "failed" | "unavailable"> {
  const input = await enrichSubscriptionContext(rawInput, invoiceResolver);
  await db.insert(adminOrderNotifications).values({
    stripeChargeId: input.chargeId,
    amountCents: input.amountCents,
    currency: input.currency,
    customerEmail: input.customerEmail,
    customerName: input.customerName,
    orderType: input.orderType,
    description: input.description,
    invoiceId: input.invoiceId,
    paymentIntentId: input.paymentIntentId,
    paidAt: input.paidAt,
    retryUntil: new Date(Date.now() + IDEMPOTENT_RETRY_WINDOW_MS),
  }).onConflictDoNothing();
  return attemptAdminOrderNotification(input.chargeId, sender);
}

export async function handleSuccessfulCharge(charge: Stripe.Charge): Promise<void> {
  const input = notificationInputFromCharge(charge);
  if (!input) return;
  await queueAdminOrderNotification(input);
}

export async function retryAdminOrderNotifications(limit = 25): Promise<number> {
  const due = await db.select({ stripeChargeId: adminOrderNotifications.stripeChargeId })
    .from(adminOrderNotifications)
    .where(and(
      isNull(adminOrderNotifications.sentAt),
      lte(adminOrderNotifications.nextAttemptAt, new Date()),
      gte(adminOrderNotifications.retryUntil, new Date()),
      or(
        isNull(adminOrderNotifications.leaseUntil),
        lt(adminOrderNotifications.leaseUntil, new Date()),
      ),
    ))
    .orderBy(adminOrderNotifications.nextAttemptAt)
    .limit(limit);
  await Promise.all(due.map(({ stripeChargeId }) =>
    attemptAdminOrderNotification(stripeChargeId)));
  return due.length;
}

export async function listUnresolvedAdminOrderNotifications(
  limit = 100,
  now = new Date(),
): Promise<AdminOrderNotificationSummary[]> {
  const rows = await db.select().from(adminOrderNotifications)
    .where(isNull(adminOrderNotifications.sentAt))
    .orderBy(asc(adminOrderNotifications.retryUntil))
    .limit(limit);
  return rows.map(row => ({
    stripeChargeId: row.stripeChargeId,
    amountCents: row.amountCents,
    currency: row.currency,
    customerEmail: row.customerEmail,
    customerName: row.customerName,
    orderType: row.orderType,
    attempts: row.attempts,
    lastError: row.lastError,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
    lastAttemptAt: row.lastAttemptAt,
    nextAttemptAt: row.nextAttemptAt,
    retryUntil: row.retryUntil,
    status: row.retryUntil.getTime() < now.getTime()
      ? "reconciliation_required"
      : "retrying",
  }));
}

export async function retryExpiredAdminOrderNotification(
  stripeChargeId: string,
  duplicateRiskAcknowledged: boolean,
  sender: AdminOrderSender = sendAdminOrderEmail,
): Promise<"sent" | "failed" | "unavailable" | "acknowledgement_required"> {
  if (!duplicateRiskAcknowledged) return "acknowledgement_required";

  const now = new Date();
  const reopened = await db.update(adminOrderNotifications).set({
    nextAttemptAt: now,
    retryUntil: new Date(now.getTime() + IDEMPOTENT_RETRY_WINDOW_MS),
  }).where(and(
    eq(adminOrderNotifications.stripeChargeId, stripeChargeId),
    isNull(adminOrderNotifications.sentAt),
    lt(adminOrderNotifications.retryUntil, now),
    or(
      isNull(adminOrderNotifications.leaseUntil),
      lt(adminOrderNotifications.leaseUntil, now),
    ),
  )).returning({ stripeChargeId: adminOrderNotifications.stripeChargeId });
  if (reopened.length !== 1) return "unavailable";

  return attemptAdminOrderNotification(stripeChargeId, sender);
}

let retryTimer: NodeJS.Timeout | null = null;

export function startAdminOrderNotificationRetryLoop(): void {
  if (retryTimer) return;
  const run = () => {
    void retryAdminOrderNotifications().catch(error =>
      console.error("Admin order notification retry sweep failed:", error));
  };
  run();
  retryTimer = setInterval(run, RETRY_INTERVAL_MS);
  retryTimer.unref?.();
}