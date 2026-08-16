import Stripe from 'stripe';
import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { db } from './db';
import { payments, users, downloadEvents } from '@shared/schema';
import { sql, eq } from 'drizzle-orm';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    // Verify the signature ourselves against the managed webhook signing
    // secret(s) stored by the sync engine. This must not depend on live
    // Stripe API calls (e.g. accounts.retrieve), which can fail on
    // restricted keys and would otherwise drop payment records.
    const event = await WebhookHandlers.verifyEvent(payload, signature);

    if (event) {
      // Signature verified — persist the payment record first so it can
      // never be lost to a sync-engine failure. Errors here propagate so
      // Stripe retries the delivery.
      await WebhookHandlers.handleEvent(event);

      // Best-effort: let the sync engine mirror Stripe data. Its failure
      // (e.g. key permission issues) must not fail the webhook after the
      // payment record is safely stored.
      try {
        const sync = await getStripeSync();
        await sync.processWebhook(payload, signature);
      } catch (err: any) {
        console.error('Stripe sync processing failed (payment record already stored):', err?.message ?? err);
      }
    } else {
      // No local signing secret available — fall back to the sync engine,
      // which verifies the signature itself and throws on mismatch.
      const sync = await getStripeSync();
      await sync.processWebhook(payload, signature);
      await WebhookHandlers.handleEvent(JSON.parse(payload.toString('utf8')) as Stripe.Event);
    }
  }

  /**
   * Verify the webhook signature against every managed-webhook signing
   * secret stored locally (test and live). Returns the verified event, or
   * null when no secrets are stored. Throws when secrets exist but none
   * match the signature.
   */
  private static async verifyEvent(payload: Buffer, signature: string): Promise<Stripe.Event | null> {
    const result = await db.execute(
      sql`SELECT secret FROM "stripe"."_managed_webhooks"`
    );
    const secrets = (result.rows as Array<{ secret: string }>)
      .map((r) => r.secret)
      .filter(Boolean);
    if (secrets.length === 0) return null;

    const stripe = await getUncachableStripeClient();
    let lastError: unknown = null;
    for (const secret of secrets) {
      try {
        return await stripe.webhooks.constructEventAsync(payload, signature, secret);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Webhook signature verification failed');
  }

  /**
   * Persist completed checkout payments server-side, independent of the
   * buyer's browser returning to the success page. The interactive
   * verify-payment / verify-plan routes insert the same row; both sides use
   * onConflictDoNothing on the unique stripe_session_id so whichever path
   * runs first wins and the other is a no-op.
   */
  private static async handleEvent(event: Stripe.Event): Promise<void> {
    if (event.type !== 'checkout.session.completed') return;

    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.app !== 'websucker') return;
    // Delayed payment methods complete the session before funds clear —
    // only record once actually paid (or a $0/no-payment subscription setup).
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return;

    const inserted = await db
      .insert(payments)
      .values({
        stripeSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id ?? null,
        customerEmail: session.customer_details?.email ?? null,
        amountCents: session.amount_total ?? 0,
        currency: session.currency ?? 'usd',
        mode: session.mode ?? 'payment',
        jobId: session.metadata?.jobId ?? null,
        websiteUrl: session.metadata?.url ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: payments.id });

    // Credit-pack purchases: verify-plan only grants credits when its own
    // insert wins the idempotency race. If the webhook's insert won instead,
    // apply the credits here so the buyer never loses them.
    if (inserted.length > 0 && session.metadata?.type === 'credits' && session.metadata?.userId) {
      const creditAmount = parseInt(session.metadata?.credits ?? '0', 10);
      const userId = parseInt(session.metadata.userId, 10);
      if (creditAmount > 0 && Number.isFinite(userId)) {
        await db
          .update(users)
          .set({ credits: sql`${users.credits} + ${creditAmount}` })
          .where(eq(users.id, userId));
        console.log(`Webhook granted ${creditAmount} credits to user ${userId} (session ${session.id})`);
      }
    }

    if (inserted.length > 0) {
      console.log(`Webhook recorded payment for session ${session.id} (job: ${session.metadata?.jobId ?? 'none'})`);
      // Job-bound one-time purchases are download unlocks — log them so the
      // admin Recent Downloads list is complete even if the buyer never
      // returns to the success page. Unique (job_id, method) dedupes against
      // the browser verify-payment path.
      if (session.mode === 'payment' && session.metadata?.jobId && session.metadata?.url) {
        await db
          .insert(downloadEvents)
          .values({
            userEmail: session.customer_details?.email ?? null,
            jobId: session.metadata.jobId,
            websiteUrl: session.metadata.url,
            method: 'payment',
          })
          .onConflictDoNothing()
          .catch((e: unknown) => console.error('Failed to record webhook download event:', e));
      }
    }
  }
}
